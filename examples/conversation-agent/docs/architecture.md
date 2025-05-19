# Agent Architecture Deep Dive

The conversation agent employs a sophisticated architecture to deliver natural and personality-driven interactions:

1.  **Message Ingestion & Intelligent Batching (`src/index.ts`)**:
    *   The agent connects to a chat room and actively listens for new messages.
    *   Incoming messages are collected into a buffer. To optimize API usage and foster a more natural conversational rhythm, these messages are processed in batches.
    *   A dynamic timeout system schedules the processing of these batches. This timeout intelligently adjusts based on the frequency of incoming messages and incorporates a random delay. This approach prevents predictable response patterns and allows the agent to strategically "wait" for more conversational context or a natural pause.

2.  **Decision Engine - LangGraph (`src/graph.ts`)**:
    *   Once a message batch is ready for processing, the agent feeds it into a LangGraph state machine. This graph is the core of the agent's decision-making, determining its actions based on the current state (which includes historical messages, new messages, and whether an initial greeting has been made).
    *   **Initial Greeting**: If the agent has not yet introduced itself to the room, it bypasses other analytical steps and directly generates a greeting message.
    *   **Keyword Analysis (`nodeReviewKeywords`)**: The agent first scans new messages for specific keywords defined in its active personality profile (e.g., `likes_keywords`, `dislikes_keywords` from `personalities.json`). If a keyword triggers a "like" or "dislike," the agent may flag the message as "interesting" based on configurable probabilities (`speak_prob_on_like`, `speak_prob_on_dislike`).
    *   **LLM-Powered Review (`nodeReadWithLLM`)**: If the initial keyword analysis doesn't identify an interesting message, or based on a `read_probability` (also defined in the personality profile), the agent sends messages to a Large Language Model (LLM) for deeper analysis (`reviewMessage` in `src/llm.ts`). Guided by the agent's specific persona, the LLM determines:
        *   Whether the message content is "interesting" enough to warrant a reply.
        *   Whether the agent "likes" or "dislikes" the message, which can subsequently trigger appropriate emoji reactions.
        *   Potential positive or negative alternative thoughts, and even a random fleeting thought. These enrich the agent's internal state and can inform future interactions.
    *   **Reply Generation (`nodeGenerateReply`)**: If any message in the batch is deemed "interesting" (either through keyword matching or LLM review), or if it's time for the initial greeting, the agent proceeds to generate a reply. It achieves this via another LLM call (`generateReply` or `generateGreeting` in `src/llm.ts`), which considers the agent's persona, behavioral prompts, and recent conversation history to craft a contextually relevant and engaging response. The agent also has the capability to decide not to reply by outputting "NO_REPLY".

3.  **Output and Interaction (`src/index.ts`)**:
    *   **Reactions**: If the LLM review process marked messages with a "like" or "dislike," the agent automatically applies corresponding emoji reactions (defined in `personalities.json`) to those messages in the chat.
    *   **Sending Replies**: If the agent successfully generated a reply, it sends it to the chat room.
    *   **Contextual Awareness & Adaptability**: The agent maintains a history of the conversation. If new messages arrive while the agent is in the middle of processing a batch and formulating a reply, it has the capability to abort the current reply. This allows it to re-evaluate the situation with the newest context, ensuring more timely and relevant responses.
    *   **Idle Behavior**: If no new messages are received and the agent has processed its current buffer, it can, based on an `idle_probability` (from its personality profile), decide to send an idle message (e.g., a random thought or observation) or simply wait for a longer period before potentially re-engaging.

4.  **Personality-Driven Behavior (`src/personalities.json`, `src/config.ts`)**:
    *   The agent's core behavior, conversational tone, and decision-making parameters are profoundly influenced by the selected personality profile, which is defined in `src/personalities.json`. Each profile includes its name, a detailed persona description, lists of keywords it likes and dislikes, specific behavioral prompts for the LLM, and various probabilities that govern its engagement style (e.g., likelihood to speak upon encountering a liked/disliked keyword, likelihood to perform a deeper LLM read of a message, likelihood to send an idle message).
    *   The agent determines its active personality at startup via the `AGENT_PERSONALITY` environment variable. 