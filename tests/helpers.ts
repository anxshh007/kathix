import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, type Runtime } from '@kathix/runtime';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function sample(file: string): string {
  return readFileSync(path.join(ROOT, 'seed', 'sample', file), 'utf8').replace(/\r\n/g, '\n');
}

export function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'kathix-test-'));
}

/** A full runtime on a fresh data folder with the deterministic test provider. */
export async function testRuntime(dataDir = tempDir()): Promise<Runtime & { dataDir: string }> {
  process.env.KATHIX_LOG = 'silent';
  const rt = await createRuntime({ dataDir, mock: true, quiet: true });
  await rt.refreshCapabilities();
  return Object.assign(rt, { dataDir });
}

/** Reads a server-sent-events response body into its events. */
export async function readSse(res: Response): Promise<{ event: string; data: unknown }[]> {
  const text = await res.text();
  return text
    .split(/\n\n/)
    .filter((b) => b.trim())
    .map((block) => {
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      return { event, data: data ? JSON.parse(data) : null };
    });
}

export async function json<T>(res: Response | Promise<Response>): Promise<T> {
  const r = await res;
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(`${r.status}: ${body.error ?? 'request failed'}`);
  return body;
}
