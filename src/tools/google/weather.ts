import { FunctionTool } from '@google/adk';
import { z } from 'zod';

const getWeatherSchema = z.object({
  location: z.string().describe('The location to get weather for (e.g. "Tokyo", "London", or "35.6895,139.6917").'),
});

import { searchFn } from './search.js';

export async function getWeatherFn({ location }: { location: string }) {
  try {
    const query = `weather in ${location}`;
    const searchResults = await searchFn({ query, num: 3 });

    if (typeof searchResults === 'string' && searchResults.startsWith('Error')) {
      return searchResults;
    }

    if (!searchResults || searchResults === 'No search results found.') {
      return `Could not find weather information for ${location}.`;
    }

    return `Weather Search Results for ${location}:\n\n${searchResults}`;
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to get weather: ${err.message || String(error)}`;
  }
}

export const getWeather = new FunctionTool({
  name: 'getWeather',
  description: 'Get current weather for a location by searching Google.',
  parameters: getWeatherSchema,
  execute: getWeatherFn,
});
