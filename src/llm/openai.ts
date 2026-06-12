import type { LlmClient } from '../runtime/types.js';

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string };
};

export class OpenAiLlmClient implements LlmClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    if (!this.apiKey) {
      throw new Error('OpenAI env is not configured. Set OPENAI_API_KEY in .env (see .env.example)');
    }
  }

  async generateText(args: { system: string; user: string }): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user }
        ]
      })
    });

    const data = (await resp.json()) as ChatCompletionResponse;

    if (!resp.ok) {
      throw new Error(`OpenAI HTTP ${resp.status}: ${data.error?.message ?? 'unknown error'}`);
    }

    const out = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!out) throw new Error('OpenAI: empty response');
    return out;
  }
}
