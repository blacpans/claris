import chalk from 'chalk';
import { Command } from 'commander';
import { startServer } from '../utils/server.js';

export const start = new Command('start')
  .description('Start the Claris server')
  .option('-d, --detached', 'Run in detached mode (background)')
  .option('-p, --port <number>', 'Port to run the server on')
  .action(async (options) => {
    console.log(chalk.cyan('🚀 Starting Claris server...'));

    const detached = options.detached;
    const stdio = detached ? 'ignore' : 'inherit';
    const port = options.port ? Number(options.port) : undefined;

    // stdio type mismatch workaround if needed, but startServer accepts any[] | string
    const subprocess = await startServer({ detached, stdio, port });

    if (detached) {
      console.log(chalk.green(`✨ Server started in background! (PID: ${subprocess.pid})`));
      process.exit(0);
    }
  });
