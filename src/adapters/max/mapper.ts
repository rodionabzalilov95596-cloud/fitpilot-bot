import type { IncomingMessage } from '../../runtime/types.js';
import type { MaxUpdate } from './types.js';

export function mapMaxUpdateToIncoming(update: MaxUpdate): {
  incoming: IncomingMessage;
  chatId: number;
  callbackId?: string;
} | null {
  if (update.update_type === 'bot_started') {
    const userId = update.user?.user_id;
    if (!userId) return null;

    const chatId = update.chat_id ?? update.message?.recipient?.chat_id ?? 0;

    return {
      incoming: {
        userId: String(userId),
        text: null,
        buttonId: null,
        timestampMs: Date.now(),
        restart: true
      },
      chatId
    };
  }

  if (update.update_type === 'message_callback') {
    const cb = update.callback;
    // В MAX message и callback — siblings на верхнем уровне update, не callback.message
    const userId =
      cb?.user?.user_id ?? cb?.sender?.user_id ?? update.user?.user_id;
    const chatId =
      update.message?.recipient?.chat_id ?? update.chat_id;
    if (!userId) return null;

    return {
      incoming: {
        userId: String(userId),
        text: null,
        buttonId: parseButtonPayload(cb?.payload),
        timestampMs: Date.now()
      },
      chatId: chatId ?? 0,
      callbackId: cb?.callback_id
    };
  }

  if (update.update_type === 'message_created') {
    const msg = update.message;
    const userId = msg?.sender?.user_id;
    const chatId = msg?.recipient?.chat_id ?? update.chat_id ?? 0;
    if (!userId) return null;

    const text = msg.body?.text?.trim() || null;

    return {
      incoming: {
        userId: String(userId),
        text,
        buttonId: null,
        timestampMs: Date.now()
      },
      chatId
    };
  }

  return null;
}

function parseButtonPayload(payload: string | undefined): string | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as { buttonId?: string };
    if (typeof parsed.buttonId === 'string') return parsed.buttonId;
  } catch {
    // payload может быть plain string
  }

  return payload || null;
}
