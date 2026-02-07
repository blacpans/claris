import { FunctionTool } from '@google/adk';
import { Client, type TravelMode } from '@googlemaps/google-maps-services-js';
import { z } from 'zod';

const client = new Client({});

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_MAPS_API_KEY is not set in environment variables.');
  }
  return key;
}

const searchPlacesSchema = z.object({
  query: z.string().describe('Text query for the place search (e.g. "restaurants in Tokyo", "Tokyo Tower").'),
});

export async function searchPlacesFn({ query }: { query: string }) {
  try {
    const key = getApiKey();
    const response = await client.textSearch({
      params: {
        query,
        key,
      },
    });

    if (response.data.results.length === 0) {
      return 'No places found.';
    }

    // Return top 5 results
    return response.data.results
      .slice(0, 5)
      .map((place) => {
        return `Name: ${place.name}\nAddress: ${place.formatted_address}\nRating: ${place.rating} (${place.user_ratings_total} reviews)\nOpen Now: ${place.opening_hours?.open_now ? 'Yes' : 'No'}\n`;
      })
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    return `Failed to search places: ${err.message || JSON.stringify(err.response?.data || error)}`;
  }
}

export const searchPlaces = new FunctionTool({
  name: 'searchPlaces',
  description: 'Search for places using Google Maps.',
  parameters: searchPlacesSchema,
  execute: searchPlacesFn,
});

const getDirectionsSchema = z.object({
  origin: z.string().describe('The starting point for the directions (address or place name).'),
  destination: z.string().describe('The destination for the directions (address or place name).'),
  mode: z
    .enum(['driving', 'walking', 'bicycling', 'transit'])
    .optional()
    .describe('The mode of transport. Defaults to driving.'),
});

export async function getDirectionsFn({
  origin,
  destination,
  mode = 'driving',
}: {
  origin: string;
  destination: string;
  mode?: string;
}) {
  try {
    const key = getApiKey();
    const response = await client.directions({
      params: {
        origin,
        destination,
        mode: mode as TravelMode,
        key,
      },
    });

    if (response.data.routes.length === 0) {
      return 'No routes found.';
    }

    const route = response.data.routes[0];
    const leg = route?.legs[0];

    if (!leg) {
      return 'No route legs found.';
    }

    const steps = leg.steps
      .map(
        (step, index) =>
          `${index + 1}. ${step.html_instructions.replace(/<[^>]*>/g, '')} (${step.distance.text}, ${step.duration.text})`,
      )
      .join('\n');

    return `Directions from ${leg.start_address} to ${leg.end_address} (${mode}):\nDistance: ${leg.distance.text}\nDuration: ${leg.duration.text}\n\nSteps:\n${steps}`;
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    return `Failed to get directions: ${err.message || JSON.stringify(err.response?.data || error)}`;
  }
}

export const getDirections = new FunctionTool({
  name: 'getDirections',
  description: 'Get directions between two locations using Google Maps.',
  parameters: getDirectionsSchema,
  execute: getDirectionsFn,
});
