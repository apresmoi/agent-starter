#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const inquirer = require('inquirer');

// Import configurations and helpers
const colors = require('./config/colors');
const welcomeBanner = require('./config/banner');
const agentOptions = require('./config/agent-options');
const {
  copyDirectoryRecursiveSync,
  updatePackageJson,
  updateEnvFile,
} = require('./helpers/file-operations');

// Import prompt modules
const projectPrompts = require('./setup/project-prompts');
const apiPrompts = require('./setup/api-prompts');
const agentPrompts = require('./setup/agent-prompts');
const roomPrompts = require('./setup/room-prompts');
const setupMessages = require('./setup/setup-messages');
const templateSetup = require('./setup/template-setup');

// Import agent setup modules
const setupConversationAgent = require('./setup/agents/conversation-agent');
const setupSitcomTeam = require('./setup/agents/sitcom-team');

// Main function
async function main() {
  // Display welcome message
  console.log(welcomeBanner);
  setupMessages.displayWelcome();

  // Get target directory from command line args or prompt for it
  let targetDir = process.argv[2] || (await projectPrompts.getProjectName());

  // Get absolute path to target directory
  const targetPath = path.resolve(process.cwd(), targetDir);

  // Check if target directory already exists
  if (fs.existsSync(targetPath)) {
    const contents = fs.readdirSync(targetPath);
    if (contents.length > 0) {
      const overwrite = await projectPrompts.confirmOverwrite(targetDir);
      if (!overwrite) {
        console.log('Operation cancelled.');
        return;
      }
    }
  }

  setupMessages.displayCreatingProject(targetDir);

  // Get template choice
  const template = await projectPrompts.selectTemplate(agentOptions);
  const selectedOption = agentOptions.find((option) => option.value === template);

  setupMessages.displayCreatingTemplate(selectedOption, targetDir);

  try {
    // Get and validate source directory
    const sourceDir = templateSetup.getSourceDir(template, __filename);
    templateSetup.validateSourceDir(sourceDir);

    // Copy the template to the target directory
    copyDirectoryRecursiveSync(sourceDir, targetPath);

    // Update package.json
    const packageJson = updatePackageJson(targetPath, targetDir);

    // Handle API key setup
    setupMessages.displayApiKeySetup();
    const { apiKey, hasApiKey } = await apiPrompts.getApiKey();

    // Handle personalization based on template type
    let envVars = {};
    if (template === 'sitcom-team') {
      setupMessages.displayRoomSetup();
      const { roomName, roomDescription } = await roomPrompts.getRoomDetails();
      envVars = {
        ROOM_NAME: roomName,
        ROOM_DESCRIPTION: roomDescription,
      };
    } else {
      setupMessages.displayAgentPersonalization();
      const details = await agentPrompts.getAgentDetails(packageJson, selectedOption);
      envVars = {
        AGENT_DISPLAY_NAME: details.agentName,
        AGENT_BIO: details.agentBio,
      };
    }

    // Update the .env file with all configurations
    updateEnvFile(targetPath, apiKey, envVars);

    // Setup template-specific configurations
    if (template === 'conversation-agent') {
      await setupConversationAgent(targetPath, envVars.AGENT_DISPLAY_NAME, inquirer, colors);
    } else if (template === 'sitcom-team') {
      await setupSitcomTeam(targetPath, envVars.ROOM_NAME, inquirer, colors);
    }

    // Display success and next steps
    setupMessages.displaySuccess(selectedOption, targetDir);
    setupMessages.displayNextSteps(targetDir, hasApiKey);
    agentPrompts.displayAgentWelcome(envVars.AGENT_DISPLAY_NAME);
  } catch (error) {
    setupMessages.displayError(error);
  }
}

// Run the main function
main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
