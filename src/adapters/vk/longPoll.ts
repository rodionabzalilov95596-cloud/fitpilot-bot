import { handleIncoming } from '../../runtime/handler.js';
import type { LlmClient, UserStore } from '../../runtime/types.js';
import { VkApiClient } from './api.js';
import { mapVkUpdateToIncoming } from './mapper.js';
import type { VkLongPollResponse, VkLongPollUpdate } from './types.js';

const WAIT_SECONDS = 25;

export async function startVkLongPoll(args: {
  token: string;
  store: UserStore;
  llm: LlmClient;
  groupId?: number;
}): Promise<void> {
  const api = new VkApiClient(args.token);
  const groupId = await api.resolveGroupId(args.groupId);

  // eslint-disable-next-line no-console
  console.log(`VK long poll: group_id=${groupId}`);

  let server = await api.getLongPollServer(groupId);
  const seenEvents = new Set<string>();
  let running = true;

  const shutdown = () => {
    running = false;
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  while (running) {
    try {
      const url = new URL(server.server);
      url.searchParams.set('act', 'a_check');
      url.searchParams.set('key', server.key);
      url.searchParams.set('ts', server.ts);
      url.searchParams.set('wait', String(WAIT_SECONDS));

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`VK long poll HTTP ${res.status}`);
      }

      const data = (await res.json()) as VkLongPollResponse;

      if (data.failed === 1 && data.ts) {
        server = { ...server, ts: data.ts };
        continue;
      }

      if (data.failed === 2 || data.failed === 3) {
        server = await api.getLongPollServer(groupId);
        continue;
      }

      if (data.ts) {
        server = { ...server, ts: data.ts };
      }

      for (const update of data.updates ?? []) {
        // eslint-disable-next-line no-console
        if (update.type) console.log(`VK event: ${update.type}`);
        await processUpdate({
          update,
          api,
          store: args.store,
          llm: args.llm,
          seenEvents
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('VK long poll error:', err instanceof Error ? err.message : err);
      await sleep(3000);
      try {
        server = await api.getLongPollServer(groupId);
      } catch (refreshErr) {
        // eslint-disable-next-line no-console
        console.error(
          'VK long poll: failed to refresh server:',
          refreshErr instanceof Error ? refreshErr.message : refreshErr
        );
        await sleep(5000);
      }
    }
  }
}

async function processUpdate(args: {
  update: VkLongPollUpdate;
  api: VkApiClient;
  store: UserStore;
  llm: LlmClient;
  seenEvents: Set<string>;
}): Promise<void> {
  const incoming = mapVkUpdateToIncoming(args.update);
  if (!incoming) return;

  const message = args.update.object?.message;
  const eventKey = message?.id
    ? `msg:${message.id}`
    : args.update.type === 'message_allow'
      ? `allow:${incoming.userId}`
      : `${args.update.type}:${incoming.userId}:${Date.now()}`;

  if (args.seenEvents.has(eventKey)) return;
  args.seenEvents.add(eventKey);
  if (args.seenEvents.size > 5000) {
    args.seenEvents.clear();
  }

  const peerId = message?.peer_id ?? Number(incoming.userId);

  try {
    const { outgoing, debug } = await handleIncoming({
      incoming,
      store: args.store,
      llm: args.llm
    });

    await args.api.sendMessage({
      peerId,
      text: outgoing.text,
      buttons: outgoing.buttons
    });

    // eslint-disable-next-line no-console
    console.log(`VK reply → user ${incoming.userId}, step=${debug.stepId}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`VK handler error for user ${incoming.userId}:`, err instanceof Error ? err.message : err);
    try {
      await args.api.sendMessage({
        peerId,
        text: 'Произошла ошибка. Попробуйте ещё раз через минуту.'
      });
    } catch {
      // ignore secondary failure
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
