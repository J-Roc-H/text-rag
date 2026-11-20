'use strict';
// 동반자 접속 중·방치 정산 배선 (P3-10 펫 1단계 Task 4).
// 핵심: 방치 정산은 runHeadlessTicks가 Date.now를 과거로 돌려 전투를 다시 돌린다. 펫 시간은 그 전에
// 실제 시각으로 한 번만 진행하고, 헤드리스 안의 processTurn 호출은 과거 시각이라 아무것도 하지 않아야 한다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction, html } = require('./_item-effect-harness');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'source', 'companion.js'), 'utf8');
const MIN = 60 * 1000, HOUR = 60 * MIN;

function env(food) {
  const ctx = {
    DB: { pets: {
      constants: { stages: [1, 100, 250, 750, 910, 1000], hungerStart: 100, feedAt: 25, fullGainMaxHunger: 75 },
      pets: { TEST: { name: '시험펫', food: '시험사료', fullness: 3, hungryDelaySec: 60, hungerIncrease: 20,
        intimacy: { start: 240, fed: 50, overfed: -100, hungry: -5, ownerDie: -20 } } } } },
    log: () => {}, notify: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const p = { inventory: { '시험사료': food } };
  ctx.companionNormalize(p);
  p.companions.pet = ctx.companionCreatePet('TEST', 0);
  return { ctx, p };
}

// offline_once: 정산 전 실제 시각 진행 + 헤드리스 표본(과거 시각) 반복 = 순수 12시간 진행
{
  const pure = env(50), real = env(50);
  const T = 12 * HOUR;
  pure.ctx.companionAdvance(pure.p, T);
  real.ctx.companionAdvance(real.p, T);                       // processOfflineTicks 맨 앞
  const sampleTicks = 600, tickMs = 1500;                     // runHeadlessTicks: simT = now - n*tick 부터
  for (let i = 0; i < sampleTicks; i++) real.ctx.companionAdvance(real.p, T - (sampleTicks - i) * tickMs);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(real.p)), JSON.parse(JSON.stringify(pure.p)));
}

// summary_line: 먹은 개수·단계 변화·남은 사료
{
  const { ctx, p } = env(3);
  const r = ctx.companionAdvance(p, 12 * HOUR);
  const line = ctx.companionAwaySummaryLine(p, r);
  assert(line.includes('시험펫'), line);
  assert(line.includes('사료 3개'), line);
  assert(line.includes('서먹함 → 보통'), line);         // 240 -> 390
  assert(line.includes('떨어져'), line);                  // 다 먹고 배고픔 0
}
{
  const { ctx, p } = env(0);
  const r = ctx.companionAdvance(p, 30 * MIN);
  assert(!ctx.companionAwaySummaryLine(p, r).includes('→'));
}
{
  const { ctx } = env(0);
  const p = { inventory: {} }; ctx.companionNormalize(p);
  assert.strictEqual(ctx.companionAwaySummaryLine(p, { fed: 0 }), '');   // 펫 없으면 줄 없음
}

// 배선: 템플릿 안의 호출 위치
{
  const offline = extractFunction(html, 'function processOfflineTicks(elapsedMs, resume = true) {');
  const iAdv = offline.indexOf('companionAdvance(');
  const iHunt = offline.indexOf('if(!G.autoHunt');
  assert(iAdv > 0 && iAdv < iHunt, '방치 정산은 자동사냥 여부와 무관하게, 헤드리스 전에 펫을 진행해야 한다');
  assert(offline.indexOf('summary.companion') > offline.indexOf('let summary'), 'summary에 펫 결과를 싣는다');
  const turn = extractFunction(html, 'function processTurn(){');
  assert(turn.includes('companionAdvance('), 'processTurn에서 펫 시간 진행');
  const lines = extractFunction(html, 'function awaySummaryLines(summary, full){');
  assert(lines.includes('summary.companion'), '방치 요약에 펫 한 줄');
  assert(SRC.includes('setInterval('), '마을 등 사냥 밖에서도 60초마다 진행');
}

console.log('companion-offline-smoke: OK');
