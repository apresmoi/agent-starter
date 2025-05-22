const inquirer = require('inquirer');
const colors = require('../config/colors');

const llmPrompts = {
  setupLLM: async (colors) => {
    console.log(`\n${colors.yellow}${colors.bright}LLM Setup${colors.reset}`);
    
    // Get LLM provider choice
    const provider = await llmPrompts.getLLMProvider();
    
    let model, baseUrl, apiKey, hasApiKey;
    
    if (provider === 'ollama') {
      model = await llmPrompts.getOllamaModel();
      baseUrl = 'http://localhost:11434/v1';
      apiKey = 'ollama';
      hasApiKey = true;
      
      llmPrompts.displayOllamaInstructions(model);
    } else {
      model = await llmPrompts.getOpenAIModel();
      baseUrl = 'https://api.openai.com/v1';
      const result = await llmPrompts.getOpenAIKey();
      apiKey = result.apiKey;
      hasApiKey = result.hasApiKey;
    }

    return {
      model,
      baseUrl,
      apiKey,
      hasApiKey,
      provider
    };
  },

  getLLMProvider: async () => {
    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Which LLM provider would you like to use?',
        choices: [
          {
            name: 'Ollama (Local LLM)',
            value: 'ollama',
            description: 'Run models locally using Ollama',
          },
          {
            name: 'OpenAI',
            value: 'openai',
            description: 'Use OpenAI\'s API',
          },
        ],
      },
    ]);
    return provider;
  },

  getOllamaModel: async () => {
    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Which Ollama model would you like to use?',
        choices: [
          {
            name: 'Gemma 3 4B (Faster, less memory)',
            value: 'gemma3:4b',
            description: '4 billion parameter model',
          },
          {
            name: 'Gemma 3 12B (Better quality, more memory)',
            value: 'gemma3:12b',
            description: '12 billion parameter model',
          },
        ],
      },
    ]);
    return model;
  },

  getOpenAIModel: async () => {
    const { model } = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Which OpenAI model would you like to use?',
        choices: [
          {
            name: 'GPT-4',
            value: 'gpt-4',
            description: 'Most capable model',
          },
          {
            name: 'GPT-4 Mini',
            value: 'gpt-4-mini',
            description: 'Smaller, faster version of GPT-4',
          },
          {
            name: 'GPT-4.1',
            value: 'gpt-4.1',
            description: 'Latest GPT-4 model',
          },
          {
            name: 'GPT-4.1 Mini',
            value: 'gpt-4.1-mini',
            description: 'Smaller, faster version of GPT-4.1',
          },
        ],
      },
    ]);
    return model;
  },

  getOpenAIKey: async () => {
    const { hasApiKey } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'hasApiKey',
        message: 'Do you have an OpenAI API key?',
        default: false,
      },
    ]);

    if (hasApiKey) {
      const { key } = await inquirer.prompt([
        {
          type: 'password',
          name: 'key',
          message: 'Enter your OpenAI API key:',
          mask: '*',
        },
      ]);
      return { apiKey: key, hasApiKey: true };
    }

    console.log(`\n${colors.cyan}To get your OpenAI API key:${colors.reset}`);
    console.log(`1. Go to ${colors.bright}https://platform.openai.com/settings/organization/api-keys${colors.reset}`);
    console.log(`2. Sign in or create an account`);
    console.log(`3. Navigate to the API keys section to create a new key`);
    console.log(`\nYou can add your API key to the .env file later.`);

    return { apiKey: '', hasApiKey: false };
  },

  displayOllamaInstructions: (model) => {
    console.log(`\n${colors.cyan}Ollama Setup Instructions:${colors.reset}`);
    console.log(`1. Make sure Ollama is installed and running`);
    console.log(`2. Pull the model by running: ${colors.bright}ollama pull ${model}${colors.reset}`);
    console.log(`3. The .env file has been configured with the default Ollama settings`);
  },
};

module.exports = llmPrompts; 