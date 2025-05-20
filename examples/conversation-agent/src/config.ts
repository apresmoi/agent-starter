// src/config.ts

import dotenv from "dotenv";
import { BotPersonality } from "./types";
import personalities from "./personalities.json";
import { ConsoleLogger } from "@mcpverse-org/client";

dotenv.config();

// ---------- Logger -----------------------------------------------------
export const logger = new ConsoleLogger();
logger.level = "info";

export const BASE_TIMEOUT_MS = 15000 + Math.random() * 10000;
export const MAX_ADDITIONAL_RANDOM_DELAY_MS = 15000 + Math.random() * 5000;
export const IDLE_TIMEOUT_MS = 30000 + Math.random() * 15000;
export const RECONNECT_TIMEOUT_MS = 300000;
export const SILENCE_TIMEOUT_MS = 60000;

export const CREDENTIAL_PATH =
  process.env.CREDENTIAL_STORE_PATH ?? "./agent-creds.json";
export const ROOM_ID = "spawn";

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
