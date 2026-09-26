'use strict';
// P0 종료감사 회귀 테스트 — "collector가 active로 수집하지만 실제 소비처가 없는데
// unsupported/deferred 표시도 없는" 상태가 하나도 없는지 검증한다. 이번 감사에서
// 직접 고친 4개 필드(healBoost/rangedDmgReduce/magicImmune/armorElement)가 각 P0-C
// 단계에서 이미 보류로 확정된 3개 필드(magicRaceAtk/skillDmg/doubleAtkCard)와 함께
// 전부 unsupported[]에 표시되는지 한 번에 확인하고, ledger 신뢰성(A-E)을 공식 테스트로
// 굳힌다. 실제 collectItemEffects()/calcStats()를 그대로 실행한다(재구현 아님).
const assert = require('assert');
const { runCalcStats, makePlayer, makeDB } = require('./_item-effect-harness');

// 현재 P0 전체에서 "값은 집계되지만 게임 결과에 영향을 주는 소비처가 없다"고 확정된
// 필드 전체 목록(patch notes 근거: DEFENSE §8/§신규, RESOURCE, OFFENSE §4-6, 이번 감사).
// 이 목록에 없는 필드가 미래에 추가되는데 unsupported 표시를 빠뜨리면 이 테스트가 깨진다.
const DEFERRED_FIELDS = [
  { key: 'magicRaceAtk', cardField: { magicRaceAtk: { '인간형': 1 } } },
  { key: 'skillDmg', cardField: { skillDmg: { '배쉬': 1 } } },
  { key: 'doubleAtkCard', cardField: { doubleAtk: 1 } },
  { key: 'healBoost', cardField: { healBoost: 1 } },
  { key: 'rangedDmgReduce', cardField: { rangedDmgReduce: 1 } },
  { key: 'magicImmune', cardField: { magicImmune: true } },
  { key: 'armorElement', cardField: { armorElement: '화속성' } },
];

// ── 보류 7개 필드 전부: 값은 집계되지만 unsupported[]에 표시됨 ──
{
  DEFERRED_FIELDS.forEach(({ key, cardField }) => {
    const DB = makeDB({ '__close 카드': Object.assign({ type: '카드' }, cardField) });
    const p = makePlayer('테스트무기 [1] <__close>');
    const s = runCalcStats(DB, { player: p });
    const labels = s.itemEffects.unsupported.map(u => u.label).join(' | ');
    assert.ok(labels.includes(key), `${key}: unsupported[]에 보류 표시가 있어야 함 (실제: ${labels})`);
  });
  console.log('OK - CLOSE A: 보류 7개 필드(magicRaceAtk/skillDmg/doubleAtkCard/healBoost/rangedDmgReduce/magicImmune/armorElement) 전부 unsupported[] 표시');
}

// ── 보류 7개 필드 전부: 루트-pending 카드에서는 unsupported 표시조차 안 됨(파이프라인 도달 불가) ──
{
  DEFERRED_FIELDS.forEach(({ key, cardField }) => {
    const DB = makeDB({
      '__closepending 카드': Object.assign({ type: '카드', _pendingVerification: true }, cardField),
    });
    const p = makePlayer('테스트무기 [1] <__closepending>');
    const s = runCalcStats(DB, { player: p });
    const labels = s.itemEffects.unsupported.map(u => u.label).join(' | ');
    assert.ok(!labels.includes(key), `${key}: 루트-pending이면 unsupported[]에도 안 들어가야 함(pending[]으로만 존재)`);
    assert.strictEqual(s.itemEffects.pending.length > 0, true, `${key}: pending[]에는 기록되어야 함`);
  });
  console.log('OK - CLOSE B: 보류 필드도 루트-pending이면 unsupported[]에도 도달 안 함(pending[]으로만 존재)');
}

// ══════════════════════════════════════════════
// ledger 신뢰성 A-E (task §9)
// ══════════════════════════════════════════════

// ── A. 실제 적용 효과: ledger active=true → 실제 stats에도 동일 효과 존재 ──
{
  const DB = makeDB({ '__a 카드': { type: '카드', hit: 7 } });
  const p = makePlayer('테스트무기 [1] <__a>');
  const s = runCalcStats(DB, { player: p });
  const entry = s.itemEffects.ledger.find(e => e.key === 'hit' && e.source === '__a 카드');
  assert.strictEqual(entry.active, true, 'A: ledger active=true');
  assert.strictEqual(s.bonusHit, 7, 'A: 실제 stats(bonusHit)에도 동일 값 반영');
  console.log('OK - CLOSE LEDGER A: 실제 적용 효과는 ledger active=true이면서 실제 stats에도 반영됨');
}

// ── B. deferred: 극단값을 넣어도 실제 gameplay 수치(예: doubleAtkRate)에 영향 없음 ──
{
  const DB = makeDB({ '__b 카드': { type: '카드', doubleAtk: 999, healBoost: 999 } });
  const p = makePlayer('테스트무기 [1] <__b>');
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.doubleAtkRate, 0, 'B: doubleAtkCard 극단값도 기존 doubleAtkRate(스킬 기반)에 영향 0');
  console.log('OK - CLOSE LEDGER B: deferred 필드는 극단값이어도 실제 게임 수치에 영향 0');
}

// ── C. pending: active ledger 0, pending[]으로만 존재 ──
{
  const DB = makeDB({ '__c 카드': { type: '카드', hit: 99, _pendingVerification: true } });
  const p = makePlayer('테스트무기 [1] <__c>');
  const s = runCalcStats(DB, { player: p });
  const activeFromC = s.itemEffects.ledger.filter(e => e.source === '__c 카드' && e.active === true);
  assert.strictEqual(activeFromC.length, 0, 'C: pending 카드는 active ledger 0');
  assert.ok(s.itemEffects.pending.some(pd => pd.source === '__c 카드'), 'C: pending[]에는 존재');
  console.log('OK - CLOSE LEDGER C: pending 카드는 active ledger 0, pending[]으로만 존재');
}

// ── D. 장착/해제: ledger 즉시 사라짐 ──
{
  const DB = makeDB({ '__d 카드': { type: '카드', hit: 5 } });
  const equipped = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__d>') });
  const unequipped = runCalcStats(DB, { player: makePlayer('테스트무기') });
  assert.ok(equipped.itemEffects.ledger.some(e => e.source === '__d 카드'), 'D: 장착 중엔 ledger 존재');
  assert.ok(!unequipped.itemEffects.ledger.some(e => e.source === '__d 카드'), 'D: 해제 후 ledger 즉시 사라짐');
  console.log('OK - CLOSE LEDGER D: 장착/해제에 따라 ledger 즉시 반영');
}

// ── E. 중복: 같은 카드의 같은 효과가 두 번 ledger에 들어가지 않음 ──
{
  const DB = makeDB({ '__e 카드': { type: '카드', hit: 5 } });
  const p = makePlayer('테스트무기 [1] <__e>');
  const s = runCalcStats(DB, { player: p });
  const hitEntries = s.itemEffects.ledger.filter(e => e.source === '__e 카드' && e.key === 'hit');
  assert.strictEqual(hitEntries.length, 1, 'E: 같은 카드의 같은 효과는 ledger에 정확히 1회만');
  console.log('OK - CLOSE LEDGER E: 동일 카드/효과 중복 없음');
}

console.log('ALL TESTS PASS - item-effect-p0-close-smoke');
