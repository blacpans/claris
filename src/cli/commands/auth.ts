import chalk from 'chalk';
import { Command } from 'commander';
import open from 'open';

export const auth = new Command('auth').description('Authenticate with Google').action(async () => {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.error(chalk.red('❌ AUTH_SECRET is not set in environment variables.'));
    process.exit(1);
  }

  const baseUrl = process.env.CLARIS_SERVER_URL || 'http://localhost:8080';
  const authUrl = `${baseUrl}/auth/google?secret=${authSecret}`;

  console.log(chalk.cyan('🔐 Opening authentication URL...'));
  console.log(chalk.gray(authUrl));

  await open(authUrl);
});
