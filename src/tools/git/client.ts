/**
 * GitHub API Client - Wrapper for Octokit
 */
import { Octokit } from '@octokit/rest';

let octokitInstance: Octokit | null = null;

/**
 * Gets or creates the GitHub client instance
 */
export function getGitHubClient(): Octokit {
  if (!octokitInstance) {
    const token = process.env.GITHUB_TOKEN;
    if (!token || token.trim() === '') {
      throw new Error(
        'GITHUB_TOKEN environment variable is not set or is empty. Please set a valid GitHub Personal Access Token in your environment.',
      );
    }
    octokitInstance = new Octokit({ auth: token });
  }
  return octokitInstance;
}

/**
 * Parses owner and repo from a GitHub URL or "owner/repo" string
 */
export function parseRepo(repoInput: string): { owner: string; repo: string } {
  if (!repoInput) {
    throw new Error('Repository input is empty. Please provide a repository name (owner/repo) or URL.');
  }

  // Handle "owner/repo" format
  if (repoInput.includes('/') && !repoInput.includes('://')) {
    const [owner, repo] = repoInput.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: "${repoInput}". Expected "owner/repo" or a full GitHub URL.`);
    }
    return { owner, repo };
  }

  // Handle full GitHub URL
  const match = repoInput.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (match?.[1] && match[2]) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  throw new Error(
    `Could not parse repository from: "${repoInput}". Please ensure it's in "owner/repo" format or a valid GitHub URL (e.g., https://github.com/owner/repo).`,
  );
}
