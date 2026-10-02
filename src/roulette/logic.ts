import { randomInt } from 'node:crypto';
import { weapons } from '../data/weapons.js';

export interface Weapon {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly range: number;
  readonly sub: string;
  readonly special: string;
}
export const ranges = ['短射程', '中射程', '長射程'] as const;
export type Range = (typeof ranges)[number];
export const rules = ['なし', '全員違うブキ', '全員違うブキ種', '全員同じブキ種'] as const;
export type Rule = (typeof rules)[number];
export interface Conditions {
  categories: string[];
  ranges: Range[];
  subs: string[];
  specials: string[];
  rule: Rule;
}
export interface Participant { id: string; name: string }
export interface Assignment { member: Participant; weapon: Weapon }
export class RouletteError extends Error {}
export function defaultConditions(): Conditions {
  return { categories: [], ranges: [], subs: [], specials: [], rule: 'なし' };
}
// Bot-defined grouping of stat.ink matching_range; not official game categories.
export function rangeOf(weapon: Weapon): Range {
  return weapon.range < 15 ? '短射程' : weapon.range < 22 ? '中射程' : '長射程';
}
export function filterWeapons(conditions: Conditions, data: readonly Weapon[] = weapons): Weapon[] {
  const matches = (values: readonly string[], value: string) => !values.length || values.includes(value);
  return data.filter(w => matches(conditions.categories, w.category)
    && matches(conditions.ranges, rangeOf(w)) && matches(conditions.subs, w.sub)
    && matches(conditions.specials, w.special));
}
export function feasibility(pool: readonly Weapon[], count: number, rule: Rule): string | null {
  if (!Number.isInteger(count) || count < 1) return '対象メンバーがいません。';
  if (!pool.length) return '条件に一致するブキがありません。条件を変更してください';
  if (rule === '全員違うブキ' && new Set(pool.map(w => w.id)).size < count) {
    return `全員違うブキにするには${count}種類必要ですが、候補は${new Set(pool.map(w => w.id)).size}種類です。`;
  }
  if (rule === '全員違うブキ種' && new Set(pool.map(w => w.category)).size < count) {
    return `全員違うブキ種にするには${count}種必要ですが、候補は${new Set(pool.map(w => w.category)).size}種です。`;
  }
  return null;
}
function pick<T>(pool: readonly T[]): T { return pool[randomInt(pool.length)]!; }
function sample<T>(pool: readonly T[], count: number): T[] {
  const remaining = [...pool];
  const result: T[] = [];
  for (let i = 0; i < count; i++) result.push(remaining.splice(randomInt(remaining.length), 1)[0]!);
  return result;
}
export function assignWeapons(members: readonly Participant[], conditions: Conditions,
  data: readonly Weapon[] = weapons): Assignment[] {
  const pool = filterWeapons(conditions, data);
  const error = feasibility(pool, members.length, conditions.rule);
  if (error) throw new RouletteError(error);
  const groups = new Map<string, Weapon[]>();
  for (const weapon of pool) {
    const group = groups.get(weapon.category) ?? [];
    group.push(weapon); groups.set(weapon.category, group);
  }
  let selected: Weapon[];
  switch (conditions.rule) {
    case '全員違うブキ':
      selected = sample([...new Map(pool.map(w => [w.id, w])).values()], members.length); break;
    case '全員違うブキ種':
      selected = sample([...groups.keys()], members.length).map(category => pick(groups.get(category)!)); break;
    case '全員同じブキ種': {
      const group = pick([...groups.values()]); selected = members.map(() => pick(group)); break;
    }
    default: selected = members.map(() => pick(pool));
  }
  return members.map((member, index) => ({ member, weapon: selected[index]! }));
}
