import 'dotenv/config';
import { createEventFn, listUpcomingEventsFn } from '../src/tools/google/calendar.js';

async function main() {
  console.log('🧪 Testing Calendar Tool Functions Directly...');

  console.log('\n--- Testing listUpcomingEvents ---');
  const resultList = await listUpcomingEventsFn({ maxResults: 3 });
  console.log('Result:', resultList);

  console.log('\n--- Testing createEvent (Dry Run-ish) ---');
  // We expect this to fail with auth error, so we can test handling
  const resultCreate = await createEventFn({
    summary: 'Test Event',
    startDateTime: new Date().toISOString(),
    endDateTime: new Date(Date.now() + 3600000).toISOString(),
  });
  console.log('Result:', resultCreate);
}

main();
