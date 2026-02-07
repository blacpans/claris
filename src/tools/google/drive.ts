import { FunctionTool } from '@google/adk';
import { google } from 'googleapis';
import { z } from 'zod';
import { authorize } from './auth.js';

export async function getDriveClient() {
  const auth = await authorize();
  return google.drive({ version: 'v3', auth });
}

const searchFilesSchema = z.object({
  query: z.string().describe('The name of the file to search for, or a natural language query.'),
  pageSize: z.number().optional().describe('Number of files to return. Defaults to 10.'),
});

export async function searchFilesFn({ query, pageSize = 10 }: { query: string; pageSize?: number }) {
  try {
    const service = await getDriveClient();
    // Simple name contains query. For more complex queries, the user can be more specific or we can enhance this.
    const q = `name contains '${query}' and trashed = false`;

    const res = await service.files.list({
      q,
      pageSize,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime)',
    });

    const files = res.data.files;
    if (!files || files.length === 0) {
      return 'No files found.';
    }

    return files
      .map((file) => {
        return `Name: ${file.name}\nType: ${file.mimeType}\nLink: ${file.webViewLink}\nCreated: ${file.createdTime}\n`;
      })
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to search files: ${err.message || String(error)}`;
  }
}

export const searchFiles = new FunctionTool({
  name: 'searchDriveFiles',
  description: 'Search for files in Google Drive.',
  parameters: searchFilesSchema,
  execute: searchFilesFn,
});
