#!/usr/bin/env node

import '../config/env.js';
import { Command } from 'commander';
import { chat } from './chat.js';
import { auth } from './commands/auth.js';
import { live } from './commands/live.js';
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './status.js';

const program = new Command();

program
  .name('claris')
  .description('Claris - Agentic NetNavi 🌸')
  .version('0.1.0')
  .addCommand(live)
  .addCommand(auth)
  .addCommand(start)
  .addCommand(stop)
  .addCommand(status)
  .addCommand(chat);

program.parse();
