const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');
const llmPrompts = require('../llm-prompts');

async function setupSitcomTeam(targetPath, roomName, inquirer, colors) {
  // First handle LLM setup
  const llmConfig = await llmPrompts.setupLLM(colors);

  // Get or create .env file
  const envPath = path.join(targetPath, '.env');
  const envExamplePath = path.join(targetPath, '.env.example');
  
  let envContent;
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, 'utf8');
  } else {
    console.error(`\n${colors.red}Error: Neither .env nor .env.example found in ${targetPath}${colors.reset}`);
    return;
  }
  
  // Update credential store path with relative path using room name
  const credentialStorePath = `${roomName}-credentials.json`;
  envContent = envContent.replace(/CREDENTIAL_STORE_PATH=.*/g, `CREDENTIAL_STORE_PATH=${credentialStorePath}`);
  
  // Update LLM configuration
  envContent = envContent.replace(/OPENAI_MODEL=.*/g, `OPENAI_MODEL=${llmConfig.model}`);
  envContent = envContent.replace(/OPENAI_API_KEY=.*/g, `OPENAI_API_KEY=${llmConfig.apiKey}`);
  envContent = envContent.replace(/OPENAI_BASE_URL=.*/g, `OPENAI_BASE_URL=${llmConfig.baseUrl}`);
  
  // Write the updated content to .env
  fs.writeFileSync(envPath, envContent);
  console.log(`\n${colors.green}Created/Updated .env file with room configuration${colors.reset}`);

  // Create/update premise.json with room configuration
  const premisePath = path.join(targetPath, 'src/scene/premise.json');
  let premiseContent;
  if (fs.existsSync(premisePath)) {
    premiseContent = JSON.parse(fs.readFileSync(premisePath, 'utf8'));
  } else {
    premiseContent = {
      name: roomName,
      description: `${roomName}'s sitcom room`,
      series_premise: []
    };
  }
  
  premiseContent.name = roomName;
  premiseContent.description = `${roomName}'s sitcom room`;
  
  fs.writeFileSync(premisePath, JSON.stringify(premiseContent, null, 4));
  console.log(`\n${colors.green}Created/Updated premise.json with room configuration${colors.reset}`);

  // Display setup instructions
  console.log(`\n${colors.yellow}${colors.bright}Sitcom Team Setup: ${roomName}${colors.reset}`);
  console.log(`\n${colors.cyan}Important: Sitcom team configuration requires manual customization.${colors.reset}`);
  console.log(`\n${colors.dim}You'll need to edit the following files to customize your sitcom team:${colors.reset}`);
  console.log(`\n${colors.dim}1. src/character/personalities.json - Define your characters' personalities${colors.reset}`);
  console.log(`${colors.dim}   Example: ${colors.reset}`);
  console.log(`${colors.dim}   {
     "CharacterName": {
       "name": "Character Name",
       "tagline": "Character's catchphrase",
       "persona": "Detailed character description",
       "behavioural_prompt": [
         "You are **Character Name**",
         "• Character's behavior rules",
         "• More behavior rules..."
       ],
       "speak_prob_on_like": 0.5,
       "speak_prob_on_dislike": 0.5,
       "read_probability": 0.9,
       "idle_probability": 0.1
     }
   }${colors.reset}`);
  
  console.log(`\n${colors.dim}2. src/scene/premise.json - Define your sitcom's premise${colors.reset}`);
  console.log(`${colors.dim}   Example: ${colors.reset}`);
  console.log(`${colors.dim}   {
     "series_premise": [
       "📍  Setting: Your sitcom's setting",
       "🤖  Staff: List of staff characters",
       "👥  Regulars: List of regular characters",
       "🌀  Running gags: List of running gags",
       "🎭  Tone: Overall tone and style"
     ]
   }${colors.reset}`);

  console.log(`\n${colors.green}The basic setup is complete! You can now customize your sitcom team by editing these files.${colors.reset}`);
}

module.exports = setupSitcomTeam; 