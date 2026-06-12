import { existsSync, readFileSync } from 'node:fs';
import dotenv from 'dotenv';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  if (existsSync('.env')) {
    dotenv.config();
  }

  if (!process.env.VK_BOT_TOKEN && existsSync('.env.txt')) {
    const raw = readFileSync('.env.txt', 'utf8').trim();
    if (raw.startsWith('vk1.')) {
      process.env.VK_BOT_TOKEN = raw;
    } else if (!existsSync('.env')) {
      dotenv.config({ path: '.env.txt' });
    }
  }
}

export function getVkBotToken(): string | undefined {
  const token = process.env.VK_BOT_TOKEN?.trim();
  return token || undefined;
}

export function getMaxBotToken(): string | undefined {
  const token = process.env.MAX_BOT_TOKEN?.trim();
  return token || undefined;
}

/** Публичный HTTPS-адрес бота (Render задаёт RENDER_EXTERNAL_URL автоматически). */
export function getPublicUrl(): string | undefined {
  const url =
    process.env.PUBLIC_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    undefined;

  if (!url || !url.startsWith('https://')) return undefined;
  return url.replace(/\/$/, '');
}
