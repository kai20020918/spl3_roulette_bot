import { randomInt } from 'node:crypto';
import { weapons } from './data/weapons.js';

export type Weapon = (typeof weapons)[number];

export function rollWeapon(pool: readonly Weapon[] = weapons): Weapon {
  if (pool.length === 0) throw new Error('抽選対象のブキがありません。');
  return pool[randomInt(pool.length)]!;
}
