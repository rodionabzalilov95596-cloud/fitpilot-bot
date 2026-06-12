import type { Button } from '../../runtime/types.js';
import type { VkLongPollServer } from './types.js';

const DEFAULT_API_VERSION = '5.199';

type VkApiError = { error_code: number; error_msg: string };
type VkApiEnvelope<T> = { response?: T; error?: VkApiError };

export class VkApiClient {
  private readonly token: string;
  private readonly apiVersion: string;

  constructor(token: string, apiVersion = process.env.VK_API_VERSION ?? DEFAULT_API_VERSION) {
    this.token = token;
    this.apiVersion = apiVersion;
  }

  async callMethod<T>(method: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const body = new URLSearchParams();
    body.set('access_token', this.token);
    body.set('v', this.apiVersion);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value));
    }

    const res = await fetch(`https://api.vk.com/method/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!res.ok) {
      throw new Error(`VK API HTTP ${res.status} for ${method}`);
    }

    const json = (await res.json()) as VkApiEnvelope<T>;
    if (json.error) {
      throw new Error(`VK API ${method}: [${json.error.error_code}] ${json.error.error_msg}`);
    }
    if (json.response === undefined) {
      throw new Error(`VK API ${method}: empty response`);
    }

    return json.response;
  }

  async resolveGroupId(explicitGroupId?: number): Promise<number> {
    if (explicitGroupId) return explicitGroupId;

    try {
      const byToken = await this.callMethod<Array<{ id: number }>>('groups.getById', {});
      if (byToken[0]?.id) return byToken[0].id;
    } catch {
      // token may need explicit group id
    }

    try {
      const admin = await this.callMethod<{ items: Array<{ id: number; name?: string }> }>('groups.get', {
        filter: 'admin',
        extended: 0,
        count: 10
      });
      if (admin.items?.length === 1) return admin.items[0].id;
      if (admin.items && admin.items.length > 1) {
        const list = admin.items.map((g) => `${g.id} (${g.name ?? 'без имени'})`).join(', ');
        throw new Error(
          `VK: у вас несколько сообществ (${list}). Укажите нужное в .env: VK_GROUP_ID=число`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('VK:')) throw err;
    }

    throw new Error(
      'VK: не найден ID сообщества. Создайте файл .env и добавьте строку VK_GROUP_ID=123456789 ' +
        '(число из адреса vk.com/club123456789). Токен должен быть ключом доступа сообщества, не личным.'
    );
  }

  async getLongPollServer(groupId: number): Promise<VkLongPollServer> {
    return this.callMethod<VkLongPollServer>('groups.getLongPollServer', { group_id: groupId });
  }

  async sendMessage(args: { peerId: number; text: string; buttons?: Button[] }): Promise<void> {
    const chunks = splitText(args.text, 4096);

    for (const chunk of chunks) {
      const params: Record<string, string | number | undefined> = {
        peer_id: args.peerId,
        random_id: randomId(),
        message: chunk
      };

      if (args.buttons?.length) {
        params.keyboard = buildVkKeyboard(args.buttons);
      }

      await this.callMethod<number>('messages.send', params);
    }
  }
}

export function buildVkKeyboard(buttons: Button[]): string {
  const rows: Array<Array<Record<string, unknown>>> = [];
  const callbacks: Button[] = [];

  for (const button of buttons) {
    if (button.kind === 'link' && button.url) {
      rows.push([
        {
          action: {
            type: 'open_link',
            label: truncate(button.title, 40),
            link: button.url
          }
        }
      ]);
      continue;
    }

    if (button.kind === 'open_app') continue;
    callbacks.push(button);
  }

  for (let i = 0; i < callbacks.length; i += 2) {
    const row = callbacks.slice(i, i + 2).map((button) => ({
      action: {
        type: 'text',
        label: truncate(button.title, 40),
        payload: JSON.stringify({ buttonId: button.id })
      },
      color: 'primary'
    }));
    rows.push(row);
  }

  return JSON.stringify({
    one_time: false,
    inline: false,
    buttons: rows
  });
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function randomId(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}
