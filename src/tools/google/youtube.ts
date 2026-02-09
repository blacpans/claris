import { FunctionTool } from '@google/adk';
import { google } from 'googleapis';
import { z } from 'zod';
import { authorize } from './auth.js';

export async function getYouTubeClient() {
  const auth = await authorize('youtube');
  return google.youtube({ version: 'v3', auth });
}

const searchVideosSchema = z.object({
  query: z.string().describe('The search query for videos.'),
  maxResults: z.number().optional().describe('Maximum number of results. Defaults to 5.'),
});

export async function searchVideosFn({ query, maxResults = 5 }: { query: string; maxResults?: number }) {
  try {
    const service = await getYouTubeClient();
    const res = await service.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults,
    });

    const items = res.data.items;
    if (!items || items.length === 0) {
      return 'No videos found.';
    }

    return items
      .map((item) => {
        const title = item.snippet?.title;
        const channel = item.snippet?.channelTitle;
        const videoId = item.id?.videoId;
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        return `Title: ${title}\nChannel: ${channel}\nLink: ${url}\n`;
      })
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to search videos: ${err.message || String(error)}`;
  }
}

export const searchVideos = new FunctionTool({
  name: 'searchVideos',
  description: 'Search for videos on YouTube.',
  parameters: searchVideosSchema,
  execute: searchVideosFn,
});

const listPlaylistsSchema = z.object({
  mine: z.boolean().optional().describe("Whether to list the authenticated user's playlists. Defaults to true."),
  maxResults: z.number().optional().describe('Maximum number of playlists. Defaults to 10.'),
});

export async function listPlaylistsFn({ mine = true, maxResults = 10 }: { mine?: boolean; maxResults?: number }) {
  try {
    const service = await getYouTubeClient();
    const res = await service.playlists.list({
      part: ['snippet', 'contentDetails'],
      mine,
      maxResults,
    });

    const items = res.data.items;
    if (!items || items.length === 0) {
      return 'No playlists found.';
    }

    return items
      .map((item) => {
        return `Title: ${item.snippet?.title} (ID: ${item.id})\nItems: ${item.contentDetails?.itemCount}\n`;
      })
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to list playlists: ${err.message || String(error)}`;
  }
}

export const listPlaylists = new FunctionTool({
  name: 'listPlaylists',
  description: 'List your YouTube playlists.',
  parameters: listPlaylistsSchema,
  execute: listPlaylistsFn,
});
