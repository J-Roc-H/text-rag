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

console.log('prt-pilot-smoke: OK');
