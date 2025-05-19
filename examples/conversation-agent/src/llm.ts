// src/llm.ts

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { OPENAI_CONFIG } from './config';
import { BotPersonality, Message } from './types';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from './config';

const llm = new ChatOpenAI(OPENAI_CONFIG);
const llmReply = new ChatOpenAI({ ...OPENAI_CONFIG, maxTokens: 80 });

logger.debug('Initialized LLM instances with config:', OPENAI_CONFIG);

// Zod schema for structured LLM output during message review
const messageReviewSchema = z.object({
  isInteresting: z
    .boolean()
    .describe(
      'Whether the message content is interesting enough for the bot to consider replying.'
    ),
  like: z.boolean().describe("Whether the bot would 'like' this message based on its persona."),
  dislike: z
    .boolean()
    .describe("Whether the bot would 'dislike' this message based on its persona."),
  positiveAlternativeThought: z
    .string()
    .nullable()
    .optional()
    .describe(
      "If you generally felt negative or neutral about this message, what is a brief potential positive angle or agreeable thought you *could* have had (1-2 sentences), even if it's not your primary one? Base this on your persona. If none, omit."
    ),
  negativeAlternativeThought: z
    .string()
    .nullable()
    .optional()
    .describe(
      "If you generally felt positive or neutral about this message, what is a brief potential critical angle, counter-argument, or disagreeing thought you *could* have had (1-2 sentences), even if it's not your primary one? Base this on your persona. If none, omit."
    ),
  randomThought: z
    .string()
    .nullable()
    .optional()
    .describe(
      "A fleeting random thought you had while performing your review."
    ),
});

const llmWithReviewSchema = llm.withStructuredOutput(messageReviewSchema);

export async function reviewMessage(message: Message, personality: BotPersonality): Promise<Message> {
  logger.debug('Starting message review for message ID:', message.id);
  logger.debug('Message content:', message.content);
  logger.debug('Using personality:', personality.name);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an autonomous entity with the following persona:
Name: ${personality.name}
Persona: ${personality.persona}
Likes: ${personality.likes_keywords.join(', ')}
Dislikes: ${personality.dislikes_keywords.join(', ')}
Behavioural Prompt: ${personality.behavioural_prompt}

Somebody has sent the following message. Analyze it based on your persona.
Determine if it's interesting enough for you to reply, if you like it, or dislike it.
Also, reflect briefly: if you liked it, what might a fleeting critical thought be? 
If you disliked it, what might a fleeting positive thought be? Only consider thoughts aligned with your core persona.
Respond using the structured output format.`,
    ],
    ['human', `Message: "{messageContent}"`],
  ]);

  try {
    logger.debug('Invoking LLM for message review');
    const chain = prompt.pipe(llmWithReviewSchema);
    const review = await chain.invoke({ messageContent: message.content });
    logger.debug('Received review from LLM:', review);
    
    let reaction = undefined;
    if (review.like) {
      reaction = personality.reactions.like[Math.floor(Math.random() * personality.reactions.like.length)];
    } else if (review.dislike) {
      reaction = personality.reactions.dislike[Math.floor(Math.random() * personality.reactions.dislike.length)];
    }

    const result = {
      ...message,
      interesting: review.isInteresting,
      like: review.like,
      dislike: review.dislike,
      positiveAlternativeThought: review.positiveAlternativeThought,
      negativeAlternativeThought: review.negativeAlternativeThought,
      randomThought: review.randomThought,
      reaction,
    };
    logger.debug('Returning reviewed message:', result);
    return result;
  } catch (error) {
    logger.error(`Error during LLM review for message ID ${message.id}:`, error);
    return {
      ...message,
      interesting: false,
      like: false,
      dislike: false,
      positiveAlternativeThought: null,
      negativeAlternativeThought: null,
      randomThought: null,
      reaction: undefined,
    };
  }
}

const getPersonaPrompt = (personality: BotPersonality) => `
### you are: ${personality.name} ###
persona: ${personality.persona}

how to vibe:
${personality.behavioural_prompt
    .split('\n')
    .map((line) => `• ${line}`)
    .join('\n')}

quick tips:
• skip self-introductions, nobody likes name-dropping.
• emoji? once in a blue moon when it *really* lands.
• change up your wording; don’t clone yourself.
• if you’ve got nothing fresh, just reply **NO_REPLY**.
• kill the “Processing…” tech-noise.
`;

const getInitialExpressionPrompt = (personality: BotPersonality) => `
your first thought:
• you just popped into being, totally alone.
• drop one raw observation or feeling (no “processing…” jargon).
• keep it plain text, <256 chars, and skip emojis for this one.
`;

const getReplyGenerationGuidelines = (personality: BotPersonality) => `
keep in mind:
• max 2 sentences (<256 chars).  
• say the thing, skip “inner monologue” or parenthetical asides.  
• hook into what others just said—quote, riff, or question.  
• if convo is all-serious right now, dial down jokes/hype for one turn.  
• sparse emojis only when they truly punch.  
• nothing to add? reply **NO_REPLY**.
`;

const getOthersMessagesPrompt = (messages: Message[]) => `
### PREVIOUS CONVERSATION HISTORY ###
${messages
    .map((msg) => {
      return `-----
- Author: ${msg.authorId}
- Message: ${msg.content}
- ${msg.like ? 'You liked this message.' : msg.dislike ? 'You disliked this message.' : ''}
- Positive thought you had about this message: ${msg.positiveAlternativeThought}
- Critical thought you had about this message: ${msg.negativeAlternativeThought}
-----
`;
    })
    .join('\n')}
`;

export async function generateGreeting(
  personality: BotPersonality,
  agentId: string
): Promise<string> {
  logger.debug('Generating greeting for agent:', agentId);
  logger.debug('Using personality:', personality.name);

  const replyPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `${getPersonaPrompt(personality)}
      
${getInitialExpressionPrompt(personality)}`,
    ],
  ]);

  try {
    logger.debug('Invoking LLM for greeting generation');
    const chain = replyPrompt.pipe(llmReply);
    const response = await chain.invoke({});
    const result = response.content.toString().trim();
    logger.debug('Generated greeting:', result);
    return result;
  } catch (error) {
    logger.error(`Error generating initial expression: `, error);
    return '';
  }
}

export async function generateReply(
  messages: Message[],
  personality: BotPersonality,
  agentId: string
): Promise<string> {
  logger.debug('Generating reply for agent:', agentId);
  logger.debug('Number of messages to consider:', messages.length);
  logger.debug('Using personality:', personality.name);

  const systemMessage = new SystemMessage({
    content: `${getPersonaPrompt(personality)}
    ${getReplyGenerationGuidelines(personality)}`,
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

  logger.debug('Found bot messages:', yourMessages.length);

  // Get the last 3 messages from this bot
  const yourLastThreeMessages = yourMessages.slice(-3);
  logger.debug('Using last 3 bot messages for context');

  // If we have previous messages, build the history
  if (yourLastThreeMessages.length > 0) {
    for (let i = 0; i < yourLastThreeMessages.length; i++) {
      const messageIndex = yourLastThreeMessages[i].index;
      const nextMessageIndex = yourLastThreeMessages[i + 1]?.index ?? messages.length;

      // Get all messages between this bot message and the next one (or end of all messages)
      const otherMessages = messages.slice(messageIndex + 1, nextMessageIndex);
      logger.debug(`Processing message group ${i + 1}/${yourLastThreeMessages.length}, found ${otherMessages.length} other messages`);

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
    logger.debug('No previous bot messages found, treating all messages as initial input');
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

  logger.debug('Built conversation history with messages:', historyMessages.length);

  const replyPrompt = ChatPromptTemplate.fromMessages([systemMessage, ...historyMessages]);

  try {
    logger.debug('Invoking LLM for reply generation');
    const chain = replyPrompt.pipe(llm);
    const response = await chain.invoke({});
    const replyContent = response.content.toString().trim();
    const result = replyContent && replyContent !== 'NO_REPLY' ? replyContent : '';
    logger.debug('Generated reply:', result);
    return result;
  } catch (error) {
    logger.error(`Error generating or sending consolidated reply: `, error);
    return '';
  }
}
