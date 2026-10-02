import { DiscordAPIError, HTTPError, REST, Routes } from 'discord.js';
import { ConfigurationError, requiredDiscordId, requiredEnv } from './config.js';
import { pingCommand } from './commands/ping.js';
import { rouletteCommand } from './commands/roulette.js';

async function main(): Promise<void> {
  const token = requiredEnv('DISCORD_TOKEN');
  const clientId = requiredDiscordId('DISCORD_CLIENT_ID');
  const guildId = requiredDiscordId('DISCORD_GUILD_ID');
  const rest = new REST({ version: '10' }).setToken(token);

  // Upsert this command without deleting other commands in the server.
  for (const command of [pingCommand, rouletteCommand]) {
    await rest.post(Routes.applicationGuildCommands(clientId, guildId), {
      body: command.toJSON(),
    });
    console.log(`開発サーバーに/${command.name}を登録しました。`);
  }
}

void main().catch((error: unknown) => {
  console.error('コマンド登録に失敗しました。.envのToken、Application ID、サーバーIDと接続を確認してください。');
  if (error instanceof ConfigurationError) {
    console.error(error.message);
  } else if (error instanceof DiscordAPIError) {
    // Do not print the full error: it can contain request data.
    console.error(`Discord API: HTTP ${error.status}, code ${error.code}`);
  } else if (error instanceof HTTPError) {
    console.error(`Discord HTTP: ${error.status}`);
  } else {
    console.error('通信または処理に失敗しました。ネットワーク接続を確認してください。');
  }
  process.exitCode = 1;
});
