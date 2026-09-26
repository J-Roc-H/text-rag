'use strict';
// P0-C3 회귀 테스트 — 아이템 효과의 dmgReduceAll/raceDmgReduce/elemReduce가 실제 받는
// 피해 계산에, immune이 실제 상태이상 면역 판정에 연결됐는지 검증한다.
// source/item-effects.js의 실제 applyIncomingItemReduction()/isStatusImmune()과
// 실제 collectItemEffects()/calcStats()를 그대로 실행한다(재구현 아님).
const assert = require('assert');
const {
  html, runCalcStats, makeApplyIncomingItemReduction, makeIsStatusImmune,
  makePlayer, makeDB,
} = require('./_item-effect-harness');

const applyIncomingItemReduction = makeApplyIncomingItemReduction();
const isStatusImmune = makeIsStatusImmune();

function statsWith(cards) {
  const extra = {};
  Object.keys(cards || {}).forEach(name => { extra[name + ' 카드'] = Object.assign({ type: '카드' }, cards[name]); });
  const DB = makeDB(extra);
  const cardNames = Object.keys(cards || {});
  const equip = cardNames.length ? `테스트무기 [${cardNames.length}] <${cardNames.join(', ')}>` : '테스트무기';
  return runCalcStats(DB, { player: makePlayer(equip) });
}

// ══════════════════════════════════════════════
// 받는 피해 감소
// ══════════════════════════════════════════════

// ── A. 효과 없음 ──
{
  const s = statsWith({});
  assert.strictEqual(applyIncomingItemReduction(100, {}, s), 100, 'A: 아이템 효과 없으면 피해 그대로');
  console.log('OK - DEF A: 효과 없음, 100 → 100');
}

// ── B. 전체 감소 10% ──
{
  const s = statsWith({ __dmgall: { dmgReduceAll: 10 } });
  assert.strictEqual(s.cardDmgReduceAll, 10, 'B: cardDmgReduceAll이 카드 값(10) 그대로 반영');
  assert.strictEqual(applyIncomingItemReduction(100, {}, s), 90, 'B: 100 * (1-10/100) = 90');
  console.log('OK - DEF B: 전체 감소 10% → 90');
}

// ── C. 종족 일치만 적용 ──
{
  const s = statsWith({ __race: { raceDmgReduce: { '인간형': 30 } } });
  assert.deepStrictEqual(s.cardRaceDmgReduce, { '인간형': 30 }, 'C: cardRaceDmgReduce 맵 그대로 반영');
  assert.strictEqual(applyIncomingItemReduction(100, { attackerRace: '인간형' }, s), 70, 'C: 일치 종족(인간형) 100*(1-0.3)=70');
  assert.strictEqual(applyIncomingItemReduction(100, { attackerRace: '동물' }, s), 100, 'C: 불일치 종족(동물)은 미적용, 100 그대로');
  console.log('OK - DEF C: 종족 일치만 감소, 불일치는 변화 없음');
}

// ── D. 속성 일치만 적용 ──
{
  const s = statsWith({ __elem: { elemReduce: { '화속성': 20 } } });
  assert.strictEqual(applyIncomingItemReduction(100, { element: '화속성' }, s), 80, 'D: 일치 속성(화속성) 100*(1-0.2)=80');
  assert.strictEqual(applyIncomingItemReduction(100, { element: '수속성' }, s), 100, 'D: 불일치 속성(수속성)은 미적용, 100 그대로');
  console.log('OK - DEF D: 속성 일치만 감소, 불일치는 변화 없음');
}

// ── E. metadata 없음(공격자 종족/속성 정보 자체가 없음) → 조건부 감소 0 ──
{
  const s = statsWith({ __race: { raceDmgReduce: { '인간형': 30 } }, __elem: { elemReduce: { '화속성': 20 } } });
  assert.strictEqual(applyIncomingItemReduction(100, {}, s), 100, 'E: attackerRace/element 자체가 없으면(undefined) 조건부 감소 전혀 적용 안 됨');
  console.log('OK - DEF E: race/element metadata 없음 → 조건부 감소 미적용');
}

// ── F. 복합: 전체 10% + 종족 30% + 속성 20%, 순차 곱연산(중첩 규칙) ──
{
  const s = statsWith({
    __dmgall: { dmgReduceAll: 10 },
    __race: { raceDmgReduce: { '인간형': 30 } },
    __elem: { elemReduce: { '화속성': 20 } },
  });
  const expected = 100 * (1 - 10 / 100) * (1 - 30 / 100) * (1 - 20 / 100);
  const actual = applyIncomingItemReduction(100, { attackerRace: '인간형', element: '화속성' }, s);
  assert.strictEqual(actual, expected, 'F: 순차 곱연산 결과와 정확히 일치(합산 후 1회 적용 아님)');
  console.log(`OK - DEF F: 복합(전체+종족+속성) 순차 곱연산 = ${actual}`);
}

// ── G. 장착/해제/재장착 ──
{
  const DB = makeDB({ '__dmgall 카드': { type: '카드', dmgReduceAll: 10 } });
  const sEquipped = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__dmgall>') });
  assert.strictEqual(applyIncomingItemReduction(100, {}, sEquipped), 90, 'G: 장착 시 감소 적용');
  const sUnequipped = runCalcStats(DB, { player: makePlayer('테스트무기') });
  assert.strictEqual(applyIncomingItemReduction(100, {}, sUnequipped), 100, 'G: 해제 후 원상복구');
  const sReequipped = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__dmgall>') });
  assert.strictEqual(applyIncomingItemReduction(100, {}, sReequipped), 90, 'G: 재장착 시 정확히 한 번만 감소(중복 없음)');
  console.log('OK - DEF G: 장착/해제/재장착 정확히 동작');
}

// ══════════════════════════════════════════════
// 상태 면역
// ══════════════════════════════════════════════

// ── A. 면역 없음 → 기존과 동일하게 판정 false(상태 적용 진행) ──
{
  const s = statsWith({});
  assert.strictEqual(isStatusImmune('freeze', s), false, 'A: 면역 카드 없으면 면역 아님');
  console.log('OK - IMM A: 면역 없음 → 상태 적용 진행');
}

// ── B. 해당 면역 ──
{
  const s = statsWith({ __immune: { immune: ['freeze'] } });
  assert.deepStrictEqual(s.cardImmune, ['freeze'], 'B: cardImmune 배열 그대로 반영');
  assert.strictEqual(isStatusImmune('freeze', s), true, 'B: freeze 면역 카드 있으면 freeze는 면역');
  console.log('OK - IMM B: 해당 상태 면역 확인');
}

// ── C. 다른 상태는 면역 아님 ──
{
  const s = statsWith({ __immune: { immune: ['freeze'] } });
  assert.strictEqual(isStatusImmune('stun', s), false, 'C: freeze만 면역이면 stun은 정상 적용 대상');
  console.log('OK - IMM C: 면역 목록에 없는 다른 상태는 정상 적용 대상');
}

// ── D. 장착 해제 후 동일 상태 정상 적용 ──
{
  const DB = makeDB({ '__immune 카드': { type: '카드', immune: ['freeze'] } });
  const sEquipped = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__immune>') });
  assert.strictEqual(isStatusImmune('freeze', sEquipped), true, 'D: 장착 중엔 면역');
  const sUnequipped = runCalcStats(DB, { player: makePlayer('테스트무기') });
  assert.strictEqual(isStatusImmune('freeze', sUnequipped), false, 'D: 해제 후엔 면역 아님(정상 적용 대상)');
  console.log('OK - IMM D: 장착 해제 후 면역 해제 확인');
}

// ── E. _pendingVerification 면역 데이터는 실행 0(파이프라인에 아예 들어가지 않음) ──
{
  const DB = makeDB({ '__pendingimmune 카드': { type: '카드', immune: ['freeze'], _pendingVerification: true } });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__pendingimmune>') });
  assert.strictEqual(s.cardImmune, null, 'E: pending 카드의 immune은 cardImmune에 전혀 반영되지 않음(calcStats 기본값 null 그대로)');
  assert.strictEqual(isStatusImmune('freeze', s), false, 'E: pending 면역은 실제 면역 판정에 영향 0');
  console.log('OK - IMM E: _pendingVerification 면역 데이터는 완전히 비활성');
}

// ── F. isStatusImmune 호출부는 적대적(m.inflict) 경로 1곳뿐 — 자기 버프는 영향받지 않음 ──
{
  const callSites = html.match(/isStatusImmune\(/g) || [];
  assert.strictEqual(callSites.length, 1, 'F: isStatusImmune 호출부는 template.html에 정확히 1곳(m.inflict)뿐');
  const idx = html.indexOf('isStatusImmune(');
  const nearby = html.slice(Math.max(0, idx - 200), idx + 50);
  assert.ok(nearby.includes('m.inflict'), 'F: 그 1곳은 m.inflict(적→플레이어 상태이상) 처리 블록 내부여야 함');
  console.log('OK - IMM F: isStatusImmune은 적대적 상태이상 경로에만 연결, 자기 버프 경로는 무관');
}

console.log('ALL TESTS PASS - item-effect-defense-smoke');
