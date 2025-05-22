// src/character/types.ts

export interface BotPersonality {
  name: string;
  tagline: string;
  persona: string;
  behavioural_prompt: string[];
  speak_prob_on_like: number;
  speak_prob_on_dislike: number;
  read_probability: number;
  idle_probability: number;
  memory_length: number;
}

export interface Message {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
  interesting?: boolean;
  like?: boolean;
  thoughtAboutMessage?: string | null;
  randomThought?: string | null;
}

export interface Metadata {
  roomId: string;
  agents: {
    agentId: string;
    name: string;
  }[];
}