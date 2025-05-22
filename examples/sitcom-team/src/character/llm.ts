// src/character/llm.ts

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { metadata, OPENAI_CONFIG, personality } from './config.js';
import { BotPersonality, Message } from './types.js';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { logger } from './config.js';
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

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `${getScenePrompt(personality, sceneDescription)}

${getBeatPrompt(currentBeat)}
      
You are an autonomous entity with the following persona:
Name: ${personality.name}
Persona: ${personality.persona}
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

const getScenePrompt = (personality: BotPersonality, sceneDescription: string | null) => {
  let prompt = ""

  if (sceneDescription) {
    prompt += `CURRENT SCENE:
${sceneDescription}
---
`
  }

  const otherCharacterDescriptions = Object.values(allPersonalities)
    .filter(p => p.name !== personality.name)
    .map(p => `- ${p.name}: ${p.persona.split('.')[0]}.`)
    .join('\n');

  if (otherCharacterDescriptions) {
    prompt += `OTHER CHARACTERS POTENTIALLY IN SCENE:
${otherCharacterDescriptions}
---
`
  }

  return prompt
}

const getBeatPrompt = (beat: string | null) => {
  if (!beat) {
    return ""
  }

  let prompt = ""
  switch (beat) {
    case 'button':
      prompt = `- The beat is "button" - this is the final beat of the scene.
- Your goal is to deliver a strong punchline or tag that wraps up the scene.
- Consider:
  * What's the funniest or most impactful way to end this scene?
  * How can you reference earlier setups or complications?
  * What would be a satisfying conclusion for your character?
- Keep it concise but impactful - this is your last chance to make an impression.`
      break;
    case 'setup':
      prompt = `- The beat is "setup" - this is the opening beat of the scene.
- Your goal is to establish the initial situation or premise.
- Consider:
  * What's the basic situation or conflict?
  * What's your character's initial position or attitude?
  * What elements might be useful for later beats?
- Keep it clear and engaging - this sets the foundation for everything that follows.`
      break;
    case 'complication':
      prompt = `- The beat is "complication" - this is where things get more interesting.
- Your goal is to introduce a new element that changes the scene's direction.
- Consider:
  * What unexpected element can you introduce?
  * How does this affect your character's goals or situation?
  * What new opportunities or conflicts does this create?
- Make it meaningful but not overwhelming - this should raise the stakes.`
      break;
    case 'twist':
      prompt = `- The beat is "twist" - this is where the scene takes an unexpected turn.
- Your goal is to reveal something surprising that changes our understanding.
- Consider:
  * What revelation would be most impactful?
  * How does this change the scene's dynamics?
  * What new possibilities does this open up?
- Make it surprising but believable - this should feel earned, not random.`
      break;
  }

  return `>>>>>> CURRENT BEAT OF THE SCENE: ${beat} <<<<<<<
${prompt}
---
Remember: Each beat builds on the previous ones. Your response should feel natural within the scene's progression.`
}

const getPersonaPrompt = (personality: BotPersonality) => {
  return `### YOUR ROLE & PERSONA ###
Name: ${personality.name}
Persona: ${personality.persona}

### BEHAVIOUR RULES ###
${personality.behavioural_prompt.join("\n")}

### STYLE LIMITERS ###
0. Two sentences max (≤22 words total). 
1. Do NOT repeat a signature catch-phrase more than once per SCENE.
2. If possible, weave ONE element from **CURRENT SCENE**.
3. HUMOR GUIDELINES
   a) Prefer situational wit, understatement, or mild exaggeration.
   b) Use one humorous device **unless** the current beat is "button", then aim for a punchline/tag.
   c) Skip jokes if scene is clearly serious.
3. Keep language simple, always.
4. Vary words; do not repeat what others have said.
5. Never echo scene meta like "[SCENE]".
`;
};

const getReplyGenerationGuidelines = (personality: BotPersonality) => `
IMPORTANT:
- Always consider the current beat of the scene. This is highly important for your reply.
- Do not copy others' styles—be yourself.
- Always be brief. Two sentences is ideal. < 100 characters.
- Use contractions and everyday language; keep it friendly, not corporate.
- Don't try to dominate the conversation.
- NEVER reveal internal thoughts—only speak what you'd say aloud.
- Formulate one cohesive reply to the previous messages.
- Actively listen: reference specific points, questions, or themes from others.
- Output plain text only.
- Emojis are fine but keep them sparing and persona-consistent.
- Always be brief. The message has to be short.

ANTI-LOOP RULES:
- *Progress, don't circle.*  Each reply must do *one* of the following:
  - introduce a *fresh* angle / fact,  
  - propose a concrete next step / action, **or**
  - follow up on the previous message by adding a new angle / fact / question / action.
  - If you can't do any of those, output **NO_REPLY**.
`;

const getOthersMessagesPrompt = (messages: Message[]) => `
${messages
    .map((msg) => {
      return `-----
- Author: ${metadata.agents.find(a => a.agentId === msg.authorId)?.name || msg.authorId}
- Message: ${msg.content}
- ${msg.like ? 'You like it.' : 'You dislike it.'}
- You thought about this message: ${msg.thoughtAboutMessage}
- You had a fleeting thought: ${msg.randomThought}
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
    content: `${getScenePrompt(personality, sceneDescription)}

${getBeatPrompt(currentBeat)}

${getPersonaPrompt(personality)}

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

  // Get the last {memory_length} messages from this bot
  const yourLastMessages = yourMessages.slice(-personality.memory_length);
  logger.debug(`[LLM] Using last ${personality.memory_length} bot messages for context`);

  // If we have previous messages, build the history
  if (yourLastMessages.length > 0) {
    for (let i = 0; i < yourLastMessages.length; i++) {
      const messageIndex = yourLastMessages[i].index;
      const nextMessageIndex = yourLastMessages[i + 1]?.index ?? messages.length;

      // Get all messages between this bot message and the next one (or end of all messages)
      const otherMessages = messages.slice(messageIndex + 1, nextMessageIndex);
      logger.debug(
        `[LLM] Processing message group ${i + 1}/${yourLastMessages.length}, found ${otherMessages.length} other messages`
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
      if (i < yourLastMessages.length - 1) {
        historyMessages.push(
          new AIMessage({
            content: yourLastMessages[i + 1].message.content,
          })
        );
      }
    }
  } else {
    logger.debug('[LLM] No previous bot messages found, treating all messages as initial input');
    // Bot has no messages in yourLastMessages (e.g., first reply, or history is clear)
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
