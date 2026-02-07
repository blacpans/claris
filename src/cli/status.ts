import chalk from 'chalk';
import { Command } from 'commander';
import { listUpcomingEventsFn } from '@/tools/google/calendar.js';
import { listUnreadEmailsFn } from '@/tools/google/gmail.js';

export const status = new Command('status')
  .description('Show current status (Unread emails & Upcoming events)')
  .action(async () => {
    console.log(chalk.bold.cyan('\n🔍 Checking status...\n'));

    try {
      // Parallel fetch for simplified "smart" feel
      const [emails, events] = await Promise.all([
        listUnreadEmailsFn({ maxResults: 5 }),
        listUpcomingEventsFn({ maxResults: 5 }),
      ]);

      console.log(chalk.bold.yellow('📧 Unread Emails (Top 5):'));
      console.log(emails);
      console.log(''); // spacer

      console.log(chalk.bold.green('📅 Upcoming Events:'));
      console.log(events);
      console.log(''); // spacer
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`❌ Failed to fetch status: ${errorMessage}`));
      if (errorMessage.includes('No saved credentials')) {
        console.log(
          chalk.yellow(
            '💡 Hint: You need to authenticate first. The system should have opened a browser window or provided a link.',
          ),
        );
      }
    }
  });
