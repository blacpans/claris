import { FunctionTool } from '@google/adk';
import { google } from 'googleapis';
import { z } from 'zod';
import { authorize } from './auth.js';

export async function getDriveClient() {
  const auth = await authorize();
  return google.drive({ version: 'v3', auth });
}

const searchFilesSchema = z.object({
  query: z.string().optional().describe('The name of the file to search for, or a natural language query.'),
  pageSize: z.number().optional().describe('Number of files to return. Defaults to 10.'),
});

export async function searchFilesFn({ query, pageSize = 10 }: { query?: string; pageSize?: number }) {
  try {
    const service = await getDriveClient();
    let q = 'trashed = false';

    if (query) {
      const lowerQuery = query.toLowerCase();
      if (lowerQuery === 'pdf') {
        q += " and mimeType = 'application/pdf'";
      } else if (lowerQuery === 'folder') {
        q += " and mimeType = 'application/vnd.google-apps.folder'";
      } else if (lowerQuery === 'image') {
        q += " and mimeType contains 'image/'";
      } else if (query.includes('=') || query.includes('contains')) {
        // Model provided a raw query (e.g. "name = 'foo'")
        q += ` and (${query})`;
      } else {
        // Default: name contains query
        q += ` and name contains '${query}'`;
      }
    }

    const res = await service.files.list({
      q,
      pageSize,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = res.data.files;
    if (!files || files.length === 0) {
      // Check if we can see ANY files to rule out auth/scope issues
      if (q !== 'trashed = false') {
        const check = await service.files.list({ pageSize: 1, fields: 'files(id)' });
        if (!check.data.files || check.data.files.length === 0) {
          return `No files found matching query: "${q}". WARNING: Your Drive appears completely empty to me. This suggests a permission issue. Please ensuring you have authorized the correct scopes.`;
        }
      }
      return `No files found matching query: "${q}"`;
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
