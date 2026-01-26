#!/usr/bin/env node

import '../config/env.js';
import { Command } from 'commander';
import { CLI_MESSAGES } from './messages.js';
import { registerTalk } from './talk.js';
import { registerStatus } from './status.js';

const program = new Command();

program
  .name('claris')
  .description(CLI_MESSAGES.DESCRIPTION)
  .version('0.1.0');

registerStatus(program);
registerTalk(program);

program.parse();
