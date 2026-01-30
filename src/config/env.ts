import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// Determine environment
const APP_ENV = process.env.APP_ENV || 'local';
const CWD = process.cwd();

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(CWD, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath });
    // console.log(`[Config] Loaded ${fileName}`);
  }
}

// Load in priority order (First loaded wins for existing vars)
// 1. .env.local (Dev secrets - ignored by git)
loadEnvFile('.env.local');

// 2. .env.{APP_ENV} (Environment specific config)
if (APP_ENV !== 'local') {
  loadEnvFile(`.env.${APP_ENV}`);
}

// 3. .env (Base defaults)
loadEnvFile('.env');

console.log(`[Config] Environment: ${APP_ENV}`);
