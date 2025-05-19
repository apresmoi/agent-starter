// src/config.ts

import dotenv from 'dotenv';
import { BotPersonality } from './types';
import personalities from './personalities.json';
import { ConsoleLogger } from '@mcpverse-org/client';

dotenv.config();

console.log(process.env.AGENT_PERSONALITY)

// ---------- Logger -----------------------------------------------------
export const logger = new ConsoleLogger();
logger.level = 'info';

export const BASE_TIMEOUT_MS = 5000;
export const MESSAGE_ARRIVAL_DELAY_INCREMENT_MS = 2500;
export const MAX_ADDITIONAL_RANDOM_DELAY_MS = 15000;
export const MAX_TIMEOUT_MS = 15000;

export const CREDENTIAL_PATH = process.env.CREDENTIAL_STORE_PATH ?? './agent-creds.json';
export const ROOM_ID = 'spawn';

export const personality = personalities[
  process.env.AGENT_PERSONALITY as keyof typeof personalities
] as BotPersonality;

export const OPENAI_CONFIG = {
  modelName: process.env.OPENAI_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  maxTokens: 256,
};
