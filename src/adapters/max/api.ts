import type { Button } from '../../runtime/types.js';
import { getMaxBotUsername } from './botInfo.js';
import type { MaxUpdate, MaxUpdatesResponse } from './types.js';

const DEFAULT_BASE_URL = 'https://platform-api.max.ru';

export class MaxApiClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string, baseUrl = process.env.MAX_API_BASE_URL ?? DEFAULT_BASE_URL) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.token,
      'Content-Type': 'application/json'
    };
  }

  async getMe(): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/me`, { headers: { Authorization: this.token } });
    if (!res.ok) throw new Error(`MAX /me HTTP ${res.status}`);
    return res.json();
  }

  async setCommands(commands: Array<{ name: string; description: string }>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/me`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ commands })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MAX PATCH /me HTTP ${res.status}: ${text}`);
    }
  }

  async getUpdates(args: {
    marker?: number | null;
    timeout?: number;
    types?: string[];
  }): Promise<{ updates: MaxUpdate[]; marker: number | null }> {
    const url = new URL(`${this.baseUrl}/updates`);
    url.searchParams.set('timeout', String(args.timeout ?? 30));
    url.searchParams.set('limit', '100');
    if (args.marker != null) url.searchParams.set('marker', String(args.marker));
    if (args.types?.length) url.searchParams.set('types', args.types.join(','));

    const res = await fetch(url, { headers: { Authorization: this.token } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MAX /updates HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as MaxUpdatesResponse;
    return {
      updates: data.updates ?? [],
      marker: data.marker ?? null
    };
  }

  async sendMessage(args: {
    userId?: number;
    chatId?: number;
    text: string;
    buttons?: Button[];
  }): Promise<void> {
    const url = new URL(`${this.baseUrl}/messages`);
    if (args.userId) {
      url.searchParams.set('user_id', String(args.userId));
    } else if (args.chatId) {
      url.searchParams.set('chat_id', String(args.chatId));
    } else {
      throw new Error('MAX: user_id or chat_id required');
    }

    const chunks = splitText(args.text, 4000);

    for (let i = 0; i < chunks.length; i++) {
      const body: Record<string, unknown> = { text: chunks[i] };

      if (i === chunks.length - 1 && args.buttons?.length) {
        body.attachments = [buildMaxKeyboard(args.buttons)];
      }

      await this.postMessage(url.toString(), body);
    }
  }

  async answerCallback(callbackId: string, notification = ''): Promise<void> {
    const res = await fetch(`${this.baseUrl}/answers`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ callback_id: callbackId, notification })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`MAX /answers HTTP ${res.status}: ${text}`);
    }
  }

  private async postMessage(url: string, body: Record<string, unknown>, retries = 3): Promise<void> {
    for (let attempt = 0; attempt < retries; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body)
      });

      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After') ?? 5);
        await sleep(wait * 1000);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`MAX /messages HTTP ${res.status}: ${text}`);
      }

      return;
    }
  }
}

function buildMaxKeyboard(buttons: Button[]): Record<string, unknown> {
  const rows: Array<Array<Record<string, string>>> = [];
  const callbacks: Button[] = [];

  for (const button of buttons) {
    if (button.kind === 'open_app') {
      const webApp = getMaxBotUsername();
      if (webApp) {
        rows.push([
          {
            type: 'open_app',
            text: truncate(button.title, 256),
            web_app: webApp,
            payload: button.id
          }
        ]);
      }
      continue;
    }

    if (button.kind === 'link' && button.url) {
      rows.push([
        {
          type: 'link',
          text: truncate(button.title, 256),
          url: button.url
        }
      ]);
      continue;
    }

    callbacks.push(button);
  }

  for (let i = 0; i < callbacks.length; i += 2) {
    const row = callbacks.slice(i, i + 2).map((button) => ({
      type: 'callback',
      text: truncate(button.title, 40),
      payload: JSON.stringify({ buttonId: button.id })
    }));
    rows.push(row);
  }

  return {
    type: 'inline_keyboard',
    payload: { buttons: rows }
  };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
