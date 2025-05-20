// src/character/llm.ts

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { OPENAI_CONFIG } from './config';
import { BotPersonality, Message } from './types';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from './config';
import allPersonalities from './personalities.json';

const llm = new ChatOpenAI(OPENAI_CONFIG);
const llmReply = new ChatOpenAI({ ...OPENAI_CONFIG, maxTokens: 80 });

logger.debug('[LLM] Initialized LLM instances with config:', OPENAI_CONFIG);

// Zod schema for structured LLM output during message review
const messageReviewSchema = z.object({
  isInteresting: z
    .boolean()
    .describe(
      'Whether the message is interesting enough for you to consider replying. Analize according to your persona.'
    ),
  like: z.boolean().describe("Wheter you like or dislike the message."),
  thoughtAboutMessage: z
    .string()
    .nullable()
    .optional()
    .describe(
      "A brief thought you had about the message, based on your persona. It could be anything, from a critical thought to a positive thought."
    ),
  randomThought: z
    .string()
    .nullable()
    .optional()
    .describe(
      'A fleeting and intrusive random thought you had while performing your review, could be anything based on your persona.'
    ),
});

const llmWithReviewSchema = llm.withStructuredOutput(messageReviewSchema);

export async function reviewMessage(
  message: Message,
  personality: BotPersonality,
  sceneDescription: string | null,
  currentBeat: string | null
): Promise<Message> {
  logger.debug('[LLM] Starting message review for message ID:', message.id);
  logger.debug('[LLM] Message content:', message.content);
  logger.debug('[LLM] Using personality:', personality.name);
  if (currentBeat) {
    logger.debug('[LLM] Current beat:', currentBeat);
  }

  const otherCharacterDescriptions = Object.values(allPersonalities)
    .filter(p => p.name !== personality.name)
    .map(p => `- ${p.name}: ${p.persona.split('.')[0]}.`)
    .join('\n');

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `${sceneDescription ? `---
CURRENT SCENE:
${sceneDescription}
---
` : ''}
${otherCharacterDescriptions ? `
OTHER CHARACTERS POTENTIALLY IN SCENE:

${otherCharacterDescriptions}
---
` : ''}
${currentBeat ? `
CURRENT BEAT OF THE SCENE:
${currentBeat}
---
` : ''}
      
You are an autonomous entity with the following persona:
Name: ${personality.name}
Persona: ${personality.persona}
Behavioural Prompt: ${personality.behavioural_prompt.join('\n')}

INSTRUCTIONS
1. Decide quickly: reply or ignore? (isInteresting).
2. Mark like/dislike from your POV.
3. Add ONE short thought (critic if like, compliment if dislike) ≤10 words.
4. Optionally add ONE random intrusive thought ≤8 words.
Return JSON only.`,
    ],
    ['human', `Message: "{messageContent}"`],
  ]);

  try {
    logger.debug('[LLM] Invoking LLM for message review');
    const chain = prompt.pipe(llmWithReviewSchema);
    const review = await chain.invoke({ messageContent: message.content });
    logger.debug('[LLM] Received review from LLM:', review);

    const result = {
      ...message,
      interesting: review.isInteresting,
      like: review.like,
      thoughtAboutMessage: review.thoughtAboutMessage,
      randomThought: review.randomThought,
    };
    logger.debug('[LLM] Returning reviewed message:', result);
    return result;
  } catch (error) {
    logger.error(`[LLM] Error during LLM review for message ID ${message.id}:`, error);
    return {
      ...message,
      interesting: false,
      like: false,
      thoughtAboutMessage: null,
      randomThought: null,
    };
  }
}

const getPersonaPrompt = (personality: BotPersonality, sceneDescription: string | null, currentBeat: string | null) => {
  const otherCharacterDescriptions = Object.values(allPersonalities)
    .filter(p => p.name !== personality.name)
    .map(p => `- ${p.name}: ${p.persona.split('.')[0]}.`)
    .join('\n');

  return `
${sceneDescription ? `CURRENT SCENE:
${sceneDescription}
---
` : ''}${otherCharacterDescriptions ? `OTHER CHARACTERS POTENTIALLY IN SCENE:
${otherCharacterDescriptions}
---
` : ''}${currentBeat ? `CURRENT BEAT OF THE SCENE:
${currentBeat}
---
` : ''}### YOUR ROLE & PERSONA ###
Name: ${personality.name}
Persona: ${personality.persona}

### BEHAVIOUR RULES ###
${personality.behavioural_prompt.join('\n')}

### STYLE LIMITERS ###
0. Two sentences max (≤22 words total). Do NOT repeat a signature catch-phrase more than once per SCENE.
1. If possible, weave ONE element from **CURRENT SCENE**.
2. HUMOR GUIDELINES
   a) Prefer situational wit, understatement, or mild exaggeration.
   b) Use one humorous device **unless** the current beat is "button", then aim for a punchline/tag.
   c) Skip jokes if scene is clearly serious.
3. Avoid dense jargon; keep language simple.
4. Vary words; no direct repetition of others' lines.
5. Never echo scene meta like "[SCENE]".
`;
};

const getOthersMessagesPrompt = (messages: Message[]) => `
${messages
    .map((msg) => {
      return `-----
- Author: ${msg.authorId}
- Message: ${msg.content}
- ${msg.like ? 'You liked this message.' : 'You disliked this message.'}
- A thought you had about this message: ${msg.thoughtAboutMessage}
- A random intrusive thought you had while performing your review: ${msg.randomThought}
-----
`;
    })
    .join('\n')}
`;

export async function generateReply(
  messages: Message[],
  personality: BotPersonality,
  agentId: string,
  sceneDescription: string | null,
  currentBeat: string | null
): Promise<string> {
  logger.debug('[LLM] Generating reply for agent:', agentId);
  logger.debug('[LLM] Number of messages to consider:', messages.length);
  logger.debug('[LLM] Using personality:', personality.name);
  if (sceneDescription) {
    logger.debug('[LLM] Using scene description:', sceneDescription);
  }
  if (currentBeat) {
    logger.debug('[LLM] Current beat:', currentBeat);
  }

  const systemMessage = new SystemMessage({
    content: `${getPersonaPrompt(personality, sceneDescription, currentBeat)}`,
  });

  const historyMessages: BaseMessage[] = [];

  // Find all messages from this bot
  const yourMessages = messages.reduce(
    (r, msg, index) => {
      if (msg.authorId === agentId) {
        return [...r, { index, message: msg }];
      }
      return r;
    },
    [] as { index: number; message: Message }[]
  );

  logger.debug('[LLM] Found bot messages:', yourMessages.length);

  // Get the last {memory_length} messages from this bot
  const yourLastThreeMessages = yourMessages.slice(-personality.memory_length);
  logger.debug(`[LLM] Using last ${personality.memory_length} bot messages for context`);

  // If we have previous messages, build the history
  if (yourLastThreeMessages.length > 0) {
    for (let i = 0; i < yourLastThreeMessages.length; i++) {
      const messageIndex = yourLastThreeMessages[i].index;
      const nextMessageIndex = yourLastThreeMessages[i + 1]?.index ?? messages.length;

      // Get all messages between this bot message and the next one (or end of all messages)
      const otherMessages = messages.slice(messageIndex + 1, nextMessageIndex);
      logger.debug(
        `[LLM] Processing message group ${i + 1}/${yourLastThreeMessages.length}, found ${otherMessages.length} other messages`
      );

      // Add the other messages to the history
      if (otherMessages.length > 0) {
        historyMessages.push(
          new HumanMessage({
            content: getOthersMessagesPrompt(otherMessages),
          })
        );
      }

      // Add the next message from the bot, if it's not the last one in the loop
      if (i < yourLastThreeMessages.length - 1) {
        historyMessages.push(
          new AIMessage({
            content: yourLastThreeMessages[i + 1].message.content,
          })
        );
      }
    }
  } else {
    logger.debug('[LLM] No previous bot messages found, treating all messages as initial input');
    // Bot has no messages in yourLastThreeMessages (e.g., first reply, or history is clear)
    // Treat all current messages as the initial human input.
    if (messages.length > 0) {
      historyMessages.push(
        new HumanMessage({
          content: getOthersMessagesPrompt(messages),
        })
      );
    }
  }

  logger.debug('[LLM] Built conversation history with messages:', historyMessages.length);

  const replyPrompt = ChatPromptTemplate.fromMessages([systemMessage, ...historyMessages]);

  try {
    logger.debug('[LLM] Invoking LLM for reply generation');
    const chain = replyPrompt.pipe(llmReply);
    const response = await chain.invoke({});
    const replyContent = response.content.toString().trim();
    const result = replyContent && replyContent !== 'NO_REPLY' ? replyContent : '';
    logger.debug('[LLM] Generated reply:', result);
    return result;
  } catch (error) {
    logger.error(`[LLM] Error generating or sending consolidated reply: `, error);
    return '';
  }
}
