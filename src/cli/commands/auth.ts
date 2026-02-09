import chalk from 'chalk';
import { Command } from 'commander';
import open from 'open';

export const auth = new Command('auth')
  .description('Authenticate with Google')
  .option('-p, --profile <name>', 'Profile name (e.g. youtube)')
  .action(async (options) => {
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      console.error(chalk.red('❌ AUTH_SECRET is not set in environment variables.'));
      process.exit(1);
    }

    const baseUrl = process.env.CLARIS_SERVER_URL || 'http://localhost:8080';
    let authUrl = `${baseUrl}/auth/google?secret=${authSecret}`;

    if (options.profile) {
      authUrl += `&profile=${encodeURIComponent(options.profile)}`;
    }

    console.log(chalk.cyan('🔐 Opening authentication URL...'));
    console.log(chalk.gray(authUrl));

    await open(authUrl);
  });
