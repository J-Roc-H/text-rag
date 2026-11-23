'use strict';
// 펫 채집 (P3-11, 설계 §6-5): 펫이 있으면 원작 풀·버섯 비율로 캐 오고, 없으면 캐지 못한 채 가끔 아쉬워만 한다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'source', 'companion.js'), 'utf8');
const GATHER = JSON.parse(fs.readFileSync(path.join(ROOT, 'source', 'data', 'db-gathering.json'), 'utf8'));
const ITEMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'source', 'data', 'db-items.json'), 'utf8').replace(/^﻿/, ''));

function env() {
  const logs = [];
  let now = 0;
  const ctx = {
    DB: {
      pets: { constants: { stages: [1, 100, 250, 750, 910, 1000], hungerStart: 100 },
        pets: { PORING: { name: '포링', food: '사과 주스', fullness: 3, hungryDelaySec: 60, intimacy: { start: 250 } } } },
      gathering: GATHER, items: ITEMS,
    },
    G: { currentMap: 'pay_dun00' },
    log: (m, k) => logs.push([String(m), k]),
    Date: { now: () => now },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const p = { inventory: {} };
  ctx.companionNormalize(p);
  return { ctx, p, logs, setNow: (t) => { now = t; } };
}
// 결정적 난수
function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ① 자료: 모든 결과 아이템이 게임에 있고, 시범 맵에만 걸려 있다
const pilot = JSON.parse(fs.readFileSync(path.join(ROOT, 'source', 'data', 'db-prt-pilot.json'), 'utf8').replace(/^﻿/, ''));
for (const [cid, s] of Object.entries(GATHER.sources)) {
  for (const k of Object.keys(s.drops)) assert(ITEMS[k], `${cid} 결과 ${k}가 db-items에 없음`);
}
for (const mid of Object.keys(GATHER.maps)) assert(pilot.maps[mid], `${mid}는 시범 맵이 아님`);

// ② 채집 자료가 없는 맵: 아무 일도 없다
{
  const { ctx, p } = env();
  p.companions.pet = ctx.companionCreatePet('PORING', 0);
  assert.strictEqual(ctx.companionGatherOnKill(p, { map: '프론테라' }, () => 0), null);
}

// ③ 펫이 있으면 원작 비율로 기회가 오고, 결과는 원작 드롭률을 따른다 (보통 단계 = 1배)
{
  const { ctx, p, logs } = env();
  p.companions.pet = ctx.companionCreatePet('PORING', 0);
  assert.strictEqual(ctx.companionStage(p.companions.pet.intimacy), 2, '첫 펫은 보통 단계');
  const t = GATHER.maps.pay_dun00;
  const total = t.gather.reduce((a, x) => a + x[1], 0);
  const rng = lcg(7), N = 40000;
  let chances = 0;
  for (let i = 0; i < N; i++) if (ctx.companionGatherOnKill(p, {}, rng)) chances++;
  const expect = total / t.monsters;
  assert(Math.abs(chances / N - expect) < 0.01, `기회 비율 ${chances / N} vs 원작 ${expect}`);
  // 빨간 풀(1078)이 15/18 -> 빨간 허브 55%
  const herb = p.inventory['빨간 허브'] || 0;
  const want = chances * (15 / total) * 0.55;
  assert(Math.abs(herb - want) / want < 0.08, `빨간 허브 ${herb} vs 기대 ${want}`);
  assert(logs.some(([m, k]) => k === 'loot' && /^🐾 포링이 (풀을 뜯어|버섯을 캐) /.test(m)), '채집 로그');
}

// ④ 친밀도: 절친은 1.25배, 어색함은 0.5배 (빈도만)
{
  const { ctx, p } = env();
  p.companions.pet = ctx.companionCreatePet('PORING', 0);
  const count = (intimacy) => {
    p.companions.pet.intimacy = intimacy;
    const rng = lcg(11); let c = 0;
    for (let i = 0; i < 40000; i++) if (ctx.companionGatherOnKill(p, { silent: true }, rng)) c++;
    return c;
  };
  const normal = count(500), best = count(950), awkward = count(0);
  assert(Math.abs(best / normal - 1.25) < 0.06, `절친 배율 ${best / normal}`);
  assert(Math.abs(awkward / normal - 0.5) < 0.04, `어색함 배율 ${awkward / normal}`);
}

// ⑤ 방치(silent): 아이템은 들어오고 요약에 집계되며 로그는 없다
{
  const { ctx, p, logs } = env();
  p.companions.pet = ctx.companionCreatePet('PORING', 0);
  const summary = { items: {}, events: [], phase: 'extrapolate' };
  const rng = lcg(3);
  for (let i = 0; i < 5000; i++) ctx.companionGatherOnKill(p, { silent: true, summary }, rng);
  assert(Object.keys(summary.items).length > 0, '요약 집계');
  assert.deepStrictEqual(Object.keys(summary.items).sort(), Object.keys(p.inventory).sort());
  assert.strictEqual(logs.length, 0, '방치 중엔 말이 없다');
}

// ⑥ 펫이 없으면 채집되지 않고, 아쉬움 문구가 10분에 한 번만 나온다
{
  const { ctx, p, logs, setNow } = env();
  const rng = () => 0;   // 매번 기회
  setNow(1000);
  const r1 = ctx.companionGatherOnKill(p, {}, rng);
  assert(r1 && r1.wished && r1.items.length === 0);
  for (let i = 0; i < 50; i++) ctx.companionGatherOnKill(p, {}, rng);
  assert.strictEqual(logs.length, 1, '쉼 간격 안에서는 한 번');
  assert(/동료/.test(logs[0][0]), '동료를 아쉬워한다');
  setNow(1000 + 10 * 60 * 1000);
  ctx.companionGatherOnKill(p, {}, rng);
  assert.strictEqual(logs.length, 2, '10분 뒤 다시');
  assert.deepStrictEqual(p.inventory, {}, '펫 없이는 아무것도 얻지 않는다');
  // 방치 중에는 아쉬움도 없다
  setNow(1000 + 30 * 60 * 1000);
  ctx.companionGatherOnKill(p, { silent: true }, rng);
  assert.strictEqual(logs.length, 2);
}

// ⑦ 조사: 받침 유무
{
  const { ctx } = env();
  assert.strictEqual(ctx.companionJosa('포링', '이', '가'), '이');
  assert.strictEqual(ctx.companionJosa('빨간 허브', '을', '를'), '를');
  assert.strictEqual(ctx.companionJosa('파란허브', '을', '를'), '를');
  assert.strictEqual(ctx.companionJosa('꿀', '을', '를'), '을');
}

console.log('companion-gather-smoke: PASS');
