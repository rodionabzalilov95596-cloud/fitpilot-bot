import type { IncomingMessage } from '../../runtime/types.js';
import type { VkLongPollUpdate, VkMessage } from './types.js';

export function mapVkUpdateToIncoming(update: VkLongPollUpdate): IncomingMessage | null {
  // Кнопка «Начать» в чате с сообществом → событие message_allow
  if (update.type === 'message_allow') {
    const userId = update.object?.user_id;
    if (!userId) return null;
    return {
      userId: String(userId),
      text: null,
      buttonId: null,
      timestampMs: Date.now(),
      restart: true
    };
  }

  if (update.type !== 'message_new') return null;

  const message = extractMessage(update);
  if (!message) return null;

  if (message.out === 1) return null;
  if (message.from_id <= 0) return null;

  const text = message.text?.trim() || null;
  const buttonId = parseButtonPayload(message.payload);

  // Пустое сообщение (иногда приходит вместе с «Начать») — всё равно отвечаем приветствием
  return {
    userId: String(message.from_id),
    text,
    buttonId,
    timestampMs: Date.now()
  };
}

function extractMessage(update: VkLongPollUpdate): VkMessage | null {
  const object = update.object;
  if (!object) return null;
  if (object.message) return object.message;

  const legacy = object as unknown as VkMessage;
  if (typeof legacy.id === 'number' && typeof legacy.from_id === 'number') {
    return legacy;
  }

  return null;
}

function parseButtonPayload(payload: string | undefined): string | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as { buttonId?: string };
    return typeof parsed.buttonId === 'string' ? parsed.buttonId : null;
  } catch {
    return null;
  }
}
