import chalk from 'chalk';
import { Command } from 'commander';
import { stopServer } from '../utils/server.js';

export const stop = new Command('stop').description('Stop the Claris server').action(async () => {
  console.log(chalk.cyan('🛑 Stopping Claris server...'));

  const stopped = await stopServer();

  if (stopped) {
    console.log(chalk.green('✨ Server stopped successfully.'));
  } else {
    console.log(chalk.yellow('⚠️ No server found running or failed to stop.'));
  }
});
