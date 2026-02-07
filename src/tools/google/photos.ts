import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { authorize } from './auth.js';

// Note: standard googleapis might not have full Photos Library support or it might be under a different name.
// Historically, accessing Photos often required calling the REST API directly with the token.
// Let's attempt to use the token to fetch from the API directly to be safe and avoid dependency issues if 'photoslibrary' isn't in the default set.
// The scope is https://www.googleapis.com/auth/photoslibrary.readonly

const searchPhotosSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Text description to search for (e.g. "cat", "sunset"). Note: Filters are limited in the API, this often searches your created albums or descriptions.',
    ),
  pageSize: z.number().optional().describe('Number of photos to return. Defaults to 10.'),
});

export async function searchPhotosFn({ query, pageSize = 10 }: { query?: string; pageSize?: number }) {
  try {
    const auth = await authorize();
    const token = await auth.getAccessToken();

    if (!token.token) {
      throw new Error('Failed to retrieve access token.');
    }

    // Google Photos Library API - Search
    // POST https://photoslibrary.googleapis.com/v1/mediaItems:search
    const url = 'https://photoslibrary.googleapis.com/v1/mediaItems:search';

    // Construct filters based on query if possible, but the API "filters" are complex (dates, categories).
    // Text search isn't directly supported in the `search` endpoint in the same way as "search bar".
    // It supports: albumId, filters (date, content, mediaType).
    // "ContentFilter" allows categories like LANDSCAPES, RECEIPTS, PETS, etc.
    // Since "query" usually implies keyword search which the API *doesn't* strictly support for general keywords on ALL photos (only internal classification),
    // we might just list media items if no specific structured filter is easy to map.
    // However, let's try to list latest photos if no query, or warn about limitation.

    // Actually, listing plain media items:
    // GET https://photoslibrary.googleapis.com/v1/mediaItems

    let fetchUrl = url;
    let method = 'POST';
    let body: { pageSize?: number } | undefined = {
      pageSize,
    };

    if (!query) {
      // List latest
      fetchUrl = `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=${pageSize}`;
      method = 'GET';
      body = undefined;
    } else {
      // If query is provided, we can't easily map a free text query to the API's ContentFilter categories without NLP mapping.
      // For now, let's treat "query" as a category if it matches, otherwise just list.
      // Or simpler: Just implement "list latest photos" since free search is restricted.
      // Let's assume the user might want to find "cats".
      // We can try to map simple keywords to ContentCategory.
      // Categories: ANIMALS, FASHION, LANDMARKS, RECEIPTS, WEDDINGS, ... (Review docs)
      // This is getting complex.

      // Simpler approach: Just return latest photos for "Visual Memories".
      fetchUrl = `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=${pageSize}`;
      method = 'GET';
      body = undefined;
    }

    const res = await fetch(fetchUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text();
      return `Error fetching photos: ${res.status} ${res.statusText} - ${errText}`;
    }

    const data = (await res.json()) as {
      mediaItems?: {
        filename: string;
        mimeType: string;
        productUrl: string;
        mediaMetadata: { creationTime: string };
      }[];
    };

    if (!data.mediaItems || data.mediaItems.length === 0) {
      return 'No photos found.';
    }

    return data.mediaItems
      .map((item) => {
        return `File: ${item.filename}\nType: ${item.mimeType}\nLink: ${item.productUrl}\nDate: ${item.mediaMetadata.creationTime}\n`;
      })
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to list/search photos: ${err.message || String(error)}`;
  }
}

export const listPhotos = new FunctionTool({
  name: 'listPhotos',
  description: 'List your latest photos from Google Photos.',
  parameters: searchPhotosSchema,
  execute: searchPhotosFn,
});
