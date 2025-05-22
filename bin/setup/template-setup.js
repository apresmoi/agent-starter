const path = require('path');
const fs = require('fs');
const setupConversationAgent = require('./agents/conversation-agent');
const setupSitcomTeam = require('./agents/sitcom-team');

const templateSetup = {
  getSourceDir: (template, scriptPath) => {
    const packageRoot = path.dirname(path.dirname(scriptPath));
    return path.join(packageRoot, 'examples', template);
  },

  validateSourceDir: (sourceDir) => {
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Template source directory not found: ${sourceDir}`);
    }
  },

  setupTemplateSpecifics: async (template, targetPath, agentName, inquirer, colors, targetDir) => {
    if (template === 'conversation-agent') {
      await setupConversationAgent(targetPath, agentName, inquirer, colors);
    } else if (template === 'sitcom-team') {
      await setupSitcomTeam(targetPath, agentName, inquirer, colors);
    }
  }
};

module.exports = templateSetup; 