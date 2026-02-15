import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { DEFAULT_IGNORED_FILES } from '@/config/defaults.js';
import { getGitHubClient, parseRepo } from './client.js';

// --- Tool Schemas ---

const FetchDiffSchema = z.object({
  repo: z.string().describe('The full repository name (e.g., "owner/repo") or GitHub URL.'),
  prNumber: z.number().describe('The numeric ID of the Pull Request.'),
});

const PostCommentSchema = z.object({
  repo: z.string().describe('The full repository name or URL.'),
  prNumber: z.number().describe('The numeric ID of the Pull Request or Issue.'),
  body: z.string().describe('The Markdown content of the comment.'),
});

const ListPRsSchema = z.object({
  repo: z.string().describe('The full repository name or URL.'),
  state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('The state of PRs to list.'),
});

const AddReviewerSchema = z.object({
  repo: z.string().describe('The full repository name or URL.'),
  prNumber: z.number().describe('The numeric ID of the Pull Request.'),
  reviewer: z.string().describe('The GitHub username of the reviewer to add.'),
});

const CreateReviewSchema = z.object({
  repo: z.string().describe('The full repository name or URL.'),
  prNumber: z.number().describe('The numeric ID of the Pull Request.'),
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).describe('The review action to take.'),
  body: z.string().describe('The Markdown content of the review.'),
});

const AddLabelsSchema = z.object({
  repo: z.string().describe('The full repository name or URL.'),
  prNumber: z.number().describe('The numeric ID of the Pull Request or Issue.'),
  labels: z.array(z.string()).describe('An array of label names to add.'),
});

// Tool input/output types
interface FetchDiffInput {
  repo: string;
  prNumber: number;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // If it's an Octokit error, it might have a response body with more details
    const maybeOctokitError = error as Error & {
      response?: { data?: { message?: string } };
    };
    if (maybeOctokitError.response?.data?.message) {
      return `${error.message}: ${maybeOctokitError.response.data.message}`;
    }
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    return JSON.stringify(error);
  }
  return String(error);
}

interface PostCommentInput {
  repo: string;
  prNumber: number;
  body: string;
}

interface ListPRsInput {
  repo: string;
  state?: 'open' | 'closed' | 'all';
}

interface PRInfo {
  number: number;
  title: string;
  author: string;
  state: string;
  createdAt: string;
}

/**
 * Fetches the diff of a Pull Request
 */
export async function fetchDiff(input: FetchDiffInput): Promise<string> {
  try {
    const client = getGitHubClient();
    const { owner, repo } = parseRepo(input.repo);

    const response = await client.pulls.get({
      owner,
      repo,
      pull_number: input.prNumber,
      mediaType: { format: 'diff' },
    });

    // Response is raw diff text when using diff format
    const fullDiff = response.data as unknown as string;

    // Filter out lockfiles to save tokens and avoid truncation of important code
    const chunks = fullDiff.split('diff --git ');
    const filteredHelper = chunks.filter((chunk) => {
      if (!chunk.trim()) return true; // Keep empty prelude if any
      const newLineIndex = chunk.indexOf('\n');
      const firstLine = newLineIndex === -1 ? chunk : chunk.substring(0, newLineIndex);
      return !DEFAULT_IGNORED_FILES.some((file) => firstLine.includes(file));
    });

    return filteredHelper.join('diff --git ');
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Error fetching diff: ${message}`);
    return `Error fetching diff: ${message}`;
  }
}

export const fetchDiffTool = new FunctionTool({
  name: 'fetchPRDiff',
  description: 'Fetches the file diff of a GitHub Pull Request.',
  parameters: FetchDiffSchema,
  execute: fetchDiff,
});

/**
 * Posts a comment to a Pull Request
 */
export async function postComment(input: PostCommentInput): Promise<string> {
  try {
    const client = getGitHubClient();
    const { owner, repo } = parseRepo(input.repo);

    const response = await client.issues.createComment({
      owner,
      repo,
      issue_number: input.prNumber,
      body: input.body,
    });

    return `Comment posted: ${response.data.html_url}`;
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Error posting comment: ${message}`);
    return `Error posting comment: ${message}`;
  }
}

export const postCommentTool = new FunctionTool({
  name: 'postPRComment',
  description: 'Posts a simple comment to a Pull Request or Issue.',
  parameters: PostCommentSchema,
  execute: postComment,
});

/**
 * Lists Pull Requests in a repository
 */
export async function listPRs(input: ListPRsInput): Promise<{ prs: PRInfo[] } | string> {
  try {
    const client = getGitHubClient();
    const { owner, repo } = parseRepo(input.repo);

    const response = await client.pulls.list({
      owner,
      repo,
      state: input.state || 'open',
      per_page: 10,
    });

    return {
      prs: response.data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || 'unknown',
        state: pr.state,
        createdAt: pr.created_at,
      })),
    };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Error listing PRs: ${message}`);
    return `Error listing PRs: ${message}`;
  }
}

export const listPRsTool = new FunctionTool({
  name: 'listPullRequests',
  description: 'Lists open Pull Requests in a GitHub repository.',
  parameters: ListPRsSchema,
  execute: listPRs,
});

/**
 * Gets details of a specific Pull Request
 */
export async function getPRDetails(input: FetchDiffInput): Promise<
  | {
      number: number;
      title: string;
      body: string;
      author: string;
      state: string;
      additions: number;
      deletions: number;
      changedFiles: number;
    }
  | string
> {
  try {
    const client = getGitHubClient();
    const { owner, repo } = parseRepo(input.repo);

    const response = await client.pulls.get({
      owner,
      repo,
      pull_number: input.prNumber,
    });

    const pr = response.data;
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      author: pr.user?.login || 'unknown',
      state: pr.state,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Error getting PR details: ${message}`);
    return `Error getting PR details: ${message}`;
  }
}

export const getPRDetailsTool = new FunctionTool({
  name: 'getPRDetails',
  description: 'Gets detailed information about a specific Pull Request.',
  parameters: FetchDiffSchema,
  execute: getPRDetails,
});

// --- Review Enhancement Functions ---

interface AddReviewerInput {
  repo: string;
  prNumber: number;
  reviewer: string;
}

interface CreateReviewInput {
  repo: string;
  prNumber: number;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  body: string;
}

interface AddLabelsInput {
  repo: string;
  prNumber: number;
  labels: string[];
}

/**
 * Adds a reviewer to a Pull Request
 */
export async function addReviewer(input: AddReviewerInput): Promise<string> {
  try {
    const client = getGitHubClient();
    const { owner, repo } = parseRepo(input.repo);

    await client.pulls.requestReviewers({
      owner,
      repo,
      pull_number: input.prNumber,
      reviewers: [input.reviewer],
    });
    return `Reviewer ${input.reviewer} added to PR #${input.prNumber}`;
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Could not add reviewer: ${message}`);
    return `Could not add reviewer: ${message}`;
  }
}

export const addReviewerTool = new FunctionTool({
  name: 'addPRReviewer',
  description: 'Adds a reviewer to a GitHub Pull Request.',
  parameters: AddReviewerSchema,
  execute: addReviewer,
});

/**
 * Creates a review on a Pull Request (Approve, Request Changes, or Comment)
 */
export async function createReview(input: CreateReviewInput): Promise<string> {
  try {
    const client = getGitHubClient();
    const { owner, repo } = parseRepo(input.repo);

    const response = await client.pulls.createReview({
      owner,
      repo,
      pull_number: input.prNumber,
      event: input.event,
      body: input.body,
    });

    return `Review created: ${response.data.html_url}`;
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Error creating review: ${message}`);
    return `Error creating review: ${message}`;
  }
}

export const createReviewTool = new FunctionTool({
  name: 'createPRReview',
  description: 'Creates a formal review on a GitHub Pull Request.',
  parameters: CreateReviewSchema,
  execute: createReview,
});

/**
 * Adds labels to a Pull Request
 */
export async function addLabels(input: AddLabelsInput): Promise<string> {
  try {
    const client = getGitHubClient();
    const { owner, repo } = parseRepo(input.repo);

    await client.issues.addLabels({
      owner,
      repo,
      issue_number: input.prNumber,
      labels: input.labels,
    });
    return `Labels added: ${input.labels.join(', ')}`;
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`Could not add labels: ${message}`);
    return `Could not add labels: ${message}`;
  }
}

export const addLabelsTool = new FunctionTool({
  name: 'addPRLabels',
  description: 'Adds labels to a GitHub Pull Request or Issue.',
  parameters: AddLabelsSchema,
  execute: addLabels,
});
