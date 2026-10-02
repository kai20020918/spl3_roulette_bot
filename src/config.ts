import 'dotenv/config';

export class ConfigurationError extends Error {}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigurationError(`${name}を.envに設定してください。`);
  }
  return value;
}

export function requiredDiscordId(name: string): string {
  const value = requiredEnv(name);
  if (!/^\d{17,20}$/.test(value)) {
    throw new ConfigurationError(`${name}にはDiscordのIDを設定してください。`);
  }
  return value;
}
