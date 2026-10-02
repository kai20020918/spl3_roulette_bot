import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { requiredEnv } from './config.js';
import { executePing } from './commands/ping.js';
import { executeRoulette, handleRouletteComponent } from './commands/roulette.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

client.once(Events.ClientReady, readyClient => {
  console.log(`${readyClient.user.tag}としてログインしました。`);
});

client.on(Events.Error, () => {
  console.error('Discord接続でエラーが発生しました。');
});

client.on(Events.InteractionCreate, async interaction => {
  const panel = (interaction.isButton() || interaction.isStringSelectMenu())
    && interaction.customId.startsWith('roulette:');
  if (!interaction.isChatInputCommand() && !panel) return;

  try {
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && panel) {
      await handleRouletteComponent(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'ping') {
      await executePing(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'roulette') {
      await executeRoulette(interaction);
    } else {
      await interaction.reply({ content: '未対応のコマンドです。', flags: MessageFlags.Ephemeral });
    }
  } catch {
    console.error('コマンドの実行に失敗しました。');
    const message = { content: 'エラーが発生しました。もう一度お試しください。', flags: MessageFlags.Ephemeral } as const;
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(message);
      } else {
        await interaction.reply(message);
      }
    } catch {
      console.error('エラー応答の送信に失敗しました。');
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    client.destroy();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  await client.login(requiredEnv('DISCORD_TOKEN'));
}

void main().catch(() => {
  console.error('Botの起動に失敗しました。.envのDISCORD_TOKENと接続を確認してください。');
  client.destroy();
  process.exitCode = 1;
});
