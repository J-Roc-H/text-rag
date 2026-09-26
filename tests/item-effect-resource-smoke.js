'use strict';
// P0-C2 회귀 테스트 — 아이템 효과의 spCostMul/castReduction이 실제 SP 소비·캐스팅
// 공식에 연결됐는지 검증한다. source/template.html의 실제 calcStats()/useSkill()과
// source/item-effects.js의 실제 getSkillSpCost()를 그대로 실행한다(재구현 아님).
const assert = require('assert');
const {
  runCalcStats, makeGetSkillSpCost, runUseSkill, makePlayer, makeDB,
} = require('./_item-effect-harness');

const getSkillSpCost = makeGetSkillSpCost();

function statsWithSpCostMul(mul) {
  const DB = makeDB(mul != null ? { '__spmul 카드': { type: '카드', spCostMul: mul } } : {});
  const equip = mul != null ? '테스트무기 [1] <__spmul>' : '테스트무기';
  return runCalcStats(DB, { player: makePlayer(equip) });
}

// ══════════════════════════════════════════════
// SP 소비
// ══════════════════════════════════════════════

// ── A. 기본: spCostMul 없음(=1) → base 그대로 ──
{
  const s = statsWithSpCostMul(null);
  assert.strictEqual(s.cardSpCostMul, 1, 'A: 아이템 효과 없으면 cardSpCostMul은 기본값 1');
  assert.strictEqual(getSkillSpCost(40, s), 40, 'A: spCostMul=1이면 base cost 그대로(40)');
  console.log('OK - SP A: 기본(mul=1) → 40');
}

// ── B. 감소: spCostMul 0.7 ──
{
  const s = statsWithSpCostMul(0.7);
  assert.strictEqual(s.cardSpCostMul, 0.7, 'B: cardSpCostMul이 카드 값(0.7) 그대로 반영');
  assert.strictEqual(getSkillSpCost(40, s), Math.floor(40 * 0.7), 'B: floor(40*0.7)=28');
  console.log('OK - SP B: 감소(mul=0.7) → 28');
}

// ── C. 증가: spCostMul 1.5 ──
{
  const s = statsWithSpCostMul(1.5);
  assert.strictEqual(getSkillSpCost(40, s), Math.floor(40 * 1.5), 'C: floor(40*1.5)=60');
  console.log('OK - SP C: 증가(mul=1.5) → 60');
}

// ── D. 자동/수동 parity: 같은 s 객체에서 getSkillSpCost가 만드는 값은 어디서 불러도 같다 ──
// (자동 경로 4곳 + 실제 차감 1곳, 수동 useSkill 판정/차감/환불 3곳 -- 총 8개 호출부가
// 전부 이 함수 하나만 거치도록 통합했으므로, 함수가 같은 입력에 같은 출력을 내는지와
// useSkill의 실제 차감액이 그 값과 일치하는지를 함께 확인한다.)
{
  const DB = makeDB({ '__spmul 카드': { type: '카드', spCostMul: 0.7 } });
  DB.skills = { '테스트스킬': { type: '액티브', spCost: 40, cooldown: 0, effect: () => ({ msg: '발동', type: 'system' }) } };
  const p = makePlayer('테스트무기 [1] <__spmul>');
  p.sp = 100; p.maxSp = 100; p.skills['테스트스킬'] = 1;
  const G = { player: p, battles: [], cooldowns: {}, autoHunt: false };

  const s = runCalcStats(DB, G);
  const expectedCost = getSkillSpCost(40, s); // "자동 경로"가 쓰는 것과 동일한 계산

  const logs = runUseSkill(DB, G, '테스트스킬'); // "수동 경로"의 실제 실행
  assert.strictEqual(100 - p.sp, expectedCost, 'D: useSkill 실제 차감액이 getSkillSpCost 계산값과 일치(자동/수동 동일 함수)');
  assert.ok(logs.some(l => l.msg === '발동'), 'D: 스킬 효과 정상 실행');
  console.log('OK - SP D: 자동 경로 계산값과 useSkill 실제 차감액이 정확히 일치');
}

// ── E. 사용 가능 판정: base 40, mul 0.7 → 실제 28. SP 30이면 사용 가능해야 함 ──
{
  const DB = makeDB({ '__spmul 카드': { type: '카드', spCostMul: 0.7 } });
  DB.skills = { '테스트스킬': { type: '액티브', spCost: 40, cooldown: 0, effect: () => ({ msg: '발동', type: 'system' }) } };
  const p = makePlayer('테스트무기 [1] <__spmul>');
  p.sp = 30; p.maxSp = 30; p.skills['테스트스킬'] = 1;
  const G = { player: p, battles: [], cooldowns: {}, autoHunt: false };

  const logs = runUseSkill(DB, G, '테스트스킬');
  assert.strictEqual(p.sp, 30 - Math.floor(40 * 0.7), 'E: 기본 40이어도 실제 비용 28이라 SP 30으로 사용 가능, 정확히 차감');
  assert.ok(!logs.some(l => (l.msg || '').includes('SP 부족')), 'E: SP 부족 경고 없이 정상 사용');
  console.log('OK - SP E: 기본 비용보다 SP가 적어도(30<40) 실제 비용(28)만 있으면 사용 가능');
}

// ── F. 부족 시: 사용 실패, SP는 차감되지 않아야 함 ──
{
  const DB = makeDB({});
  DB.skills = { '테스트스킬': { type: '액티브', spCost: 60, cooldown: 0, effect: () => ({ msg: '발동', type: 'system' }) } };
  const p = makePlayer(null);
  p.sp = 40; p.maxSp = 40; p.skills['테스트스킬'] = 1;
  const G = { player: p, battles: [], cooldowns: {}, autoHunt: false };

  const logs = runUseSkill(DB, G, '테스트스킬');
  assert.strictEqual(p.sp, 40, 'F: SP 부족으로 실패 시 SP가 잘못 차감되지 않음(원래값 그대로)');
  assert.ok(logs.some(l => (l.msg || '').includes('SP 부족')), 'F: SP 부족 경고 로그 존재');
  assert.ok(!logs.some(l => l.msg === '발동'), 'F: 스킬 효과가 실행되지 않음');
  console.log('OK - SP F: SP 부족 시 사용 실패, SP 차감 없음');
}

// ══════════════════════════════════════════════
// 캐스팅(CAST)
// ══════════════════════════════════════════════

// ── CAST A. 효과 없음 → P0-C2 이전과 완전 동일(순수 DEX 공식) ──
{
  const DB = makeDB({});
  const p = makePlayer(null); p.dex = 1;
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.castReduction, Math.min(1.0, s.dex / 150), 'CAST A: 아이템 효과 없으면 순수 DEX 공식 그대로');
  console.log('OK - CAST A: 효과 없음, 기존 DEX 공식과 동일');
}

// ── CAST B. item castReduction만 ──
{
  const DB = makeDB({ '__cast 카드': { type: '카드', castReduction: 0.2 } });
  const p = makePlayer('테스트무기 [1] <__cast>'); p.dex = 1;
  const s = runCalcStats(DB, { player: p });
  const before = runCalcStats(makeDB({}), { player: makePlayer('테스트무기') });
  assert.strictEqual(s.castReduction, Math.min(1.0, before.castReduction + 0.2), 'CAST B: item castReduction(0.2)이 정확히 가산');
  console.log('OK - CAST B: item castReduction 단독 정확히 가산');
}

// ── CAST C. DEX + item ──
{
  const DB = makeDB({ '__cast 카드': { type: '카드', castReduction: 0.1 } });
  const p = makePlayer('테스트무기 [1] <__cast>'); p.dex = 60; // dex/150 = 0.4
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.castReduction, Math.min(1.0, 60 / 150 + 0.1), 'CAST C: DEX(0.4) + item(0.1) = 0.5');
  console.log('OK - CAST C: DEX + item castReduction 정확히 합산');
}

// ── CAST D. 버프(브라기) + item ──
{
  const DB = makeDB({ '__cast 카드': { type: '카드', castReduction: 0.1 } });
  const p = makePlayer('테스트무기 [1] <__cast>'); p.dex = 1;
  p.statusEffects.bragi = { castReduce: 0.15, delayReduce: 0.05 };
  const s = runCalcStats(DB, { player: p });
  const baseDex = Math.min(1.0, p.dex / 150 /* + jobBonus 등은 dex=1 novice라 0 */);
  // 실제 계산 순서: DEX -> item -> bragi -> suffragium, 각 단계 min(1,...) 클램프.
  // 항이 전부 음수가 아니므로 최종값은 min(1, dexPart+item+bragi)와 같다.
  assert.strictEqual(s.castReduction, Math.min(1.0, baseDex + 0.1 + 0.15), 'CAST D: DEX+item+bragi 합산(버프 기존 동작 유지)');
  console.log('OK - CAST D: 버프(브라기) + item castReduction 기존 동작대로 합산');
}

// ── CAST E. 상한: 과도한 item reduction도 기존 clamp(최대 1.0, instantCast) 규칙 유지 ──
{
  const DB = makeDB({ '__cast 카드': { type: '카드', castReduction: 5 } }); // 터무니없이 큰 값
  const p = makePlayer('테스트무기 [1] <__cast>');
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.castReduction, 1.0, 'CAST E: 과도한 item reduction도 기존 규칙대로 1.0에서 clamp');
  assert.strictEqual(s.instantCast, true, 'CAST E: castReduction>=1.0이면 기존 instantCast 규칙 그대로 true');
  console.log('OK - CAST E: 과도한 item castReduction도 기존 상한(1.0)/instantCast 규칙 유지');
}

console.log('ALL TESTS PASS - item-effect-resource-smoke');
