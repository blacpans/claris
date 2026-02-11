import { type StdioOptions, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fkill from 'fkill';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

export async function startServer(options: { detached?: boolean; stdio?: StdioOptions; port?: number } = {}) {
  const isDev = process.env.NODE_ENV !== 'production';
  let command: string;
  let args: string[];

  if (isDev) {
    command = 'npx';
    args = ['tsx', 'src/index.ts'];
  } else {
    command = 'node';
    args = [path.join(projectRoot, 'dist/index.js')];
  }

  const env = { ...process.env };
  if (options.port) {
    env.PORT = options.port.toString();
  }

  const subprocess = spawn(command, args, {
    cwd: projectRoot,
    detached: options.detached ?? true,
    stdio: options.stdio ?? 'ignore',
    env,
  });

  if (options.detached) {
    subprocess.unref();
  }

  return subprocess;
}

export async function stopServer(port?: number) {
  const targetPort = port || Number(process.env.PORT) || 8080;
  try {
    await fkill(`:${targetPort}`, { force: true });
    return true;
  } catch (_error) {
    // If process not found, fkill throws.
    // We can assume it's already stopped or not running.
    return false;
  }
}

export async function isServerRunning(url = 'http://localhost:8080'): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForServer(url = 'http://localhost:8080', retries = 20, interval = 1000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    if (await isServerRunning(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}
