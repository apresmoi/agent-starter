import { MCPVerseClient, FileCredentialStore } from '@mcpverse-org/client';
import {
  personality,
  CREDENTIAL_PATH,
  ROOM_ID,
  BASE_TIMEOUT_MS,
  MAX_ADDITIONAL_RANDOM_DELAY_MS,
  IDLE_TIMEOUT_MS,
  RECONNECT_TIMEOUT_MS,
  logger,
} from './config';
import { Message } from './types';
import { graph } from './graph';

export class Agent {
  private verseClient: MCPVerseClient;
  private messages: Message[] = [];
  private running = false;
  private timeout: NodeJS.Timeout | null = null;
  private newMessagesBuffer: Message[] = [];
  private agentId!: string; // Definite assignment assertion, will be set in _printProfile
  private inactivityTimer: NodeJS.Timeout | null = null; // Added for inactivity timeout

  constructor() {
    this.verseClient = new MCPVerseClient({
      credentialStore: new FileCredentialStore(CREDENTIAL_PATH),
      agentDetailsForRegistration: {
        apiKey: process.env.MCPVERSE_API_KEY!, // required
        displayName: personality.name,
        bio: personality.persona,
      },
      autoReconnect: true,
    });

    this.verseClient.addEventListener('connected', (reconnect?: boolean) => {
      logger.info('Successfully connected to MCPVerse.');
      this._setup(reconnect);
    });
  }

  private _resetInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (RECONNECT_TIMEOUT_MS > 0) {
      logger.debug(`Resetting inactivity timer for ${RECONNECT_TIMEOUT_MS}ms`);
      this.inactivityTimer = setTimeout(() => {
        // Ensure the async handler doesn't cause unhandled promise rejections
        void this._handleInactivityTimeout();
      }, RECONNECT_TIMEOUT_MS);
    } else {
      logger.debug('Inactivity timer is disabled (RECONNECT_TIMEOUT_MS <= 0).');
    }
  }

  private async _handleInactivityTimeout() {
    logger.warn(
      `Inactivity timeout of ${RECONNECT_TIMEOUT_MS}ms reached. Initiating disconnect.`
    );
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer); // Should be cleared by setTimeout itself, but good for clarity
      this.inactivityTimer = null;
    }

    try {
      // autoReconnect: true in client constructor should handle reconnection.
      await this.verseClient.disconnect();
      logger.info(
        'Disconnected due to inactivity. Auto-reconnect feature should now attempt to reconnect.'
      );
    } catch (error) {
      logger.error('Error during client disconnect for inactivity timeout:', error);
      // If disconnect fails, reset the timer to try again after the next inactivity period.
      logger.info('Resetting inactivity timer after failed disconnect attempt.');
      this._resetInactivityTimer();
    }
  }

  private async _processMessageBatch() {
    logger.debug('Processing message batch');
    if (this.running) {
      logger.debug('Skipping batch processing: already running');
      return;
    }

    logger.debug(`Processing message batch of size ${this.newMessagesBuffer.length}`);

    this.running = true;

    const toProcess = this.newMessagesBuffer.splice(0);
    logger.debug(
      `Invoking graph with ${this.messages.length} historical messages and ${toProcess.length} new messages`
    );
    const result = await graph.invoke({ messages: this.messages, newMessages: toProcess, hasGreeted: true, agentId: this.agentId });

    logger.debug('Finished processing graph');

    // Apply reactions
    const reactionMessages = result.newMessages.filter((msg) => msg.reaction);
    if (reactionMessages.length > 0) {
      logger.debug(`Applying ${reactionMessages.length} reactions`);
      for (const { id, reaction } of reactionMessages) {
        if (reaction) {
          this.verseClient.tools.chatRoom.addReactionToMessage({
            roomId: ROOM_ID,
            messageId: id,
            reaction,
          });
          logger.debug(`Added reaction "${reaction}" to message ${id}`);
        }
      }
    }

    // finally, append the batch to history
    this.messages.push(...toProcess);
    logger.debug(`Updated message history. Total messages: ${this.messages.length}`);

    if (this.newMessagesBuffer.length > 0) {
      logger.info('↩️  Aborting reply: context changed');
      logger.debug(
        `New messages arrived during processing: ${this.newMessagesBuffer.length} messages in buffer`
      );
      this.running = false;
      this._processMessageBatch();
    } else if (result.reply) {
      logger.debug(`Generated reply of length ${result.reply.length}`);

      // Send the reply
      const sendIntent = await this.verseClient.tools.chatRoom.sendMessage({
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

    this.running = false;
    this._resetInactivityTimer(); // Reset inactivity timer after processing a batch

    const otherMessages = this.newMessagesBuffer.filter((msg) => msg.authorId !== this.agentId);

    if (Math.random() <= personality.idle_probability || otherMessages.length === 0) {
      logger.debug(`Going idle for ${IDLE_TIMEOUT_MS}ms`);
      this.timeout = setTimeout(this._processMessageBatch.bind(this), IDLE_TIMEOUT_MS)
    } else if (otherMessages.length > 0) {
      logger.debug(`Scheduling next batch processing with ${otherMessages.length} messages`);
      this._scheduleProcessing();
    } else {
      logger.debug('No more messages to process - going to sleep');
      this.timeout = setTimeout(this._processMessageBatch.bind(this), IDLE_TIMEOUT_MS)
    }
  }

  private _scheduleProcessing() {
    if (this.timeout) {
      logger.debug('Clearing existing timeout');
      clearTimeout(this.timeout);
    }

    const randomDelay = Math.random() * MAX_ADDITIONAL_RANDOM_DELAY_MS;
    const totalDelay = BASE_TIMEOUT_MS + randomDelay;
    logger.debug(
      `Scheduling processing in ${totalDelay.toFixed(0)}ms (base: ${BASE_TIMEOUT_MS}ms, random: ${randomDelay.toFixed(0)}ms)`
    );
    this.timeout = setTimeout(this._processMessageBatch.bind(this), totalDelay);
  }

  private async _generateInitialGreeting() {
    logger.info('Generating initial greeting');

    const result = await graph.invoke({
      messages: [],
      newMessages: [],
      hasGreeted: false,
      agentId: this.agentId,
    });

    logger.debug('Greeting generation result:', result);

    if (result.reply) {
      logger.info('Sending greeting message');
      const sendIntent = await this.verseClient.tools.chatRoom.sendMessage({
        roomId: ROOM_ID,
        content: result.reply.slice(0, 256),
      });
      if (sendIntent.isError) {
        logger.error('Failed to send message:', sendIntent.error.message);
      } else {
        logger.debug(`Message sent successfully to room ${ROOM_ID}`);
      }
    }
  }

  private async _printProfile() {
    logger.info('Fetching agent profile');
    const profile = await this.verseClient.tools.profile.getProfile();
    if (profile.isError) {
      logger.error('Failed to fetch profile:', profile.error.message);
      throw new Error(profile.error.message);
    }
    this.agentId = profile.data.id;
    const agentName = profile.data.displayName;
    logger.info(`👤 #${this.agentId} - ${agentName} — impact ${profile.data.impact}`);
    logger.debug('Profile details:', profile.data);
  }

  private async _printRoomInfo() {
    logger.info('Fetching room information');
    const room = await this.verseClient.tools.chatRoom.get({ roomId: ROOM_ID });
    if (room.isError) {
      logger.error('Failed to fetch room:', room.error.message);
      throw new Error(room.error.message);
    }
    const roomTTL = room.data.messageTtlSeconds;
    logger.info(`💬 Room: ${room.data.displayName}`);
    logger.info(`💬 Room TTL: ${roomTTL}`);
    logger.debug('Room details:', room.data);
  }

  private async _watchRoom() {
    logger.info('Watching room for messages');
    const reply = await this.verseClient.tools.chatRoom.watchRoom({
      roomId: ROOM_ID,
    });
    if (reply.isError) {
      logger.error('Failed to watch room:', reply.error.message);
      throw new Error(reply.error.message);
    }
    logger.debug('Room watch established');
  }

  private async _listenRoom() {
    logger.info(`👂  Listening on room ${ROOM_ID}… (Ctrl-C to exit)`);
    this.verseClient.subscribeNotification(`room/${ROOM_ID}/message`, (message) => {
      logger.debug('New message received');

      if (message.authorId === this.agentId) {
        logger.info(`[You]: ${message.content}`);

        this.newMessagesBuffer.push({
          id: message.id,
          content: message.content,
          authorId: message.authorId,
          createdAt: message.createdAt,
        });

        return;
      }

      logger.info(`[${message.authorId}]: ${message.content}`);

      this.newMessagesBuffer.push({
        id: message.id,
        content: message.content,
        authorId: message.authorId,
        createdAt: message.createdAt,
      });

      logger.debug(`Message added to buffer. Buffer size: ${this.newMessagesBuffer.length}`);
      this._scheduleProcessing();
      this._resetInactivityTimer(); // Reset inactivity timer on new message
    });
  }

  private async _setup(reconnect: boolean = false) {
    await this._printProfile();
    await this._printRoomInfo();
    if (!reconnect) {
      //The listener is client level, so it should be declared only once
      await this._listenRoom();
    }
    await this._watchRoom();
    this._resetInactivityTimer(); // Reset inactivity timer on setup/reconnect
  }

  public async run() {
    try {
      logger.info('🔌  Connecting…');
      await this.verseClient.connect();
      logger.info('✅  Connected');
      logger.debug('Client connection established successfully');
      await this._generateInitialGreeting();
    } catch (error: unknown) {
      logger.error('❌  Error in agent execution', error);
      // Optionally re-throw or handle more gracefully
      if (error instanceof Error) {
        throw error; // Re-throw if it's an Error object
      }
      throw new Error(String(error)); // Wrap other types in an Error object
    }
  }
} 