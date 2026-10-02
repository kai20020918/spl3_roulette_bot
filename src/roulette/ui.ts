import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, escapeMarkdown,
  MessageFlags, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { weapons } from '../data/weapons.js';
import { feasibility, filterWeapons, ranges, rules } from './logic.js';
import type { Session } from './sessions.js';
export const selections = {
  categories: [...new Set(weapons.map(w => w.category))], ranges: [...ranges],
  subs: [...new Set(weapons.map(w => w.sub))], specials: [...new Set(weapons.map(w => w.special))], rule: [...rules],
};
export type SelectionKey = keyof typeof selections;
const labels: Record<SelectionKey, string> = {
  categories: 'ブキ種', ranges: '射程', subs: 'サブ', specials: 'スペシャル', rule: '特殊ルール',
};
const safe = (text: string) => escapeMarkdown(text.replace(/[\r\n]/g, ' ')).replace(/@/g, '＠');
function addText(container: ContainerBuilder, text: string): void {
  // Each Text Display is limited to 4,000 characters. Keep complete lines together.
  let chunk = '';
  for (const line of text.split('\n')) {
    if (chunk.length + line.length + 1 > 3500) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
}
export function componentId(session: Session, action: string): string {
  return `roulette:${session.id}:${session.revision}:${action}`;
}
export function conditionsText(session: Session): string {
  return (Object.keys(labels) as SelectionKey[]).map(key => {
    const value = session.conditions[key];
    return `${labels[key]}：${typeof value === 'string' ? value : value.join(' / ') || '指定なし'}`;
  }).join('\n');
}
export function renderSession(session: Session) {
  const container = new ContainerBuilder().setAccentColor(0x8b5cf6);
  const pool = filterWeapons(session.conditions);
  const problem = feasibility(pool, session.members.length, session.conditions.rule);
  const summary = `対象メンバー：${session.members.length}人（${safe(session.voiceName)}・実行時のメンバー）\n` +
    session.members.map(m => safe(m.name)).join(' / ');
  const body = session.results
    ? `## 🎰 抽選結果\n${summary}\n\n### 条件\n${conditionsText(session)}\n\n` +
      session.results.map(a => `${safe(a.member.name)} → **${a.weapon.name}**`).join('\n')
    : `## 🎰 ブキルーレット 条件設定\n${summary}\n\n### 現在の条件\n${conditionsText(session)}\n\n候補ブキ：${pool.length}種類`;
  addText(container, body);
  if (problem) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`⚠️ ${problem}`));
  if (!session.results) {
    for (const key of Object.keys(labels) as SelectionKey[]) {
      const values: readonly string[] = key === 'rule' ? [session.conditions.rule] : session.conditions[key];
      const choices: readonly string[] = selections[key];
      if (choices.length > 25) throw new Error('Select Menuの選択肢上限を超えています。');
      const menu = new StringSelectMenuBuilder().setCustomId(componentId(session, key)).setPlaceholder(labels[key])
        .setMinValues(key === 'rule' ? 1 : 0).setMaxValues(key === 'rule' ? 1 : choices.length)
        .addOptions(choices.map(value => ({ label: value, value, default: values.includes(value) })));
      container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
    }
  }
  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(componentId(session, session.results ? 'reroll' : 'roll'))
      .setLabel(session.results ? '同じ条件で再抽選' : '🎲 抽選する').setStyle(ButtonStyle.Primary).setDisabled(Boolean(problem)),
    new ButtonBuilder().setCustomId(componentId(session, session.results ? 'edit' : 'reset'))
      .setLabel(session.results ? '条件を変更' : '条件リセット').setStyle(ButtonStyle.Secondary),
  ));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '-# 操作できるのは実行者のみ。有効期限は操作から30分。Bot再起動後は /roulette を実行し直してください。'));
  return { components: [container], flags: MessageFlags.IsComponentsV2 as const, allowedMentions: { parse: [] as [] } };
}
