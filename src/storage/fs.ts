import { mkdir } from 'node:fs/promises';

export async function ensureDataDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

