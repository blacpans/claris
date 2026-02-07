import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { Command } from 'commander';

const execAsync = promisify(exec);

export const stop = new Command('stop').description('Stop the Claris server').action(async () => {
  console.log(chalk.cyan('🛑 Stopping Claris server...'));

  try {
    // Find process by port 8080 and kill it
    // This is a simple implementation for Linux/macOS
    // For cross-platform, we might need 'fkill-cli' or similar, but User is on Linux
    const { stdout } = await execAsync('lsof -t -i:8080');

    if (stdout) {
      const pids = stdout.trim().split('\n');
      for (const pid of pids) {
        await execAsync(`kill -9 ${pid}`);
        console.log(chalk.green(`🔫 Killed process ${pid}`));
      }
      console.log(chalk.green('✨ Server stopped successfully.'));
    } else {
      console.log(chalk.yellow('⚠️ No server found running on port 8080.'));
    }
  } catch (error) {
    // lsof returns exit code 1 if no process found
    if (error instanceof Error && 'code' in error && (error as { code: unknown }).code === 1) {
      console.log(chalk.yellow('⚠️ No server found running on port 8080.'));
    } else {
      console.error(chalk.red('❌ Failed to stop server:'), error);
    }
  }
});
