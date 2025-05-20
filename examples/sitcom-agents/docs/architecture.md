# Sitcom Agents: Architecture Deep Dive

This document outlines the architecture of the Sitcom Agents example, which comprises two main types of agents: a single **Scene Agent** that directs the environment, and one or more **Character Agents** that interact within the scenes.

## I. Scene Agent (`src/scene/`)

The Scene Agent acts as the director or playwright for the sitcom, dynamically creating and managing the narrative environment.

1.  **Role & Responsibilities**:
    *   Generates overarching scene parameters: title, time of day, location (name & description), mood, plot hook, and a list of relevant props.
    *   Controls the timing and flow of scenes, including when they start, end, and reset.
    *   Manages scene pacing and progression through defined beats (e.g., setup, complication, twist, button).
    *   Communicates scene information, beat progression, and directives to Character Agents via specific messages in the shared MCPVerse room.

2.  **Core Logic (`scene.ts`)**:
    *   **State Management**: Maintains the `currentScene` object, `sceneResetTimer`, `beatIndex`, and `beatTimer`.
    *   **Scene Generation (`llm.ts` -> `createScene`)**: Periodically (or on first run), invokes an LLM to generate details for a new scene. The prompt guides the LLM to create a cohesive sitcom-style scene, potentially including a `startingCharacterName`.
    *   **Beat Progression (`advanceBeat` method)**:
        *   Uses a `BEATS` array (defined in `config.ts`) to store the sequence of beats for a scene.
        *   Uses `BEAT_TIMEOUT_MS` (from `config.ts`) to time the interval between beats.
        *   The `advanceBeat` method is called after the scene starts and recursively calls itself to send subsequent beat messages.
        *   `beatIndex` tracks the current position in the `BEATS` array.
        *   `beatTimer` is the `NodeJS.Timeout` for scheduling the next beat.
    *   **Scene Lifecycle Communication**:
        *   Broadcasts scene details using multiple `[NEW SCENE]` messages.
        *   Sends the initial `[BEAT <beat_name>]` message (e.g., `[BEAT setup]`). If `createScene` provided a `startingCharacterName`, it is included in this first beat message as `[FIRST SPEAKER] <character_name>` on a new line.
        *   Sends a `[SCENE START]` message to signal Character Agents that the scene is now active.
        *   Subsequently sends `[BEAT <beat_name>]` messages for each beat in the `BEATS` array at timed intervals.
        *   Before generating a new scene (e.g., on timeout), it sends a `[SCENE END]` message to conclude the current one.
    *   **Timeouts**: Uses three primary timers:
        *   `RESET_SCENE_TIMEOUT_MS`: Determines the duration of a scene. When this timer elapses, the Scene Agent sends `[SCENE END]`, generates a new scene, and sends the corresponding messages.
        *   `BEAT_TIMEOUT_MS`: Controls the delay between successive `[BEAT]` messages during an active scene.
        *   `RECONNECT_TIMEOUT_MS`: Standard MCPVerse client inactivity/reconnection timer.
    *   **Concurrency Control**: Uses an `isGeneratingScene` flag to prevent multiple instances of `_generateScene()` from running concurrently.

3.  **Configuration (`config.ts`)**:
    *   LLM settings for scene generation.
    *   `RESET_SCENE_TIMEOUT_MS`, `RECONNECT_TIMEOUT_MS`, `BEAT_TIMEOUT_MS`.
    *   `BEATS`: An array defining the sequence of beats (e.g., `['setup', 'complication', 'twist', 'button']`).
    *   `ROOM_ID` for MCPVerse.

## II. Character Agents (`src/character/`)

Character Agents are the actors within the sitcom, each with a distinct personality. They react to the scene set by the Scene Agent and to messages from other Character Agents.

1.  **Role & Responsibilities**:
    *   Embody a specific personality defined in `personalities.json`.
    *   Listen for and interpret scene directives and beat progression from the Scene Agent.
    *   Participate in the conversation when a scene is active, tailoring responses based on their personality, the current scene context, and the active beat.
    *   Respond appropriately if nominated as the `[FIRST SPEAKER]`.
    *   Remain dormant when no scene is active or after a scene has ended.

2.  **Core Logic (`agent.ts`)**:
    *   **Personality Loading**: Loads a specific personality from `personalities.json` based on the `AGENT_PERSONALITY` environment variable.
    *   **Scene Awareness & State Management**:
        *   `currentSceneDescription: string | null`: Stores the aggregated details from `[NEW SCENE]` messages.
        *   `isSceneActive: boolean`: Tracks whether the current scene has been started and not yet ended.
        *   `currentBeat: string | null`: Stores the name of the current active beat (e.g., "setup", "complication").
        *   `nominatedStarterName: string | null`: Stores the name of the character nominated as the first speaker for the scene, if any.
        *   Message History (`messages`, `newMessagesBuffer`): Cleared upon `[SCENE END]`.
    *   **Scene Directive Handling (`_attachRoomListener`)**:
        *   On `[NEW SCENE]`: Appends the message content to `currentSceneDescription`.
        *   On `[BEAT <beat_name>]`: Parses the beat name and updates `this.currentBeat`. Also checks for an embedded `[FIRST SPEAKER]` directive if present in the same message.
        *   On `[FIRST SPEAKER] <character_name>` (if sent as a distinct message or parsed from a `[BEAT]` message): Updates `this.nominatedStarterName`.
        *   On `[SCENE START]`: Sets `isSceneActive = true`. Calls `_initiateSceneParticipation` which checks if the agent is the `nominatedStarterName` and if so, may generate an opening line.
        *   On `[SCENE END]`: Sets `isSceneActive = false`, clears message history, `currentSceneDescription`, `currentBeat`, and `nominatedStarterName`.
    *   **Guarded Interaction**: The agent's core message processing loop (`_processMessageBatch`) and scene initiation logic (`_initiateSceneParticipation`) are guarded by `isSceneActive` and consider `currentBeat` and `nominatedStarterName`.

3.  **Decision Engine - LangGraph (`graph.ts`)**:
    *   **State Definition (`StateAnnotation`)**: The graph's state now includes `sceneDescription: string | null` and `currentBeat: string | null`.
    *   **LLM-Powered Review & Reply (`llm.ts`)**:
        *   `reviewMessage`: Takes `sceneDescription` and `currentBeat` as arguments. The system prompt for the LLM now includes these details (if available) to provide context for analyzing messages relative to the scene and its current phase.
        *   `generateReply`: Also takes `sceneDescription` and `currentBeat`. The system prompt used for generating replies (via `getPersonaPrompt`) similarly prepends these details to the character's persona and behavioral rules, influencing the style and content of the response.
    *   The graph orchestrates calls to these LLM functions. The `shouldReadMessages` conditional edge can direct to `generateReply` if `isInitiatingStatement` is true (used by `_initiateSceneParticipation`).

4.  **Configuration (`config.ts`)**:
    *   `AGENT_PERSONALITY` to select character.
    *   LLM settings for character responses.
    *   Various timeouts for message batching, idle behavior, and client reconnection.

## III. Overall Interaction Flow

1.  The **Scene Agent** starts, generates a scene (potentially nominating a first speaker), and broadcasts `[NEW SCENE]` messages, followed by the initial `[BEAT setup]` (which might include the `[FIRST SPEAKER]` directive), and then `[SCENE START]`.
2.  **Character Agents** receive `[NEW SCENE]` and store the description. They receive `[BEAT setup]` and store the beat and any first speaker nomination. Upon `[SCENE START]`, they become active. If nominated, a character might make an initial statement.
3.  Active **Character Agents** listen for messages. When messages arrive, they are processed through their LangGraph.
4.  The LangGraph uses the character's **personality**, the current **scene description**, and the current **beat** to guide LLM calls for message review and reply generation.
5.  Characters send their replies to the room.
6.  The **Scene Agent** continues to send `[BEAT <beat_name>]` messages at timed intervals to progress the scene.
7.  When the **Scene Agent**'s `RESET_SCENE_TIMEOUT_MS` elapses, it sends `[SCENE END]`.
8.  **Character Agents** receive `[SCENE END]`, clear their context (history, scene description, current beat, nominated speaker), and become inactive.
9.  The Scene Agent generates a new scene, and the cycle repeats from step 1.

This architecture allows for a clear separation of concerns, with the Scene Agent managing the narrative environment and its pacing, and the Character Agents focusing on immersive, personality-driven interactions within that environment, adapting to each phase of the scene.
