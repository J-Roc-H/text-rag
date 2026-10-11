#!/usr/bin/env node
/*
 * 지도·몬스터 원작 복원 P5 회귀 게이트
 *
 * 범위: P1 mapId 해석, P2 압축 지도 그룹/실맵 구조, P3 확정 출현군, P4 기존 세이브 이관, P6 확정 연결.
 * 브라우저 API 없이 template.html의 실제 함수를 평가한다. 따라서 별도 구현을
 * 복제하지 않고, 다음 P3 스폰 반영 뒤에도 같은 경로를 검사한다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const source = read('source', 'template.html');
const baseMaps = JSON.parse(read('source', 'data', 'db-maps.json'));
const mapGroups = JSON.parse(read('source', 'data', 'db-map-groups.json'));
const mapSpawns = JSON.parse(read('source', 'data', 'db-map-spawns.json'));
const mapConnections = JSON.parse(read('source', 'data', 'db-map-connections.json'));
const restorationLedger = JSON.parse(read('source', 'data', 'db-map-restoration-ledger.json'));
const monsters = JSON.parse(read('source', 'data', 'db-monsters.json'));

assert(source.includes('출현군 확인') && source.includes('한국 Pre-RE 출현군 근거 보류'), 'group UI distinguishes verified and pending rosters');

function section(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert(start >= 0 && end >= 0, `template section missing: ${from}`);
  return source.slice(start, end);
}

const resolver = section('const DB = {};', '\nfunction loadDB()');
const migration = section('const SAVE_SCHEMA_VERSION =', '\n// 버전과 무관하게');
const runtime = new Function(`
  const STAT_KEYS=[];
  function totalStatPointsAt(){ return 0; }
  ${resolver}
  ${migration}
  return { DB, installMapGroups, installMapSpawns, installMapConnections, rebuildMapIndex, getMap, mapKey, mapLabel, mapConnections, getMapMoveRule, unmetMapMoveRequirement, validateMapRestorationLedger, resolveLegacyMapRef, migrateSave, SAVE_SCHEMA_VERSION };
`)();

runtime.DB.maps = structuredClone(baseMaps);
runtime.DB.mapGroups = mapGroups;
runtime.DB.mapSpawns = mapSpawns;
runtime.DB.mapConnections = mapConnections;
runtime.DB.mapRestorationLedger = restorationLedger;
runtime.DB.monsters = monsters;
runtime.installMapGroups();
runtime.rebuildMapIndex();
runtime.installMapSpawns();
runtime.rebuildMapIndex();
runtime.installMapConnections();
runtime.rebuildMapIndex();

const groups = Object.values(runtime.DB.maps).filter(map => map && map.kind === 'group');
const physicalMaps = Object.values(runtime.DB.maps).filter(map => map && map.kind === 'map');

assert.strictEqual(runtime.SAVE_SCHEMA_VERSION, 2, 'P4 schema version');
assert.strictEqual(groups.length, 12, 'compressed UI group count');
assert.strictEqual(physicalMaps.length, 49, 'original physical map count including c_tower1');
assert(groups.every(group => !(group.monsters || []).length && !group.hasMvp), 'groups must not retain combat data');
assert(physicalMaps.every(map => map.mapId && map.displayName), 'physical map schema');

const mapIds = physicalMaps.map(map => map.mapId);
assert.strictEqual(new Set(mapIds).size, mapIds.length, 'mapId must be unique');
assert.strictEqual(runtime.mapKey('gl_knt01'), 'gl_knt01', 'mapId lookup');
assert.strictEqual(runtime.mapLabel('gl_knt01'), '글레스트헤임 기사단 1층', 'mapId display label');
assert.strictEqual(runtime.mapKey('c_tower1'), 'c_tower1', 'existing direct map gets original mapId');
assert.strictEqual(runtime.resolveLegacyMapRef('프론테라 평원').mapId, '프론테라 남쪽 평원', 'one-to-one legacy alias');

const expectedPlacements = {
  c_tower1:[152,97,486,148], c_tower2:[86,152,96,97,148,144], c_tower3:[86,152,95,148],
  c_tower4:[80,86,152,96,95,148,145,144], alde_dun01:[133,418], alde_dun02:[454,418,130,129],
  alde_dun03:[133,147,149], alde_dun04:[80,486,142], gl_knt01:[393,152,84,83,85,89],
  gl_knt02:[84,83,90,85,89,143]
};
assert.deepStrictEqual(mapSpawns.placements, Object.fromEntries(Object.entries(expectedPlacements).filter(([id])=>id!=='c_tower1')), 'P3 data contains only approved split-map placements');
Object.entries(expectedPlacements).forEach(([mapId, ids])=>{
  const map=runtime.getMap(mapId);
  assert.deepStrictEqual(map.monsters, ids, `${mapId}: exact Korean Pre-RE confirmed roster`);
  assert.strictEqual(map.spawnVerified, true, `${mapId}: confirmed roster marker`);
  ids.forEach(id=>assert(monsters[String(id)], `${mapId}: monster ${id} exists`));
});
assert(!runtime.getMap('gl_knt01').monsters.includes(296) && !runtime.getMap('gl_knt02').monsters.includes(313), 'Alice collision remains blocked');

assert.deepStrictEqual(runtime.mapConnections('c_tower1'), ['alde_dun01'], 'c_tower1 keeps only evidence-backed connections');
assert.deepStrictEqual(runtime.mapConnections('c_tower3'), ['c_tower4'], 'only confirmed key route leaves c_tower3');
assert.strictEqual(runtime.getMapMoveRule('c_tower3', 'c_tower4').requires.items[0], '시계탑의 열쇠', 'fourth-floor route preserves key condition');
assert.strictEqual(runtime.unmetMapMoveRequirement('c_tower3', 'c_tower4', {inventory:{}}), '시계탑의 열쇠', 'key route blocks without item');
assert.strictEqual(runtime.unmetMapMoveRequirement('c_tower3', 'c_tower4', {inventory:{'시계탑의 열쇠':1}}), null, 'key route opens with item');
assert.strictEqual(runtime.getMapMoveRule('c_tower2', 'alde_dun03'), null, 'random warp candidate remains unimplemented');

assert.strictEqual(restorationLedger.groups.length, 12, 'ledger covers every split map group');
assert.deepStrictEqual(runtime.validateMapRestorationLedger(), [], 'ledger permits only confirmed current map/spawn/connection data');
runtime.getMap('gl_sew01').monsters.push(80);
assert(runtime.validateMapRestorationLedger().includes('unapproved spawn:gl_sew01'), 'ledger fails closed on an unsupported spawn');
runtime.getMap('gl_sew01').monsters.pop();

const legacyMonsterIds = new Set([141, 151]);
const legacyRefs = Object.entries(runtime.DB.maps).flatMap(([mapKey, map]) =>
  (map.monsters || []).filter(id => legacyMonsterIds.has(id)).map(id => `${mapKey}:${id}`)
);
assert.deepStrictEqual(legacyRefs, [], 'legacy Bathory/Arclouze records are never active map spawns');
assert(!monsters['141'], '바토리 duplicate remains canonically removed');
assert(monsters['151'], 'unbound Arclouze record remains available for compatibility inspection');

for (const group of mapGroups.groups) {
  const legacy = group.legacyKey;
  const save = {
    name: '회귀검증', job: '노비스', statSystemV2: true,
    savedMap: legacy, currentMap: legacy,
    unlockedMaps: { [legacy]: true },
    visitedMaps: { [legacy]: true },
    records: { mapTime: { [legacy]: 37 } },
    offlineHunt: { map: legacy, at: 1 }
  };
  runtime.migrateSave(save);
  runtime.migrateSave(save); // 반복 로드: 시간·기록 중복 금지

  assert.strictEqual(save.savedMap, '프론테라', `${legacy}: safe fallback`);
  assert(!Object.hasOwn(save, 'currentMap'), `${legacy}: current location must not target a floor`);
  assert(!save.offlineHunt, `${legacy}: offline hunt must be cancelled without reward`);
  assert.strictEqual(save.unlockedMaps[legacy], true, `${legacy}: unlock preserved as group`);
  assert.strictEqual(save.visitedMaps[legacy], true, `${legacy}: visit preserved as group`);
  assert.strictEqual(save.records.mapTime[legacy], 37, `${legacy}: time preserved as group`);
  assert.strictEqual(save.mapGroupState.unlocked[group.groupId], true, `${legacy}: group unlock mirror`);
  assert.strictEqual(save.mapGroupState.visited[group.groupId], true, `${legacy}: group visit mirror`);
  assert.strictEqual(save.mapGroupState.mapTime[group.groupId], 37, `${legacy}: group time mirror`);
  const floorIds = new Set(group.maps.map(([mapId]) => mapId));
  assert(!Object.keys(save.unlockedMaps).some(key => floorIds.has(key)), `${legacy}: no invented unlock`);
  assert(!Object.keys(save.visitedMaps).some(key => floorIds.has(key)), `${legacy}: no invented visit`);
}

const directSave = {
  name:'직결 회귀검증', job:'노비스', statSystemV2:true,
  savedMap:'알데바란 시계탑 1층', currentMap:'알데바란 시계탑 1층',
  unlockedMaps:{'알데바란 시계탑 1층':true}, visitedMaps:{'알데바란 시계탑 1층':true},
  records:{mapTime:{'알데바란 시계탑 1층':12}}, offlineHunt:{map:'알데바란 시계탑 1층',at:1}
};
runtime.migrateSave(directSave);
runtime.migrateSave(directSave);
assert.strictEqual(directSave.savedMap, 'c_tower1', 'confirmed direct save map normalizes to mapId');
assert.strictEqual(directSave.currentMap, 'c_tower1', 'confirmed direct current map normalizes to mapId');
assert.strictEqual(directSave.offlineHunt.map, 'c_tower1', 'confirmed direct offline hunt normalizes to mapId');
assert.strictEqual(directSave.unlockedMaps.c_tower1, true, 'confirmed direct unlock normalizes to mapId');
assert.strictEqual(directSave.visitedMaps.c_tower1, true, 'confirmed direct visit normalizes to mapId');
assert.strictEqual(directSave.records.mapTime.c_tower1, 12, 'confirmed direct time normalizes to mapId');
assert(!directSave.unlockedMaps['알데바란 시계탑 1층'], 'legacy direct key does not persist after migration');

const buildScript = read('build.py');
const outputMatch = buildScript.match(/OUTPUT_PATH\s*=\s*os\.path\.join\(BASE,\s*"([^"]+)"\)/);
assert(outputMatch, 'build script declares an output path');
const built = read(outputMatch[1]);
assert(!built.includes('{{__DATA_DB_MAP_GROUPS__}}'), 'built output must inline map groups');
assert(!built.includes('{{__DATA_DB_MAP_SPAWNS__}}'), 'built output must inline map spawns');
assert(!built.includes('{{__DATA_DB_MAP_CONNECTIONS__}}'), 'built output must inline map connections');
let executableBlocks = 0;
for (const match of built.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
  const code = match[1];
  if (!code.trim() || /^[\s\r\n]*[{\[]/.test(code)) continue;
  new Function(code);
  executableBlocks++;
}
console.log(`PASS map restoration regression: ${groups.length} groups, ${physicalMaps.length} maps, ${Object.keys(expectedPlacements).length} confirmed spawn rosters, ${mapGroups.groups.length} legacy saves, ${executableBlocks} JS blocks`);
