import { createHmac, timingSafeEqual } from 'node:crypto';

function buildLaunchParams(initData: string): { launchParams: string; hash: string } | null {
  const pairs = initData.split('&').map((part) => {
    const eq = part.indexOf('=');
    if (eq < 0) return null;
    return [part.slice(0, eq), part.slice(eq + 1)] as const;
  });

  if (pairs.some((p) => p === null)) return null;

  const hashEntries = pairs.filter((p) => p![0] === 'hash');
  if (hashEntries.length !== 1) return null;

  const hash = decodeURIComponent(hashEntries[0]![1]);
  const entries = pairs
    .filter((p): p is readonly [string, string] => p !== null && p[0] !== 'hash')
    .map(([key, value]) => [key, decodeURIComponent(value)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const launchParams = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  return { launchParams, hash };
}

function signLaunchParams(launchParams: string, botToken: string): string {
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secretKey).update(launchParams).digest('hex');
}

export type ValidatedInitData = {
  userId: string;
  authDate: number;
};

export function validateMaxInitData(initData: string, botToken: string): ValidatedInitData | null {
  if (!initData.trim()) return null;

  const parsed = buildLaunchParams(initData);
  if (!parsed) return null;

  const calculated = signLaunchParams(parsed.launchParams, botToken);
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(parsed.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const params = new URLSearchParams(initData);
  const authRaw = params.get('auth_date');
  const authDate = authRaw ? Number(authRaw) : 0;
  if (!authDate) return null;

  const maxAgeSec = Number(process.env.MINIAPP_INIT_MAX_AGE_SEC ?? 86400);
  if (Date.now() / 1000 - authDate > maxAgeSec) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as { id?: number };
    if (!user.id) return null;
    return { userId: String(user.id), authDate };
  } catch {
    return null;
  }
}
