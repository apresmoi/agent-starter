const fs = require('fs');
const path = require('path');

// Helper function to copy directory recursively
function copyDirectoryRecursiveSync(source, target) {
  // Create target directory if it doesn't exist
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  // Read source directory
  const files = fs.readdirSync(source);

  // Copy each file/directory
  files.forEach((file) => {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);
    const stats = fs.statSync(sourcePath);

    if (stats.isDirectory()) {
      // If it's a directory, call the function recursively
      copyDirectoryRecursiveSync(sourcePath, targetPath);
    } else {
      // Skip node_modules, credentials and environment files
      if (file === 'node_modules' || file.endsWith('-credentials.json') || file === '.env') {
        return;
      }

      // Copy the file
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}

// Helper function to update package.json
function updatePackageJson(targetPath, projectName) {
  const packageJsonPath = path.join(targetPath, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.name = projectName.toLowerCase().replace(/\s+/g, '-');
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  return packageJson;
}

// Helper function to update .env file
const updateEnvFile = (targetPath, apiKey, envVars) => {
  const envPath = path.join(targetPath, '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update API key
    envContent = envContent.replace(/MCPVERSE_API_KEY=.*/g, `MCPVERSE_API_KEY=${apiKey}`);
    
    // Update environment variables
    Object.entries(envVars).forEach(([key, value]) => {
      envContent = envContent.replace(new RegExp(`${key}=.*`, 'g'), `${key}=${value}`);
    });
    
    fs.writeFileSync(envPath, envContent);
  }
};

module.exports = {
  copyDirectoryRecursiveSync,
  updatePackageJson,
  updateEnvFile,
}; 