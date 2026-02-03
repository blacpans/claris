import 'dotenv/config';
import { adkRunner } from '../src/runtime/runner.js';

async function main() {
  console.log('🤖 Starting Calendar Verification...');

  // 1. Ask for schedule (expecting auth error or success if already authenticated)
  const prompt = '明日の予定を教えて！';
  console.log(`👤 User: ${prompt}`);

  try {
    const response = await adkRunner.run({
      userId: 'verify-calendar-user',
      sessionId: `verify-calendar-${Date.now()}`,
      message: prompt,
    }); // Context is not needed for this simple test unless we wanted to force a specific style

    console.log('--------------------------------------------------');
    console.log(`🌸 Claris: ${response}`);
    console.log('--------------------------------------------------');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
