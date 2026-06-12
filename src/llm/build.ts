import type { LlmClient } from '../runtime/types.js';
import { MockLlmClient } from './mock.js';
import { OpenAiLlmClient } from './openai.js';
import { YandexLlmClient } from './yandex.js';

export function buildLlmClient(): LlmClient {
  const provider = (process.env.LLM_PROVIDER ?? 'mock').toLowerCase();

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      // eslint-disable-next-line no-console
      console.warn('OPENAI_API_KEY не задан — используется mock. Добавьте ключ в .env');
      return new MockLlmClient();
    }
    return new OpenAiLlmClient();
  }

  if (provider === 'yandex') {
    const hasAuth = Boolean(process.env.YANDEX_API_KEY?.trim() || process.env.YANDEX_IAM_TOKEN?.trim());
    const hasFolder = Boolean(process.env.YANDEX_FOLDER_ID?.trim());
    if (!hasAuth || !hasFolder) {
      // eslint-disable-next-line no-console
      console.warn('Yandex LLM не настроен — используется mock. Заполните YANDEX_* в .env');
      return new MockLlmClient();
    }
    return new YandexLlmClient();
  }

  return new MockLlmClient();
}

export function getLlmProviderName(): string {
  return (process.env.LLM_PROVIDER ?? 'mock').toLowerCase();
}

