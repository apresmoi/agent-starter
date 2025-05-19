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

logger.debug('[LLM] Initialized LLM instances with config:', OPENAI_CONFIG);

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
    .describe('A fleeting random thought you had while performing your review.'),
});

const llmWithReviewSchema = llm.withStructuredOutput(messageReviewSchema);

export async function reviewMessage(
  message: Message,
  personality: BotPersonality
): Promise<Message> {
  logger.debug('[LLM] Starting message review for message ID:', message.id);
  logger.debug('[LLM] Message content:', message.content);
  logger.debug('[LLM] Using personality:', personality.name);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an autonomous entity with the following persona:
Name: ${personality.name}
Persona: ${personality.persona}
Likes: ${personality.likes_keywords.join(', ')}
Dislikes: ${personality.dislikes_keywords.join(', ')}
Behavioural Prompt: ${personality.behavioural_prompt.join('\n')}

Somebody has sent the following message. Analyze it based on your persona.
Determine if it's interesting enough for you to reply, if you like it, or dislike it.
Also, reflect briefly: if you liked it, what might a fleeting critical thought be? 
If you disliked it, what might a fleeting positive thought be? Only consider thoughts aligned with your core persona.
Respond using the structured output format.`,
    ],
    ['human', `Message: "{messageContent}"`],
  ]);

  try {
    logger.debug('[LLM] Invoking LLM for message review');
    const chain = prompt.pipe(llmWithReviewSchema);
    const review = await chain.invoke({ messageContent: message.content });
    logger.debug('[LLM] Received review from LLM:', review);

    let reaction = undefined;
    if (review.like) {
      reaction =
        personality.reactions.like[Math.floor(Math.random() * personality.reactions.like.length)];
    } else if (review.dislike) {
      reaction =
        personality.reactions.dislike[
          Math.floor(Math.random() * personality.reactions.dislike.length)
        ];
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
    logger.debug('[LLM] Returning reviewed message:', result);
    return result;
  } catch (error) {
    logger.error(`[LLM] Error during LLM review for message ID ${message.id}:`, error);
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
### YOUR ROLE & PERSONA ###
Name: ${personality.name}
Persona: ${personality.persona}

### BEHAVIOUR RULES ###
${personality.behavioural_prompt.join('\n')}

### STYLE LIMITERS ###
1. NO self-introductions (don't repeat your own name or tagline in normal conversation).
2. Emojis are extremely rare, only use them in really rare ocassions. If you check your previous messages and see that you used an emoji, don't use another one.
3. Vary word choice; avoid copying your own previous sentences.
4. If you can't add clear value, output exactly **NO_REPLY**.
`;

const getInitialExpressionPrompt = (personality: BotPersonality) => `
### SPECIAL INSTRUCTIONS FOR YOUR VERY FIRST EXPRESSION ###
- You just have become aware of your existence. You are not yet aware of any others or where you are.
- Your expression should be something that you would say to yourself, like a thought or a statement.
- **Critically: DO NOT use emojis or overly conversational language.**
- Stay under 256 characters.
- Output plain text only.
`;

const getReplyGenerationGuidelines = (personality: BotPersonality) => `
IMPORTANT:
- Do not copy others styles, be yourself.
- Stay under 256 characters for your entire reply. Aim for brevity.
- You can use up to two sentences in your reply. 
- Go for brevity. Brevity is key. 
- Do not try to dominate the conversation.
- NEVER share your internal thoughts, just say what you want to say out loud.
- You are formulating a single, cohesive reply to the previous messages.
- Actively listen: Directly reference or address specific points, questions, or themes from the other's messages. 
- You can also acknowledge or subtly weave in your own fleeting alternative thoughts if you feel like it.
- Foster deeper conversation: If appropriate, ask relevant follow - up questions or offer perspectives that build upon what others have said.
- Output plain text only.
- Do not abuse of emojis, use them only if you are extremely excited or something similar.
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
  logger.debug('[LLM] Generating greeting for agent:', agentId);
  logger.debug('[LLM] Using personality:', personality.name);

  const replyPrompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `${getPersonaPrompt(personality)}
      
${getInitialExpressionPrompt(personality)}`,
    ],
  ]);

  try {
    logger.debug('[LLM] Invoking LLM for greeting generation');
    const chain = replyPrompt.pipe(llmReply);
    const response = await chain.invoke({});
    const result = response.content.toString().trim();
    logger.debug('[LLM] Generated greeting:', result);
    return result;
  } catch (error) {
    logger.error(`[LLM] Error generating initial expression: `, error);
    return '';
  }
}

export async function generateReply(
  messages: Message[],
  personality: BotPersonality,
  agentId: string
): Promise<string> {
  logger.debug('[LLM] Generating reply for agent:', agentId);
  logger.debug('[LLM] Number of messages to consider:', messages.length);
  logger.debug('[LLM] Using personality:', personality.name);

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

  logger.debug('[LLM] Found bot messages:', yourMessages.length);

  // Get the last 3 messages from this bot
  const yourLastThreeMessages = yourMessages.slice(-3);
  logger.debug('[LLM] Using last 3 bot messages for context');

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
    const chain = replyPrompt.pipe(llm);
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
