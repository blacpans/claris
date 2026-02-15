import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Determine environment
const APP_ENV = process.env.APP_ENV || 'local';
const CWD = process.cwd();

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(CWD, fileName);
  if (fs.existsSync(filePath)) {
    // Suppress logs if already loaded in parent process
    const quiet = process.env.CLARIS_ENV_LOADED === 'true';
    if (!quiet) {
      dotenv.config({ path: filePath, quiet: true });
    }
  }
}

// Check if already loaded to avoid duplicate logs in spawned processes
if (process.env.CLARIS_ENV_LOADED !== 'true') {
  // Load in priority order (First loaded wins for existing vars)
  // 1. .env.local (Dev secrets - ignored by git)
  loadEnvFile('.env.local');

  // 2. .env.{APP_ENV} (Environment specific config)
  if (APP_ENV !== 'local') {
    loadEnvFile(`.env.${APP_ENV}`);
  }

  // 3. .env (Base defaults)
  loadEnvFile('.env');

  // 4. Load secrets from volume mounts (e.g. Cloud Run, Docker Swarm)
  // This allows secrets to be loaded even if "Expose as environment variable" is missed
  const secretDirs = ['/app/scripts/temp_secrets'];
  for (const dir of secretDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          // Skip hidden files and directories
          if (file.startsWith('.') || fs.statSync(fullPath).isDirectory()) continue;

          // Only load if not already set (Env vars take precedence)
          if (!process.env[file]) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8').trim();
              process.env[file] = content;
            } catch (e) {
              console.error(`[Config] Failed to load secret ${file}:`, e);
            }
          }
        }
      } catch (e) {
        // Directory access error, ignore
      }
    }
  }

  // Mark as loaded for child processes
  process.env.CLARIS_ENV_LOADED = 'true';
  console.log(`[Config] Environment: ${APP_ENV}`);
}

console.log("TEST_SECRET=" + process.env.TEST_SECRET);