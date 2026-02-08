#!/usr/bin/env node

import '../config/env.js';
import { Command } from 'commander';
import { auth } from './commands/auth.js';
import { chat } from './commands/chat.js';
import { live } from './commands/live.js';
import { start } from './commands/start.js';
import { status } from './commands/status.js';
import { stop } from './commands/stop.js';

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
