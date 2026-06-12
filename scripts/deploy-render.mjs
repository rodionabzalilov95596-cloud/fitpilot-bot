import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dns.setDefaultResultOrder('ipv4first');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const apiKey = process.env.RENDER_API_KEY?.trim();
const ownerId = process.env.RENDER_OWNER_ID?.trim();
const repo = 'https://github.com/rodionabzalilov95596-cloud/fitpilot-bot';

if (!apiKey) {
  console.error('Нужен RENDER_API_KEY в .env');
  console.error('Получить: https://dashboard.render.com/u/settings#api-keys');
  process.exit(1);
}

async function api(pathname, options = {}) {
  let res;
  try {
    res = await fetch(`https://api.render.com${pathname}`, {
      ...options,
      signal: AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers ?? {})
      }
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Сеть недоступна для ${pathname}: ${cause}`);
  }
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${pathname} HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

function unwrapList(data) {
  if (Array.isArray(data)) return data;
  return data?.items ?? data?.data ?? [];
}

function envFromDotenv() {
  const keys = [
    'MAX_BOT_TOKEN',
    'LLM_PROVIDER',
    'YANDEX_API_KEY',
    'YANDEX_FOLDER_ID',
    'YANDEX_MODEL_URI',
    'VK_BOT_TOKEN',
    'VK_GROUP_ID',
    'DATA_DIR',
    'NODE_ENV'
  ];
  const vars = [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'DATA_DIR', value: './data' },
    { key: 'LLM_PROVIDER', value: 'yandex' }
  ];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    if (vars.some((v) => v.key === key)) {
      const item = vars.find((v) => v.key === key);
      if (item) item.value = value;
      continue;
    }
    vars.push({ key, value });
  }
  return vars.map((v) => ({ key: v.key, value: v.value }));
}

async function resolveOwnerId() {
  if (ownerId) return ownerId;
  const owners = await api('/v1/owners?limit=20');
  const list = unwrapList(owners);
  if (!list.length) throw new Error('Не найден workspace Render. Задайте RENDER_OWNER_ID в .env');
  const first = list[0].owner ?? list[0];
  const id = first.id;
  console.log('Workspace:', first.name ?? first.email ?? id);
  return id;
}

async function findExistingService() {
  const services = await api('/v1/services?limit=100');
  const list = unwrapList(services);
  return list.find((item) => {
    const svc = item.service ?? item;
    return svc.name === 'fitpilot-bot' || svc.repo?.includes('fitpilot-bot');
  });
}

async function main() {
  const resolvedOwnerId = await resolveOwnerId();
  const existing = await findExistingService();

  if (existing) {
    const svc = existing.service ?? existing;
    console.log('Сервис уже есть:', svc.name);
    console.log('URL:', svc.serviceDetails?.url ?? `https://${svc.slug ?? svc.name}.onrender.com`);
    console.log('Miniapp:', `https://${svc.slug ?? 'fitpilot-bot'}.onrender.com/miniapp/schedule/`);
    return;
  }

  const payload = {
    type: 'web_service',
    name: 'fitpilot-bot',
    ownerId: resolvedOwnerId,
    repo,
    branch: 'main',
    autoDeploy: 'yes',
    envVars: envFromDotenv(),
    serviceDetails: {
      env: 'node',
      plan: 'free',
      region: 'oregon',
      buildCommand: 'npm install --include=dev && npm run build',
      startCommand: 'npm start',
      healthCheckPath: '/health',
      pullRequestPreviewsEnabled: 'no'
    }
  };

  console.log('Создаю Web Service на Render...');
  const created = await api('/v1/services', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const svc = created.service ?? created;
  const slug = svc.slug ?? 'fitpilot-bot';
  console.log('\nГотово!');
  console.log('Сервис:', svc.name ?? 'fitpilot-bot');
  console.log('URL:', `https://${slug}.onrender.com`);
  console.log('Miniapp для MAX:', `https://${slug}.onrender.com/miniapp/schedule/`);
  console.log('\nДеплой запущен. Первый билд может занять 3–5 минут.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
