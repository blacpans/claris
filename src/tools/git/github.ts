/**
 * GitHub Tools for ADK Agent
 *
 * These tools allow Claris to interact with GitHub PRs and Issues.
 */
import { getGitHubClient, parseRepo } from './client';

// Tool input/output types
interface FetchDiffInput {
  repo: string;
  prNumber: number;
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
  const client = getGitHubClient();
  const { owner, repo } = parseRepo(input.repo);

  const response = await client.pulls.get({
    owner,
    repo,
    pull_number: input.prNumber,
    mediaType: { format: 'diff' },
  });

  // Response is raw diff text when using diff format
  return response.data as unknown as string;
}

/**
 * Posts a comment to a Pull Request
 */
export async function postComment(input: PostCommentInput): Promise<string> {
  const client = getGitHubClient();
  const { owner, repo } = parseRepo(input.repo);

  const response = await client.issues.createComment({
    owner,
    repo,
    issue_number: input.prNumber,
    body: input.body,
  });

  return `Comment posted: ${response.data.html_url}`;
}

/**
 * Lists Pull Requests in a repository
 */
export async function listPRs(input: ListPRsInput): Promise<PRInfo[]> {
  const client = getGitHubClient();
  const { owner, repo } = parseRepo(input.repo);

  const response = await client.pulls.list({
    owner,
    repo,
    state: input.state || 'open',
    per_page: 10,
  });

  return response.data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login || 'unknown',
    state: pr.state,
    createdAt: pr.created_at,
  }));
}

/**
 * Gets details of a specific Pull Request
 */
export async function getPRDetails(input: FetchDiffInput): Promise<{
  number: number;
  title: string;
  body: string;
  author: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}> {
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
}
