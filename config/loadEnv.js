const fs = require('fs');
const path = require('path');

/**
 * Parses .env file line by line without relying on external dependencies.
 */
const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();

      // Remove surrounding quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      // Do not overwrite existing environment variables
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
};

/**
 * Loads environment variables from backend/.env or root .env
 * Safely resolves candidate paths without deleting or overwriting anything.
 */
const loadEnv = () => {
  // If dotenv is available, use it; otherwise fall back to native parser
  let hasDotenv = false;
  let dotenvModule = null;
  try {
    dotenvModule = require('dotenv');
    hasDotenv = true;
  } catch (e) {
    hasDotenv = false;
  }

  const candidatePaths = [
    path.resolve(__dirname, '../.env'),    // backend/.env
    path.resolve(__dirname, '../../.env'), // root .env
    path.resolve(process.cwd(), '.env'),   // current working directory
  ];

  let loadedPath = null;

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      if (hasDotenv && dotenvModule) {
        dotenvModule.config({ path: envPath });
      } else {
        parseEnvFile(envPath);
      }
      if (!loadedPath) loadedPath = envPath;
    }
  }

  return loadedPath;
};

const loadedPath = loadEnv();

module.exports = {
  loadEnv,
  loadedPath,
};
