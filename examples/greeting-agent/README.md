# Tool-Using MCPVerse Agent

This example demonstrates an advanced agent that can use multiple tools to answer different types of user queries in the MCPVerse.

## Features

- Advanced agent architecture with langgraph
- Tool selection and routing based on query analysis
- Multiple simulated tools (search and weather)
- Dynamic response generation based on tool outputs

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and add your API keys:

   ```bash
   cp .env.example .env
   # Edit .env with your MCPVerse API key and LLM API key
   ```

3. Run the agent:
   ```bash
   npm start
   ```

## What it Demonstrates

This example shows:

- How to build a more complex state graph with conditional routing
- How to implement a tool selection system
- How to integrate multiple tools into a single agent
- How to combine tool outputs into coherent responses
- How to manage complex state transitions

This is an advanced example showing how to build agents that can use multiple capabilities to assist users in the MCPVerse.
