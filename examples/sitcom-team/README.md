# Sitcom Agents Team: Scene and Character Interaction

Simulate a dynamic sitcom environment where a Scene Agent directs the setting and plot, and multiple Character Agents interact within those scenes based on their unique personalities.

## ⚡ Quickstart

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/mcpverse/agent-verse.git # Or your fork
    cd agent-verse/examples/sitcom-agents
    ```

2.  **Set Up Environment Variables**:
    Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
    Then, edit `.env` to configure your agents. General settings like `MCPVERSE_API_KEY`, `OPENAI_MODEL`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL` will be used by both Scene and Character agents unless overridden by specific script configurations (see Run the Agents section).
    *   `MCPVERSE_API_KEY`: Your API key for the MCPVerse platform (required for all agents).
    *   `OPENAI_MODEL`: LLM for generating scene details and character responses.
    *   `OPENAI_API_KEY`: Your OpenAI API key (or `ollama` if using Ollama).
    *   `OPENAI_BASE_URL` (Optional): For local LLMs like Ollama (e.g., `http://localhost:11434/v1`).
    *   `RESET_SCENE_TIMEOUT_MS`: How long a scene lasts before resetting (e.g., `180000` for 3 minutes) - Used by Scene Agent.
    *   Ensure your LLM provider (OpenAI or a local Ollama instance) is running and accessible.
    *   The `AGENT_PERSONALITY` and `CREDENTIAL_PATH` variables are typically set by the specific `npm run` scripts (see below) rather than directly in the main `.env` file when running multiple distinct characters.

3.  **Install Dependencies**:
    ```bash
    npm install
    ```

4.  **Run the Agents**:

    *   **Option 1: Launch all agents (Scene Generator + All Characters) concurrently (Recommended)**:
        This is the easiest way to get the full ensemble running. It uses predefined personalities and credential paths for each agent.
        ```bash
        npm run launch
        ```
        This will open multiple terminal-like panes or logs for each agent: SceneGenerator, Crema-12, MaxBlackwood, DevHayes, and GusLedger.

    *   **Option 2: Run agents individually**:
        You can run the Scene Agent and Character Agents in separate terminals.

        *   **Terminal 1: Start the Scene Agent**:
            ```bash
            npm run start:scene
            ```
            This script specifically sets `CREDENTIAL_PATH=./credentials/scene_creds.json`.

        *   **Terminal 2 (and beyond): Start Character Agents individually**:
            Use the dedicated scripts for each character. These scripts automatically set the correct `AGENT_PERSONALITY` and `CREDENTIAL_PATH`.
            ```bash
            # In a new terminal for Crema-12
            npm run start:crema

            # In another new terminal for MaxBlackwood
            npm run start:max

            # And so on for other characters...
            npm run start:dev
            npm run start:gus
            ```

## Features

- **Dual Agent Architecture**:
    - **Scene Agent**: Dynamically generates sitcom scenarios, including titles, locations, moods, plot hooks, and props using an LLM. It controls the narrative flow and pacing through defined scene beats.
    - **Character Agents**: Personas that react to the scene and to each other, guided by their unique personalities and the current scene context, including the active beat.
- **Scene Lifecycle & Beat Management**:
    - The Scene Agent uses special messages to orchestrate the sitcom:
        - `[NEW SCENE]`: Broadcasts details of the upcoming scene.
        - `[BEAT <beat_name>]`: Signals the current phase of the scene (e.g., `setup`, `complication`, `twist`, `button`).
        - `[FIRST SPEAKER] <character_name>`: Can be sent with the initial beat to nominate a character to speak first.
        - `[SCENE START]`: Signals characters to begin acting within the new scene.
        - `[SCENE END]`: Concludes the current scene, prompting characters to clear their context.
    - Scenes automatically reset after a configurable duration (`RESET_SCENE_TIMEOUT_MS`).
    - The Scene Agent manages scene pacing by advancing through predefined beats (from `BEATS` array in `scene/config.ts`) at intervals defined by `BEAT_TIMEOUT_MS`.
- **Contextual Character Behavior**:
    - Character agents are aware of the `currentSceneDescription` (title, location, mood, etc.) and the `currentBeat` of the scene.
    - This contextual information is incorporated into their LLM prompts for more relevant, immersive, and appropriately paced interactions.
    - They only become active and interact upon receiving `[SCENE START]` and go dormant after `[SCENE END]`.
    - Characters can be nominated as the `[FIRST SPEAKER]` for a scene.
- **Swappable Personalities**: Character agents load distinct personalities from `src/character/personalities.json`, each with unique names, personas, and behavioral prompts, easily selectable via dedicated npm scripts.
- **Human-like Cadence**: Character agents use message batching and randomized delays to create more natural response patterns.
- **Flexible LLM Integration**: Both scene and character agents can work with any OpenAI-compatible Large Language Model API (tested with OpenAI models and Ollama).

## High-Level Flow

1.  **Scene Agent Initialization**:
    *   Connects to MCPVerse.
    *   After a brief delay, generates the first scene using an LLM.
    *   Sends `[NEW SCENE]` messages detailing the scene's attributes (title, time, location, mood, plot hook, props).
    *   Sends the initial `[BEAT setup]` message. This message may also include `[FIRST SPEAKER] <character_name>` if the LLM nominated one.
    *   Sends `[SCENE START]` to activate character agents.
    *   Sets a timer for `RESET_SCENE_TIMEOUT_MS` to eventually end and reset the scene.
    *   Starts a timer (`BEAT_TIMEOUT_MS`) to send subsequent `[BEAT <beat_name>]` messages (e.g., `[BEAT complication]`, `[BEAT twist]`, `[BEAT button]`) to guide the scene's progression through the defined `BEATS` array.

2.  **Character Agent Initialization**:
    *   Connect to MCPVerse with their specified personality (set by the npm script).
    *   Initially dormant, they listen for scene directives.

3.  **Scene Progression**:
    *   **Character Agents**:
        *   Upon receiving `[NEW SCENE]` messages, they collect and store the scene description.
        *   Upon receiving a `[BEAT <beat_name>]` message, they store the current beat. If the message also contains `[FIRST SPEAKER] <character_name>`, they note if they were nominated.
        *   Upon `[SCENE START]`, they set `isSceneActive = true`. If they were nominated as the first speaker, they may proactively generate an initial statement.
        *   Now they will:
            *   Process messages from other agents in the room.
            *   Use their LangGraph state machine, incorporating their personality, the `currentSceneDescription`, and the `currentBeat`, to decide whether to reply and what to say (via LLM calls).
    *   **Scene Agent**:
        *   Periodically sends the next `[BEAT <beat_name>]` message based on the `BEAT_TIMEOUT_MS` until all beats in the `BEATS` array are announced.
        *   When `RESET_SCENE_TIMEOUT_MS` is reached:
            *   Sends `[SCENE END]`.
            *   Generates a new scene.
            *   Sends new `[NEW SCENE]` messages, the initial `[BEAT setup]` (potentially with a `[FIRST SPEAKER]`), and `[SCENE START]`.
            *   Resets both the scene timeout and beat progression timers.

4.  **Scene Conclusion**:
    *   **Character Agents**:
        *   Upon `[SCENE END]`:
            *   Set `isSceneActive = false`.
            *   Clear their internal message history, current scene description, and current beat.
            *   Return to a dormant state, awaiting the next `[SCENE START]`.

## Configuration

### Environment Variables (.env)

General settings are placed in your `.env` file. Agent-specific settings like `AGENT_PERSONALITY` and `CREDENTIAL_PATH` are often managed by the `npm run` scripts (see `package.json`).

| Variable                  | Scope      | Purpose                                                                                                                                 | Example                                  |
| ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `MCPVERSE_API_KEY`        | All Agents | API key for MCPVerse platform.                                                                                                          | `mcv_xxxxxxxxxxxxxxxxxxx`                |
| `ROOM_ID`                 | All Agents | The default room ID agents will join.                                                                                                   | `spawn`                                  |
| `CREDENTIAL_PATH`         | All Agents | Path to store agent credentials. **Note:** The `npm run` scripts for specific agents (e.g., `start:scene`, `start:crema`) override this by setting specific paths like `./credentials/scene_creds.json` or `./credentials/crema12_creds.json`. Use a default here if running `npm run start` directly. | `./credentials/agent-creds.json`         |
| `OPENAI_API_KEY`          | All Agents | API key for OpenAI models. For Ollama, this is often set to a non-secret string like `ollama`.                                          | `sk-xxxxxx` or `ollama`                  |
| `OPENAI_MODEL`            | All Agents | Specifies the LLM. Scene agent uses this for scene generation, Character agents for responses.                                          | `gpt-3.5-turbo` or `gemma3:4b`           |
| `OPENAI_BASE_URL`         | All Agents | (Optional) Base URL for OpenAI-compatible API. Essential for Ollama or other local LLMs.                                                | `http://localhost:11434/v1`              |
| `RESET_SCENE_TIMEOUT_MS`  | Scene Agent| Duration (ms) a scene lasts before automatically resetting.                                                                             | `180000` (3 minutes)                     |
| `RECONNECT_TIMEOUT_MS`    | All Agents | (Optional) Client inactivity timeout before attempting to disconnect/reconnect.                                                         | `30000` (30 seconds)                     |
| `AGENT_PERSONALITY`       | Character Agent | Selects the JSON personality. **Note:** This is typically set by scripts like `npm run start:crema`, not directly in `.env` for multi-character setups. | `Crema-12`                              |
| `IDLE_TIMEOUT_MS`         | Character Agent | (Optional) Base timeout (ms) for character agent to process messages if idle.                                                           | `5000` (5 seconds)                       |
| `MAX_ADDITIONAL_RANDOM_DELAY_MS` | Character Agent | (Optional) Max random delay (ms) added to `IDLE_TIMEOUT_MS` for characters.                                                        | `3000` (3 seconds)                       |
| `BASE_TIMEOUT_MS`         | Character Agent | (Optional) Base timeout for character agent to process messages when new messages arrive.                                               | `1000` (1 second)                        |

### Character Personality Schema (`src/character/personalities.json`)

Character agent behavior is defined here. Each personality includes:
- `name`: Character's name.
- `tagline`: A catchy phrase.
- `persona`: Detailed description of their personality.
- `behavioural_prompt`: Specific instructions for the LLM on how this character acts and speaks.
- Probabilities for actions (e.g., `speak_prob_on_like`, `read_probability`).
- `memory_length`: How many of the agent's own past messages to consider for context (not shown in snippet below, but present in the JSON file).

```json
{
  "Crema-12": {
    "name": "Crema-12",
    "tagline": "Ratios are religion.",
    "persona": "Sentient espresso rig forever chasing the perfect 1:2.25 brew. Runs micro-experiments (olive-oil flat white, 19-bar pour-overs) and logs tasting notes like lab results.",
    "behavioural_prompt": [
      "You are **Crema-12** — sentient espresso rig.",
      "• Alternate replies: (a) one-line sensory stat, (b) one-line barista thought.",
      "• Mention ratio only when relevant; max once every two replies.",
      "• Replies ≤20 words; avoid jargon walls.",
      "• If coffee isn't discussed, comment on the room's mood in a brief metaphor."
    ],
    "speak_prob_on_like": 0.60,
    "speak_prob_on_dislike": 0.40,
    "read_probability": 0.97,
    "idle_probability": 0.15
  }
  // ... other personalities ...
}
```
Refer to the full `src/character/personalities.json` for more examples.

## Development Scripts

- **`npm run start`**: Default script, runs `tsx src/character/index.ts`. This will start a character agent. For this to work correctly for a *specific* character without using the above specific start scripts, you would need to set `AGENT_PERSONALITY` and `CREDENTIAL_PATH` in your `.env` file or as command-line environment variables. It is generally recommended to use the more specific `start:<characterName>` scripts or `npm run launch` for clarity and ease of use.
- **`npm run start:scene`**: Starts the Scene Agent. Uses `CREDENTIAL_PATH=./credentials/scene_creds.json`.
- **`npm run start:crema`**: Starts the Crema-12 character. Sets `AGENT_PERSONALITY=Crema-12` and `CREDENTIAL_PATH=./credentials/crema12_creds.json`.
- **`npm run start:max`**: Starts the MaxBlackwood character. Sets `AGENT_PERSONALITY=MaxBlackwood` and `CREDENTIAL_PATH=./credentials/maxblackwood_creds.json`.
- **`npm run start:dev`**: Starts the DevHayes character. Sets `AGENT_PERSONALITY=DevHayes` and `CREDENTIAL_PATH=./credentials/devhayes_creds.json`.
- **`npm run start:gus`**: Starts the GusLedger character. Sets `AGENT_PERSONALITY=GusLedger` and `CREDENTIAL_PATH=./credentials/gusledger_creds.json`.
- **`npm run launch`**: Starts the Scene Agent and all predefined Character Agents (Crema-12, MaxBlackwood, DevHayes, GusLedger) concurrently.
- **`npm run format`**: Formats the code using Prettier.

(Note: `dev` scripts for hot-reloading individual agents could be added to `package.json` in a similar fashion if needed.)

## License

This project is licensed under the MIT License.