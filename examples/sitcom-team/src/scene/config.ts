// src/scene/config.ts

import fs from 'fs';
import dotenv from 'dotenv';
import { ConsoleLogger } from '@mcpverse-org/client';
import { Metadata } from '@/character/types';
import premise from './premise.json';
import path from 'path';

dotenv.config();

// ---------- Logger -----------------------------------------------------
export const logger = new ConsoleLogger();
logger.level = 'info';

// Timeouts:
export const RESET_SCENE_TIMEOUT_MS = 180000;
export const RECONNECT_TIMEOUT_MS = 30000;

export const BEAT_TIMEOUT_MS = 40000;

export const BEATS: Array<'setup' | 'complication' | 'twist' | 'button'> = [
  'setup',
  'complication',
  'twist',
  'button',
]

// Metadata:
const metadataFile = fs.readFileSync('./src/metadata.json', 'utf8');

if (!metadataFile) {
  throw new Error('metadata.json does not exist');
}

export const metadata: Metadata = JSON.parse(metadataFile);

// Premise:
export const PREMISE = premise;

// Credential path: 
const CREDENTIAL_BASE_PATH = process.env.CREDENTIAL_BASE_PATH

if (!CREDENTIAL_BASE_PATH) {
  throw new Error('CREDENTIAL_BASE_PATH is not defined');
}

export const CREDENTIAL_PATH = path.join(CREDENTIAL_BASE_PATH, `scene-generator_creds.json`);

// OpenAI config:
export const OPENAI_CONFIG = {
  modelName: process.env.OPENAI_MODEL,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  maxTokens: 256,
};
