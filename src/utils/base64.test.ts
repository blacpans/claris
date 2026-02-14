import { describe, expect, it } from 'vitest';
import { fastBase64Decode } from './base64.js';

describe('fastBase64Decode', () => {
  it('should decode empty string', () => {
    const res = fastBase64Decode('');
    expect(res.length).toBe(0);
  });

  it('should decode string without padding', () => {
    const buf = Buffer.from('123'); // 3 bytes -> 4 chars, no padding
    const base64 = buf.toString('base64');
    expect(fastBase64Decode(base64)).toEqual(buf);
  });

  it('should decode string with 1 padding', () => {
    const buf = Buffer.from('12'); // 2 bytes -> 3 chars + =
    const base64 = buf.toString('base64');
    expect(fastBase64Decode(base64)).toEqual(buf);
  });

  it('should decode string with 2 padding', () => {
    const buf = Buffer.from('1'); // 1 byte -> 2 chars + ==
    const base64 = buf.toString('base64');
    expect(fastBase64Decode(base64)).toEqual(buf);
  });

  it('should decode large string correctly', () => {
    // Reduce size to avoid timeout in deep equality check or large buffer generation
    const buf = Buffer.alloc(1024 * 64); // 64KB
    for (let i = 0; i < buf.length; i++) buf[i] = i % 256;
    const base64 = buf.toString('base64');

    const decoded = fastBase64Decode(base64);
    // Use buffer.equals for fast comparison
    expect(decoded.equals(buf)).toBe(true);
  });
});
