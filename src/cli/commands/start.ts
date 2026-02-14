import chalk from 'chalk';
import { Command } from 'commander';
import { startServer } from '../utils/server.js';

export const start = new Command('start')
  .description('Start the Claris server')
  .option('-f, --foreground', 'Run in foreground mode (show logs)')
  .option('-p, --port <number>', 'Port to run the server on')
  .action(async (options) => {
    console.log(chalk.cyan('🚀 Starting Claris server...'));

    const foreground = options.foreground;
    const detached = !foreground;
    const stdio = foreground ? 'inherit' : 'ignore';
    const port = options.port ? Number(options.port) : undefined;

    const subprocess = await startServer({ detached, stdio, port });

    if (detached) {
      console.log(chalk.green(`✨ Server started in background! (PID: ${subprocess.pid})`));
      process.exit(0);
    } else {
      // Handle foreground termination
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n👋 Shutting down...'));
        subprocess.kill();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        subprocess.kill();
        process.exit(0);
      });
    }
  });
