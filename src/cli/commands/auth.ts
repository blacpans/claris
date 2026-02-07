import chalk from 'chalk';
import { Command } from 'commander';
import open from 'open';

export const auth = new Command('auth');

auth.description('Authenticate with Google services (Calendar, Gmail)').action(async () => {
  console.log(chalk.blue('🔐 Starting Google Authentication flow...'));

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.error(chalk.red('❌ AUTH_SECRET environment variable is not set.'));
    console.error('Please set AUTH_SECRET in your .env file or environment variables.');
    process.exit(1);
  }

  // Determine the base URL
  // In development, we use localhost. In production, this should be the deployed URL.
  // For CLI, we can default to localhost if CLARIS_SERVER_URL is not set,
  // assuming the user might want to authenticate against a local server
  // OR a remote server if configured.
  // However, the auth flow is: CLI -> Server (/auth/google) -> Google -> Server (/oauth2callback)
  // The CLI just needs to open the initial URL.

  const baseUrl = process.env.CLARIS_SERVER_URL || 'http://localhost:8080';
  const authUrl = `${baseUrl}/auth/google?secret=${authSecret}`;

  console.log(`\nOpening authentication URL: ${chalk.green(authUrl)}`);
  console.log('Please complete the authentication in your browser.');

  try {
    await open(authUrl);
    console.log(chalk.gray('\n(Browser should have opened automatically)'));
  } catch (_error) {
    console.error(chalk.red('\n❌ Failed to open browser automatically.'));
    console.error(`Please copy and paste the URL above into your browser.`);
  }
});
