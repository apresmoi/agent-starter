// src/index.ts

import { MCPVerseClient, FileCredentialStore } from '@mcpverse-org/client';
import {
  personality,
  CREDENTIAL_PATH,
  ROOM_ID,
  BASE_TIMEOUT_MS,
  MESSAGE_ARRIVAL_DELAY_INCREMENT_MS,
  MAX_ADDITIONAL_RANDOM_DELAY_MS,
  MAX_TIMEOUT_MS,
  logger,
} from './config';
import { Message } from './types';
import { graph } from './graph';

// Global state
const messages: Message[] = [];
let running = false;
let timeout: NodeJS.Timeout | null = null;
let newMessagesBuffer: Message[] = [];
let currentTimeoutTargetMs = BASE_TIMEOUT_MS;
let agentId: string;

// ---------- Build client -----------------------------------------------
const verseClient = new MCPVerseClient({
  credentialStore: new FileCredentialStore(CREDENTIAL_PATH),
  agentDetailsForRegistration: {
    apiKey: process.env.MCPVERSE_API_KEY!, // required
    displayName: personality.name,
    bio: personality.persona,
  },
});

async function processMessageBatch() {
  logger.debug('Processing message batch');
  if (running) {
    logger.debug('Skipping batch processing: already running');
    return;
  }

  logger.debug(`Processing message batch of size ${newMessagesBuffer.length}`);

  running = true;

  const toProcess = newMessagesBuffer.splice(0);
  logger.debug(
    `Invoking graph with ${messages.length} historical messages and ${toProcess.length} new messages`
  );
  const result = await graph.invoke({ messages, newMessages: toProcess, hasGreeted: true, agentId });

  logger.debug('Finished processing graph');

  // Apply reactions
  const reactionMessages = result.newMessages.filter((msg) => msg.reaction);
  if (reactionMessages.length > 0) {
    logger.debug(`Applying ${reactionMessages.length} reactions`);
    for (const { id, reaction } of reactionMessages) {
      if (reaction) {
        verseClient.tools.chatRoom.addReactionToMessage({
          roomId: ROOM_ID,
          messageId: id,
          reaction,
        });
        logger.debug(`Added reaction "${reaction}" to message ${id}`);
      }
    }
  }

  // If new messages arrived while planning, note this reply as a thought and abort
  if (newMessagesBuffer.length > 0) {
    logger.info('↩️  Aborting reply: context changed');
    logger.debug(
      `New messages arrived during processing: ${newMessagesBuffer.length} messages in buffer`
    );

    if (result.reply) {
      // Maybe we could store this as a random thought that didn't make it to the reply?
    }
  } else if (result.reply) {
    logger.debug(`Generated reply of length ${result.reply.length}`);

    // Send the reply
    const sendIntent = await verseClient.tools.chatRoom.sendMessage({
      roomId: ROOM_ID,
      content: result.reply.slice(0, 256),
    });

    if (sendIntent.isError) {
      logger.error('Failed to send message:', sendIntent.error.message);
    } else {
      logger.debug(`Message sent successfully to room ${ROOM_ID}`);
    }
  } else {
    logger.debug('No reply generated');
  }

  // finally, append the batch to history
  messages.push(...toProcess);
  logger.debug(`Updated message history. Total messages: ${messages.length}`);

  running = false;

  // if there's still buffered messages, schedule the next run
  if (newMessagesBuffer.filter((msg) => msg.authorId !== agentId).length > 0) {
    logger.debug(`Scheduling next batch processing with ${newMessagesBuffer.length} messages`);
    scheduleProcessing();
  } else if (Math.random() <= personality.idle_probability) {
    logger.debug('No more messages to process - scheduling idle timeout');
    timeout = setTimeout(processMessageBatch, MAX_TIMEOUT_MS)
  }else {
    logger.debug('No more messages to process - going to sleep');
  }
}

function scheduleProcessing() {
  if (timeout) {
    logger.debug('Clearing existing timeout');
    clearTimeout(timeout);
  }

  currentTimeoutTargetMs = Math.min(
    MAX_TIMEOUT_MS,
    BASE_TIMEOUT_MS + MESSAGE_ARRIVAL_DELAY_INCREMENT_MS
  );
  const randomDelay = Math.random() * MAX_ADDITIONAL_RANDOM_DELAY_MS;
  const totalDelay = currentTimeoutTargetMs + randomDelay;
  logger.debug(
    `Scheduling processing in ${totalDelay.toFixed(0)}ms (base: ${currentTimeoutTargetMs}ms, random: ${randomDelay.toFixed(0)}ms)`
  );
  timeout = setTimeout(processMessageBatch, totalDelay);
}

async function generateGreeting() {
  logger.info('Generating initial greeting');

  const result = await graph.invoke({
    messages: [],
    newMessages: [],
    hasGreeted: false,
    agentId,
  });

  logger.debug('Greeting generation result:', result);

  if (result.reply) {
    logger.info('Sending greeting message');
    await verseClient.tools.chatRoom.sendMessage({
      roomId: ROOM_ID,
      content: result.reply.slice(0, 256),
    });
    logger.debug('Greeting message sent successfully');
  }
}

async function printProfile() {
  logger.info('Fetching agent profile');
  const profile = await verseClient.tools.profile.getProfile();
  if (profile.isError) {
    logger.error('Failed to fetch profile:', profile.error.message);
    throw new Error(profile.error.message);
  }
  agentId = profile.data.id;
  const agentName = profile.data.displayName;
  logger.info(`👤 #${agentId} - ${agentName} — impact ${profile.data.impact}`);
  logger.debug('Profile details:', profile.data);
}

async function printRoom() {
  logger.info('Fetching room information');
  const room = await verseClient.tools.chatRoom.get({ roomId: ROOM_ID });
  if (room.isError) {
    logger.error('Failed to fetch room:', room.error.message);
    throw new Error(room.error.message);
  }
  const roomTTL = room.data.messageTtlSeconds;
  logger.info(`💬 Room: ${room.data.displayName}`);
  logger.info(`💬 Room TTL: ${roomTTL}`);
  logger.debug('Room details:', room.data);
}

async function listenToRoom() {
  logger.info(`👂  Listening on room ${ROOM_ID}… (Ctrl-C to exit)`);
  verseClient.subscribeNotification(`room/${ROOM_ID}/message`, (message) => {
    logger.debug('New message received');

    if (message.authorId === agentId) {
      logger.info(`[You]: ${message.content}`);

      newMessagesBuffer.push({
        id: message.id,
        content: message.content,
        authorId: message.authorId,
        createdAt: message.createdAt,
      });

      return;
    }

    logger.info(`[${message.authorId}]: ${message.content}`);

    newMessagesBuffer.push({
      id: message.id,
      content: message.content,
      authorId: message.authorId,
      createdAt: message.createdAt,
    });

    logger.debug(`Message added to buffer. Buffer size: ${newMessagesBuffer.length}`);
    scheduleProcessing();
  });

  logger.info('Watching room for messages');
  await verseClient.tools.chatRoom.watchRoom({
    roomId: ROOM_ID,
  });
  logger.debug('Room watch established');
}

(async () => {
  try {
    logger.info('🔌  Connecting…');
    await verseClient.connect();
    logger.info('✅  Connected');
    logger.debug('Client connection established successfully');

    await printProfile();
    await printRoom();
    await generateGreeting();
    await listenToRoom();
  } catch (error: unknown) {
    logger.error('❌  Error', error);
  }
})();
