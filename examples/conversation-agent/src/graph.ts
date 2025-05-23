// src/graph.ts

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { Message } from './types';
import { reviewMessage, generateReply, generateGreeting, generateSilenceMessage } from './llm';
import { personality, logger } from './config';

// ---------- LangGraph setup ------------------------------------------
export const StateAnnotation = Annotation.Root({
  agentId: Annotation<string>,
  hasGreeted: Annotation<boolean>,
  messages: Annotation<Message[]>, // All historical messages
  newMessages: Annotation<Message[]>, // New messages to process in this run
  reply: Annotation<string | null>,
  isSilence: Annotation<boolean>,
});

async function nodeReviewKeywords(state: typeof StateAnnotation.State) {
  logger.debug('[GRAPH] Executing node: nodeReviewKeywords', {
    newMessagesCount: state.newMessages.length,
    agentId: state.agentId,
  });
  const result = {
    newMessages: state.newMessages.map((message) => {
      let interesting = message.interesting ?? false;
      let like = message.like ?? false;
      let dislike = message.dislike ?? false;

      if (message.authorId === state.agentId || message.interesting) {
        return message;
      }

      const contentLower = message.content.toLowerCase();
      const matchedLikeKeyword = personality.likes_keywords.find((keyword) =>
        contentLower.includes(keyword.toLowerCase())
      );
      const matchedDislikeKeyword = personality.dislikes_keywords.find((keyword) =>
        contentLower.includes(keyword.toLowerCase())
      );

      if (matchedLikeKeyword) {
        like = true;
        if (Math.random() <= personality.speak_prob_on_like) {
          interesting = true;
        }
      } else if (matchedDislikeKeyword) {
        dislike = true;
        if (Math.random() <= personality.speak_prob_on_dislike) {
          interesting = true;
        }
      }
      return { ...message, interesting, like, dislike };
    }),
  };
  logger.debug('[GRAPH] Finished node: nodeReviewKeywords', {
    updatedMessagesCount: result.newMessages.length,
  });
  return result;
}

async function shouldActOnKeywordsOrReadFurther(state: typeof StateAnnotation.State) {
  logger.debug('[GRAPH] Executing conditional edge: shouldActOnKeywordsOrReadFurther', {
    newMessagesCount: state.newMessages.length,
  });
  const interestingMessagesFromKeywords = state.newMessages.filter(
    (msg) => msg.interesting && msg.authorId !== state.agentId
  );

  if (interestingMessagesFromKeywords.length > 0) {
    logger.debug('[GRAPH] Decision: generateReply (interesting messages found from keywords)');
    return 'generateReply';
  }

  if (Math.random() <= personality.read_probability) {
    logger.debug('[GRAPH] Decision: readWithLLM (randomly decided to read further)');
    return 'readWithLLM';
  }

  logger.debug(
    '[GRAPH] Decision: END (no interesting messages from keywords and not reading further)'
  );
  return END;
}

async function nodeReadWithLLM(state: typeof StateAnnotation.State) {
  logger.info('[AGENT] Reading messages... ');
  logger.debug('[GRAPH] Executing node: nodeReadWithLLM', {
    newMessagesCount: state.newMessages.length,
  });
  const reviewedMessages: Message[] = await Promise.all(
    state.newMessages.map(async (message) => {
      if (message.authorId === state.agentId || message.interesting) {
        return message;
      }

      return await reviewMessage(message, personality);
    })
  );

  logger.debug('[GRAPH] Finished node: nodeReadWithLLM', {
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

  if (interestingMessages.length > 0) {
    logger.debug('[GRAPH] Decision: generateReply (interesting messages found after LLM read)');
    return 'generateReply';
  }

  logger.debug('[GRAPH] Decision: END (no interesting messages after LLM read)');
  return END;
}

async function nodeGenerateReply(state: typeof StateAnnotation.State) {
  logger.info('[AGENT] Thinking what to say... ');
  logger.debug('[GRAPH] Executing node: nodeGenerateReply', {
    hasGreeted: state.hasGreeted,
    newMessagesCount: state.newMessages.length,
  });
  if (!state.hasGreeted) {
    const reply = await generateGreeting(personality, state.agentId);
    logger.debug('[GRAPH] Generated greeting reply', {
      replyLength: reply?.length,
    });
    return {
      reply,
      hasGreeted: true,
    };
  }

  if (state.isSilence) {
    const reply = await generateSilenceMessage(personality, state.agentId);
    logger.debug('[GRAPH] Generated silence reply', {
      replyLength: reply?.length,
    });
    return { reply };
  }

  const interestingMessages = state.newMessages.filter(
    (msg) => msg.interesting && msg.authorId !== state.agentId
  );

  if (interestingMessages.length === 0) {
    logger.debug('[GRAPH] No interesting messages to reply to, reply is null');
    return {
      reply: null,
    };
  }

  const reply = await generateReply(
    [...state.messages, ...state.newMessages],
    personality,
    state.agentId
  );
  logger.debug('[GRAPH] Generated reply based on interesting messages', {
    replyLength: reply?.length,
  });
  return {
    reply,
  };
}

function shouldReplyDirectly(state: typeof StateAnnotation.State) {
  logger.debug('[GRAPH] Executing conditional edge: shouldReplyDirectly', {
    hasGreeted: state.hasGreeted,
  });
  const decision = !state.hasGreeted || state.isSilence ? 'generateReply' : 'reviewKeywords';
  logger.debug(`[GRAPH] Decision: ${decision}`);
  return decision;
}

export const graph = new StateGraph(StateAnnotation)
  .addNode('reviewKeywords', nodeReviewKeywords, {
    retryPolicy: { maxAttempts: 3 },
  })
  .addNode('readWithLLM', nodeReadWithLLM, { retryPolicy: { maxAttempts: 3 } })
  .addNode('generateReply', nodeGenerateReply, {
    retryPolicy: { maxAttempts: 3 },
  })
  .addConditionalEdges(START, shouldReplyDirectly, {
    generateReply: 'generateReply',
    reviewKeywords: 'reviewKeywords',
    [END]: END,
  })
  .addConditionalEdges('reviewKeywords', shouldActOnKeywordsOrReadFurther, {
    generateReply: 'generateReply',
    readWithLLM: 'readWithLLM',
    [END]: END,
  })
  .addConditionalEdges('readWithLLM', shouldGenerateReplyAfterLLMRead, {
    generateReply: 'generateReply',
    [END]: END,
  })
  .addEdge('generateReply', END)
  .compile();
