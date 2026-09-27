'use strict';
// P2-A.5 — bMatkRate/bUseSPrate 엔진 확장 회귀 테스트(엔진 레벨, JS).
// source/template.html의 실제 calcStats()/getEquipmentComparison()과
// source/item-effects.js의 실제 getSkillSpCost()를 그대로 실행한다(재구현 아님).
// 콤보 canonicalizer 레벨 회귀는 tests/combo-engine-extension-p2a5-test.py 참조.
const assert = require('assert');
const {
  runCalcStats, makeGetSkillSpCost, runUseSkill, makePlayer, makeDB, makeEquipmentCompareApi,
} = require('./_item-effect-harness');

const getSkillSpCost = makeGetSkillSpCost();

// ══════════════════════════════════════════════
// SP 소비: spCostRatePct(신규, additive) — rAthena skill.cpp skill_get_requirement
// `req.sp = req.sp * dsprate / 100` 재현, dsprate는 status.cpp에서 100 기준
// `sd->dsprate += val`(additive, 0% 하한 clamp)로 누적된다.
// ══════════════════════════════════════════════

// ── A. 단일 소스: -20% → 80% ──
{
  const DB = makeDB({ '__sprate 카드': { type: '카드', spCostRatePct: -20 } });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__sprate>') });
  assert.strictEqual(s.cardSpCostRatePct, -20, 'A: cardSpCostRatePct가 카드 값(-20) 그대로 반영');
  assert.strictEqual(getSkillSpCost(100, s), 80, 'A: base 100 * (100-20)/100 = 80');
  console.log('OK - A: bUseSPrate 단일 -20% → 80');
}

// ── B. 두 소스 합산: -20% + -20% = -40% → 60%(64% 아님) ──
{
  const DB = makeDB({ '__sprate 카드': { type: '카드', spCostRatePct: -20 } });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [2] <__sprate, __sprate>') });
  assert.strictEqual(s.cardSpCostRatePct, -40, 'B: additive 누적 -20+-20=-40');
  assert.strictEqual(getSkillSpCost(100, s), 60, 'B: rAthena dsprate additive 재현 -- base 100*(100-40)/100=60(구 곱연산 64는 틀림)');
  console.log('OK - B: bUseSPrate 이중 -20%+-20% → 60(원작 additive 재현, 64% 아님)');
}

// ── C. 양수(소비 증가): +20% → 120% ──
{
  const DB = makeDB({ '__sprate 카드': { type: '카드', spCostRatePct: 20 } });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__sprate>') });
  assert.strictEqual(getSkillSpCost(100, s), 120, 'C: base 100 * (100+20)/100 = 120');
  console.log('OK - C: bUseSPrate +20% → 120');
}

// ── D. 하한 clamp: -150%까지 내려가도 rAthena `if(dsprate<0) dsprate=0`처럼 0%에서 clamp ──
{
  const DB = makeDB({ '__sprate 카드': { type: '카드', spCostRatePct: -150 } });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__sprate>') });
  assert.strictEqual(getSkillSpCost(100, s), 0, 'D: rate가 -100% 밑으로 내려가도 0에서 clamp(음수 비용 없음)');
  console.log('OK - D: bUseSPrate 하한 clamp(-150% → 0% → 비용 0)');
}

// ── E. 기존 spCostMul(곱연산, 오재사용 사고 원인)과의 관계: 둘은 별개 필드로 함께 곱해진다 ──
{
  const DB = makeDB({
    '__sprate 카드': { type: '카드', spCostRatePct: -20 },
    '__spmul 카드': { type: '카드', spCostMul: 0.5 },
  });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [2] <__sprate, __spmul>') });
  assert.strictEqual(s.cardSpCostRatePct, -20, 'E: spCostRatePct는 spCostMul과 독립적으로 유지');
  assert.strictEqual(s.cardSpCostMul, 0.5, 'E: spCostMul도 그대로 유지(오재사용 없음)');
  assert.strictEqual(getSkillSpCost(100, s), Math.floor(100 * 0.8 * 0.5), 'E: (100-20)/100=0.8 과 기존 spCostMul(0.5)이 함께 곱해짐(40)');
  console.log('OK - E: 신규 spCostRatePct와 기존 spCostMul이 독립적으로 함께 곱연산');
}

// ── F. 자동/수동 8개 호출부 정본 경로 회귀 없음(P0-C2 정본 유지) ──
{
  const DB = makeDB({ '__sprate 카드': { type: '카드', spCostRatePct: -20 } });
  DB.skills = { '테스트스킬': { type: '액티브', spCost: 50, cooldown: 0, effect: () => ({ msg: '발동', type: 'system' }) } };
  const p = makePlayer('테스트무기 [1] <__sprate>');
  p.sp = 100; p.maxSp = 100; p.skills['테스트스킬'] = 1;
  const G = { player: p, battles: [], cooldowns: {}, autoHunt: false };

  const s = runCalcStats(DB, G);
  const expectedCost = getSkillSpCost(50, s); // 40 (50*0.8)
  const logs = runUseSkill(DB, G, '테스트스킬');
  assert.strictEqual(100 - p.sp, expectedCost, 'F: useSkill 실제 차감액이 getSkillSpCost 계산값과 일치(P0-C2 단일 정본 경로 회귀 없음)');
  assert.ok(logs.some(l => l.msg === '발동'), 'F: 스킬 효과 정상 실행');
  console.log('OK - F: getSkillSpCost 단일 정본 경로(8개 호출부 대표) 회귀 없음');
}

// ══════════════════════════════════════════════
// MATK: matkPct(신규, additive) — rAthena status.cpp(pre-RE, SCB_MATK)
// `matk_min/max = base+ematk; if(matk_rate!=100) matk *= matk_rate/100;` 재현.
// ══════════════════════════════════════════════

// ── G. 단일 소스: +6% ──
{
  const DB = makeDB({ '__matkpct 카드': { type: '카드', matkPct: 6 } });
  const p = makePlayer('테스트무기 [1] <__matkpct>'); p.int = 40;
  const s = runCalcStats(DB, { player: p });
  const baseMAtk = 40 + Math.pow(Math.floor(40 / 5), 2); // totInt 기반 base 공식 그대로 재현(재구현 아님 -- 값 검증용)
  assert.strictEqual(s.cardMatkPct, 6, 'G: cardMatkPct가 카드 값(6) 그대로 반영');
  assert.strictEqual(s.matk, Math.floor(baseMAtk * 1.06), 'G: (base+flat0)*1.06 -- flat 아이템 MATK 없을 때');
  console.log('OK - G: bMatkRate 단일 +6%');
}

// ── H. 두 소스 합산: +6% + +4% = +10%(additive) ──
{
  const DB = makeDB({ '__matkpct 카드': { type: '카드', matkPct: 6 }, '__matkpct2 카드': { type: '카드', matkPct: 4 } });
  const p = makePlayer('테스트무기 [2] <__matkpct, __matkpct2>'); p.int = 40;
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.cardMatkPct, 10, 'H: additive 누적 6+4=10(rAthena sd->matk_rate+=val 재현)');
  const baseMAtk = 40 + Math.pow(Math.floor(40 / 5), 2);
  assert.strictEqual(s.matk, Math.floor(baseMAtk * 1.10), 'H: (base+flat0)*1.10');
  console.log('OK - H: bMatkRate 이중 +6%+4% → +10% additive');
}

// ── I. 순서: 스킬 버프 flat MATK(임포시티오 마누스)는 matkPct 배율 *이후*에 더해진다
// (rAthena status.cpp 실코드: pseudobuff/consumable MATK는 matk_rate 배율 다음 단계에서
// 가산됨). 아이템 flat MATK(bonus.matk)는 현재 어떤 아이템 필드로도 채워지지 않는
// 기존 dead 경로(P0-close 확인 "bMatk: 파생값이라 직접 가산 지점 불명확")라 이 순서
// 검증에는 실제로 동작하는 버프 경로(imposMannus)를 쓴다.
{
  const DB = makeDB({ '__matkpct 카드': { type: '카드', matkPct: 10 } });
  const p = makePlayer('테스트무기 [1] <__matkpct>'); p.int = 40;
  p.statusEffects.imposMannus = { matkBonus: 50 };
  const s = runCalcStats(DB, { player: p });
  const baseMAtk = 40 + Math.pow(Math.floor(40 / 5), 2); // 104
  const correctOrder = Math.floor(baseMAtk * 1.10) + 50; // rAthena 순서: rate 적용 후 버프 가산
  const wrongOrder = Math.floor((baseMAtk + 50) * 1.10); // 틀린 순서: 버프까지 rate에 포함
  assert.strictEqual(s.matk, correctOrder, 'I: matkPct 배율이 먼저 적용되고 스킬 버프(임포시티오 마누스)가 그 이후에 가산됨(rAthena status.cpp 순서)');
  assert.notStrictEqual(correctOrder, wrongOrder, 'I: 두 순서가 실제로 다른 결과를 낸다는 사전 확인(테스트 유효성)');
  console.log('OK - I: MATK rate 배율과 스킬 버프 가산의 순서가 rAthena와 일치(rate 먼저, 버프 나중)');
}

// ── J. 음수 rate: -50%도 정상 반영(하한 clamp는 0%, -50%는 그 안쪽이라 그대로) ──
{
  const DB = makeDB({ '__matkneg 카드': { type: '카드', matkPct: -50 } });
  const p = makePlayer('테스트무기 [1] <__matkneg>'); p.int = 40;
  const s = runCalcStats(DB, { player: p });
  const baseMAtk = 40 + Math.pow(Math.floor(40 / 5), 2);
  assert.strictEqual(s.matk, Math.floor(baseMAtk * 0.50), 'J: 음수 matkPct(-50%)도 정확히 반영');
  console.log('OK - J: bMatkRate 음수(-50%) 정상 반영');
}
// ── J-2. 하한 clamp: -150%까지 내려가도 rAthena matk_rate 0% 하한과 동일하게 clamp ──
{
  const DB = makeDB({ '__matkneg2 카드': { type: '카드', matkPct: -150 } });
  const p = makePlayer('테스트무기 [1] <__matkneg2>'); p.int = 40;
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.matk, 0, 'J-2: rate가 -100% 밑으로 내려가도 0에서 clamp(음수 MATK 없음)');
  console.log('OK - J-2: bMatkRate 하한 clamp(-150% → 0% → MATK 0)');
}

// ══════════════════════════════════════════════
// M. zero-effect parity: 신규 필드가 기본값(0)일 때 기존 결과와 완전히 동일해야 한다.
// ══════════════════════════════════════════════
{
  const DB = makeDB({});
  const p = makePlayer('테스트무기'); p.int = 30;
  const s = runCalcStats(DB, { player: p });
  const baseMAtk = 30 + Math.pow(Math.floor(30 / 5), 2);
  assert.strictEqual(s.cardMatkPct, 0, 'M: matkPct 기본값 0');
  assert.strictEqual(s.cardSpCostRatePct, 0, 'M: spCostRatePct 기본값 0');
  assert.strictEqual(s.matk, baseMAtk, 'M: matkPct=0이면 MATK가 기존 base 공식과 완전히 동일(zero-effect parity)');
  assert.strictEqual(getSkillSpCost(77, s), 77, 'M: spCostRatePct=0/spCostMul=1이면 SP 비용이 base 그대로(zero-effect parity)');
  console.log('OK - M: 신규 필드 0(기본값)일 때 기존 결과와 완전히 동일(zero-effect parity)');
}

// ══════════════════════════════════════════════
// N. 장비 비교(getEquipmentComparison) MATK parity — 별도 공식 없이 calcStats(clone)
// diff만 쓴다는 P1-C 원칙이 matkPct에도 그대로 적용되는지 확인.
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '마력완드': { type: '무기', atk: 5, wType: '완드', weaponLv: 1, matkPct: 15 } });
  const p = makePlayer(null); p.int = 40;
  p.inventory['마력완드'] = 1;
  const G = { player: p };
  const api = makeEquipmentCompareApi(DB, G);

  const before = api.calcStats().matk;
  const cmp = api.getEquipmentComparison('마력완드', DB.items['마력완드']);
  const matkDiff = cmp.statDiffs.find(d => d.label === 'MATK');
  assert.ok(matkDiff, 'N: matkPct를 가진 장비도 MATK diff에 나타남');
  assert.strictEqual(matkDiff.diff, cmp.candidateStats.matk - before, 'N: diff = candidate.matk - current.matk(별도 공식 없음)');
  api.equipItem('마력완드');
  const actual = api.calcStats();
  assert.strictEqual(actual.matk, cmp.candidateStats.matk, 'N: 실제 equip 후 matk가 비교 결과와 정확히 일치');
  console.log('OK - N: 장비 비교 MATK(matkPct 포함) parity, 별도 공식 없이 calcStats(clone) diff만 사용');
}

console.log('ALL TESTS PASS - combo-engine-extension-p2a5-smoke');
