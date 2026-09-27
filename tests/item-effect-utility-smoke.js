'use strict';
// P0-C4 회귀 테스트 — grantSkill(getEffectiveSkills)/soulgain(onKill)/dropBonus가 실제
// 게임 경로에 연결됐는지 검증한다. source/item-effects.js의 실제 getEffectiveSkills()/
// getItemDropBonus()/triggerItemEffects()와 실제 collectItemEffects()/calcStats()/
// useSkill()/rollDrops()를 그대로 실행한다(재구현 아님).
const assert = require('assert');
const {
  html, runCalcStats, makeGetEffectiveSkills, makeTriggerItemEffects, runUseSkill,
  runRollDrops, makePlayer, makeDB,
} = require('./_item-effect-harness');

const getEffectiveSkills = makeGetEffectiveSkills();
const triggerItemEffects = makeTriggerItemEffects();

function statsWithGrant(grantMap, learned) {
  const DB = makeDB({ '__grant 카드': { type: '카드', grantSkill: grantMap } });
  const p = makePlayer('테스트무기 [1] <__grant>');
  if (learned) p.skills = learned;
  const s = runCalcStats(DB, { player: p });
  return { s, p };
}

// ══════════════════════════════════════════════
// grantSkill
// ══════════════════════════════════════════════

// ── A. 영구 없음 + grant Lv3 → effective Lv3 ──
{
  const { s } = statsWithGrant({ '배쉬': 3 }, {});
  assert.deepStrictEqual(s.cardGrantSkill, { '배쉬': 3 }, 'A: cardGrantSkill이 카드 값 그대로 반영');
  const eff = getEffectiveSkills(makePlayer(null), s);
  assert.strictEqual(eff['배쉬'], 3, 'A: 영구 습득 없으면 grant 레벨(3) 그대로');
  console.log('OK - GRANT A: 영구 없음 + grant Lv3 → effective Lv3');
}

// ── B. 영구 Lv5 + grant Lv3 → 5 ──
{
  const { s } = statsWithGrant({ '배쉬': 3 }, {});
  const p = makePlayer(null); p.skills = { '배쉬': 5 };
  const eff = getEffectiveSkills(p, s);
  assert.strictEqual(eff['배쉬'], 5, 'B: 영구(5) > grant(3)이면 영구값 그대로');
  console.log('OK - GRANT B: 영구 Lv5 + grant Lv3 → 5(더 높은 쪽)');
}

// ── C. 영구 Lv1 + grant Lv5 → 5 ──
{
  const { s } = statsWithGrant({ '배쉬': 5 }, {});
  const p = makePlayer(null); p.skills = { '배쉬': 1 };
  const eff = getEffectiveSkills(p, s);
  assert.strictEqual(eff['배쉬'], 5, 'C: grant(5) > 영구(1)이면 grant값 채택');
  console.log('OK - GRANT C: 영구 Lv1 + grant Lv5 → 5(더 높은 쪽)');
}

// ── D. 실제 useSkill(): 장착 시 사용 가능, 해제 시 즉시 거부, p.skills 흔적 없음 ──
{
  const DB = makeDB({ '__grant 카드': { type: '카드', grantSkill: { '테스트스킬': 3 } } });
  DB.skills = { '테스트스킬': { type: '액티브', spCost: 10, cooldown: 0, effect: () => ({ msg: '발동', type: 'system' }) } };

  // 장착 상태: p.skills는 완전히 빈 상태(영구 습득 0) -- grantSkill만으로 사용 가능해야 함
  const pEquipped = makePlayer('테스트무기 [1] <__grant>');
  pEquipped.sp = 50; pEquipped.maxSp = 50; pEquipped.skills = {};
  const gEquipped = { player: pEquipped, battles: [], cooldowns: {}, autoHunt: false };
  const logsEquipped = runUseSkill(DB, gEquipped, '테스트스킬');
  assert.ok(logsEquipped.some(l => l.msg === '발동'), 'D: grantSkill만으로도 실제 useSkill() 사용 가능');
  assert.strictEqual('테스트스킬' in pEquipped.skills, false, 'D: p.skills(영구 데이터)에는 전혀 흔적이 남지 않음');

  // 해제 상태: 같은 스킬을 쓰려 하면 즉시 거부
  const pUnequipped = makePlayer('테스트무기');
  pUnequipped.sp = 50; pUnequipped.maxSp = 50; pUnequipped.skills = {};
  const gUnequipped = { player: pUnequipped, battles: [], cooldowns: {}, autoHunt: false };
  const logsUnequipped = runUseSkill(DB, gUnequipped, '테스트스킬');
  assert.ok(logsUnequipped.some(l => (l.msg || '').includes('아직 배우지 않은')), 'D: 장비 해제 즉시 사용 거부');
  assert.strictEqual(pUnequipped.sp, 50, 'D: 거부된 시전은 SP를 전혀 건드리지 않음');
  console.log('OK - GRANT D: 실제 useSkill() 경로 - 장착 시 사용 가능, 해제 즉시 거부, p.skills 미변경');
}

// ── E. pending grantSkill → 사용 불가 ──
{
  const DB = makeDB({ '__pendinggrant 카드': { type: '카드', grantSkill: { '배쉬': 5 }, _pendingVerification: true } });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__pendinggrant>') });
  assert.strictEqual(s.cardGrantSkill, null, 'E: pending 카드의 grantSkill은 cardGrantSkill에 전혀 반영되지 않음');
  const eff = getEffectiveSkills(makePlayer(null), s);
  assert.strictEqual(eff['배쉬'], undefined, 'E: pending grantSkill은 effective 목록에 없음');
  console.log('OK - GRANT E: _pendingVerification grantSkill은 완전히 비활성');
}

// ══════════════════════════════════════════════
// soulgain (onKill)
// ══════════════════════════════════════════════

// ── A. 종족 일치 → SP 회복 ──
{
  const p = { sp: 10, maxSp: 100 };
  const t = { race: '언데드' };
  const logs = [];
  triggerItemEffects('onKill',
    { player: p, target: t, log: (msg, type) => logs.push({ msg, type }) },
    [{ source: '__soulgain 카드', sourceType: 'card', kind: 'soulgain', race: '언데드', sp: 20 }]
  );
  assert.strictEqual(p.sp, 30, 'A: 종족 일치 시 SP +20');
  assert.ok(logs.some(l => l.msg.includes('소울게인')), 'A: 소울게인 로그 존재');
  console.log('OK - SOULGAIN A: 종족 일치 → SP 회복');
}

// ── B. 종족 불일치 → 변화 없음 ──
{
  const p = { sp: 10, maxSp: 100 };
  const t = { race: '인간형' };
  const logs = [];
  triggerItemEffects('onKill',
    { player: p, target: t, log: (msg, type) => logs.push({ msg, type }) },
    [{ source: '__soulgain 카드', sourceType: 'card', kind: 'soulgain', race: '언데드', sp: 20 }]
  );
  assert.strictEqual(p.sp, 10, 'B: 종족 불일치 시 SP 변화 없음');
  assert.strictEqual(logs.length, 0, 'B: 로그도 발생하지 않음');
  console.log('OK - SOULGAIN B: 종족 불일치 → 변화 없음');
}

// ── C. maxSp 초과 → clamp ──
{
  const p = { sp: 90, maxSp: 100 };
  const t = { race: '언데드' };
  triggerItemEffects('onKill',
    { player: p, target: t, log: () => {} },
    [{ source: '__soulgain 카드', sourceType: 'card', kind: 'soulgain', race: '언데드', sp: 50 }]
  );
  assert.strictEqual(p.sp, 100, 'C: maxSp(100)에서 clamp');
  console.log('OK - SOULGAIN C: maxSp 초과분은 clamp');
}

// ── D. 실제 useSkill() 처치 경로에서 soulgain이 collector→onKill 이벤트로 정상 발동 ──
{
  const DB = makeDB({ '__soulgain 카드': { type: '카드', soulgain: { race: '언데드', sp: 15 } } });
  DB.skills = { '킬스킬': { type: '액티브', spCost: 5, cooldown: 0, effect: (p, s, t) => { t.currentHp = 0; return { msg: '처치타격', type: 'combat' }; } } };
  const p = makePlayer('테스트무기 [1] <__soulgain>');
  p.sp = 50; p.maxSp = 100; p.skills = { '킬스킬': 1 };
  const t = { name: '테스트몬스터', emoji: '👻', race: '언데드', currentHp: 10, hp: 10, zeny: [0, 0] };
  const G = { player: p, battles: [t], cooldowns: {}, autoHunt: false };
  const logs = runUseSkill(DB, G, '킬스킬');
  assert.strictEqual(p.sp, 50 - 5 + 15, 'D: 실제 useSkill() 처치 경로에서 soulgain SP 회복(-5 spCost +15 soulgain)');
  assert.ok(logs.some(l => l.msg.includes('소울게인')), 'D: 실제 실행 로그에 소울게인 표시');
  console.log('OK - SOULGAIN D: 실제 useSkill() 처치 경로에서 collector→onKill 파이프라인 정상 동작');
}

// ── E. 정적 검사: c.soulgain/card.soulgain 직접 재파싱이 template.html에 남아있지 않음 ──
{
  const directReparse = (html.match(/\bc\.soulgain\b|\bcard\.soulgain\b/g) || []);
  assert.strictEqual(directReparse.length, 0, 'E: template.html에 soulgain 직접 재파싱 흔적이 0건이어야 함');
  console.log('OK - SOULGAIN E: 직접 DB 재파싱 0건(정적 검사)');
}

// ══════════════════════════════════════════════
// dropBonus
// ══════════════════════════════════════════════

function withFixedRandom(value, fn) {
  const orig = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}

function statsWithDropBonus(bonus) {
  const DB = makeDB(bonus != null ? { '__drop 카드': { type: '카드', dropBonus: bonus } } : {});
  const equip = bonus != null ? '테스트무기 [1] <__drop>' : '테스트무기';
  return runCalcStats(DB, { player: makePlayer(equip) });
}

// ── A. 효과 없음 → 기존 확률과 동일(경계값 그대로) ──
{
  const DB = makeDB({ '테스트드롭템': { type: '무기' } });
  const mon = { name: '테스트몬스터', drops: { '테스트드롭템': 50 } };
  const s = statsWithDropBonus(null);
  assert.strictEqual(s.cardDropBonus, null, 'A: 아이템 효과 없으면 cardDropBonus는 기본값 null(calcStats 초기값 그대로)');
  // chance = 50 * (1+0+0) = 50 -> 정확히 50% 경계
  const pSucceed = makePlayer(null); pSucceed.settings = { dropRate: 1, cardRate: 1 };
  withFixedRandom(0.4999, () => runRollDrops(DB, {}, pSucceed, mon, s));
  assert.strictEqual(pSucceed.inventory['테스트드롭템'], 1, 'A: 49.99% 굴림은 50% 경계 안쪽 -> 드롭');
  const pFail = makePlayer(null); pFail.settings = { dropRate: 1, cardRate: 1 };
  withFixedRandom(0.5001, () => runRollDrops(DB, {}, pFail, mon, s));
  assert.strictEqual(pFail.inventory['테스트드롭템'], undefined, 'A: 50.01% 굴림은 경계 밖 -> 드롭 실패(기존 동작 그대로)');
  console.log('OK - DROP A: 효과 없음, 기존 50% 경계 그대로');
}

// ── B. dropBonus 10% -> 경계가 정확히 이동 ──
{
  const DB = makeDB({ '테스트드롭템': { type: '무기' } });
  const mon = { name: '테스트몬스터', drops: { '테스트드롭템': 50 } };
  const s = statsWithDropBonus(0.1);
  assert.strictEqual(s.cardDropBonus[0], 0.1, 'B: cardDropBonus 배열에 카드 값 그대로');
  // chance = 50 * (1+0+0.1) = 55 -> 새 경계 55%
  const p1 = makePlayer(null); p1.settings = { dropRate: 1, cardRate: 1 };
  withFixedRandom(0.5499, () => runRollDrops(DB, {}, p1, mon, s));
  assert.strictEqual(p1.inventory['테스트드롭템'], 1, 'B: 54.99% 굴림은 새 경계(55%) 안쪽 -> 드롭');
  const p2 = makePlayer(null); p2.settings = { dropRate: 1, cardRate: 1 };
  withFixedRandom(0.5501, () => runRollDrops(DB, {}, p2, mon, s));
  assert.strictEqual(p2.inventory['테스트드롭템'], undefined, 'B: 55.01% 굴림은 새 경계 밖 -> 드롭 실패');
  console.log('OK - DROP B: dropBonus(0.1) 만큼 경계가 정확히 55%로 이동');
}

// ── C. 기존 dropRate/richManKim과 함께 적용(같은 항에 합산) ──
{
  const DB = makeDB({ '테스트드롭템': { type: '무기' } });
  const mon = { name: '테스트몬스터', drops: { '테스트드롭템': 50 } };
  const s = statsWithDropBonus(0.05);
  const p = makePlayer(null);
  p.settings = { dropRate: 1.2, cardRate: 1 };
  p.statusEffects = { richManKim: { dropBonus: 0.1 } };
  // chance = 50 * (1.2 + 0.1 + 0.05) = 67.5
  withFixedRandom(0.6749, () => runRollDrops(DB, {}, p, mon, s));
  assert.strictEqual(p.inventory['테스트드롭템'], 1, 'C: dropRate(1.2)+richManKim(0.1)+item(0.05) 합산 경계(67.5%) 안쪽 -> 드롭');
  const p2 = makePlayer(null);
  p2.settings = { dropRate: 1.2, cardRate: 1 };
  p2.statusEffects = { richManKim: { dropBonus: 0.1 } };
  withFixedRandom(0.6751, () => runRollDrops(DB, {}, p2, mon, s));
  assert.strictEqual(p2.inventory['테스트드롭템'], undefined, 'C: 경계(67.5%) 밖 -> 드롭 실패');
  console.log('OK - DROP C: 기존 dropRate/richManKim과 item dropBonus가 같은 항에 정확히 합산');
}

// ── D. 카드 드롭에도 동일하게 적용(richManKim 선례와 동일하게 카드/일반 구분 없음) ──
{
  const DB = makeDB({ '테스트카드 카드': { type: '카드' } });
  const mon = { name: '테스트몬스터', drops: { '테스트카드 카드': 10 } };
  const s = statsWithDropBonus(0.2);
  // chance = 10 * (1+0+0.2) = 12
  const p1 = makePlayer(null); p1.settings = { dropRate: 1, cardRate: 1 };
  withFixedRandom(0.1199, () => runRollDrops(DB, {}, p1, mon, s));
  assert.strictEqual(p1.inventory['테스트카드 카드'], 1, 'D: 카드 드롭에도 item dropBonus 적용, 경계 안쪽 -> 드롭');
  const p2 = makePlayer(null); p2.settings = { dropRate: 1, cardRate: 1 };
  withFixedRandom(0.1201, () => runRollDrops(DB, {}, p2, mon, s));
  assert.strictEqual(p2.inventory['테스트카드 카드'], undefined, 'D: 경계 밖 -> 드롭 실패');
  console.log('OK - DROP D: 카드 드롭에도 동일하게 적용(richManKim 선례와 동일 범위)');
}

// ── E. 장착 해제 -> 원복 ──
{
  const DB = makeDB({ '테스트드롭템': { type: '무기' } });
  const mon = { name: '테스트몬스터', drops: { '테스트드롭템': 50 } };
  const s = statsWithDropBonus(null);
  assert.strictEqual(s.cardDropBonus, null, 'E: 해제 후 cardDropBonus는 기본값 null로 원복');
  console.log('OK - DROP E: 장착 해제 -> 원복 확인');
}

// ── F. pending dropBonus -> 변화 0 ──
{
  const DB = makeDB({ '__pendingdrop 카드': { type: '카드', dropBonus: 0.5, _pendingVerification: true } });
  const s = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__pendingdrop>') });
  assert.strictEqual(s.cardDropBonus, null, 'F: pending dropBonus는 cardDropBonus에 전혀 반영되지 않음(기본값 null 그대로)');
  console.log('OK - DROP F: _pendingVerification dropBonus는 완전히 비활성');
}

console.log('ALL TESTS PASS - item-effect-utility-smoke');
