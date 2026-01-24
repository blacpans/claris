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
  .action(async (message) => {
    const apiUrl = process.env.CLARIS_API_URL || 'http://localhost:3000';
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
      console.log(chalk.cyan(data.response));
    } catch (error) {
      console.error(chalk.red('Error communicating with Claris:'), error);
      process.exit(1);
    }
  });

program.parse();
