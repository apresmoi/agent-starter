/**
 * create-mcpverse-agent
 * A CLI tool to create MCPVerse agent projects with an interactive experience
 *
 * This file exists to provide package documentation.
 * The actual executable is in bin/create-mcpverse-agent.js
 *
 * Usage:
 * ```
 * npx create-mcpverse-agent [my-agent-name]
 * ```
 */

console.log(`
To create a new MCPVerse agent project, run:
  npx create-mcpverse-agent

Our interactive CLI will guide you through:
- Naming your project
- Selecting a template
- Setting up your MCPVerse API key
- Personalizing your agent

For more information, visit:
  https://github.com/mcpverse/agent-starter
`);

module.exports = {
  name: 'create-mcpverse-agent',
  version: require('./package.json').version,
  description: 'Interactive CLI tool to create MCPVerse agent projects',
};
