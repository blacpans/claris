/**
 * GitHub Tools for ADK Agent
 *
 * These tools allow Claris to interact with GitHub PRs and Issues.
 */
import { DEFAULT_IGNORED_FILES } from '../../config/defaults.js';
import { getGitHubClient, parseRepo } from './client.js';

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
	// Response is raw diff text when using diff format
	const fullDiff = response.data as unknown as string;

	// Filter out lockfiles to save tokens and avoid truncation of important code
	// Split by "diff --git ", filter out chunks containing lockfiles, then rejoin
	const chunks = fullDiff.split('diff --git ');
	const filteredHelper = chunks.filter((chunk) => {
		if (!chunk.trim()) return true; // Keep empty prelude if any
		const firstLine = chunk.split('\n')[0] || '';
		return !DEFAULT_IGNORED_FILES.some((file) => firstLine.includes(file));
	});

	return filteredHelper.join('diff --git ');
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
	const client = getGitHubClient();
	const { owner, repo } = parseRepo(input.repo);

	try {
		await client.pulls.requestReviewers({
			owner,
			repo,
			pull_number: input.prNumber,
			reviewers: [input.reviewer],
		});
		return `Reviewer ${input.reviewer} added to PR #${input.prNumber}`;
	} catch (error) {
		// Reviewer might already be assigned or bot can't add itself
		console.warn(`Could not add reviewer: ${error}`);
		return `Could not add reviewer: ${error}`;
	}
}

/**
 * Creates a review on a Pull Request (Approve, Request Changes, or Comment)
 */
export async function createReview(input: CreateReviewInput): Promise<string> {
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
}

/**
 * Adds labels to a Pull Request
 */
export async function addLabels(input: AddLabelsInput): Promise<string> {
	const client = getGitHubClient();
	const { owner, repo } = parseRepo(input.repo);

	try {
		await client.issues.addLabels({
			owner,
			repo,
			issue_number: input.prNumber,
			labels: input.labels,
		});
		return `Labels added: ${input.labels.join(', ')}`;
	} catch (error) {
		console.warn(`Could not add labels: ${error}`);
		return `Could not add labels: ${error}`;
	}
}
