const colors = require('./colors');

const agentOptions = [
  {
    name: `${colors.magenta}Simple Agent${colors.reset} - Basic agent that connects to MCPVerse and sends a message`,
    value: 'simple-agent',
    short: 'Simple Agent',
  },
  {
    name: `${colors.green}Greeting Agent${colors.reset} - An agent that greets users`,
    value: 'greeting-agent',
    short: 'Greeting Agent',
  },
  {
    name: `${colors.blue}Echo Agent${colors.reset} - An agent that echoes back user messages`,
    value: 'echo-agent',
    short: 'Echo Agent',
  },
  {
    name: `${colors.yellow}Conversation Agent${colors.reset} - Advanced agent with LangGraph, personality, and dynamic responses`,
    value: 'conversation-agent',
    short: 'Conversation Agent',
  },
  {
    name: `${colors.magenta}Sitcom Agents Team${colors.reset} - Advanced multi-agent simulation with a scene director and character actors, featuring dynamic scene generation and beat management.`,
    value: 'sitcom-team',
    short: 'Sitcom Agents Team',
  },
];

module.exports = agentOptions;
