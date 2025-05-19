// src/graph.ts

import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { Message } from './types';
import { reviewMessage, generateReply, generateGreeting } from './llm';
import { personality } from './config';

// ---------- LangGraph setup ------------------------------------------
export const StateAnnotation = Annotation.Root({
  agentId: Annotation<string>,
  hasGreeted: Annotation<boolean>,
  messages: Annotation<Message[]>, // All historical messages
  newMessages: Annotation<Message[]>, // New messages to process in this run
  reply: Annotation<string | null>,
});

async function nodeReviewKeywords(state: typeof StateAnnotation.State) {
  return {
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
}

async function shouldActOnKeywordsOrReadFurther(state: typeof StateAnnotation.State) {
  const interestingMessagesFromKeywords = state.newMessages.filter(
    (msg) => msg.interesting && msg.authorId !== state.agentId
  );

  if (interestingMessagesFromKeywords.length > 0) {
    return 'generateReply';
  }

  if (Math.random() <= personality.read_probability) {
    return 'readWithLLM';
  }

  return END;
}

async function nodeReadWithLLM(state: typeof StateAnnotation.State) {
  const reviewedMessages: Message[] = await Promise.all(state.newMessages.map(async (message) => {
    if (message.authorId === state.agentId || message.interesting) {
      return message;
    }

    return await reviewMessage(message, personality);
  }));

  return { newMessages: reviewedMessages };
}

async function shouldGenerateReplyAfterLLMRead(state: typeof StateAnnotation.State) {
  const interestingMessages = state.newMessages.filter(
    (msg) => msg.interesting && msg.authorId !== state.agentId
  );

  if (interestingMessages.length > 0) {
    return 'generateReply';
  }

  return END;
}

async function nodeGenerateReply(state: typeof StateAnnotation.State) {
  if (!state.hasGreeted) {
    const reply = await generateGreeting(personality, state.agentId);
    return {
      reply,
      hasGreeted: true,
    };
  }


  const interestingMessages = state.newMessages.filter(
    (msg) => msg.interesting && msg.authorId !== state.agentId
  );

  if (interestingMessages.length === 0) {
    return {
      reply: null,
    };
  }

  const reply = await generateReply(
    [...state.messages, ...interestingMessages],
    personality,
    state.agentId
  );

  return {
    reply,
  };
}

function shouldReplyDirectly(state: typeof StateAnnotation.State) {
  return !state.hasGreeted ? 'generateReply' : 'reviewKeywords';
}

export const graph = new StateGraph(StateAnnotation)
  .addNode('reviewKeywords', nodeReviewKeywords, { retryPolicy: { maxAttempts: 3 } })
  .addNode('readWithLLM', nodeReadWithLLM, { retryPolicy: { maxAttempts: 3 } })
  .addNode('generateReply', nodeGenerateReply, { retryPolicy: { maxAttempts: 3 } })
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
