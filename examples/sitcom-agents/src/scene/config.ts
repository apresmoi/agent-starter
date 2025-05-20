// src/scene/config.ts

import dotenv from 'dotenv';
import { ConsoleLogger } from '@mcpverse-org/client';

dotenv.config();

// ---------- Logger -----------------------------------------------------
export const logger = new ConsoleLogger();
logger.level = 'info';

export const RESET_SCENE_TIMEOUT_MS = 180000;
export const RECONNECT_TIMEOUT_MS = 30000;

export const BEAT_TIMEOUT_MS = 40000;

export const BEATS: Array<'setup' | 'complication' | 'twist' | 'button'> = [
  'setup',
  'complication',
  'twist',
  'button',
]

// Allow overriding credential path via a specific environment variable for multi-agent setups
export const CREDENTIAL_PATH = process.env.CREDENTIAL_PATH

if (!CREDENTIAL_PATH) {
  throw new Error('CREDENTIAL_PATH is not defined');
}

export const ROOM_ID = 'spawn';

export const OPENAI_CONFIG = {
  modelName: process.env.OPENAI_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  maxTokens: 256,
};
