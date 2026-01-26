#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { CLI_MESSAGES } from './messages.js';
import { registerStatus } from './status.js';

const program = new Command();

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
