import chalk from 'chalk';
import type { Command } from 'commander';
import { CLI_MESSAGES } from './messages.js';

export function registerTalk(program: Command) {
	program
		.command(CLI_MESSAGES.COMMANDS.TALK.NAME)
		.description(CLI_MESSAGES.COMMANDS.TALK.DESCRIPTION)
		.argument('<message>', CLI_MESSAGES.COMMANDS.TALK.ARG_MESSAGE)
		.option(
			'-u, --url <url>',
			CLI_MESSAGES.COMMANDS.TALK.OPT_URL,
			process.env.CLARIS_API_URL || 'http://localhost:8080',
		)
		.option('-c, --context <path>', 'Context file path for Soul Unison')
		.action(async (message: string, options: { url: string; context?: string }) => {
			const apiUrl = options.url;
			try {
				const response = await fetch(`${apiUrl}/chat`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						message,
						context: options.context ? { activeFile: options.context } : undefined,
					}),
				});

				if (!response.ok) {
					throw new Error(CLI_MESSAGES.ERRORS.SERVER_ERROR(response.status, response.statusText));
				}

				const contentType = response.headers.get('content-type');
				if (!contentType || !contentType.includes('application/json')) {
					const text = await response.text();
					throw new Error(CLI_MESSAGES.ERRORS.UNEXPECTED_RESPONSE(contentType, text.slice(0, 200)));
				}

				const data = (await response.json()) as { response: string };
				console.log(chalk.bold.magenta(CLI_MESSAGES.PROMPTS.CLARIS) + chalk.cyan(data.response));
			} catch (error) {
				if (
					error instanceof Error &&
					(error.message.includes('fetch failed') || (error as any).cause?.code === 'ECONNREFUSED')
				) {
					console.error(chalk.red(CLI_MESSAGES.ERRORS.CONNECTION_REFUSED));
				} else {
					console.error(chalk.red(CLI_MESSAGES.ERRORS.COMMUNICATION_ERROR), error);
				}
				process.exit(1);
			}
		});
}
