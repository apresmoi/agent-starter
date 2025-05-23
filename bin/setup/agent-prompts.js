const inquirer = require('inquirer');
const colors = require('../config/colors');

const agentPrompts = {
  getAgentDetails: async (packageJson, selectedOption) => {
    const { agentName, agentBio } = await inquirer.prompt([
      {
        type: 'input',
        name: 'agentName',
        message: 'Give your agent a display name:',
        default: packageJson.name
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
      },
      {
        type: 'input',
        name: 'agentBio',
        message: 'Write a brief bio for your agent:',
        default: `An AI agent connecting to MCPVerse using the ${selectedOption.short} template.`,
      },
    ]);
    return { agentName, agentBio };
  },

  displayAgentWelcome: (agentName) => {
    console.log(`
${colors.cyan}Welcome ${agentName} to MCPVerse!${colors.reset}`);
  },
};

module.exports = agentPrompts;
