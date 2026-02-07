import chalk from 'chalk';
import { Command } from 'commander';
import { CLI_MESSAGES } from './messages.js';
import { startServer, waitForServer } from './utils/server.js';

export const chat = new Command(CLI_MESSAGES.COMMANDS.CHAT.NAME)
  .description(CLI_MESSAGES.COMMANDS.CHAT.DESCRIPTION)
  .argument('<message>', CLI_MESSAGES.COMMANDS.CHAT.ARG_MESSAGE)
  .option('-u, --url <url>', CLI_MESSAGES.COMMANDS.CHAT.OPT_URL, process.env.CLARIS_API_URL || 'http://localhost:8080')
  .option('-c, --context <path>', 'Context file path for Soul Unison')
  .action(async (message: string, options: { url: string; context?: string }) => {
    const apiUrl = options.url;

    const chatRequest = async () => {
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          context: options.context ? { activeFile: options.context } : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(CLI_MESSAGES.ERRORS.SERVER_ERROR(response.status, response.statusText));
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(CLI_MESSAGES.ERRORS.UNEXPECTED_RESPONSE(contentType, text.slice(0, 200)));
      }

      const data = (await response.json()) as { response: string };
      console.log(chalk.bold.magenta(CLI_MESSAGES.PROMPTS.CLARIS) + chalk.cyan(data.response));
    };

    try {
      await chatRequest();
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('fetch failed') ||
          (error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED')
      ) {
        console.log(chalk.yellow('⚠️ Server seems to be down. Attempting to start...'));

        // Use shared utility to start server
        try {
          const urlObj = new URL(apiUrl);
          const port = urlObj.port ? Number(urlObj.port) : undefined;
          await startServer({ detached: true, stdio: 'ignore', port });
        } catch (_e) {
          // Fallback if URL parsing fails (though unlikely if fetch worked up to connection error)
          await startServer({ detached: true, stdio: 'ignore' });
        }

        console.log(chalk.cyan('⏳ Waiting for server to initialize...'));
        const isServerReady = await waitForServer(apiUrl);

        if (isServerReady) {
          console.log(chalk.green('🚀 Server started! Retrying request...'));
          try {
            await chatRequest();
          } catch (_retryError) {
            console.error(chalk.red(CLI_MESSAGES.ERRORS.CONNECTION_REFUSED));
            process.exit(1);
          }
        } else {
          console.error(chalk.red('❌ Server failed to start in time.'));
          console.log(chalk.yellow('Tip: Try running "claris start" manually to see errors.'));
          process.exit(1);
        }
      } else {
        console.error(chalk.red(CLI_MESSAGES.ERRORS.COMMUNICATION_ERROR), error);
        process.exit(1);
      }
    }
  });
