import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const start = new Command('start')
  .description('Start the Claris server')
  .option('-d, --detached', 'Run in detached mode (background)')
  .action((options) => {
    console.log(chalk.cyan('🚀 Starting Claris server...'));

    const isDev = process.env.NODE_ENV !== 'production';
    const projectRoot = path.resolve(__dirname, '../../..'); // Adjust based on dist/cli/commands/start.js location

    let command: string;
    let args: string[];

    if (isDev) {
      // Development mode: use tsx
      command = 'npx';
      args = ['tsx', 'src/index.ts'];
    } else {
      // Production/Build mode: use node dist/index.js
      command = 'node';
      args = [path.join(projectRoot, 'dist/index.js')];
    }

    const subprocess = spawn(command, args, {
      cwd: projectRoot,
      detached: options.detached,
      stdio: options.detached ? 'ignore' : 'inherit',
    });

    if (options.detached) {
      subprocess.unref();
      console.log(chalk.green(`✨ Server started in background! (PID: ${subprocess.pid})`));
      process.exit(0);
    }
  });
