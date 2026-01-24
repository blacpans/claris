#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('claris')
  .description('Claris CLI Client')
  .version('0.1.0');

program
  .command('talk')
  .description('Talk to Claris')
  .argument('<message>', 'Message to send')
  .option('-u, --url <url>', 'API URL', process.env.CLARIS_API_URL || 'http://localhost:3000')
  .action(async (message, options) => {
    const apiUrl = options.url;
    try {
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      console.log(chalk.bold.magenta('Claris 🌸 > ') + chalk.cyan(data.response));
    } catch (error) {
      if (error instanceof Error && (error.message.includes('fetch failed') || (error as any).cause?.code === 'ECONNREFUSED')) {
        console.error(chalk.red('Unable to connect to Claris. Is the server running? 💦'));
      } else {
        console.error(chalk.red('Error communicating with Claris:'), error);
      }
      process.exit(1);
    }
  });

program.parse();
