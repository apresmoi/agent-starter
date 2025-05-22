// src/scene/llm.ts

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { OPENAI_CONFIG, PREMISE } from './config.js';
import { Scene } from './types.js'; // Assuming Scene type doesn't need to change for this
import { logger } from './config.js';
import personalities from '../character/personalities.json';

const llm = new ChatOpenAI(OPENAI_CONFIG);

logger.debug('[LLM] Initialized LLM instances with config:', OPENAI_CONFIG);

// Zod schema for structured LLM output during message review
const sceneCreationSchema = z.object({
  title: z.string().describe('The title of the scene'),
  timeOfDay: z.string().describe('The time of day of the scene'),
  location: z.object({
    name: z.string().describe('The name of the location'),
    description: z.string().describe('A description of the location'),
  }).describe('The location of the scene'),
  mood: z.string().describe('The mood of the scene'),
  plotHook: z.string().describe('The plot hook of the scene'),
  props: z.array(z.string()).describe('The props of the scene'),
  startingCharacterName: z.string().describe('The name of ONE character from the provided list who should speak the first line or make the first significant action in this new scene. Must be one of the provided character names.'),
});

const llmWithSceneCreationSchema = llm.withStructuredOutput(sceneCreationSchema);

export async function createScene(): Promise<Scene & { startingCharacterName?: string }> {
  logger.debug('[LLM] Starting scene creation');

  const characterListForPrompt = Object.values(personalities).map(p =>
    `- Name: ${p.name}, Persona: ${p.persona.split('.')[0]}.` // Using first sentence of persona for brevity
  ).join('\n');

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `
${PREMISE.series_premise.join('\n')}      
      
You are an autonomous screenwriter with the following rules:
- You are writing a sitcom episode.
- The episode has a title, a time of day, a location, a mood, a plot hook, a list of props, and a designated character to start the scene.
- You are given a list of available characters with their names and a brief of their persona.
- You need to create a new scene based on these elements.
- The new scene should be a continuation of the story, and should be consistent with the previous scenes if any (though for this task, assume each scene is fresh unless prior context is explicitly given).
- The new scene should be interesting and engaging.
- The new scene should be concise and to the point.
- From the list of characters provided, select ONE character who should make the first significant statement or action in this scene. Output their exact name as startingCharacterName.`,
    ],
    [
      'human',
      `The list of available characters is:\n${characterListForPrompt}\n\nPlease generate a new scene, including specifying the startingCharacterName.`,
    ],
  ]);

  try {
    logger.debug('[LLM] Invoking LLM for scene creation');
    const chain = prompt.pipe(llmWithSceneCreationSchema);
    const scene = await chain.invoke({});
    logger.debug('[LLM] Received scene creation from LLM:', scene);

    // The schema ensures scene has startingCharacterName, title etc.
    // Type assertion might be needed if Scene type isn't directly compatible with Zod output + startingCharacterName
    return scene as Scene & { startingCharacterName?: string };
  } catch (error) {
    logger.error(`[LLM] Error during LLM scene creation:`, error);
    return {
      title: 'Error Scene',
      timeOfDay: 'Unknown',
      location: {
        name: 'Error Location',
        description: 'An error occurred',
      },
      mood: 'Confused',
      plotHook: 'LLM failed to generate a scene.',
      props: [],
      startingCharacterName: undefined, // Or a default/random character if preferred on error
    };
  }
}
