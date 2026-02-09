import { FunctionTool } from '@google/adk';
import { google } from 'googleapis';
import { z } from 'zod';
import { authorize } from './auth.js';

export async function getPeopleClient() {
  const auth = await authorize();
  return google.people({ version: 'v1', auth });
}

const searchContactsSchema = z.object({
  query: z.string().describe('The name or query to search for in contacts.'),
  readMask: z
    .string()
    .optional()
    .describe('Comma-separated list of fields to fetch. Defaults to "names,emailAddresses,phoneNumbers,birthdays".'),
});

export async function searchContactsFn({
  query,
  readMask = 'names,emailAddresses,phoneNumbers,birthdays',
}: {
  query: string;
  readMask?: string;
}) {
  try {
    const service = await getPeopleClient();
    const res = await service.people.searchContacts({
      query,
      readMask,
    });

    const connections = res.data.results;
    if (!connections || connections.length === 0) {
      return 'No contacts found.';
    }

    return connections
      .map((result) => {
        const person = result.person;
        if (!person) return '';

        const name = person.names?.[0]?.displayName || 'Unknown';
        const emails = person.emailAddresses?.map((e) => e.value).join(', ') || 'N/A';
        const phones = person.phoneNumbers?.map((p) => p.value).join(', ') || 'N/A';
        const birthday = person.birthdays?.[0]?.date
          ? `${person.birthdays[0].date.year || '????'}-${person.birthdays[0].date.month}-${person.birthdays[0].date.day}`
          : 'N/A';

        return `Name: ${name}\nEmails: ${emails}\nPhones: ${phones}\nBirthday: ${birthday}\nResourceName: ${person.resourceName}\n`;
      })
      .filter((s) => s)
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to search contacts: ${err.message || String(error)}`;
  }
}

export const searchContacts = new FunctionTool({
  name: 'searchContacts',
  description: 'Search for contacts in your Google Contacts.',
  parameters: searchContactsSchema,
  execute: searchContactsFn,
});

const listConnectionsSchema = z.object({
  pageSize: z.number().optional().describe('Number of connections to return. Defaults to 10.'),
  personFields: z
    .string()
    .optional()
    .describe('Comma-separated list of fields to fetch. Defaults to "names,emailAddresses,phoneNumbers,birthdays".'),
});

export async function listConnectionsFn({
  pageSize = 10,
  personFields = 'names,emailAddresses,phoneNumbers,birthdays',
}: {
  pageSize?: number;
  personFields?: string;
}) {
  try {
    const service = await getPeopleClient();
    const res = await service.people.connections.list({
      resourceName: 'people/me',
      pageSize,
      personFields,
    });

    const connections = res.data.connections;
    if (!connections || connections.length === 0) {
      return 'No connections found.';
    }

    return connections
      .map((person) => {
        const name = person.names?.[0]?.displayName || 'Unknown';
        const emails = person.emailAddresses?.map((e) => e.value).join(', ') || 'N/A';
        const phones = person.phoneNumbers?.map((p) => p.value).join(', ') || 'N/A';
        const birthday = person.birthdays?.[0]?.date
          ? `${person.birthdays[0].date.year || '????'}-${person.birthdays[0].date.month}-${person.birthdays[0].date.day}`
          : 'N/A';

        return `Name: ${name}\nEmails: ${emails}\nPhones: ${phones}\nBirthday: ${birthday}\nResourceName: ${person.resourceName}\n`;
      })
      .join('---\n');
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to list connections: ${err.message || String(error)}`;
  }
}

export const listConnections = new FunctionTool({
  name: 'listConnections',
  description: 'List your contacts (connections).',
  parameters: listConnectionsSchema,
  execute: listConnectionsFn,
});
