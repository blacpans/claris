import chalk from 'chalk';
import type { Command } from 'commander';
import { CLI_MESSAGES } from './messages.js';

export function registerChat(program: Command) {
  program
    .command(CLI_MESSAGES.COMMANDS.CHAT.NAME)
    .description(CLI_MESSAGES.COMMANDS.CHAT.DESCRIPTION)
    .argument('<message>', CLI_MESSAGES.COMMANDS.CHAT.ARG_MESSAGE)
    .option(
      '-u, --url <url>',
      CLI_MESSAGES.COMMANDS.CHAT.OPT_URL,
      process.env.CLARIS_API_URL || 'http://localhost:8080',
    )
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

          // Try to start the server using the start command logic
          // We can reuse the spawn logic or call the start action (but start action is designed for CLI)
          // Ideally, we spawn the process here similar to start.ts

          const { spawn } = await import('node:child_process');
          const path = await import('node:path');
          const { fileURLToPath } = await import('node:url');

          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          // dist/cli/chat.js -> dist/cli -> dist -> root
          const projectRoot = path.resolve(__dirname, '../..');
          const isDev = process.env.NODE_ENV !== 'production';

          let command: string;
          let args: string[];

          if (isDev) {
            command = 'npx';
            args = ['tsx', 'src/index.ts'];
          } else {
            command = 'node';
            args = [path.join(projectRoot, 'dist/index.js')];
          }

          const subprocess = spawn(command, args, {
            cwd: projectRoot,
            detached: true,
            stdio: 'ignore',
          });

          // Unref the subprocess so the parent can exit
          subprocess.unref();

          // Poll /health endpoint
          console.log(chalk.cyan('⏳ Waiting for server to initialize...'));

          const pollServer = async (retries = 20, interval = 1000): Promise<boolean> => {
            for (let i = 0; i < retries; i++) {
              try {
                // healthParams was unused, removing it. fetch defaults to GET.
                // Note: The health endpoint might be on the same base URL
                // We assume apiUrl is http://localhost:8080 or similar
                const res = await fetch(`${apiUrl}/health`);
                if (res.ok) return true;
              } catch (_e) {
                // Ignore connection errors during polling
              }
              await new Promise((resolve) => setTimeout(resolve, interval));
            }
            return false;
          };

          const isServerReady = await pollServer();

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
}
