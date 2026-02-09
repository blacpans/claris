import { FunctionTool } from '@google/adk';
import { google } from 'googleapis';
import { z } from 'zod';
import { authorize } from './auth.js';

export async function getSheetsClient() {
  const auth = await authorize();
  return google.sheets({ version: 'v4', auth });
}

const createSheetSchema = z.object({
  title: z.string().describe('Title of the new spreadsheet'),
});

export async function createSheetFn({ title }: { title: string }) {
  try {
    const service = await getSheetsClient();
    const res = await service.spreadsheets.create({
      requestBody: {
        properties: {
          title,
        },
      },
    });
    return `Spreadsheet created: ${res.data.spreadsheetUrl}`;
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to create spreadsheet: ${err.message || String(error)}`;
  }
}

export const createSheet = new FunctionTool({
  name: 'createSheet',
  description: 'Create a new Google Spreadsheet.',
  parameters: createSheetSchema,
  execute: createSheetFn,
});

const appendToSheetSchema = z.object({
  spreadsheetId: z.string().describe('The ID of the spreadsheet to update.'),
  range: z.string().describe('The A1 notation of a range to search for a logical table endpoint. e.g. "Sheet1!A1"'),
  values: z.array(z.string()).describe('The data to append (array of strings for a single row).'),
});

export async function appendToSheetFn({
  spreadsheetId,
  range,
  values,
}: {
  spreadsheetId: string;
  range: string;
  values: string[];
}) {
  try {
    const service = await getSheetsClient();
    const res = await service.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });

    return `Appended ${res.data.updates?.updatedRows} row(s) to range: ${res.data.updates?.updatedRange}`;
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to append to sheet: ${err.message || String(error)}`;
  }
}

export const appendToSheet = new FunctionTool({
  name: 'appendToSheet',
  description: 'Append a row of data to a Google Sheet.',
  parameters: appendToSheetSchema,
  execute: appendToSheetFn,
});

const readSheetSchema = z.object({
  spreadsheetId: z.string().describe('The ID of the spreadsheet to read.'),
  range: z.string().describe('The A1 notation of the range to read. e.g. "Sheet1!A1:E10"'),
});

export async function readSheetFn({ spreadsheetId, range }: { spreadsheetId: string; range: string }) {
  try {
    const service = await getSheetsClient();
    const res = await service.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      return 'No data found.';
    }

    return rows.map((row) => row.join(', ')).join('\n');
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to read sheet: ${err.message || String(error)}`;
  }
}

export const readSheet = new FunctionTool({
  name: 'readSheet',
  description: 'Read data from a Google Sheet.',
  parameters: readSheetSchema,
  execute: readSheetFn,
});
