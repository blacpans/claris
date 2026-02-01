#!/usr/bin/env node

import '../config/env.js';
import { Command } from 'commander';
import { live } from './commands/live.js';
import { CLI_MESSAGES } from './messages.js';
import { registerStatus } from './status.js';
import { registerTalk } from './talk.js';

const program = new Command();

program.name('claris').description('Claris - Agentic NetNavi 🌸').version('0.1.0').addCommand(live);

registerStatus(program);
registerTalk(program);

program.parse();
