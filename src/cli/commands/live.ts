import { Command } from 'commander';
import { LiveSession } from '../../core/live/LiveSession.js';

export const live = new Command('live')
  .description('Start a real-time voice conversation with Claris 🎤')
  .action(async () => {
    const session = new LiveSession();

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n👋 Bye bye!');
      session.stop();
      process.exit(0);
    });

    await session.start();
  });
