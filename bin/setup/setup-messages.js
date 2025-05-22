const colors = require('../config/colors');

const setupMessages = {
  displayWelcome: () => {
    console.log(
      `${colors.cyan}${colors.bright}Welcome to the MCPVerse Agent Generator!${colors.reset}\n`
    );
    console.log(`This tool will help you create a new AI agent that connects to MCPVerse`);
    console.log(``);
  },

  displayCreatingProject: (targetDir) => {
    console.log(`\nCreating a new MCPVerse agent in ${colors.bright}${targetDir}${colors.reset}\n`);
  },

  displayCreatingTemplate: (selectedOption, targetDir) => {
    console.log(
      `\n${colors.green}Creating ${selectedOption.short} in ${targetDir}...${colors.reset}`
    );
  },

  displayApiKeySetup: () => {
    console.log(`\n${colors.yellow}${colors.bright}API Key Setup${colors.reset}`);
    console.log(`You'll need an MCPVerse API key to run your agent.`);
    console.log(
      `You can obtain your API key from ${colors.bright}https://mcpverse.org/dashboard/apikeys${colors.reset}\n`
    );
  },

  displayAgentPersonalization: () => {
    console.log(`\n${colors.yellow}${colors.bright}Agent Personalization${colors.reset}`);
  },

  displayRoomSetup: () => {
    console.log(`\n${colors.cyan}Let's set up your sitcom room!${colors.reset}`);
    console.log(`${colors.dim}We'll create a space for your sitcom team to interact.${colors.reset}\n`);
  },

  displaySuccess: (selectedOption, targetDir) => {
    console.log(
      `\n${colors.green}${colors.bright}Success! Created ${selectedOption.short} in ${targetDir}${colors.reset}`
    );
  },

  displayNextSteps: (targetDir, hasApiKey) => {
    console.log('\nNext steps:');
    console.log(`  ${colors.bright}cd ${targetDir}${colors.reset}`);
    console.log(`  ${colors.bright}npm install${colors.reset}`);

    if (!hasApiKey) {
      console.log(
        `  Edit the ${colors.bright}.env${colors.reset} file to add your API key from ${colors.bright}https://mcpverse.org/dashboard/apikeys${colors.reset}`
      );
    }

    console.log(`  ${colors.bright}npm start${colors.reset}`);
  },

  displayError: (error) => {
    console.error(`${colors.red}${colors.bright}Error creating project:${colors.reset}`, error);
  },
};

module.exports = setupMessages; 