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
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    octokitInstance = new Octokit({ auth: token });
  }
  return octokitInstance;
}

/**
 * Parses owner and repo from a GitHub URL or "owner/repo" string
 */
export function parseRepo(repoInput: string): { owner: string; repo: string } {
  // Handle "owner/repo" format
  if (repoInput.includes('/') && !repoInput.includes('://')) {
    const [owner, repo] = repoInput.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repo format: ${repoInput}`);
    }
    return { owner, repo };
  }

  // Handle full GitHub URL
  const match = repoInput.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (match?.[1] && match[2]) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  throw new Error(`Cannot parse repo from: ${repoInput}`);
}
