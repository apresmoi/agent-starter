// src/character/agent.ts

import { MCPVerseClient, FileCredentialStore, McpError } from '@mcpverse-org/client';
import {
  personality,
  CREDENTIAL_PATH,
  ROOM_ID,
  BASE_TIMEOUT_MS,
  MAX_ADDITIONAL_RANDOM_DELAY_MS,
  IDLE_TIMEOUT_MS,
  RECONNECT_TIMEOUT_MS,
  logger,
} from './config.js';
import { Message } from './types.js';
import { graph } from './graph.js';

export class Agent {
  private verseClient: MCPVerseClient;
  private messages: Message[] = [];
  private running = false;
  private timeout: NodeJS.Timeout | null = null;
  private newMessagesBuffer: Message[] = [];
  private agentId!: string; // Definite assignment assertion, will be set in _printProfile
  private inactivityTimer: NodeJS.Timeout | null = null; // Added for inactivity timeout
  private currentSceneDescription: string | null = null; // Added for scene awareness
  private isSceneActive: boolean = false; // Added to track if scene has started
  private nominatedStarterName: string | null = null; // Added to store nominated starter
  private currentBeat: string | null = null; // Added to store the current beat

  constructor() {
    this.verseClient = new MCPVerseClient({
      credentialStore: new FileCredentialStore(CREDENTIAL_PATH as string),
      agentDetailsForRegistration: {
        apiKey: process.env.MCPVERSE_API_KEY!, // required
        displayName: personality.name,
        bio: personality.persona,
      },
      autoReconnect: true,
    });

    this.verseClient.addEventListener('connected', async () => {
      logger.info('[AGENT] Successfully connected to MCPVerse.');
      try {
        await this._setup();
      } catch (error) {
        if (error instanceof McpError) {
          if (error.code === -32000) {
            logger.info('[AGENT] Reconnecting to MCPVerse.');
            this.verseClient.connect();
          }
        }
      }
    });

    this.verseClient.addEventListener('disconnected', () => {
      logger.info('[AGENT] Disconnected from MCPVerse.');
    });
  }

  private _resetTimers() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (RECONNECT_TIMEOUT_MS > 0) {
      logger.debug(`[AGENT] Resetting inactivity timer for ${RECONNECT_TIMEOUT_MS}ms`);
      this.inactivityTimer = setTimeout(() => {
        // Ensure the async handler doesn't cause unhandled promise rejections
        void this._handleInactivityTimeout();
      }, RECONNECT_TIMEOUT_MS);
    } else {
      logger.debug('[AGENT] Inactivity timer is disabled (RECONNECT_TIMEOUT_MS <= 0).');
    }
  }

  private async _handleInactivityTimeout() {
    logger.warn(
      `[AGENT] Inactivity timeout of ${RECONNECT_TIMEOUT_MS}ms reached. Initiating disconnect.`
    );
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer); // Should be cleared by setTimeout itself, but good for clarity
      this.inactivityTimer = null;
    }

    try {
      // autoReconnect: true in client constructor should handle reconnection.
      await this.verseClient.disconnect();
      logger.info(
        '[AGENT] Disconnected due to inactivity. Auto-reconnect feature should now attempt to reconnect.'
      );
    } catch (error) {
      logger.error('[AGENT] Error during client disconnect for inactivity timeout:', error);
      // If disconnect fails, reset the timer to try again after the next inactivity period.
      logger.info('[AGENT] Resetting inactivity timer after failed disconnect attempt.');
      this._resetTimers();
    }
  }

  private async _processMessageBatch() {
    logger.debug('[AGENT] Processing message batch');

    if (!this.isSceneActive) {
      logger.debug('[AGENT] Skipping batch processing: scene is not active.');
      this.running = false;
      return;
    }

    if (this.running) {
      logger.debug('[AGENT] Skipping batch processing: already running');
      return;
    }
    this.running = true;

    let otherMessages = this.newMessagesBuffer.filter((msg) => msg.authorId !== this.agentId);

    if (otherMessages.length === 0) {
      logger.debug('[AGENT] Skipping batch processing: no new messages');
      this.running = false;
      return;
    }

    logger.debug(`[AGENT] Processing message batch of size ${this.newMessagesBuffer.length}`);

    const toProcess = this.newMessagesBuffer.splice(0);
    logger.debug(
      `[AGENT] Invoking graph with ${this.messages.length} historical messages and ${toProcess.length} new messages`
    );
    const result = await graph.invoke({
      messages: this.messages,
      newMessages: toProcess,
      agentId: this.agentId,
      sceneDescription: this.currentSceneDescription,
      isInitiatingStatement: false,
      currentBeat: this.currentBeat,
    });

    logger.debug('[AGENT] Finished processing graph');

    // finally, append the batch to history
    this.messages.push(...toProcess);
    logger.debug(`[AGENT] Updated message history. Total messages: ${this.messages.length}`);

    if (this.newMessagesBuffer.length > 0) {
      logger.info('[AGENT] ↩️  Aborting reply: context changed');
      logger.debug(
        `[AGENT] New messages arrived during processing: ${this.newMessagesBuffer.length} messages in buffer`
      );
      this.running = false;
      this._processMessageBatch();
      return;
    } else if (result.reply) {
      logger.debug(`[AGENT] Generated reply of length ${result.reply.length}`);

      // Send the reply
      const sendIntent = await this.verseClient.tools.chatRoom.sendMessage({
        roomId: ROOM_ID,
        content: result.reply.slice(0, 256),
      });

      if (sendIntent.isError) {
        logger.error('[AGENT] Failed to send message:', sendIntent.error.message);
      } else {
        logger.debug(`[AGENT] Message sent successfully to room ${ROOM_ID}`);
      }
    } else {
      logger.debug('[AGENT] No reply generated');
    }

    this.running = false;
    this._resetTimers(); // Reset inactivity timer after processing a batch

    otherMessages = this.newMessagesBuffer.filter((msg) => msg.authorId !== this.agentId);

    if (Math.random() <= personality.idle_probability || otherMessages.length === 0) {
      logger.debug(`[AGENT] Going idle for ${IDLE_TIMEOUT_MS}ms`);
      this.timeout = setTimeout(this._processMessageBatch.bind(this), IDLE_TIMEOUT_MS);
    } else if (otherMessages.length > 0) {
      logger.debug(
        `[AGENT] Scheduling next batch processing with ${otherMessages.length} messages`
      );
      this._scheduleProcessing();
    } else {
      logger.debug('[AGENT] No more messages to process - going to sleep');
      this.timeout = setTimeout(this._processMessageBatch.bind(this), IDLE_TIMEOUT_MS);
    }
  }

  private _scheduleProcessing() {
    if (this.timeout) {
      logger.debug('[AGENT] Clearing existing timeout');
      clearTimeout(this.timeout);
    }

    const randomDelay = Math.random() * MAX_ADDITIONAL_RANDOM_DELAY_MS;
    const totalDelay = BASE_TIMEOUT_MS + randomDelay;
    logger.debug(
      `[AGENT] Scheduling processing in ${totalDelay.toFixed(0)}ms (base: ${BASE_TIMEOUT_MS}ms, random: ${randomDelay.toFixed(0)}ms)`
    );
    this.timeout = setTimeout(this._processMessageBatch.bind(this), totalDelay);
  }

  private async _initiateSceneParticipation() {
    logger.debug('[AGENT] Considering scene participation...');

    if (!this.isSceneActive || !this.currentSceneDescription) {
      logger.debug('[AGENT] Skipping scene participation: Scene not active or no description.');
      return;
    }

    // Check if nominatedStarterName is set. If not, wait briefly in case [FIRST SPEAKER] is lagging.
    if (this.nominatedStarterName === null) {
      logger.debug('[AGENT] First speaker not yet known. Waiting briefly (1.5s) for [FIRST SPEAKER] directive...');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds

      if (this.nominatedStarterName === null) {
        logger.warn('[AGENT] No nominated starter for this scene after waiting. No proactive initial statement will be made by this agent.');
        return;
      }
    }

    // Now nominatedStarterName should be set if the directive arrived.
    if (personality.name !== this.nominatedStarterName) {
      logger.debug(`[AGENT] Not nominated as first speaker. Nominated: ${this.nominatedStarterName}. Me: ${personality.name}. Waiting for others.`);
      return; 
    }
    
    logger.debug(`[AGENT] I am the nominated first speaker (${personality.name})! Let's start this scene!`);

    const result = await graph.invoke({
      messages: [], 
      newMessages: [],
      agentId: this.agentId,
      sceneDescription: this.currentSceneDescription,
      isInitiatingStatement: true,
      currentBeat: this.currentBeat,
    });

    logger.debug('[AGENT] Scene participation action result:', result);

    if (result.reply) { 
      logger.debug('[AGENT] Sending scene entry message as nominated speaker');
      const sendIntent = await this.verseClient.tools.chatRoom.sendMessage({
        roomId: ROOM_ID,
        content: result.reply.slice(0, 256),
      });
      if (sendIntent.isError) {
        logger.error('[AGENT] Failed to send message:', sendIntent.error.message);
      } else {
        logger.debug(`[AGENT] Message sent successfully to room ${ROOM_ID}`);
      }
    } else {
      logger.debug('[AGENT] No scene entry message generated by LLM even as nominated speaker.');
    }

    this.isSceneActive = false;
    this.nominatedStarterName = null; // Reset nominated starter
    this.currentBeat = null; // Reset current beat
  }

  private async _printProfile() {
    logger.info('[AGENT] Fetching agent profile');
    this.agentId = this.verseClient.getAgentId() as string;
    const profile = await this.verseClient.tools.profile.getProfile();
    if (profile.isError) {
      logger.error('[AGENT] Failed to fetch profile:', profile.error.message);
      return;
    }
    const agentName = profile.data.displayName;
    logger.info(`[AGENT] 👤 #${this.agentId} - ${agentName} — impact ${profile.data.impact}`);
    logger.debug('[AGENT] Profile details:', profile.data);
  }

  private async _printRoomInfo() {
    logger.info('[AGENT] Fetching room information');
    const room = await this.verseClient.tools.chatRoom.get({ roomId: ROOM_ID });
    if (room.isError) {
      logger.error('[AGENT] Failed to fetch room:', room.error.message);
      return;
    }
    const roomTTL = room.data.messageTtlSeconds;
    logger.info(`[AGENT] 💬 Room: ${room.data.displayName}`);
    logger.info(`[AGENT] 💬 Room TTL: ${roomTTL}`);
    logger.debug('[AGENT] Room details:', room.data);
  }

  private async _watchRoom() {
    logger.info('[AGENT] Watching room for messages');
    const reply = await this.verseClient.tools.chatRoom.watchRoom({
      roomId: ROOM_ID,
    });
    if (reply.isError) {
      logger.error('[AGENT] Failed to watch room:', reply.error.message);
      throw new Error(reply.error.message);
    }
    logger.debug('[AGENT] Room watch established');
  }

  private async _attachRoomListener() {
    logger.info(`[AGENT] 👂  Listening on room ${ROOM_ID}… (Ctrl-C to exit)`);
    this.verseClient.subscribeNotification(`room/${ROOM_ID}/message`, (message) => {
      logger.debug('[AGENT] New message received');
      this._resetTimers(); 

      if (message.content === '[SCENE END]') {
        logger.debug('[AGENT] Received [SCENE END]. Clearing history and scene state.');
        this.messages = [];
        this.newMessagesBuffer = [];
        if (this.timeout) {
          clearTimeout(this.timeout);
          this.timeout = null;
        }
        this.currentSceneDescription = null;
        this.running = false; 
        this.isSceneActive = false;
        this.nominatedStarterName = null; // Reset nominated starter
        this.currentBeat = null; // Reset current beat
        return;
      }

      if (message.content.startsWith('[FIRST SPEAKER]')) {
        const name = message.content.substring('[FIRST SPEAKER]'.length).trim();
        logger.debug(`[AGENT] Received nomination for first speaker: ${name}. My name: ${personality.name}`);
        this.nominatedStarterName = name;
        return;
      }
      
      if (message.content.startsWith('[BEAT]')) {
        const beat = message.content.substring('[BEAT]'.length).trim().split('\n')[0]; // Get beat, ignore if [FIRST SPEAKER] is on the same line
        this.currentBeat = beat;
        logger.debug(`[AGENT] Received [BEAT]. Current beat is now: ${this.currentBeat}`);
        // Note: If [FIRST SPEAKER] is part of this message, it's handled by the [FIRST SPEAKER] block if it's a distinct message,
        // or it might need more sophisticated parsing if it's genuinely on the same line after the beat name.
        // For now, assuming beat name is clean or on its own first line.
        return; // Return to avoid processing as a regular message
      }
      
      if (message.content.startsWith('[NEW SCENE]')) {
        const sceneDetail = message.content.substring('[NEW SCENE]'.length).trim();
        if (this.currentSceneDescription === null) {
          this.currentSceneDescription = sceneDetail;
          logger.debug('[AGENT] Started new scene description.');
        } else {
          this.currentSceneDescription += `\n${sceneDetail}`;
          logger.debug('[AGENT] Appended to scene description.');
        }
        logger.debug(`[AGENT] Current scene description: ${this.currentSceneDescription}`);
        return;
      }

      if (message.content === '[SCENE START]') {
        logger.debug('[AGENT] Received [SCENE START]. Scene is now active.');
        this.isSceneActive = true;
        // this.currentBeat = null; // Reset beat at scene start, will be set by first [BEAT] message
        this._initiateSceneParticipation(); 
        
        if (this.newMessagesBuffer.filter(msg => msg.authorId !== this.agentId).length > 0) {
          logger.debug('[AGENT] Messages found in buffer after scene start, scheduling processing.');
          this._scheduleProcessing();
        } else {
          this._resetTimers(); 
        }
        return;
      }

      if (message.authorId === this.agentId) {
        logger.info(`[AGENT] [You]: ${message.content}`);

        this.newMessagesBuffer.push({
          id: message.id,
          content: message.content,
          authorId: message.authorId,
          createdAt: message.createdAt,
        });

        return;
      }

      this.newMessagesBuffer.push({
        id: message.id,
        content: message.content,
        authorId: message.authorId,
        createdAt: message.createdAt,
      });

      logger.debug(
        `[AGENT] Message added to buffer. Buffer size: ${this.newMessagesBuffer.length}`
      );
      // Only schedule processing if the scene is active. 
      // If scene not active, messages are buffered until [SCENE START] -> _initiateSceneParticipation or subsequent _scheduleProcessing.
      if (this.isSceneActive) {
        this._scheduleProcessing();
      }
    });
  }

  private async _setup() {
    logger.debug('[AGENT] Setting up');
    await this._printProfile();
    await this._printRoomInfo();
    await this._attachRoomListener();
    await this._watchRoom();
    this._resetTimers();
  }

  public async run() {
    try {
      logger.info('[AGENT] 🔌  Connecting…');
      await this.verseClient.connect();
    } catch (error: unknown) {
      logger.error('[AGENT] ❌  Error in agent execution', error);
      // Optionally re-throw or handle more gracefully
      if (error instanceof Error) {
        throw error; // Re-throw if it's an Error object
      }
      throw new Error(String(error)); // Wrap other types in an Error object
    }
  }
}
