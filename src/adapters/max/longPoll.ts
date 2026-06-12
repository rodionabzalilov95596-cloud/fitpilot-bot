import { handleIncoming } from '../../runtime/handler.js';
import type { LlmClient, UserStore } from '../../runtime/types.js';
import { MaxApiClient } from './api.js';
import { setMaxBotUsername } from './botInfo.js';
import { mapMaxUpdateToIncoming } from './mapper.js';

const UPDATE_TYPES = ['message_created', 'message_callback', 'bot_started'];

export async function startMaxLongPoll(args: {
  token: string;
  store: UserStore;
  llm: LlmClient;
}): Promise<void> {
  const api = new MaxApiClient(args.token);
  await verifyMaxToken(api);

  let marker: number | null = null;
  const seenEvents = new Set<string>();
  let running = true;

  const shutdown = () => {
    running = false;
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  while (running) {
    try {
      const { updates, marker: nextMarker } = await api.getUpdates({
        marker,
        timeout: 30,
        types: UPDATE_TYPES
      });

      if (nextMarker != null) marker = nextMarker;

      for (const update of updates) {
        // eslint-disable-next-line no-console
        console.log(`MAX event: ${update.update_type}`);
        await processUpdate({ update, api, store: args.store, llm: args.llm, seenEvents });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('MAX long poll error:', err instanceof Error ? err.message : err);
      await sleep(3000);
    }
  }
}

async function processUpdate(args: {
  update: import('./types.js').MaxUpdate;
  api: MaxApiClient;
  store: UserStore;
  llm: LlmClient;
  seenEvents: Set<string>;
}): Promise<void> {
  const mapped = mapMaxUpdateToIncoming(args.update);
  if (!mapped) {
    // eslint-disable-next-line no-console
    console.log(`MAX skip: unmapped ${args.update.update_type}`, JSON.stringify(args.update).slice(0, 300));
    return;
  }

  const eventKey = buildEventKey(args.update, mapped.incoming.userId);
  if (args.seenEvents.has(eventKey)) return;
  args.seenEvents.add(eventKey);
  if (args.seenEvents.size > 5000) args.seenEvents.clear();

  if (mapped.callbackId) {
    await args.api.answerCallback(mapped.callbackId).catch(() => undefined);
  }

  try {
    const { outgoing, debug } = await handleIncoming({
      incoming: mapped.incoming,
      store: args.store,
      llm: args.llm
    });

    await args.api.sendMessage({
      userId: Number(mapped.incoming.userId),
      chatId: mapped.chatId,
      text: outgoing.text,
      buttons: outgoing.buttons
    });

    // eslint-disable-next-line no-console
    console.log(`MAX reply → user ${mapped.incoming.userId}, step=${debug.stepId}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`MAX handler error for user ${mapped.incoming.userId}:`, err instanceof Error ? err.message : err);
    try {
      await args.api.sendMessage({
        userId: Number(mapped.incoming.userId),
        chatId: mapped.chatId,
        text: 'Произошла ошибка. Попробуйте ещё раз через минуту.'
      });
    } catch {
      // ignore
    }
  }
}

function buildEventKey(update: import('./types.js').MaxUpdate, userId: string): string {
  const mid = update.message?.body?.mid;
  const callbackId = update.callback?.callback_id;
  const ts = update.timestamp ?? Date.now();
  // bot_started без уникального id — не дедуплицируем, чтобы повторный «Старт» всегда срабатывал
  if (update.update_type === 'bot_started') {
    return `bot_started:${userId}:${ts}:${Math.random()}`;
  }
  return `${update.update_type}:${userId}:${mid ?? callbackId ?? ts}`;
}

async function verifyMaxToken(api: MaxApiClient): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const me = (await api.getMe()) as { username?: string };
      if (me.username) setMaxBotUsername(me.username);
      // eslint-disable-next-line no-console
      console.log(`MAX bot: token OK${me.username ? ` (@${me.username})` : ''}`);
      await registerBotCommands(api);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(`MAX /me attempt ${attempt}/5 failed: ${msg}`);
      if (attempt < 5) await sleep(2000 * attempt);
    }
  }
  // eslint-disable-next-line no-console
  console.warn('MAX /me недоступен — long poll запускается без проверки токена');
}

async function registerBotCommands(api: MaxApiClient): Promise<void> {
  try {
    await api.setCommands([
      { name: 'start', description: 'Начать сначала' },
      { name: 'grafik', description: 'График работы' }
    ]);
    // eslint-disable-next-line no-console
    console.log('MAX bot: commands registered');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('MAX bot: failed to register commands:', err instanceof Error ? err.message : err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
