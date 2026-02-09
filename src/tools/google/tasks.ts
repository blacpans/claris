import { FunctionTool } from '@google/adk';
import { google } from 'googleapis';
import { z } from 'zod';
import { authorize } from './auth.js';

export async function getTasksClient() {
  const auth = await authorize();
  return google.tasks({ version: 'v1', auth });
}

const listTasksSchema = z.object({
  listId: z.string().optional().describe("ID of the task list. Defaults to the user's primary list (@default)."),
  maxResults: z.number().optional().describe('Maximum number of tasks to return. Defaults to 10.'),
  showCompleted: z.boolean().optional().describe('Whether to retrieve completed tasks. Defaults to false.'),
});

export async function listTasksFn({
  listId = '@default',
  maxResults = 10,
  showCompleted = false,
}: {
  listId?: string;
  maxResults?: number;
  showCompleted?: boolean;
}) {
  try {
    const service = await getTasksClient();
    const res = await service.tasks.list({
      tasklist: listId,
      maxResults,
      showCompleted,
      showHidden: showCompleted,
    });

    const tasks = res.data.items;
    if (!tasks || tasks.length === 0) {
      return 'No tasks found.';
    }

    return tasks
      .map((task) => {
        const status = task.status === 'completed' ? '[x]' : '[ ]';
        const due = task.due ? ` (Due: ${task.due.split('T')[0]})` : '';
        return `${status} ${task.title}${due}`;
      })
      .join('\n');
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number };
    if (err.code === 401 || err.code === 403) {
      return 'Authentication failed. Please check your credentials.';
    }
    return `Failed to list tasks: ${err.message || String(error)}`;
  }
}

export const listTasks = new FunctionTool({
  name: 'listTasks',
  description: 'List tasks from your Google Tasks.',
  parameters: listTasksSchema,
  execute: listTasksFn,
});

const addTaskSchema = z.object({
  title: z.string().describe('Title of the task'),
  notes: z.string().optional().describe('Notes or description for the task'),
  due: z.string().optional().describe('Due date (RFC 3339 timestamp) or YYYY-MM-DD format'),
  listId: z.string().optional().describe('ID of the task list. Defaults to @default.'),
});

export async function addTaskFn({
  title,
  notes,
  due,
  listId = '@default',
}: {
  title: string;
  notes?: string;
  due?: string;
  listId?: string;
}) {
  try {
    const service = await getTasksClient();

    let dueStr = due;
    const dueMatch = due?.match(/^\d{4}-\d{2}-\d{2}$/);
    if (due && dueMatch) {
      // Correctly format YYYY-MM-DD to RFC3339
      dueStr = `${due}T00:00:00.000Z`;
    }

    const res = await service.tasks.insert({
      tasklist: listId,
      requestBody: {
        title,
        notes,
        due: dueStr,
      },
    });

    return `Task added: ${res.data.title} (ID: ${res.data.id})\nLink: ${res.data.selfLink || 'N/A'}`;
  } catch (error: unknown) {
    const err = error as { message?: string };
    return `Failed to add task: ${err.message || String(error)}`;
  }
}

export const addTask = new FunctionTool({
  name: 'addTask',
  description: 'Add a new task to your Google Tasks.',
  parameters: addTaskSchema,
  execute: addTaskFn,
});
