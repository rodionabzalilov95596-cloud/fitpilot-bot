import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UserState, UserStore } from '../runtime/types.js';
import { getInitialState } from '../scenarios/state.js';

export class JsonUserStore implements UserStore {
  constructor(private readonly dataDir: string) {}

  private pathFor(userId: string): string {
    // Простой файловый стор: для MVP достаточно. Для продакшна заменить на БД.
    const safe = userId.replaceAll(/[^\w.-]/g, '_');
    return join(this.dataDir, `user_${safe}.json`);
  }

  async get(userId: string): Promise<UserState | null> {
    const path = this.pathFor(userId);
    try {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as UserState;
    } catch {
      return null;
    }
  }

  async set(userId: string, state: UserState): Promise<void> {
    const path = this.pathFor(userId);
    const merged: UserState = {
      ...getInitialState(),
      ...state,
      profile: { ...getInitialState().profile, ...state.profile }
    };
    await writeFile(path, JSON.stringify(merged, null, 2), 'utf8');
  }
}

