import { FunctionTool } from '@google/adk';
import { google } from 'googleapis';
import { z } from 'zod';

const searchSchema = z.object({
  query: z.string().describe('The search query (e.g. "latest tech news", "who is the president of France").'),
  num: z.number().optional().describe('Number of results to return. Defaults to 5.'),
});

export async function searchFn({ query, num = 5 }: { query: string; num?: number }) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
  const dataStoreId = process.env.VERTEX_SEARCH_DATA_STORE_ID;
  const servingConfigId = process.env.VERTEX_SEARCH_SERVING_CONFIG || 'default_config';

  if (!projectId || !dataStoreId) {
    return 'Error: GOOGLE_CLOUD_PROJECT or VERTEX_SEARCH_DATA_STORE_ID is not set in .env. Please define them to use Vertex AI Search.';
  }

  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const authClient = await auth.getClient();

    const discoveryengine = google.discoveryengine({ version: 'v1beta', auth: authClient });

    const parent = `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dataStoreId}/servingConfigs/${servingConfigId}`;

    const res = await discoveryengine.projects.locations.collections.dataStores.servingConfigs.search({
      servingConfig: parent,
      requestBody: {
        query,
        pageSize: num,
        contentSearchSpec: {
          snippetSpec: { returnSnippet: true },
          // summarySpec: { summaryResultCount: 1, includeCitations: true }, // Optional: request AI summary
        },
      },
    });

    const results = res.data.results;
    if (!results || results.length === 0) {
      return 'No search results found.';
    }

    // Format output similar to previous Custom Search
    return results
      .map((item) => {
        const title = item.document?.derivedStructData?.title || 'No Title';
        const link = item.document?.derivedStructData?.link || 'No Link';
        const snippet =
          item.document?.derivedStructData?.snippets?.[0]?.snippet ||
          item.document?.derivedStructData?.extractive_answers?.[0]?.content ||
          'No snippet available';
        return `Title: ${title}\nLink: ${link}\nSnippet: ${snippet}\n`;
      })
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown } };
    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    return `Failed to search via Vertex AI: ${errorDetails || String(error)}`;
  }
}

export const googleSearch = new FunctionTool({
  name: 'googleSearch',
  description: 'Search the web using Vertex AI Search (Discovery Engine) for news, knowledge, and general information.',
  parameters: searchSchema,
  execute: searchFn,
});
