import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { getCalendarClient } from './auth.js';

const listUpcomingEventsSchema = z.object({
  maxResults: z.number().optional().describe('Maximum number of events to list. Defaults to 10.'),
});

export const listUpcomingEvents = new FunctionTool({
  name: 'listUpcomingEvents',
  description: 'List upcoming events from the user\'s primary Google Calendar.',
  parameters: listUpcomingEventsSchema,
  execute: async ({ maxResults = 10 }: { maxResults?: number }) => {
    const calendar = await getCalendarClient();
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    const events = res.data.items;
    if (!events || events.length === 0) {
      return 'No upcoming events found.';
    }
    return events.map((event) => {
      const start = event.start?.dateTime || event.start?.date;
      return `${start} - ${event.summary}`;
    }).join('\n');
  },
});

const createEventSchema = z.object({
  summary: z.string().describe('Title of the event'),
  startDateTime: z.string().describe('Start time of the event in ISO format (e.g., 2026-01-22T10:00:00+09:00)'),
  endDateTime: z.string().describe('End time of the event in ISO format'),
  description: z.string().optional().describe('Description of the event'),
});

export const createEvent = new FunctionTool({
  name: 'createEvent',
  description: 'Create a new event in the user\'s primary Google Calendar.',
  parameters: createEventSchema,
  execute: async ({ summary, startDateTime, endDateTime, description }: { summary: string, startDateTime: string, endDateTime: string, description?: string }) => {
    const calendar = await getCalendarClient();
    const toEventTime = (dateTime: string) => ({ dateTime, timeZone: 'Asia/Tokyo' });
    const event = {
      summary,
      description,
      start: toEventTime(startDateTime),
      end: toEventTime(endDateTime),
    };

    try {
      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });
      return `Event created: ${res.data.htmlLink}`;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return `Failed to create event: ${errorMessage}`;
    }
  },
});
