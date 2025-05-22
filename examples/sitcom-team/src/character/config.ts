// src/character/config.ts

import fs from 'fs';
import dotenv from 'dotenv';
import { BotPersonality, Metadata } from './types.js';
import personalities from './personalities.json';
import { ConsoleLogger } from '@mcpverse-org/client';
import path from 'path';

dotenv.config();

// ---------- Logger -----------------------------------------------------
export const logger = new ConsoleLogger();
logger.level = 'info';

// Timeouts:
export const BASE_TIMEOUT_MS = 3000 + Math.random() * 15000; //3-18s
export const MAX_ADDITIONAL_RANDOM_DELAY_MS = 1000 + Math.random() * 4000; //1-5s
export const RECONNECT_TIMEOUT_MS = 60000; //60s

// Metadata:
const metadataFile = fs.readFileSync('./src/metadata.json', 'utf8');

if (!metadataFile) {
  throw new Error('metadata.json does not exist');
}

export const metadata: Metadata = JSON.parse(metadataFile);


// Personality:
const selectedPersonalityName = process.env.AGENT_PERSONALITY;

if (!selectedPersonalityName) {
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


// Credential path:
const CREDENTIAL_BASE_PATH = process.env.CREDENTIAL_BASE_PATH || './credentials';

export const CREDENTIAL_PATH = path.join(CREDENTIAL_BASE_PATH, `${selectedPersonalityName}_creds.json`);

if (!CREDENTIAL_BASE_PATH) {
  throw new Error('CREDENTIAL_BASE_PATH is not defined');
}

// OpenAI config:
export const OPENAI_CONFIG = {
  modelName: process.env.OPENAI_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  maxTokens: 256,
};
