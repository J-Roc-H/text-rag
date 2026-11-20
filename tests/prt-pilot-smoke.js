'use strict';
// 원작 맵 1:1 프론테라 시범 (설계: 볼트 설계_원작맵1대1_프론테라시범_v0.1).
// template.html의 실제 지도 함수와 installPilotMaps를 추출해, 실제 db-maps·db-prt-pilot·db-monsters로 설치한다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction, html } = require('./_item-effect-harness');

const D = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'source', 'data', n), 'utf8').replace(/^﻿/, ''));
const constBlock = (name) => { const s = html.indexOf(`const ${name} = Object.freeze({`); assert(s >= 0, name); return html.slice(s, html.indexOf('});', s) + 3); };

function install() {
  const ctx = { DB: { maps: D('db-maps.json'), prtPilot: D('db-prt-pilot.json'), monsters: D('db-monsters.json') } };
  vm.createContext(ctx);
  vm.runInContext([
    constBlock('MAP_LEGACY_ALIASES'), constBlock('PILOT_LEGACY_MAP'),
    extractFunction(html, 'function rebuildMapIndex(){'), extractFunction(html, 'function getMap(ref){'),
    extractFunction(html, 'function mapKey(ref){'), extractFunction(html, 'function mapConnections(ref){'),
    extractFunction(html, 'function pilotLevel(ids, weights){'), extractFunction(html, 'function installPilotMaps(){'),
    'rebuildMapIndex(); installPilotMaps(); rebuildMapIndex();',
    'this.api={getMap,mapKey,mapConnections,PILOT_LEGACY_MAP};',
  ].join('\n'), ctx);
  return ctx;
}
const ctx = install(), DB = ctx.DB, api = ctx.api;
const pilotIds = Object.keys(DB.prtPilot.maps);

// 19 maps installed as real maps with weights
assert.strictEqual(pilotIds.length, 19);
pilotIds.forEach((id) => {
  const m = api.getMap(id);
  assert(m && m.kind === 'map' && m.mapId === id, id);
  assert(m.displayName && m.level && m.spawnWeights, id);
  assert.strictEqual(JSON.stringify(Object.keys(m.spawnWeights).map(Number).sort()), JSON.stringify(m.monsters.slice().sort()), id);
});
// prt_fild08 = 포링 70 · 루나틱 40 · 푸파 20 · 드롭프스 10 (원작 마릿수 그대로)
const w08 = api.getMap('prt_fild08').spawnWeights;
assert.deepStrictEqual(Object.keys(w08).map((id) => [DB.monsters[id].name, w08[id]]).sort((a, b) => b[1] - a[1]),
  [['포링', 70], ['루나틱', 40], ['푸파', 20], ['드롭프스', 10]]);
assert.strictEqual(api.getMap('prt_sewb4').hasMvp, 399);           // 황금도둑벌레
assert.strictEqual(api.getMap('prt_maze03').hasMvp, 137);          // 바포메트

// old names gone from DB.maps but still resolve through aliases
Object.entries(api.PILOT_LEGACY_MAP).forEach(([old, id]) => {
  assert(!Object.prototype.hasOwnProperty.call(DB.maps, old), `옛 키 남음: ${old}`);
  assert.strictEqual(api.mapKey(old), id, old);
});
assert(api.getMap('prt_fild08').entryDesc, '남쪽 평원의 진입 묘사가 prt_fild08로 옮겨짐');
// no map anywhere still links to an old name
Object.entries(DB.maps).forEach(([k, m]) => (m.connected || []).forEach((c) => assert(!api.PILOT_LEGACY_MAP[c], `${k} -> ${c}`)));

// bridges_two_way: 시범 밖 이웃 <-> 시범 맵
const linked = (a, b) => api.mapConnections(a).includes(api.mapKey(b));
for (const [a, b] of [['프론테라', 'prt_fild08'], ['prt_fild08', '이즈루드'], ['prt_fild00', '게펜 필드'], ['prt_fild01', '묘르닐 산맥'], ['prt_fild08', '소그라트 사막 동부']]) {
  assert(linked(a, b) && linked(b, a), `${a} <-> ${b}`);
}
assert(linked('프론테라', 'prt_sewb1') && linked('prt_sewb1', '프론테라'), '지하수로 입구(토벌대)');
assert(!linked('프론테라', 'prt_fild01'), '원작에 없는 프론테라->prt_fild01 연결은 만들지 않음');

// every map stays reachable from 프론테라 (아무 지역도 끊기지 않음)
const seen = new Set([api.mapKey('프론테라')]), q = [...seen];
while (q.length) { const c = q.shift(); api.mapConnections(c).forEach((n) => { if (!seen.has(n)) { seen.add(n); q.push(n); } }); }
['페이욘 숲 북부', '게펜', '묘르닐 산맥', '이즈루드', 'prt_maze03', 'prt_sewb4', 'prt_fild11']
  .forEach((k) => assert(seen.has(api.mapKey(k)), `프론테라에서 못 감: ${k}`));

// ── Task 3: 가중치 뽑기 · 구역 끄기 ─────────────────────────────────────────────
{
  const c2 = { DB: { maps: { '시험': { monsters: [1, 2], safe: false }, 'w': { monsters: [1, 2, 4, 5], spawnWeights: { 1: 70, 2: 40, 4: 20, 5: 10 }, safe: false } }, monsters: D('db-monsters.json') },
    ZONE_COUNT: 3, _zoneCache: {}, Math: Object.create(Math) };
  vm.createContext(c2);
  vm.runInContext([extractFunction(html, 'function getMap(ref){').replace(/PILOT_LEGACY_MAP\[key\]|MAP_LEGACY_ALIASES\[key\]/g, 'undefined'),
    extractFunction(html, 'function getZones(mapName){'), extractFunction(html, 'function pickSpawnMonster(md, pool){'),
    'this.api={getZones,pickSpawnMonster};'].join('\n'), c2);
  assert.strictEqual(c2.api.getZones('w'), null, '가중치 맵은 레벨순 구역을 쓰지 않음');
  let seed = 7; c2.Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const n = 10000, cnt = {};
  for (let i = 0; i < n; i++) { const id = c2.api.pickSpawnMonster(c2.DB.maps.w, c2.DB.maps.w.monsters); cnt[id] = (cnt[id] || 0) + 1; }
  for (const [id, w] of Object.entries({ 1: 70, 2: 40, 4: 20, 5: 10 })) assert(Math.abs(cnt[id] / n - w / 140) < 0.02, `${id} ${cnt[id] / n}`);
  const plain = new Set(); for (let i = 0; i < 200; i++) plain.add(c2.api.pickSpawnMonster(c2.DB.maps['시험'], [1, 2]));
  assert.strictEqual(plain.size, 2, '가중치 없는 맵은 기존처럼 목록에서 고름');
  // 두 출현 지점이 모두 이 함수를 쓴다
  assert(extractFunction(html, 'function spawnMonsters(){').includes('pickSpawnMonster('), '일반 출현');
  assert((html.match(/pickSpawnMonster\(/g) || []).length >= 3, '공격적 추가 출현도');
}

// ── Task 4: 옛 지명 이관 ─────────────────────────────────────────────────────────
{
  const c3 = install();
  vm.runInContext([
    "var STAT_KEYS=['str','agi','vit','int','dex','luk']; function totalStatPointsAt(){ return 0; } var SAVE_SCHEMA_VERSION=2;",  // 스탯 이관부는 이 시험 밖
    constBlock('COMPRESSED_MAP_GROUPS'), extractFunction(html, 'function resolveLegacyMapRef(ref){'),
    extractFunction(html, 'function migrateSave(p){'), extractFunction(html, 'function giveQuestReward(q) {'),
    'this.mig={migrateSave,giveQuestReward};',
  ].join('\n'), c3);
  // legacy_keys_migrate: 옛 지명 세이브 -> 원작 맵 키, 두 번 돌려도 같다
  const old = { savedMap: '프론테라 남쪽 평원', unlockedMaps: { '프론테라 지하수로 1층': true, '게펜': true },
    visitedMaps: { '프론테라 북쪽 평원': true, '프론테라': true }, records: { mapTime: { '미궁 숲': 50, '프론테라 서쪽 평원': 7 } } };
  c3.mig.migrateSave(old);
  const once = JSON.stringify(old);
  c3.mig.migrateSave(old);
  assert.strictEqual(JSON.stringify(old), once, '멱등');
  assert.strictEqual(old.savedMap, 'prt_fild08');
  assert(old.unlockedMaps.prt_sewb1 && old.unlockedMaps['게펜'], JSON.stringify(old.unlockedMaps));
  assert(old.visitedMaps.prt_fild01 && old.visitedMaps['프론테라']);
  assert.strictEqual(old.records.mapTime.prt_maze01, 50);
  assert.strictEqual(old.records.mapTime.prt_fild05, 7);

  // sewer_lock: 토벌대 퀘스트 보상은 지하수로 1층을 원작 맵 키(prt_sewb1)로 연다
  c3.G = { player: { zeny: 0, inventory: {}, unlockedMaps: {} } };
  c3.log = () => {}; c3.notify = () => {}; c3.gainBaseExp = () => {};
  vm.runInContext('this.G=G;', c3);
  c3.mig.giveQuestReward({ reward: {}, unlock: '프론테라 지하수로 1층' });
  assert(c3.G.player.unlockedMaps.prt_sewb1, JSON.stringify(c3.G.player.unlockedMaps));
  const lock = html.slice(html.indexOf('const DUNGEON_LOCKS = {'), html.indexOf('const DUNGEON_LOCKS = {') + 400);
  assert(lock.includes('"prt_sewb1"'), '잠금 표도 원작 맵 키');
  // 시작 맵 기본값과 튜토리얼 대사
  assert(!/currentMap:"프론테라 남쪽 평원"|savedMap\|\|"프론테라 남쪽 평원"/.test(html), '기본 시작 맵이 옛 지명');
  assert(!html.includes('프론테라 남쪽 평원의 포링'), '튜토리얼 대사가 옛 지명');
}

console.log('prt-pilot-smoke: OK');
