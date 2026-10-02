import { mkdir, writeFile } from 'node:fs/promises';

const source = 'https://stat.ink/api/v3/weapon';
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Weapon API: HTTP ${response.status}`);
const data = await response.json();
if (!Array.isArray(data) || data.length === 0) throw new Error('Empty weapon data');

// Cosmetic replicas share a kit; exclude them so that those kits are not weighted more heavily.
const weapons = data.filter(w => w.key === w.reskin_of).map(w => ({
  id: w.key,
  name: w.name?.ja_JP,
  category: w.type?.name?.ja_JP,
  range: w.matching_range,
  sub: w.sub?.name?.ja_JP,
  special: w.special?.name?.ja_JP,
}));
if (weapons.length === 0 || weapons.some(w =>
  ['id', 'name', 'category', 'sub', 'special'].some(key => typeof w[key] !== 'string' || !w[key]) ||
  typeof w.range !== 'number' || !Number.isFinite(w.range) || w.range < 0)) {
  throw new Error('Invalid weapon data');
}
if (new Set(weapons.map(w => w.id)).size !== weapons.length) throw new Error('Duplicate weapon IDs');

const directory = new URL('../src/data/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('weapons.ts', directory),
  `// Source: ${source}\n// Retrieved: ${new Date().toISOString().slice(0, 10)}. Cosmetic replicas excluded.\n` +
  `export const weapons = ${JSON.stringify(weapons, null, 2)} as const;\n`, 'utf8');
console.log(`Saved ${weapons.length} weapon kits.`);
