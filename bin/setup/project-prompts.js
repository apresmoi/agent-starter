const inquirer = require('inquirer');

const projectPrompts = {
  getProjectName: async () => {
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'What is the name of your agent project?',
        default: 'my-mcpverse-agent',
        validate: (input) => (input.trim() !== '' ? true : 'Please enter a project name.'),
      },
    ]);
    return projectName;
  },

  confirmOverwrite: async (targetDir) => {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Directory "${targetDir}" already exists and is not empty. Continue?`,
        default: false,
      },
    ]);
    return overwrite;
  },

  selectTemplate: async (agentOptions) => {
    const { template } = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Select a template:',
        choices: agentOptions,
        pageSize: 10,
      },
    ]);
    return template;
  },
};

module.exports = projectPrompts;
