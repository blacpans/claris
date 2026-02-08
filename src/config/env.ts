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
      // @ts-expect-error - dotenv types might not have quiet yet depending on version, but the log suggests it
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

  // Mark as loaded for child processes
  process.env.CLARIS_ENV_LOADED = 'true';
  console.log(`[Config] Environment: ${APP_ENV}`);
}
