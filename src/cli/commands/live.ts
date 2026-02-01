import { Command } from 'commander';
import { LiveSession } from '../../core/live/LiveSession.js';

export const live = new Command('live')
  .description('Start a real-time voice conversation with Claris 🎤')
  .option('-v, --voicevox', 'Use VoiceVox (Kasukabe Tsumugi) for voice output', false)
  .action(async (options) => {
    const mode = options.voicevox ? 'voicevox' : 'native';

    // Check if VoiceVox is running if mode is voicevox
    if (mode === 'voicevox') {
      const { VoiceVoxClient } = await import('../../core/voice/VoiceVoxClient.js');
      const vv = new VoiceVoxClient();
      const isHealthy = await vv.checkHealth();
      if (!isHealthy) {
        console.error('❌ VoiceVox Engine is not running!');
        console.error('Please run: docker run --rm -p 50021:50021 voicevox/voicevox_engine:cpu-ubuntu20.04-latest');
        process.exit(1);
      }
    }

    const session = new LiveSession(mode);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n👋 Bye bye!');
      session.stop();
      process.exit(0);
    });

    await session.start();
  });
