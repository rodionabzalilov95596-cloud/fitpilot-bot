import type { LlmClient } from '../runtime/types.js';

type YandexCompletionResponse = {
  result?: {
    alternatives?: Array<{
      message?: { text?: string };
      text?: string;
    }>;
  };
};

export class YandexLlmClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly folderId: string;
  private readonly modelUri: string;

  constructor() {
    this.baseUrl = process.env.YANDEX_API_BASE_URL ?? 'https://llm.api.cloud.yandex.net';
    this.folderId = process.env.YANDEX_FOLDER_ID ?? '';
    this.modelUri = process.env.YANDEX_MODEL_URI ?? '';

    const apiKey = process.env.YANDEX_API_KEY?.trim();
    const iamToken = process.env.YANDEX_IAM_TOKEN?.trim();

    if (apiKey) {
      this.authHeader = `Api-Key ${apiKey}`;
    } else if (iamToken) {
      this.authHeader = `Bearer ${iamToken}`;
    } else {
      this.authHeader = '';
    }

    if (!this.authHeader || !this.folderId || !this.modelUri) {
      throw new Error(
        'Yandex LLM env is not configured. Set YANDEX_API_KEY (рекомендуется) или YANDEX_IAM_TOKEN, ' +
          'а также YANDEX_FOLDER_ID и YANDEX_MODEL_URI (see .env.example)'
      );
    }
  }

  async generateText(args: { system: string; user: string }): Promise<string> {
    // Примечание: Yandex периодически меняет поверхности API (Foundation Models / YandexGPT).
    // Мы делаем максимально “подстраиваемый” запрос: базовый URL и modelUri задаются env.
    const url = new URL('/foundationModels/v1/completion', this.baseUrl).toString();

    const body = {
      modelUri: this.modelUri,
      completionOptions: {
        stream: false,
        temperature: 0.4,
        maxTokens: 1200
      },
      messages: [
        { role: 'system', text: args.system },
        { role: 'user', text: args.user }
      ]
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'x-folder-id': this.folderId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Yandex LLM HTTP ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as YandexCompletionResponse;
    const alt = data.result?.alternatives?.[0];
    const out = alt?.message?.text ?? alt?.text ?? '';
    if (!out) throw new Error('Yandex LLM: empty response');
    return out;
  }
}

