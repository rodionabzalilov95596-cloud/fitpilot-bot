import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, getVkBotToken, getMaxBotToken, getPublicUrl } from './config/env.js';
import express from 'express';
import { registerMiniappScheduleRoutes } from './routes/miniappSchedule.js';
import { getMiniappUrl } from './scenarios/workSchedule.js';
import { z } from 'zod';
import { ensureDataDir } from './storage/fs.js';
import { JsonUserStore } from './storage/userStore.js';
import { buildLlmClient, getLlmProviderName } from './llm/build.js';
import { handleIncoming } from './runtime/handler.js';
import { startVkLongPoll } from './adapters/vk/longPoll.js';
import { startMaxLongPoll } from './adapters/max/longPoll.js';
import { mapMaxUpdateToIncoming } from './adapters/max/mapper.js';
import { MaxApiClient } from './adapters/max/api.js';
import type { MaxUpdate } from './adapters/max/types.js';

loadEnv();

await ensureDataDir(process.env.DATA_DIR ?? './data');

const app = express();
app.use(express.json({ limit: '1mb' }));

const store = new JsonUserStore(process.env.DATA_DIR ?? './data');

const rootDir = path.dirname(fileURLToPath(import.meta.url));
app.use('/miniapp/schedule', express.static(path.join(rootDir, '../miniapp/schedule')));
registerMiniappScheduleRoutes(app, store);

const llm = buildLlmClient();
// eslint-disable-next-line no-console
console.log(`LLM provider: ${getLlmProviderName()}`);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Локальный эмулятор входящих сообщений
const SimulateSchema = z.object({
  userId: z.string().min(1),
  text: z.string().optional(),
  buttonId: z.string().optional()
});

app.post('/simulate', async (req, res) => {
  const parsed = SimulateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const reply = await handleIncoming({
    incoming: {
      userId: parsed.data.userId,
      text: parsed.data.text ?? null,
      buttonId: parsed.data.buttonId ?? null,
      timestampMs: Date.now()
    },
    store,
    llm
  });

  return res.json(reply);
});

app.post('/webhook/max', async (req, res) => {
  const maxToken = getMaxBotToken();
  if (!maxToken) return res.status(503).json({ error: 'MAX_BOT_TOKEN not set' });

  const secret = process.env.MAX_WEBHOOK_SECRET;
  if (secret) {
    const received = req.headers['x-max-bot-api-secret'];
    if (received !== secret) return res.status(403).json({ error: 'forbidden' });
  }

  const update = req.body as MaxUpdate;
  const api = new MaxApiClient(maxToken);
  const mapped = mapMaxUpdateToIncoming(update);

  if (mapped) {
    try {
      if (mapped.callbackId) await api.answerCallback(mapped.callbackId).catch(() => undefined);

      const { outgoing } = await handleIncoming({
        incoming: mapped.incoming,
        store,
        llm
      });

      await api.sendMessage({
        userId: Number(mapped.incoming.userId),
        chatId: mapped.chatId,
        text: outgoing.text,
        buttons: outgoing.buttons
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('MAX webhook error:', err instanceof Error ? err.message : err);
    }
  }

  return res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`FitPilot listening on http://localhost:${port}`);

  const publicUrl = getPublicUrl();
  const miniappUrl = getMiniappUrl();
  if (publicUrl) {
    // eslint-disable-next-line no-console
    console.log(`Public URL: ${publicUrl}`);
  }
  if (miniappUrl) {
    // eslint-disable-next-line no-console
    console.log(`Miniapp URL (укажите в MAX): ${miniappUrl}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('Miniapp: задайте PUBLIC_URL (на Render подставляется RENDER_EXTERNAL_URL)');
  }

  const vkToken = getVkBotToken();
  if (vkToken) {
    const groupId = process.env.VK_GROUP_ID ? Number(process.env.VK_GROUP_ID) : undefined;
    startVkLongPoll({ token: vkToken, store, llm, groupId }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('VK long poll stopped:', err instanceof Error ? err.message : err);
    });
    // eslint-disable-next-line no-console
    console.log('VK long poll started (desktop testing mode)');
  } else {
    // eslint-disable-next-line no-console
    console.log('VK_BOT_TOKEN not set');
  }

  const maxToken = getMaxBotToken();
  if (maxToken) {
    startMaxLongPoll({ token: maxToken, store, llm }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('MAX long poll stopped:', err instanceof Error ? err.message : err);
    });
    // eslint-disable-next-line no-console
    console.log('MAX long poll started (desktop testing mode)');
  } else {
    // eslint-disable-next-line no-console
    console.log('MAX_BOT_TOKEN not set');
  }
});
