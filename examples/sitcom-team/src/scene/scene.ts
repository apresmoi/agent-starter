// src/scene/scene.ts

import { MCPVerseClient, FileCredentialStore, McpError } from '@mcpverse-org/client';
import {
  CREDENTIAL_PATH,
  RESET_SCENE_TIMEOUT_MS,
  RECONNECT_TIMEOUT_MS,
  logger,
  BEATS,
  BEAT_TIMEOUT_MS,
  metadata,
  PREMISE,
} from './config.js';
import { Message, Scene } from './types.js';
import { createScene } from './llm.js';
import { waitFor } from './utils.js';
import personalities from '../character/personalities.json';

export class SceneGenerator {
  private verseClient: MCPVerseClient;
  private newMessagesBuffer: Message[] = [];
  private agentId!: string; // Definite assignment assertion, will be set in _printProfile
  private inactivityTimer: NodeJS.Timeout | null = null; // Added for inactivity timeout
  private sceneResetTimer: NodeJS.Timeout | null = null; // Timer for resetting the scene
  private currentScene: Scene | null = null;
  private beatTimer: NodeJS.Timeout | null = null;
  private isGeneratingScene: boolean = false; // Flag to prevent concurrent scene generation

  private beatIndex: number = 0;
  private getCurrentBeat() {
    return BEATS[this.beatIndex];
  }

  private characterNames: string[] = Object.keys(personalities);
  private nextSpeakerIndex: number = 0;

  constructor() {
    this.verseClient = new MCPVerseClient({
      credentialStore: new FileCredentialStore(CREDENTIAL_PATH as string),
      agentDetailsForRegistration: {
        apiKey: process.env.MCPVERSE_API_KEY!, // required
        displayName: PREMISE.name,
        bio: PREMISE.description,
      },
      autoReconnect: true,
    });

    this.verseClient.addEventListener('connected', async () => {
      this.agentId = this.verseClient.getAgentId() as string;
      logger.info('[AGENT] Successfully connected to MCPVerse.');
      try {
        await this._setup();
      } catch (error) {
        logger.error('[AGENT] Error during post-connection setup:', error);
      }
      this._resetTimers();
    });

    this.verseClient.addEventListener('disconnected', () => {
      logger.info('[AGENT] Disconnected from MCPVerse. autoReconnect should be handling this.');
      this._resetTimers(); // Reset timers, which might pause activities
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

  private async _handleSceneTimeout() {
    logger.info(
      `[AGENT] Scene timeout of ${RESET_SCENE_TIMEOUT_MS}ms reached. Generating new scene.`
    );
    if (this.sceneResetTimer) {
      clearTimeout(this.sceneResetTimer);
      this.sceneResetTimer = null;
    }
    // Ensure the async handler doesn't cause unhandled promise rejections
    void this._generateScene();
  }

  private async _generateScene() {
    if (this.isGeneratingScene) {
      logger.warn('[AGENT] Scene generation is already in progress. Skipping this call.');
      return;
    }
    this.isGeneratingScene = true;

    try {
      logger.info('[AGENT] Generating scene');

      // Clear any existing scene reset timer before starting a new scene generation
      if (this.sceneResetTimer) {
        clearTimeout(this.sceneResetTimer);
        this.sceneResetTimer = null;
        logger.debug('[AGENT] Cleared existing scene reset timer.');
      }

      // Reset beat-related state for the new scene
      if (this.beatTimer) {
        clearTimeout(this.beatTimer);
        this.beatTimer = null;
      }
      this.beatIndex = 0;
      logger.debug('[AGENT] Reset beat timer and index for new scene.');

      const result = await createScene();

      logger.debug('[AGENT] Scene generation result:', result);

      if (result.title) {
        if (this.currentScene) {
          logger.debug('[AGENT] Sending scene end message');
          await this.verseClient.tools.chatRoom.sendMessage({
            roomId: metadata.roomId,
            content: `[SCENE END]`,
          });
          await waitFor(5000);
          // Consider a brief pause if needed after SCENE END before new scene messages
          // await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.currentScene = result; // result now includes startingCharacterName

        logger.debug('[AGENT] Sending new scene details');
        await this.verseClient.tools.chatRoom.sendMessage({
          roomId: metadata.roomId,
          content: `[NEW SCENE]
- Title: ${result.title}
- Time of day: ${result.timeOfDay}
- Location: ${result.location.name}
- Mood: ${result.mood}`,
        });

        await waitFor(5000);

        // It might be better to consolidate NEW SCENE messages or send them quickly.
        // For now, keeping separate messages as per existing logic.
        await this.verseClient.tools.chatRoom.sendMessage({
          roomId: metadata.roomId,
          content: `[NEW SCENE]
- Plot hook: ${result.plotHook}`,
        });

        await waitFor(5000);

        await this.verseClient.tools.chatRoom.sendMessage({
          roomId: metadata.roomId,
          content: `[NEW SCENE]
- Props: ${result.props.join('\n')}`,
        });

        await waitFor(5000);

        // Always send the first beat message. Then, if a starting character is nominated, send that.
        logger.debug(`[AGENT] Sending first beat: ${this.getCurrentBeat()}`);
        await this.verseClient.tools.chatRoom.sendMessage({
          roomId: metadata.roomId,
          content: `[BEAT] ${this.getCurrentBeat()}`,
        });
        await waitFor(1000); // Short pause for the beat message

        if (result.startingCharacterName) {
          logger.debug(`[AGENT] Nominating ${result.startingCharacterName} as first speaker.`);
          await this.verseClient.tools.chatRoom.sendMessage({
            roomId: metadata.roomId,
            content: `[FIRST SPEAKER] ${result.startingCharacterName}`,
          });
          // Brief pause to allow FIRST SPEAKER message to be processed before SCENE START
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const idx = this.characterNames.indexOf(result.startingCharacterName);
          this.nextSpeakerIndex = idx >= 0 ? (idx + 1) % this.characterNames.length : 0;
        } else {
          logger.warn('[AGENT] No starting character was nominated by the LLM for the new scene.');
          this.nextSpeakerIndex = 0;
        }

        await waitFor(5000);

        // Start the scene
        logger.debug('[AGENT] Sending scene start message');
        await this.verseClient.tools.chatRoom.sendMessage({
          roomId: metadata.roomId,
          content: `[SCENE START]`,
        });

        // Start beat progression
        if (BEATS.length > 0) {
          // Only start if there are beats defined
          this.advanceBeat();
        }

        // Set the new scene reset timer
        if (RESET_SCENE_TIMEOUT_MS > 0) {
          logger.info(`[AGENT] Setting scene reset timer for ${RESET_SCENE_TIMEOUT_MS}ms.`);
          this.sceneResetTimer = setTimeout(() => {
            // Ensure the async handler doesn't cause unhandled promise rejections
            void this._handleSceneTimeout();
          }, RESET_SCENE_TIMEOUT_MS);
        } else {
          logger.debug('[AGENT] Scene reset timer is disabled (RESET_SCENE_TIMEOUT_MS <= 0).');
        }
      }
    } catch (error) {
      logger.error('[AGENT] Error during scene generation:', error);
      // Depending on the error, you might want to re-throw or handle more gracefully
    } finally {
      this.isGeneratingScene = false;
      logger.debug('[AGENT] Scene generation flag reset.');
    }
  }

  /* ───────────────────────────── BEAT ADVANCE ────────────────────────────── */
  private async advanceBeat() {
    // If there's an existing timer, clear it. This handles explicit calls to advanceBeat
    // that might occur before a scheduled timeout.
    if (this.beatTimer) {
      clearTimeout(this.beatTimer);
      this.beatTimer = null;
    }

    // Check if the *next* beat index is within bounds
    if (this.beatIndex + 1 < BEATS.length) {
      this.beatTimer = setTimeout(async () => {
        this.beatIndex += 1; // Advance to the next beat
        const currentBeat = this.getCurrentBeat();
        logger.info(`[SCENE] Advancing beat → ${currentBeat}`);

        await this.verseClient.tools.chatRoom.sendMessage({
          roomId: metadata.roomId,
          content: `[BEAT] ${currentBeat}`,
        });

        const speaker = this.characterNames[this.nextSpeakerIndex];
        logger.debug(`[AGENT] Nominating ${speaker} as first speaker for beat ${currentBeat}.`);
        await this.verseClient.tools.chatRoom.sendMessage({
          roomId: metadata.roomId,
          content: `[FIRST SPEAKER] ${speaker}`,
        });
        this.nextSpeakerIndex = (this.nextSpeakerIndex + 1) % this.characterNames.length;

        // Schedule the next beat advancement
        this.advanceBeat();
      }, BEAT_TIMEOUT_MS);
    } else {
      logger.info('[SCENE] All beats have been processed for the current scene.');
      // No more beats to advance to, clear timer if any was pending (though unlikely here)
      if (this.beatTimer) {
        clearTimeout(this.beatTimer);
        this.beatTimer = null;
      }
    }
  }

  private async _printRoomInfo() {
    logger.info('[AGENT] Fetching room information');
    const room = await this.verseClient.tools.chatRoom.get({ roomId: metadata.roomId });
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
      roomId: metadata.roomId,
    });
    if (reply.isError) {
      logger.error('[AGENT] Failed to watch room:', reply.error.message);
      throw new Error(reply.error.message);
    }
    logger.debug('[AGENT] Room watch established');
  }

  private async _attachRoomListener() {
    logger.info(`[AGENT] 👂  Listening on room ${metadata.roomId}… (Ctrl-C to exit)`);
    this.verseClient.subscribeNotification(`room/${metadata.roomId}/message`, (message) => {
      logger.debug('[AGENT] New message received');
      this._resetTimers(); // Reset inactivity timer on new message

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
    });
  }

  private async _setup() {
    logger.debug('[AGENT] Setting up');
    await this._printRoomInfo();
    await this._attachRoomListener();
    await this._watchRoom();
    this._resetTimers();
  }

  public async run() {
    try {
      logger.info('[AGENT] 🔌  Connecting…');
      await this.verseClient.connect();
      setTimeout(() => {
        this._generateScene();
      }, 5000);
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
