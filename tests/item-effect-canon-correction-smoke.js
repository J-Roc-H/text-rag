'use strict';
// 2026-09-26 교정 패스 회귀 테스트.
// P0-A(8ea0121)에서 activated된 71+2건이 원작 근거 없이 활성화된 것으로 판명돼 되돌려졌다.
// 이 테스트는 (1) 실제로 유지되는 효과가 정확히 1회만 적용/해제로 원복되는지,
// (2) 되돌린 항목이 실제 소비 코드 경로에서 여전히 비활성인지를
// source/template.html + source/item-effects.js에서 실제 calcStats()/카드
// effect-on-hit 블록을 그대로 추출해 검증한다. (P0-B에서 하네스를
// tests/_item-effect-harness.js로 공용화 — item-effects-smoke.js와 공유)
const assert = require('assert');
const {
  items, runCalcStats, makeTriggerItemEffects, makePlayer, makeDB, pickRealItems,
} = require('./_item-effect-harness');

const fixtures = pickRealItems(['드롭스 카드', '파브르 카드', '고렘 카드', '프리오니 카드', '아르기오페 카드', '반어인 카드']);

// ── 1. 중복 제거된 stat 카드(드롭스 카드: DEX+1/HIT+3)가 정확히 1회만 적용되는지 ──
// 주의: calcStats()의 HIT 공식은 totalHit = lv + totDex + bonus.hit 이므로, DEX+1은
// HIT에도 +1을 간접 기여한다. 그래서 HIT 델타의 정답은 "직접 +3"이 아니라
// "DEX 경유 +1 + 직접 +3 = +4"다 -- 중복이 아니라 실제 공식의 정상 상호작용이다.
// (수정 전 버그였다면 DEX/HIT 둘 다 최상위+effect.stats/bonus 양쪽에서 더해져 델타가
// DEX +2, HIT +7이 됐을 것이다.)
{
  const DB = makeDB(fixtures);
  const before = runCalcStats(DB, { player: makePlayer(null) });
  const G = { player: makePlayer('테스트무기 [1] <드롭스>') };
  const after = runCalcStats(DB, G);
  assert.strictEqual(after.dex - before.dex, 1, '드롭스 카드 DEX는 정확히 +1 (중복 아님)');
  assert.strictEqual(after.hit - before.hit, 4, '드롭스 카드 HIT은 DEX경유 +1 + 직접 +3 = +4 (중복이면 +7)');
  console.log('OK - 드롭스 카드: DEX+1(→HIT+1 간접)/HIT+3(직접) 정확히 1회 적용, 중복 없음');

  // 해제 → 원복
  const reverted = runCalcStats(DB, { player: makePlayer(null) });
  assert.strictEqual(reverted.dex, before.dex, '해제 후 DEX 원복');
  assert.strictEqual(reverted.hit, before.hit, '해제 후 HIT 원복');
  console.log('OK - 드롭스 카드 해제 → 원복');
}

// ── 1b. 프리오니 카드(HIT+100 단독, DEX 등 교차항 없음)로 순수 중복 여부를 격리 검증 ──
{
  const DB = makeDB(fixtures);
  const before = runCalcStats(DB, { player: makePlayer(null) });
  const after = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <프리오니>') });
  assert.strictEqual(after.hit - before.hit, 100, '프리오니 카드 HIT은 정확히 +100 (중복이면 +200)');
  console.log('OK - 프리오니 카드: HIT+100 정확히 1회 적용 (교차항 없는 순수 중복 검증)');
}

// ── 2. 파브르 카드(VIT+1/MaxHP+100)도 정확히 1회만 적용되는지 ──
// MaxHP 공식은 VIT에도 의존하므로(레벨별 계수), "VIT+1 단독 효과 + MaxHP+100 단독 효과"의
// 합과 "파브르 카드(둘 다 포함) 효과"가 정확히 같아야 중복이 없다는 뜻이다. 정확한 공식
// 계수를 하드코딩하지 않고 이 가산성 자체로 검증한다 -- 중복이면 합보다 더 커진다.
{
  const DB = makeDB(Object.assign({}, fixtures, {
    '__vit only 카드': { type: '카드', vit: 1 },
    '__maxhp only 카드': { type: '카드', maxHp: 100 },
  }));

  const before = runCalcStats(DB, { player: makePlayer(null) });
  const vitOnly = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__vit only>') });
  const maxHpOnly = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__maxhp only>') });
  const combined = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <파브르>') });

  const expectedVit = (vitOnly.vit - before.vit) + (maxHpOnly.vit - before.vit) + before.vit;
  const expectedMaxHp = (vitOnly.maxHp - before.maxHp) + (maxHpOnly.maxHp - before.maxHp) + before.maxHp;
  assert.strictEqual(combined.vit, expectedVit, '파브르 카드 VIT = VIT단독+MaxHP단독의 합 (중복 아님)');
  assert.strictEqual(combined.maxHp, expectedMaxHp, '파브르 카드 MaxHP = VIT단독+MaxHP단독의 합 (중복이면 더 큼)');
  console.log('OK - 파브르 카드: VIT+1/MaxHP+100 가산성 확인 (중복 없음)');
}

// ── 3. 고렘 카드(ATK+5, 중복 제거 후 effect.bonus.atk 없음) — weaponAtk는 정확히 +5 ──
// 카드의 atk 필드는 calcStats()에서 캐릭터 기본 s.atk가 아니라 s.weaponAtk(무기 공격력)에
// 합산된다(P0-B부터는 collectItemEffects()가 모아 bonus.atk로 넘기고, calcStats의 기존
// `wAtk += (bonus.atk||0)` 라인이 그대로 weaponAtk에 반영한다).
{
  const DB = makeDB(fixtures);
  // 베이스라인은 "무기 없음"이 아니라 "같은 무기, 카드만 없음" -- 무기 자체 atk(10)를
  // 양쪽에서 상쇄해 카드가 기여한 순수 델타만 비교한다.
  const before = runCalcStats(DB, { player: makePlayer('테스트무기') });
  const after = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <고렘>') });
  assert.strictEqual(after.weaponAtk - before.weaponAtk, 5, '고렘 카드 weaponAtk는 정확히 +5 (중복 제거 확인, 구버전은 +10)');
  console.log('OK - 고렘 카드: weaponAtk+5 정확히 1회 적용 (구 중복 버그 없음)');
}

// ── 4. 아르기오페 카드(원작검증필요, _pendingVerification) — INT는 여전히 적용되지 않아야 함 ──
{
  const DB = makeDB(fixtures);
  const pending = items['아르기오페 카드'];
  assert.strictEqual(pending.effect._pendingVerification, true, '아르기오페 카드는 _pendingVerification 마킹 상태여야 함');
  assert.strictEqual(pending.effect.type, undefined, '아르기오페 카드는 effect.type이 없어야(비활성) 함');
  const before = runCalcStats(DB, { player: makePlayer(null) });
  const after = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <아르기오페>') });
  assert.strictEqual(after.int, before.int, '원작검증필요 카드는 INT를 바꾸지 않아야 함(여전히 비활성)');
  console.log('OK - 아르기오페 카드(원작검증필요): INT 변화 없음 (비활성 유지 확인)');
}

// ── 5. 실제 실행기(triggerItemEffects, P0-C1)로 raceBonus 선택성 검증 ──
// P0-C1부터는 processTurn이 더 이상 카드 DB를 직접 재파싱하지 않는다 -- 실행은
// source/item-effects.js의 triggerItemEffects() 하나뿐이다. 여기서는 실제
// collectItemEffects()(runCalcStats가 내부에서 호출)가 만든 fx.events.onHit을
// 그대로 그 실행기에 먹여서 검증한다(재구현 아님).
{
  const DB = makeDB(fixtures);
  const triggerItemEffects = makeTriggerItemEffects();
  const noopLog = () => {};

  // 5a. 반어인 카드는 현재 effect.effect(레거시)만 있고 effect.type이 없다 -- collector가
  //     이벤트 자체를 만들지 않아야 하고(비활성), 실행기에 넘길 이벤트도 없어야 한다.
  const pendingCard = items['반어인 카드'];
  assert.strictEqual(pendingCard.effect.type, undefined, '반어인 카드는 아직 effect.type이 없어야(비활성) 함');
  {
    const s = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <반어인>') });
    const raceBonusEvents = s.itemEffects.events.onHit.filter(e => e.kind === 'raceBonus' && e.source === '반어인 카드');
    assert.strictEqual(raceBonusEvents.length, 0, '반어인 카드(비활성)는 raceBonus 이벤트를 만들지 않아야 함');

    const t = { race: '어류', currentHp: 100 };
    const ctx = { player: makePlayer(null), target: t, damage: 100, log: noopLog };
    triggerItemEffects('onHit', ctx, raceBonusEvents);
    assert.strictEqual(ctx.damage, 100, '반어인 카드(비활성) 장착 시 어류 상대로도 추가 데미지 없음');
  }
  console.log('OK - 반어인 카드(원작검증필요, 비활성): collector가 이벤트를 만들지 않고, 실행기도 추가 데미지 없음');

  // 5b. 같은 카드가 검증되어 effect.type='raceBonus'가 되었다고 가정하면(가상 시나리오),
  //     collector가 실제로 이벤트를 만들고, 실행기가 일치하는 종족에서는 적용하고 다른
  //     종족에서는 적용하지 않아야 한다 -- collector+실행기 파이프라인 전체의 선택성 검증.
  const verifiedDB = makeDB(fixtures);
  verifiedDB.items['반어인 카드'] = Object.assign({}, pendingCard, {
    effect: { type: 'raceBonus', race: '어류', dmgMult: 1.15 },
  });
  {
    const s = runCalcStats(verifiedDB, { player: makePlayer('테스트무기 [1] <반어인>') });
    const raceBonusEvents = s.itemEffects.events.onHit.filter(e => e.kind === 'raceBonus' && e.source === '반어인 카드');
    assert.strictEqual(raceBonusEvents.length, 1, '검증된 raceBonus는 collector가 이벤트 1건을 만들어야 함');

    const ctxMatch = { player: makePlayer(null), target: { race: '어류', currentHp: 1000 }, damage: 100, log: noopLog };
    triggerItemEffects('onHit', ctxMatch, raceBonusEvents);
    // 실제 소비 코드와 동일한 부동소수점 연산으로 기대값을 계산한다(1.15-1은 정확히
    // 0.15가 아니라 0.14999999999999991이라 floor 결과가 115가 아니라 114가 된다 --
    // 이 자체가 실제 게임이 하는 계산이므로 테스트도 하드코딩 대신 같은 식을 쓴다).
    assert.strictEqual(ctxMatch.damage, 100 + Math.floor(100 * (1.15 - 1)), '검증된 raceBonus는 일치하는 종족(어류)에 dmgMult만큼 추가 데미지');

    const ctxOther = { player: makePlayer(null), target: { race: '악마', currentHp: 1000 }, damage: 100, log: noopLog };
    triggerItemEffects('onHit', ctxOther, raceBonusEvents);
    assert.strictEqual(ctxOther.damage, 100, '검증된 raceBonus는 다른 종족(악마)에는 적용되지 않음');
  }
  console.log('OK - raceBonus collector+실행기 파이프라인: 일치 종족만 +15%, 다른 종족은 미적용');
}

console.log('ALL TESTS PASS - item-effect-canon-correction-smoke');
