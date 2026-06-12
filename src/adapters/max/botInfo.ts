let botUsername: string | null = null;

export function setMaxBotUsername(username: string): void {
  botUsername = username.replace(/^@/, '').trim() || null;
}

export function getMaxBotUsername(): string {
  return botUsername ?? process.env.MAX_BOT_USERNAME?.trim() ?? '';
}
