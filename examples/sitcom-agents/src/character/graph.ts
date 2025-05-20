// src/character/graph.ts

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { Message } from './types';
import { reviewMessage, generateReply } from './llm';
import { personality, logger } from './config';

// ---------- LangGraph setup ------------------------------------------
export const StateAnnotation = Annotation.Root({
  agentId: Annotation<string>,
  messages: Annotation<Message[]>, // All historical messages
  newMessages: Annotation<Message[]>, // New messages to process in this run
  reply: Annotation<string | null>,
  sceneDescription: Annotation<string | null>, // Added sceneDescription
  isInitiatingStatement: Annotation<boolean>, // Added for initial statements
  currentBeat: Annotation<string | null>, // Added for current beat
});

async function shouldReadMessages(state: typeof StateAnnotation.State) {
  logger.debug('[GRAPH] Executing conditional edge: shouldReadMessages', {
    newMessagesCount: state.newMessages.length,
    isInitiatingStatement: state.isInitiatingStatement,
  });

  if (state.isInitiatingStatement) {
    logger.debug('[GRAPH] Decision: generateReply (is initiating statement)');
    return 'generateReply'; // Go directly to generating a reply
  }

  if (personality.read_probability > Math.random()) {
    logger.debug('[GRAPH] Decision: readMessages (read probability met)');
    return 'readMessages';
  }

  logger.debug('[GRAPH] Decision: END (read probability not met and not initiating)');
  return END;
}

async function nodeReadMessages(state: typeof StateAnnotation.State) {
  logger.info('[AGENT] Reading messages... ');
  logger.debug('[GRAPH] Executing node: nodeReadMessages', {
    newMessagesCount: state.newMessages.length,
  });
  const reviewedMessages: Message[] = await Promise.all(
    state.newMessages.map(async (message) => {
      if (message.authorId === state.agentId || message.interesting) {
        return message;
      }

      return await reviewMessage(message, personality, state.sceneDescription, state.currentBeat);
    })
  );

  logger.debug('[GRAPH] Finished node: nodeReadMessages', {
    reviewedMessagesCount: reviewedMessages.length,
  });
  return { newMessages: reviewedMessages };
}

async function shouldGenerateReplyAfterLLMRead(state: typeof StateAnnotation.State) {
  logger.debug('[GRAPH] Executing conditional edge: shouldGenerateReplyAfterLLMRead', {
    newMessagesCount: state.newMessages.length,
  });
  const interestingMessages = state.newMessages.filter(
    (msg) => msg.interesting && msg.authorId !== state.agentId
  );

  if (interestingMessages.length === 0) {
    logger.debug('[GRAPH] Decision: END (no interesting messages after LLM read)');
    return END;
  }

  // If there's at least one interesting message, increase the likelihood of speaking.
  const MIN_SPEAK_PROBABILITY_IF_INTERESTING = 0.70; // 70% base chance if any message is interesting

  if (Math.random() < MIN_SPEAK_PROBABILITY_IF_INTERESTING) {
    logger.debug(
      `[GRAPH] Decision: generateReply (interesting message found, base probability ${MIN_SPEAK_PROBABILITY_IF_INTERESTING} met)`
    );
    return 'generateReply';
  }
  
  // Fallback to original like/dislike based probabilities if the base check didn't pass
  // This gives a second chance, weighted by personality.
  const likedMessages = interestingMessages.filter((msg) => msg.like);
  const dislikedMessages = interestingMessages.filter((msg) => !msg.like);

  if (likedMessages.length > dislikedMessages.length) {
    if (personality.speak_prob_on_like > Math.random()) {
      logger.debug(
        '[GRAPH] Decision: generateReply (fallback: liked messages, personality probability met)'
      );
      return 'generateReply';
    }
  } else {
    if (personality.speak_prob_on_dislike > Math.random()) {
      logger.debug(
        '[GRAPH] Decision: generateReply (fallback: not predominantly liked, personality probability met)'
      );
      return 'generateReply';
    }
  }

  logger.debug(
    '[GRAPH] Decision: END (interesting message, but all reply probabilities not met)'
  );
  return END;
}

async function nodeGenerateReply(state: typeof StateAnnotation.State) {
  logger.info('[AGENT] Thinking what to say... ');
  logger.debug('[GRAPH] Executing node: nodeGenerateReply', {
    newMessagesCount: state.newMessages.length,
    isInitiatingStatement: state.isInitiatingStatement,
  });

  let messagesForLLM: Message[] = [...state.messages];

  if (!state.isInitiatingStatement) {
    const interestingMessages = state.newMessages.filter(
      (msg) => msg.interesting && msg.authorId !== state.agentId
    );

    if (interestingMessages.length === 0) {
      logger.debug(
        '[GRAPH] Not an initiating statement and no interesting new messages to reply to, reply is null'
      );
      return { reply: null };
    }
    messagesForLLM.push(...interestingMessages);
  } else {
    // For an initiating statement, newMessages is expected to be empty.
    // messagesForLLM is already [...state.messages] (which is also empty for this specific path from _initiateSceneParticipation).
    logger.debug('[GRAPH] Generating an initiating statement. Historical messages count for LLM (should be 0): ', messagesForLLM.length);
  }

  const reply = await generateReply(
    messagesForLLM, // Use the prepared message list
    personality,
    state.agentId,
    state.sceneDescription,
    state.currentBeat
  );
  logger.debug('[GRAPH] Generated reply', {
    replyLength: reply?.length,
    isInitiatingStatement: state.isInitiatingStatement,
  });
  return {
    reply,
  };
}

export const graph = new StateGraph(StateAnnotation)
  .addNode('readMessages', nodeReadMessages, { retryPolicy: { maxAttempts: 3 } })
  .addNode('generateReply', nodeGenerateReply, {
    retryPolicy: { maxAttempts: 3 },
  })
  .addConditionalEdges(START, shouldReadMessages, { // From START
    readMessages: 'readMessages',                 // -> go to read new messages (normal flow)
    generateReply: 'generateReply',               // -> go to generate initial statement (initiation flow)
    [END]: END,                                   // -> end if not reading and not initiating
  })
  .addConditionalEdges('readMessages', shouldGenerateReplyAfterLLMRead, { // From readMessages node
    generateReply: 'generateReply',               // -> go to generate reply based on read messages
    [END]: END,                                   // -> end if no interesting messages after read
  })
  // .addEdge('readMessages', 'generateReply') // This edge is removed as conditional logic covers it
  .addEdge('generateReply', END) // From generateReply (either initial or reactive) -> END
  .compile();
