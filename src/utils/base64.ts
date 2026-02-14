/**
 * Fast Base64 decoder using Buffer.allocUnsafe.
 * This avoids the overhead of Buffer.from(string, 'base64') which may involve
 * internal checks or allocation strategies that are slightly slower than
 * raw unsafe allocation for known-size buffers.
 */
export function fastBase64Decode(str: string): Buffer {
  if (!str) return Buffer.allocUnsafe(0);

  // Calculate length excluding padding
  let len = str.length;
  if (str.charCodeAt(len - 1) === 61) len--; // =
  if (len > 1 && str.charCodeAt(len - 1) === 61) len--; // =

  // Base64 encoding: 4 chars -> 3 bytes
  const size = Math.floor((len * 3) / 4);

  const buf = Buffer.allocUnsafe(size);
  const bytesWritten = buf.write(str, 'base64');

  // In case of invalid base64 or calculation error, ensure we return valid view
  if (bytesWritten < size) {
    return buf.subarray(0, bytesWritten);
  }

  return buf;
}
