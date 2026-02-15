import { describe, expect, it, vi } from 'vitest';
import { getGitHubClient, parseRepo } from '../client.js';

describe('GitHub Client', () => {
  describe('parseRepo', () => {
    it('should parse "owner/repo" format', () => {
      const result = parseRepo('blacpans/claris');
      expect(result).toEqual({ owner: 'blacpans', repo: 'claris' });
    });

    it('should parse full GitHub URL', () => {
      const result = parseRepo('https://github.com/blacpans/claris');
      expect(result).toEqual({ owner: 'blacpans', repo: 'claris' });
    });

    it('should parse GitHub URL with .git extension', () => {
      const result = parseRepo('https://github.com/blacpans/claris.git');
      expect(result).toEqual({ owner: 'blacpans', repo: 'claris' });
    });

    it('should throw error for empty input', () => {
      expect(() => parseRepo('')).toThrow('Repository input is empty');
    });

    it('should throw error for invalid format', () => {
      expect(() => parseRepo('just-a-string')).toThrow('Could not parse repository from');
    });

    it('should throw error for incomplete owner/repo', () => {
      expect(() => parseRepo('owner/')).toThrow('Invalid repository format');
    });
  });

  describe('getGitHubClient', () => {
    it('should throw error if GITHUB_TOKEN is missing', () => {
      const originalToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      try {
        expect(() => getGitHubClient()).toThrow('GITHUB_TOKEN environment variable is not set');
      } finally {
        process.env.GITHUB_TOKEN = originalToken;
      }
    });
  });
});
