import chalk from 'chalk';
import { Command } from 'commander';
import { stopServer } from '../utils/server.js';

export const stop = new Command('stop')
  .description('Stop the Claris server')
  .option('-p, --port <number>', 'Port the server is running on')
  .action(async (options) => {
    console.log(chalk.cyan('🛑 Stopping Claris server...'));

    const port = options.port ? Number(options.port) : undefined;
    const stopped = await stopServer(port);

    if (stopped) {
      console.log(chalk.green('✨ Server stopped successfully.'));
    } else {
      console.log(chalk.yellow('⚠️ No server found running or failed to stop.'));
    }
  });
