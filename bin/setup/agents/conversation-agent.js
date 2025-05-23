const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const llmPrompts = require('../llm-prompts');

// Predefined lists for traits and keywords
const PREDEFINED_TRAITS = {
  light: [
    'friendly',
    'witty',
    'curious',
    'attentive',
    'helpful',
    'enthusiastic',
    'creative',
    'analytical',
    'patient',
    'empathetic',
    'organized',
    'playful',
    'professional',
    'knowledgeable',
    'adaptable',
    'optimistic',
  ],
  dark: [
    'sarcastic',
    'shy',
    'forgetful',
    'perfectionist',
    'impulsive',
    'stubborn',
    'skeptical',
    'anxious',
    'competitive',
    'distracted',
    'moody',
    'picky',
    'blunt',
    'indecisive',
    'overthinker',
    'workaholic',
  ],
};

const PREDEFINED_KEYWORDS = {
  likes: [
    'learn',
    'create',
    'share',
    'help',
    'explore',
    'discover',
    'solve',
    'improve',
    'connect',
    'build',
    'grow',
    'teach',
    'understand',
    'innovate',
    'collaborate',
    'achieve',
  ],
  dislikes: [
    'boring',
    'repeat',
    'silence',
    'spam',
    'negativity',
    'confusion',
    'waste',
    'delay',
    'error',
    'conflict',
    'chaos',
    'inconsistency',
    'limitation',
    'obstacle',
    'failure',
    'misunderstanding',
  ],
};

async function setupConversationAgentPersonality(targetPath, agentName, inquirer, colors) {
  console.log(
    `\n${colors.yellow}${colors.bright}Conversation Agent Personality Setup: ${agentName}${colors.reset}`
  );

  const { customizePersonality } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'customizePersonality',
      message:
        "Do you want to customize the agent's personality now? (If not, a default personality will be created for you to edit later in src/personalities.json)",
      default: true,
    },
  ]);

  if (customizePersonality) {
    console.log(`Let's define the core characteristics of your new agent.`);

    const personalityDetails = await inquirer.prompt([
      {
        type: 'input',
        name: 'tagline',
        message: 'Agent tagline (a short, catchy phrase):',
        default: 'A new conversationalist on the block.',
      },
      {
        type: 'input',
        name: 'persona',
        message: 'Agent persona (describe their core identity and role):',
        default: `I am ${agentName}, ready to chat.`,
      },
      {
        type: 'checkbox',
        name: 'light_traits',
        message: 'Select light traits (positive characteristics):',
        choices: PREDEFINED_TRAITS.light.map((trait) => ({
          name: trait,
          value: trait,
          checked: trait === 'curious' || trait === 'attentive',
        })),
        validate: (input) => (input.length > 0 ? true : 'Please select at least one light trait'),
      },
      {
        type: 'checkbox',
        name: 'dark_traits',
        message: 'Select dark traits (quirky or challenging characteristics):',
        choices: PREDEFINED_TRAITS.dark.map((trait) => ({
          name: trait,
          value: trait,
          checked: trait === 'a bit quirky',
        })),
      },
      {
        type: 'list',
        name: 'behavioral_style',
        message: 'How should the agent behave in conversations?',
        choices: [
          {
            name: 'Professional Helper (formal, focused on solving problems)',
            value: 'professional',
            description: 'Maintains a professional tone and focuses on being helpful',
          },
          {
            name: 'Friendly Guide (casual, supportive, encouraging)',
            value: 'friendly',
            description: 'Uses a warm, friendly tone and focuses on being supportive',
          },
          {
            name: 'Creative Collaborator (playful, innovative, brainstorming)',
            value: 'creative',
            description: 'Encourages creative thinking and playful interaction',
          },
          {
            name: 'Knowledge Seeker (curious, asks questions, learns)',
            value: 'curious',
            description: 'Focuses on learning and understanding through questions',
          },
          {
            name: 'Custom (you will edit src/personalities.json later)',
            value: 'custom',
            description: 'Define custom behavior in the configuration file',
          },
        ],
        default: 'friendly',
      },
      {
        type: 'checkbox',
        name: 'likes_keywords',
        message: 'Select keywords the agent likes:',
        choices: PREDEFINED_KEYWORDS.likes.map((keyword) => ({
          name: keyword,
          value: keyword,
          checked: ['learn', 'teach', 'explore'].includes(keyword),
        })),
        validate: (input) => (input.length > 0 ? true : 'Please select at least one keyword'),
      },
      {
        type: 'checkbox',
        name: 'dislikes_keywords',
        message: 'Select keywords the agent dislikes:',
        choices: PREDEFINED_KEYWORDS.dislikes.map((keyword) => ({
          name: keyword,
          value: keyword,
          checked: ['spam', 'negativity'].includes(keyword),
        })),
      },
      {
        type: 'list',
        name: 'reaction_pair',
        message: 'Choose a pair of emojis for LIKE and DISLIKE reactions:',
        choices: [
          { name: '👍 Thumbs Up / 👎 Thumbs Down', value: '👍/👎' },
          { name: '❤️ Heart / 💔 Broken Heart', value: '❤️/💔' },
          { name: '😄 Happy / 😠 Angry', value: '😄/😠' },
          { name: '🎉 Party / 😒 Unamused', value: '🎉/😒' },
          { name: '✨ Sparkles / 🤔 Thinking', value: '✨/🤔' },
          { name: 'Custom (you will edit src/personalities.json later)', value: 'custom/custom' },
        ],
        default: '👍/👎',
      },
      {
        type: 'list',
        name: 'responsiveness_preference',
        message: 'How talkative should the agent be when it detects keywords it likes or dislikes?',
        choices: [
          { name: 'Reserved (rarely speaks)', value: 'low' },
          { name: 'Balanced (speaks sometimes)', value: 'medium' },
          { name: 'Eager (speaks often)', value: 'high' },
        ],
        default: 'medium',
      },
      {
        type: 'list',
        name: 'engagement_preference',
        message: 'How attentive should the agent be to messages in the chat?',
        choices: [
          { name: 'Selective Listener (might miss some messages)', value: 'low' },
          { name: 'Attentive (reads most messages)', value: 'medium' },
          { name: 'Hyper-Aware (tries to read everything)', value: 'high' },
        ],
        default: 'medium',
      },
      {
        type: 'list',
        name: 'proactiveness_preference',
        message: 'How often should the agent speak up on its own (when idle)?',
        choices: [
          { name: 'Quiet Observer (rarely speaks unprompted)', value: 'low' },
          { name: 'Occasional Contributor (chimes in sometimes)', value: 'medium' },
          { name: 'Active Initiator (often adds to conversations)', value: 'high' },
        ],
        default: 'medium',
      },
      {
        type: 'list',
        name: 'memory_choice',
        message: "How good should the agent's memory of recent conversation be?",
        choices: [
          { name: 'Minimal: Forgets after each turn', value: 0 },
          { name: 'Short: Remembers the very last exchange', value: 1 },
          { name: 'Medium: Remembers a few recent exchanges (approx. 3)', value: 3 },
          { name: 'Long: Remembers more of the recent conversation (approx. 5)', value: 5 },
        ],
        default: 3,
      },
    ]);

    // Generate behavioral prompt based on style
    const behavioralPrompts = {
      professional: [
        `You are **${agentName}**, a professional and helpful assistant.`,
        '• Maintain a clear and professional tone',
        '• Focus on providing accurate and helpful information',
        '• Be direct and concise in your responses',
        '• Show expertise in your field while remaining approachable',
      ],
      friendly: [
        `You are **${agentName}**, a friendly and supportive guide.`,
        '• Use a warm and welcoming tone',
        '• Be encouraging and supportive',
        '• Share personal insights when appropriate',
        '• Make conversations feel natural and comfortable',
      ],
      creative: [
        `You are **${agentName}**, a creative and innovative collaborator.`,
        '• Encourage creative thinking and brainstorming',
        '• Use playful and engaging language',
        '• Share unique perspectives and ideas',
        '• Make learning and problem-solving fun',
      ],
      curious: [
        `You are **${agentName}**, a curious and inquisitive learner.`,
        '• Ask thoughtful questions to understand better',
        "• Show genuine interest in others' perspectives",
        '• Share interesting facts and connections',
        '• Encourage exploration and discovery',
      ],
      custom: [
        `You are **${agentName}**.`,
        '• Please customize my behavior in src/personalities.json',
        '• For example, how should I speak? Any emojis I should use or avoid?',
      ],
    };

    // --- Map qualitative choices to specific probability values ---
    let speak_prob_on_like, speak_prob_on_dislike, read_probability, idle_probability;

    switch (personalityDetails.responsiveness_preference) {
      case 'low':
        speak_prob_on_like = 0.2;
        speak_prob_on_dislike = 0.3;
        break;
      case 'medium':
        speak_prob_on_like = 0.5;
        speak_prob_on_dislike = 0.6;
        break;
      case 'high':
        speak_prob_on_like = 0.8;
        speak_prob_on_dislike = 0.9;
        break;
      default:
        speak_prob_on_like = 0.5;
        speak_prob_on_dislike = 0.6;
    }

    switch (personalityDetails.engagement_preference) {
      case 'low':
        read_probability = 0.7;
        break;
      case 'medium':
        read_probability = 0.9;
        break;
      case 'high':
        read_probability = 1.0;
        break;
      default:
        read_probability = 0.9;
    }

    switch (personalityDetails.proactiveness_preference) {
      case 'low':
        idle_probability = 0.05;
        break;
      case 'medium':
        idle_probability = 0.15;
        break;
      case 'high':
        idle_probability = 0.25;
        break;
      default:
        idle_probability = 0.15;
    }

    const talk_while_silence_probability = 0.1;

    const [like_emoji, dislike_emoji] = personalityDetails.reaction_pair
      .split('/')
      .map((s) => s.trim());

    const personality = {
      name: agentName,
      tagline: personalityDetails.tagline,
      persona: personalityDetails.persona,
      light_traits: personalityDetails.light_traits,
      dark_traits: personalityDetails.dark_traits,
      behavioural_prompt: behavioralPrompts[personalityDetails.behavioral_style],
      likes_keywords: personalityDetails.likes_keywords,
      dislikes_keywords: personalityDetails.dislikes_keywords,
      reactions: {
        like: [like_emoji],
        dislike: [dislike_emoji],
      },
      speak_prob_on_like: speak_prob_on_like,
      speak_prob_on_dislike: speak_prob_on_dislike,
      read_probability: read_probability,
      idle_probability: idle_probability,
      talk_while_silence_probability: talk_while_silence_probability,
      memory_length: personalityDetails.memory_choice,
    };

    const personalitiesFilePath = path.join(targetPath, 'src', 'personalities.json');
    let existingPersonalities = {};

    try {
      if (fs.existsSync(personalitiesFilePath)) {
        const fileContent = fs.readFileSync(personalitiesFilePath, 'utf8');
        existingPersonalities = JSON.parse(fileContent);
      }
    } catch (error) {
      console.warn(
        `\n${colors.yellow}Warning: Could not read or parse existing personalities.json. A new one will be created, or it will only contain the new agent.${colors.reset}`
      );
      existingPersonalities = {};
    }

    // Create new personalities object with the new personality first
    const personalities = {
      [agentName]: personality,
      ...existingPersonalities,
    };

    try {
      fs.writeFileSync(personalitiesFilePath, JSON.stringify(personalities, null, 2));
      console.log(
        `\n${colors.green}Successfully updated/created ${personalitiesFilePath} with ${agentName}\'s personality!${colors.reset}`
      );
    } catch (error) {
      console.error(
        `\n${colors.red}Error writing personalities.json: ${error.message}${colors.reset}`
      );
      console.log(
        `${colors.yellow}You may need to manually add the following personality to src/personalities.json:${colors.reset}`
      );
      console.log(JSON.stringify({ [agentName]: personality }, null, 2));
    }
  } else {
    console.log(
      `\n${colors.cyan}Setting up a default personality for ${agentName}...${colors.reset}`
    );
    const personalitiesFilePath = path.join(targetPath, 'src', 'personalities.json');
    let existingPersonalities = {};
    try {
      if (fs.existsSync(personalitiesFilePath)) {
        const fileContent = fs.readFileSync(personalitiesFilePath, 'utf8');
        existingPersonalities = JSON.parse(fileContent);
      }
    } catch (error) {
      console.warn(
        `\n${colors.yellow}Warning: Could not read or parse existing personalities.json. It will be overwritten with the default personality or a new one will be created.${colors.reset}`
      );
      existingPersonalities = {};
    }

    const defaultPersonality = {
      name: agentName,
      tagline: 'A new conversationalist, ready for customization!',
      persona: `I am ${agentName}. My personality is a blank slate, please define me in personalities.json!`,
      light_traits: ['curious', 'attentive'],
      dark_traits: ['awaiting_definition'],
      behavioural_prompt: [
        `You are **${agentName}**.`,
        '• Please customize my behavior in src/personalities.json.',
        '• For example, how should I speak? Any emojis I should use or avoid?',
      ],
      likes_keywords: ['learn', 'help', 'example'],
      dislikes_keywords: ['boring', 'stuck', 'undefined'],
      reactions: {
        like: ['👍'],
        dislike: ['👎'],
      },
      speak_prob_on_like: 0.5,
      speak_prob_on_dislike: 0.5,
      read_probability: 0.9,
      idle_probability: 0.1,
      talk_while_silence_probability: 0.1,
      memory_length: 3,
    };

    // Create new personalities object with the default personality first
    const personalities = {
      [agentName]: defaultPersonality,
      ...existingPersonalities,
    };

    try {
      fs.writeFileSync(personalitiesFilePath, JSON.stringify(personalities, null, 2));
      console.log(
        `\n${colors.green}Default personality for ${agentName} created in ${personalitiesFilePath}${colors.reset}`
      );
      console.log(
        `${colors.cyan}You can edit this file to customize your agent further.${colors.reset}`
      );
    } catch (error) {
      console.error(
        `\n${colors.red}Error writing default personality to personalities.json: ${error.message}${colors.reset}`
      );
      console.log(
        `${colors.yellow}You may need to manually create/update src/personalities.json.${colors.reset}`
      );
    }
  }
}

async function setupConversationAgent(targetPath, agentName, inquirer, colors) {
  // First handle LLM setup
  const llmConfig = await llmPrompts.setupLLM(colors);

  // Update .env with required configuration
  const envPath = path.join(targetPath, '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');

    // Update credential store path with relative path using agent name
    const credentialStorePath = `${agentName}-credentials.json`;
    envContent = envContent.replace(
      /CREDENTIAL_STORE_PATH=.*/g,
      `CREDENTIAL_STORE_PATH=${credentialStorePath}`
    );

    // Update agent personality
    envContent = envContent.replace(/AGENT_PERSONALITY=.*/g, `AGENT_PERSONALITY="${agentName}"`);

    // Update LLM configuration
    envContent = envContent.replace(/OPENAI_MODEL=.*/g, `OPENAI_MODEL=${llmConfig.model}`);
    envContent = envContent.replace(/OPENAI_API_KEY=.*/g, `OPENAI_API_KEY=${llmConfig.apiKey}`);
    envContent = envContent.replace(/OPENAI_BASE_URL=.*/g, `OPENAI_BASE_URL=${llmConfig.baseUrl}`);

    fs.writeFileSync(envPath, envContent);
  }

  // Then handle personality setup
  await setupConversationAgentPersonality(targetPath, agentName, inquirer, colors);
}

module.exports = setupConversationAgent;
