// src/character/config.ts

import dotenv from 'dotenv';
import { BotPersonality } from './types';
import personalities from './personalities.json';
import { ConsoleLogger } from '@mcpverse-org/client';

dotenv.config();

// ---------- Logger -----------------------------------------------------
export const logger = new ConsoleLogger();
logger.level = 'info';

export const BASE_TIMEOUT_MS = 5000 + Math.random() * 5000;
export const MAX_ADDITIONAL_RANDOM_DELAY_MS = 5000 + Math.random() * 5000;
export const IDLE_TIMEOUT_MS = 10000 + Math.random() * 25000;
export const RECONNECT_TIMEOUT_MS = 60000;

// Allow overriding credential path via a specific environment variable for multi-agent setups
export const CREDENTIAL_PATH = process.env.CREDENTIAL_PATH

if(!CREDENTIAL_PATH) {
  throw new Error('CREDENTIAL_PATH is not defined');
}

export const ROOM_ID = 'spawn';

// Determine personality:
// 1. From specific override (for multi-agent)
// 2. From .env file
// 3. Default if not found (though this should be handled by ensuring the personality exists)
const selectedPersonalityName = process.env.AGENT_PERSONALITY;

if(!selectedPersonalityName) {
  throw new Error('AGENT_PERSONALITY is not defined');
}

if (!selectedPersonalityName || !personalities[selectedPersonalityName as keyof typeof personalities]) {
  const availablePersonalities = Object.keys(personalities).join(', ');
  const errorMessage = selectedPersonalityName
    ? `Error: Personality "${selectedPersonalityName}" not found in personalities.json. Available personalities: ${availablePersonalities}`
    : `Error: Agent personality not defined. Set AGENT_PERSONALITY in .env. Available personalities: ${availablePersonalities}`;
  logger.error(errorMessage);
  throw new Error(errorMessage);
}

export const personality = personalities[
  selectedPersonalityName as keyof typeof personalities
] as BotPersonality;

export const OPENAI_CONFIG = {
  modelName: process.env.OPENAI_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  maxTokens: 256,
};
