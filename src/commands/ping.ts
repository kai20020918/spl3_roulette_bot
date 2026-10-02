import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

export const pingCommand = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Botが動作しているか確認します。');

export async function executePing(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply('Pong! Botは正常に動作しています。');
}
