import { MessageFlags, SlashCommandBuilder, type ButtonInteraction,
  type ChatInputCommandInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { assignWeapons, defaultConditions, RouletteError, type Range, type Rule } from '../roulette/logic.js';
import { SESSION_TTL, sessionStore } from '../roulette/sessions.js';
import { renderSession, selections, type SelectionKey } from '../roulette/ui.js';

export const rouletteCommand = new SlashCommandBuilder()
  .setName('roulette').setDescription('VCメンバーのブキルーレット条件設定パネルを開きます。')
  .setDMPermission(false)
  .addStringOption(option => option.setName('category').setDescription('最初に設定するブキ種（パネルで変更できます）')
    .setRequired(false).addChoices({ name: 'すべて', value: 'all' },
      ...selections.categories.map(category => ({ name: category, value: category }))));

export async function executeRoulette(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: 'サーバー内で実行してください。', flags: MessageFlags.Ephemeral });
    return;
  }
  const voice = interaction.guild.voiceStates.cache.get(interaction.user.id)?.channel;
  if (!voice) {
    await interaction.reply({ content: 'VCに参加してから /roulette を実行してください。', flags: MessageFlags.Ephemeral });
    return;
  }
  const members = [...voice.members.values()].filter(member => !member.user.bot)
    .map(member => ({ id: member.id, name: member.displayName }));
  if (!members.length || members.length > 25) {
    await interaction.reply({ content: '対象はBotを除くVCメンバー1〜25人です。', flags: MessageFlags.Ephemeral });
    return;
  }
  const conditions = defaultConditions();
  const category = interaction.options.getString('category');
  if (category && category !== 'all') {
    if (!(selections.categories as readonly string[]).includes(category)) {
      await interaction.reply({ content: 'ブキ種を選び直してください。', flags: MessageFlags.Ephemeral });
      return;
    }
    conditions.categories = [category];
  }
  const session = sessionStore.create({ ownerId: interaction.user.id, guildId: interaction.guildId,
    channelId: interaction.channelId, voiceName: voice.name, members }, conditions);
  try {
    await interaction.reply(renderSession(session));
    session.messageId = (await interaction.fetchReply()).id;
  } catch (error) {
    sessionStore.delete(session.id);
    throw error;
  }
}

type PanelInteraction = ButtonInteraction | StringSelectMenuInteraction;
export async function handleRouletteComponent(interaction: PanelInteraction): Promise<void> {
  const [, id, revision, action] = interaction.customId.split(':');
  const session = id ? sessionStore.get(id) : undefined;
  const reject = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (!session) { await reject('パネルの有効期限が切れました。/roulette を実行し直してください。'); return; }
  if (interaction.user.id !== session.ownerId) { await reject('このパネルは実行した本人だけが操作できます。'); return; }
  if (interaction.guildId !== session.guildId || interaction.channelId !== session.channelId
    || interaction.message.id !== session.messageId) { await reject('このパネルは無効です。'); return; }
  if (session.busy || Number(revision) !== session.revision) { await reject('パネルを更新中、または古い操作です。最新のパネルから操作してください。'); return; }
  session.busy = true;
  const previous = { conditions: structuredClone(session.conditions), results: session.results, revision: session.revision };
  try {
    await interaction.deferUpdate();
    if (interaction.isStringSelectMenu() && action && Object.hasOwn(selections, action) && !session.results) {
      const key = action as SelectionKey;
      if (interaction.values.some(value => !(selections[key] as readonly string[]).includes(value))) {
        throw new RouletteError('無効な条件です。条件を選び直してください。');
      }
      if (key === 'rule') session.conditions.rule = (interaction.values[0] ?? 'なし') as Rule;
      else if (key === 'ranges') session.conditions.ranges = [...interaction.values] as Range[];
      else session.conditions[key] = [...interaction.values];
    } else if (interaction.isButton()) {
      if ((action === 'roll' && !session.results) || (action === 'reroll' && session.results)) {
        session.results = assignWeapons(session.members, session.conditions);
      } else if (action === 'edit') session.results = null;
      else if (action === 'reset') { session.conditions = defaultConditions(); session.results = null; }
      else throw new RouletteError('最新のパネルから操作してください。');
    } else throw new RouletteError('最新のパネルから操作してください。');
    session.revision++;
    await interaction.editReply(renderSession(session));
    session.expiresAt = Date.now() + SESSION_TTL;
  } catch (error) {
    Object.assign(session, previous);
    if (error instanceof RouletteError) {
      await interaction.followUp({ content: error.message, flags: MessageFlags.Ephemeral });
    } else throw error;
  } finally { session.busy = false; }
}
