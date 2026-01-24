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
  .description('クラリスと会話する')
  .argument('<message>', '送信するメッセージ')
  .option('-u, --url <url>', 'APIのURL', process.env.CLARIS_API_URL || 'http://localhost:3000')
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

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Unexpected response format: ${contentType}\nBody: ${text.slice(0, 200)}...`);
      }

      const data = await response.json() as { response: string };
      console.log(chalk.bold.magenta('Claris 🌸 > ') + chalk.cyan(data.response));
    } catch (error) {
      if (error instanceof Error && (error.message.includes('fetch failed') || (error as any).cause?.code === 'ECONNREFUSED')) {
        console.error(chalk.red('クラリスに接続できませんでした。サーバーは起動していますか？💦'));
      } else {
        console.error(chalk.red('クラリスとの通信中にエラーが発生しました:'), error);
      }
      process.exit(1);
    }
  });

program.parse();
