import assert from 'node:assert/strict';
import test from 'node:test';
import { weapons } from '../dist/data/weapons.js';
import { rollWeapon } from '../dist/roulette.js';
import { assignWeapons, defaultConditions, filterWeapons, rangeOf, feasibility } from '../dist/roulette/logic.js';
import { SessionStore, SESSION_TTL, sessionStore } from '../dist/roulette/sessions.js';
import { renderSession, selections, componentId } from '../dist/roulette/ui.js';
import { executeRoulette, handleRouletteComponent } from '../dist/commands/roulette.js';

const members = Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: `member${i}` }));
const input = { ownerId: 'owner', guildId: 'guild', channelId: 'channel', voiceName: 'VC', members };
const fixture = [
  { id: 'a', name: 'A', category: 'シューター', range: 10, sub: 'ボム', special: 'SP1' },
  { id: 'b', name: 'B', category: 'マニューバー', range: 18, sub: 'ボム', special: 'SP1' },
  { id: 'c', name: 'C', category: 'チャージャー', range: 25, sub: 'ボム', special: 'SP2' },
  { id: 'd', name: 'D', category: 'シューター', range: 18, sub: 'シールド', special: 'SP1' },
];

test('weapon data has unique IDs, complete fields and valid range data', () => {
  assert.equal(new Set(weapons.map(w => w.id)).size, weapons.length);
  for (const w of weapons) {
    for (const key of ['id', 'name', 'category', 'sub', 'special']) assert.ok(w[key].trim());
    assert.ok(Number.isFinite(w.range) && w.range >= 0);
    assert.ok(!w.id.includes('replica'));
  }
  assert.throws(() => rollWeapon([]));
  assert.equal(rollWeapon([weapons[0]]), weapons[0]);
});

test('filtering combines OR within fields and AND across all fields', () => {
  const c = { ...defaultConditions(), categories: ['シューター', 'マニューバー'],
    ranges: ['短射程', '中射程'], subs: ['ボム'], specials: ['SP1'] };
  assert.deepEqual(filterWeapons(c, fixture).map(w => w.id), ['a', 'b']);
  assert.equal(filterWeapons(defaultConditions(), fixture).length, 4);
  assert.deepEqual(filterWeapons({ ...c, specials: ['SP2'] }, fixture), []);
  assert.equal(rangeOf({ ...fixture[0], range: 14.9 }), '短射程');
  assert.equal(rangeOf({ ...fixture[0], range: 15 }), '中射程');
  assert.equal(rangeOf({ ...fixture[0], range: 22 }), '長射程');
});

test('all rules respect filters and terminate with correct assignments', () => {
  for (const rule of ['なし', '全員違うブキ', '全員違うブキ種', '全員同じブキ種']) {
    for (let n = 0; n < 30; n++) {
      const participants = rule === '全員違うブキ種' ? members.slice(0, 3) : members;
      const result = assignWeapons(participants, { ...defaultConditions(), rule }, fixture);
      assert.deepEqual(result.map(a => a.member.id), participants.map(m => m.id));
      assert.ok(result.every(a => fixture.includes(a.weapon)));
      if (rule === '全員違うブキ') assert.equal(new Set(result.map(a => a.weapon.id)).size, participants.length);
      if (rule === '全員違うブキ種') assert.equal(new Set(result.map(a => a.weapon.category)).size, participants.length);
      if (rule === '全員同じブキ種') assert.equal(new Set(result.map(a => a.weapon.category)).size, 1);
    }
  }
  const c = { ...defaultConditions(), categories: ['シューター'], rule: '全員同じブキ種' };
  assert.ok(assignWeapons(members, c, fixture).every(a => a.weapon.category === 'シューター'));
});

test('impossible rules and empty candidates fail before drawing', () => {
  assert.throws(() => assignWeapons(members, { ...defaultConditions(), rule: '全員違うブキ種' }, fixture), /候補は3種/);
  assert.throws(() => assignWeapons(members, { ...defaultConditions(), rule: '全員違うブキ' }, fixture.slice(0, 2)), /候補は2種類/);
  assert.throws(() => assignWeapons(members, { ...defaultConditions(), subs: ['unknown'] }, fixture), /条件に一致するブキがありません/);
  assert.throws(() => assignWeapons([], defaultConditions(), fixture), /対象メンバー/);
  const duplicate = [fixture[0], { ...fixture[0] }];
  assert.ok(feasibility(duplicate, 2, '全員違うブキ'));
  assert.equal(assignWeapons(members, { ...defaultConditions(), rule: '全員同じブキ種' }, fixture.slice(0, 1)).length, 4);
});

test('sessions isolate users, guilds, member snapshots and conditions; expire in memory', () => {
  const store = new SessionStore();
  const source = structuredClone(input);
  const c = defaultConditions();
  const a = store.create(source, c, 0);
  const b = store.create({ ...input, guildId: 'other', ownerId: 'other' }, c, 0);
  source.members[0].name = 'changed'; c.categories.push('changed');
  a.conditions.subs.push('ボム');
  assert.notEqual(a.id, b.id);
  assert.equal(a.members[0].name, 'member0');
  assert.deepEqual(b.conditions.subs, []);
  assert.deepEqual(a.conditions.categories, []);
  assert.ok(store.get(a.id, SESSION_TTL - 1));
  assert.equal(store.get(a.id, SESSION_TTL), undefined);
  store.cleanup(SESSION_TTL);
  assert.equal(store.get(b.id, SESSION_TTL), undefined);
});

test('V2 panel has five selectable menus and buttons, preserves defaults, and disables impossible draws', () => {
  const s = new SessionStore().create(input);
  s.conditions.categories = ['シューター'];
  const json = renderSession(s).components[0].toJSON();
  const rows = json.components.filter(c => c.type === 1);
  assert.equal(rows.length, 6);
  for (const row of rows.slice(0, 5)) assert.ok(row.components[0].options.length <= 25);
  assert.equal(rows[0].components[0].min_values, 0);
  assert.equal(rows[0].components[0].options.find(o => o.value === 'シューター').default, true);
  assert.deepEqual(rows[2].components[0].options.map(o => o.value), selections.subs);
  assert.deepEqual(rows[3].components[0].options.map(o => o.value), selections.specials);
  s.conditions.rule = '全員違うブキ種';
  const impossible = renderSession(s).components[0].toJSON();
  assert.ok(impossible.components.some(c => c.type === 10 && c.content.includes('候補は1種')));
  assert.equal(impossible.components.filter(c => c.type === 1).at(-1).components[0].disabled, true);
});

function component(s, action, userId = s.ownerId, values) {
  const i = {
    customId: componentId(s, action), user: { id: userId }, guildId: s.guildId,
    channelId: s.channelId, message: { id: s.messageId }, values,
    isStringSelectMenu: () => values !== undefined, isButton: () => values === undefined,
    reply: async p => { i.replyPayload = p; }, deferUpdate: async () => { i.deferred = true; },
    editReply: async p => { i.edited = p; }, followUp: async p => { i.followed = p; },
  };
  return i;
}

test('component lifecycle supports selection, reset, results, reroll and edit with frozen members', async () => {
  const s = sessionStore.create(input); s.messageId = 'message';
  await handleRouletteComponent(component(s, 'categories', s.ownerId, ['シューター', 'マニューバー']));
  assert.deepEqual(s.conditions.categories, ['シューター', 'マニューバー']);
  await handleRouletteComponent(component(s, 'rule', s.ownerId, ['全員違うブキ']));
  await handleRouletteComponent(component(s, 'roll'));
  assert.equal(s.results.length, 4);
  assert.equal(new Set(s.results.map(a => a.weapon.id)).size, 4);
  const old = s.results;
  await handleRouletteComponent(component(s, 'reroll'));
  assert.notEqual(s.results, old);
  assert.deepEqual(s.results.map(a => a.member.id), members.map(m => m.id));
  const rows = renderSession(s).components[0].toJSON().components.filter(c => c.type === 1);
  assert.deepEqual(rows[0].components.map(c => c.label), ['同じ条件で再抽選', '条件を変更']);
  await handleRouletteComponent(component(s, 'edit'));
  assert.equal(s.results, null); assert.equal(s.conditions.rule, '全員違うブキ');
  await handleRouletteComponent(component(s, 'reset'));
  assert.deepEqual(s.conditions, defaultConditions());
  sessionStore.delete(s.id);
});

test('other users, wrong messages, stale clicks and expired sessions are rejected', async () => {
  const s = sessionStore.create(input); s.messageId = 'message';
  const stranger = component(s, 'roll', 'stranger'); await handleRouletteComponent(stranger);
  assert.ok(stranger.replyPayload.content.includes('本人')); assert.equal(s.results, null);
  const wrong = component(s, 'roll'); wrong.message.id = 'wrong'; await handleRouletteComponent(wrong);
  assert.ok(wrong.replyPayload.content.includes('無効'));
  const stale = component(s, 'roll'); s.revision++; await handleRouletteComponent(stale);
  assert.ok(stale.replyPayload.content.includes('古い'));
  s.expiresAt = 0;
  const expired = component(s, 'roll'); await handleRouletteComponent(expired);
  assert.ok(expired.replyPayload.content.includes('有効期限'));
});

test('simultaneous operations cannot race; failed message edits roll back state', async () => {
  const s = sessionStore.create(input); s.messageId = 'message';
  const first = component(s, 'categories', s.ownerId, ['シューター']);
  let release;
  first.deferUpdate = () => new Promise(resolve => { release = resolve; });
  const pending = handleRouletteComponent(first);
  const second = component(s, 'roll'); await handleRouletteComponent(second);
  assert.ok(second.replyPayload.content.includes('更新中'));
  release(); await pending;
  const revision = s.revision;
  const fail = component(s, 'reset'); fail.editReply = async () => { throw new Error('offline'); };
  await assert.rejects(handleRouletteComponent(fail), /offline/);
  assert.deepEqual(s.conditions.categories, ['シューター']); assert.equal(s.revision, revision);
  assert.equal(s.busy, false);
  sessionStore.delete(s.id);
});

test('slash command rejects DMs and no-VC, excludes bots and creates a panel without drawing', async () => {
  let reply;
  const base = { reply: async p => { reply = p; }, inCachedGuild: () => false };
  await executeRoulette(base); assert.ok(reply.content.includes('サーバー'));
  const i = { ...base, inCachedGuild: () => true, user: { id: 'owner' }, guildId: 'guild', channelId: 'channel',
    guild: { voiceStates: { cache: new Map() } }, options: { getString: () => 'チャージャー' },
    fetchReply: async () => ({ id: 'message' }) };
  await executeRoulette(i); assert.ok(reply.content.includes('VCに参加'));
  const people = new Map([
    ['owner', { id: 'owner', displayName: 'Owner', user: { bot: false } }],
    ['bot', { id: 'bot', displayName: 'Bot', user: { bot: true } }],
  ]);
  i.guild.voiceStates.cache.set('owner', { channel: { name: 'VC', members: people } });
  await executeRoulette(i);
  const json = reply.components[0].toJSON();
  assert.ok(json.components[0].content.includes('対象メンバー：1人'));
  assert.ok(json.components[0].content.includes('ブキ種：チャージャー'));
  const id = json.components.find(c => c.type === 1).components[0].custom_id.split(':')[1];
  assert.equal(sessionStore.get(id).results, null);
  sessionStore.delete(id);
});

test('large member snapshots with markdown names fit Discord text component limits', () => {
  const large = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: '*'.repeat(32) }));
  const s = new SessionStore().create({ ...input, members: large });
  s.conditions.categories = [...selections.categories];
  s.conditions.subs = [...selections.subs];
  s.conditions.specials = [...selections.specials];
  s.conditions.ranges = [...selections.ranges];
  s.results = assignWeapons(s.members, s.conditions);
  const json = renderSession(s).components[0].toJSON();
  const texts = json.components.filter(c => c.type === 10);
  assert.ok(texts.every(c => c.content.length <= 4000));
  assert.ok(texts.reduce((n, c) => n + c.content.length, 0) <= 6000);
});
