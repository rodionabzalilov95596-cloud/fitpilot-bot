import type { Express, Request, Response } from 'express';
import { getMaxBotToken } from '../config/env.js';
import { validateMaxInitData } from '../miniapp/validateInitData.js';
import { ensureWorkWeek, formatWorkScheduleNotes, isWorkWeekSchedule } from '../scenarios/workSchedule.js';
import { getInitialState } from '../scenarios/state.js';
import type { UserStore, WorkWeekSchedule } from '../runtime/types.js';

function readInitData(req: Request): string | null {
  const header = req.headers['x-max-init-data'];
  if (typeof header === 'string' && header.trim()) return header.trim();

  const body = req.body as { initData?: string } | undefined;
  if (typeof body?.initData === 'string' && body.initData.trim()) return body.initData.trim();

  const query = req.query.initData;
  if (typeof query === 'string' && query.trim()) return query.trim();

  return null;
}

function authUser(req: Request, res: Response): { userId: string } | null {
  const botToken = getMaxBotToken();
  if (!botToken) {
    res.status(503).json({ error: 'bot_not_configured' });
    return null;
  }

  const initData = readInitData(req);
  if (!initData) {
    res.status(401).json({ error: 'missing_init_data' });
    return null;
  }

  const validated = validateMaxInitData(initData, botToken);
  if (!validated) {
    res.status(403).json({ error: 'invalid_init_data' });
    return null;
  }

  return { userId: validated.userId };
}

export function registerMiniappScheduleRoutes(app: Express, store: UserStore): void {
  app.get('/api/miniapp/schedule', async (req, res) => {
    const auth = authUser(req, res);
    if (!auth) return;

    const state = await store.get(auth.userId);
    const schedule = state ? ensureWorkWeek(state.profile) : ensureWorkWeek(getInitialState().profile);

    return res.json({ schedule });
  });

  app.post('/api/miniapp/schedule', async (req, res) => {
    const auth = authUser(req, res);
    if (!auth) return;

    if (!isWorkWeekSchedule(req.body?.schedule)) {
      return res.status(400).json({ error: 'invalid_schedule' });
    }

    const schedule = req.body.schedule as WorkWeekSchedule;
    const prev = (await store.get(auth.userId)) ?? getInitialState();

    await store.set(auth.userId, {
      ...prev,
      profile: {
        ...prev.profile,
        updatedAtMs: Date.now(),
        workWeekSchedule: schedule,
        workScheduleNotes: formatWorkScheduleNotes(schedule)
      }
    });

    return res.json({ ok: true });
  });
}
