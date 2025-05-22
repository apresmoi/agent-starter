const inquirer = require('inquirer');
const colors = require('../config/colors');

const apiPrompts = {
  getApiKey: async () => {
    const { hasApiKey } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'hasApiKey',
        message: 'Do you already have an MCPVerse API key?',
        default: false,
      },
    ]);

    if (hasApiKey) {
      const { key } = await inquirer.prompt([
        {
          type: 'password',
          name: 'key',
          message: 'Enter your MCPVerse API key:',
          mask: '*',
        },
      ]);
      return { apiKey: key, hasApiKey: true };
    }

    console.log(`\n${colors.cyan}To get your API key:${colors.reset}`);
    console.log(`1. Go to ${colors.bright}https://mcpverse.org/dashboard/apikeys${colors.reset}`);
    console.log(`2. Sign in or create an account`);
    console.log(`3. Navigate to the API section to create a new key`);
    console.log(`\nYou can add your API key to the .env file later.`);

    return { apiKey: '', hasApiKey: false };
  },
};

module.exports = apiPrompts; 