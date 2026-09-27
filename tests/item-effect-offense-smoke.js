'use strict';
// P0-C5 회귀 테스트 — 평타(정상 공격)가 이미 소비 중이던 raceAtk/elemAtk/sizeAtk/bossAtk/
// atkPct/defIgnore가 item-effects.js의 헬퍼로 옮겨진 뒤에도 정확히 같은 데미지를 내는지,
// 그리고 magicRaceAtk/skillDmg/doubleAtkCard가 의도적으로 보류(집계는 되지만 게임 결과에
// 영향 0)되어 있는지 검증한다. source/template.html의 실제 평타 공식(processTurn()에서
// 텍스트 그대로 추출)과 실제 collectItemEffects()/calcStats()를 그대로 실행한다(재구현 아님).
const assert = require('assert');
const {
  html, runCalcStats, runNormalAttackFormula, makePlayer, makeDB,
} = require('./_item-effect-harness');

// 명중/크리 굴림을 고정해 매 호출 항상 '명중, 크리 아님'이 되게 한다.
const HIT_NO_CRIT = () => {
  let n = 0;
  return () => (n++ === 0 ? 0.01 : 0.99); // 1st call = hit roll(낮게, 명중), 2nd = crit roll(높게, 크리 아님)
};

function baseTarget(overrides) {
  return Object.assign({
    race: null, element: '무속성', size: '중형', isMvp: false,
    softDef: 0, def: 0, lv: 1, flee: 0, currentHp: 1000,
  }, overrides || {});
}

function statsWithCard(cardFields) {
  const DB = makeDB(cardFields ? { '__off 카드': Object.assign({ type: '카드' }, cardFields) } : {});
  const equip = cardFields ? '테스트무기 [1] <__off>' : '테스트무기';
  const p = makePlayer(equip);
  const s = runCalcStats(DB, { player: p });
  return { s, p, DB };
}

// ══════════════════════════════════════════════
// 이미 작동 중이던 6개 필드 — 헬퍼 이관 후에도 동일 공식
// ══════════════════════════════════════════════

// ── 베이스라인: 효과 없음 ──
// rawAtk = floor((1+10) * 0.75(단검×중형) * 1(무속성 vs 무속성) * 1 * 1 * 1) = floor(8.25) = 8
{
  const { s, p, DB } = statsWithCard(null);
  const t = baseTarget({});
  const r = runNormalAttackFormula(p, t, s, {}, DB, HIT_NO_CRIT());
  assert.strictEqual(r.missed, false, '베이스라인: 명중 고정이므로 명중해야 함');
  assert.strictEqual(r.dmg, 8, '베이스라인: floor(11*0.75)=8');
  console.log('OK - OFF 베이스라인: 효과 없음 → 8');
}

// ── raceAtk: 종족 일치만 적용 ──
{
  const { s, p, DB } = statsWithCard({ raceAtk: { '인간형': 50 } });
  const tMatch = baseTarget({ race: '인간형' });
  const rMatch = runNormalAttackFormula(p, tMatch, s, {}, DB, HIT_NO_CRIT());
  // rawAtk = floor(11*0.75*1.5) = floor(12.375) = 12
  assert.strictEqual(rMatch.dmg, 12, 'raceAtk: 종족 일치 시 floor(11*0.75*1.5)=12');
  const tMiss = baseTarget({ race: '동물' });
  const rMiss = runNormalAttackFormula(p, tMiss, s, {}, DB, HIT_NO_CRIT());
  assert.strictEqual(rMiss.dmg, 8, 'raceAtk: 종족 불일치 시 베이스라인(8)과 동일');
  console.log('OK - OFF raceAtk: 종족 일치만 적용, 불일치는 변화 없음');
}

// ── elemAtk: 속성 일치만 적용 ──
{
  const DB = makeDB({ '__off 카드': { type: '카드', elemAtk: { '화속성': 30 } } });
  const p = makePlayer('테스트무기 [1] <__off>');
  const s = runCalcStats(DB, { player: p });
  const tMatch = baseTarget({ element: '화속성' });
  const rMatch = runNormalAttackFormula(p, tMatch, s, {}, DB, HIT_NO_CRIT());
  // rawAtk = floor(11*0.75*1.3) = floor(10.725) = 10
  assert.strictEqual(rMatch.dmg, 10, 'elemAtk: 속성 일치 시 floor(11*0.75*1.3)=10');
  const tMiss = baseTarget({ element: '수속성' });
  const rMiss = runNormalAttackFormula(p, tMiss, s, {}, DB, HIT_NO_CRIT());
  assert.strictEqual(rMiss.dmg, 8, 'elemAtk: 속성 불일치 시 베이스라인(8)과 동일');
  console.log('OK - OFF elemAtk: 속성 일치만 적용, 불일치는 변화 없음');
}

// ── sizeAtk: 크기 일치만 적용 ──
{
  const DB = makeDB({ '__off 카드': { type: '카드', sizeAtk: { '대형': 20 } } });
  const p = makePlayer('테스트무기 [1] <__off>');
  const s = runCalcStats(DB, { player: p });
  const tMatch = baseTarget({ size: '대형' });
  const rMatch = runNormalAttackFormula(p, tMatch, s, {}, DB, HIT_NO_CRIT());
  // 단검 vs 대형 szP=0.5, rawAtk = floor(11*0.5*1.2) = floor(6.6) = 6
  assert.strictEqual(rMatch.dmg, 6, 'sizeAtk: 크기 일치 시 floor(11*0.5*1.2)=6');
  const tMiss = baseTarget({ size: '소형' });
  const rMiss = runNormalAttackFormula(p, tMiss, s, {}, DB, HIT_NO_CRIT());
  // 단검 vs 소형 szP=1.0, sizeAtk 미적용 -> rawAtk = floor(11*1.0*1)=11
  assert.strictEqual(rMiss.dmg, 11, 'sizeAtk: 크기 불일치 시 sizeAtk 미적용(순수 무기 크기페널티만)');
  console.log('OK - OFF sizeAtk: 크기 일치만 적용, 불일치는 미적용');
}

// ── bossAtk: t.isMvp일 때만 적용 ──
{
  const DB = makeDB({ '__off 카드': { type: '카드', bossAtk: 25 } });
  const p = makePlayer('테스트무기 [1] <__off>');
  const s = runCalcStats(DB, { player: p });
  const tBoss = baseTarget({ isMvp: true });
  const rBoss = runNormalAttackFormula(p, tBoss, s, {}, DB, HIT_NO_CRIT());
  // rawAtk = floor(11*0.75*1.25) = floor(10.3125) = 10
  assert.strictEqual(rBoss.dmg, 10, 'bossAtk: isMvp일 때 floor(11*0.75*1.25)=10');
  const tNormal = baseTarget({ isMvp: false });
  const rNormal = runNormalAttackFormula(p, tNormal, s, {}, DB, HIT_NO_CRIT());
  assert.strictEqual(rNormal.dmg, 8, 'bossAtk: isMvp 아니면 베이스라인(8)과 동일');
  console.log('OK - OFF bossAtk: t.isMvp일 때만 적용');
}

// ── atkPct ──
{
  const DB = makeDB({ '__off 카드': { type: '카드', atkPct: 20 } });
  const p = makePlayer('테스트무기 [1] <__off>');
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.cardAtkPct, 20, 'atkPct: cardAtkPct 그대로 반영');
  const t = baseTarget({});
  const r = runNormalAttackFormula(p, t, s, {}, DB, HIT_NO_CRIT());
  // rawAtk = floor(11*0.75*1.2) = floor(9.9) = 9
  assert.strictEqual(r.dmg, 9, 'atkPct: floor(11*0.75*1.2)=9');
  console.log('OK - OFF atkPct: floor(11*0.75*1.2)=9');
}

// ── defIgnore: soft/hard DEF 전부 무시(전무/전부, 부분 아님) ──
{
  const DB = makeDB({ '__off 카드': { type: '카드', defIgnore: true } });
  const p = makePlayer('테스트무기 [1] <__off>');
  const s = runCalcStats(DB, { player: p });
  const t = baseTarget({ softDef: 5, def: 50 });
  const r = runNormalAttackFormula(p, t, s, {}, DB, HIT_NO_CRIT());
  // ignore 없으면: rawAtk=8, tot=max(1,floor((8-5)*(1-0.5)))=max(1,1)=1
  // ignore 있으면: tot=max(1,floor((8-0)*(1-0)))=8
  assert.strictEqual(r.dmg, 8, 'defIgnore: soft/hard DEF 모두 0으로 무시 -> 8');
  const DB2 = makeDB({});
  const p2 = makePlayer('테스트무기');
  const s2 = runCalcStats(DB2, { player: p2 });
  const r2 = runNormalAttackFormula(p2, t, s2, {}, DB2, HIT_NO_CRIT());
  assert.strictEqual(r2.dmg, 1, 'defIgnore 없으면: max(1,floor((8-5)*0.5))=1 (기존 DEF 감산 그대로)');
  console.log('OK - OFF defIgnore: 무시 시 8, 미적용 시 기존 DEF 감산대로 1');
}

// ── 복합: race+elem+size+boss+atkPct+defIgnore 동시 적용 ──
{
  const DB = makeDB({
    '__off 카드': {
      type: '카드', raceAtk: { '인간형': 10 }, elemAtk: { '화속성': 10 },
      sizeAtk: { '중형': 10 }, bossAtk: 10, atkPct: 10, defIgnore: true,
    },
  });
  const p = makePlayer('테스트무기 [1] <__off>');
  const s = runCalcStats(DB, { player: p });
  const t = baseTarget({ race: '인간형', element: '화속성', size: '중형', isMvp: true, softDef: 100, def: 100 });
  const r = runNormalAttackFormula(p, t, s, {}, DB, HIT_NO_CRIT());
  // raceMul = 1 + 0.1+0.1+0.1+0.1 = 1.4, cardAtkMul = 1.1
  // rawAtk = floor(11*0.75*1.4*1.1) = floor(12.705) = 12, defIgnore -> tot=12
  assert.strictEqual(r.dmg, 12, '복합: floor(11*0.75*1.4*1.1)=12, defIgnore로 DEF 100 무시');
  console.log('OK - OFF 복합: 6개 필드 동시 적용 정확히 합산');
}

// ── pending: 루트-pending 카드의 공격 효과는 완전히 비활성 ──
{
  const DB = makeDB({ '__offpending 카드': { type: '카드', raceAtk: { '인간형': 90 }, atkPct: 90, _pendingVerification: true } });
  const p = makePlayer('테스트무기 [1] <__offpending>');
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.cardRaceAtk, null, 'pending: cardRaceAtk 전혀 반영 안 됨');
  assert.strictEqual(s.cardAtkPct, 0, 'pending: cardAtkPct 전혀 반영 안 됨');
  const t = baseTarget({ race: '인간형' });
  const r = runNormalAttackFormula(p, t, s, {}, DB, HIT_NO_CRIT());
  assert.strictEqual(r.dmg, 8, 'pending: 공격 효과 0 -> 베이스라인(8)과 동일');
  console.log('OK - OFF pending: 루트-pending 카드의 공격 효과 완전 비활성');
}

// ══════════════════════════════════════════════
// 보류된 3개 필드 — 집계는 되지만 게임 결과에 영향 0
// ══════════════════════════════════════════════

// ── magicRaceAtk/skillDmg/doubleAtkCard: 값은 수집되지만 평타 데미지에 영향 없음 ──
{
  const DB = makeDB({
    '__deferred 카드': {
      type: '카드',
      magicRaceAtk: { '인간형': 999 },
      skillDmg: { '배쉬': 999 },
      doubleAtk: 999,
    },
  });
  const p = makePlayer('테스트무기 [1] <__deferred>');
  const s = runCalcStats(DB, { player: p });
  // 값 자체는 정상 집계된다(미래 단계가 바로 쓸 수 있게)
  assert.deepStrictEqual(s.cardMagicRaceAtk, { '인간형': 999 }, '값은 정상 집계됨(magicRaceAtk)');
  assert.deepStrictEqual(s.cardSkillDmg, { '배쉬': 999 }, '값은 정상 집계됨(skillDmg)');
  assert.strictEqual(s.cardDoubleAtkCard, 999, '값은 정상 집계됨(doubleAtkCard)');
  // 하지만 평타 데미지에는 전혀 영향 없음(999라는 극단값을 넣어도 베이스라인과 동일해야 증명력 있음)
  const t = baseTarget({ race: '인간형' });
  const r = runNormalAttackFormula(p, t, s, {}, DB, HIT_NO_CRIT());
  assert.strictEqual(r.dmg, 8, '보류 필드는 극단값이어도 평타 데미지에 영향 0(베이스라인 8 그대로)');
  // 더블어택 확률 자체도 변하지 않는다(더블 어택 스킬 미보유이므로 기존처럼 0)
  assert.strictEqual(s.doubleAtkRate, 0, 'doubleAtkCard는 기존 doubleAtkRate(스킬 기반)에 전혀 합류하지 않음');
  console.log('OK - OFF 보류: magicRaceAtk/skillDmg/doubleAtkCard는 집계만 되고 게임 결과 영향 0');
}

// ── 정적 검사: 보류 필드가 unsupported[]에 명시적으로 표시되는지 ──
{
  const DB = makeDB({
    '__deferred2 카드': {
      type: '카드',
      magicRaceAtk: { '인간형': 1 },
      skillDmg: { '배쉬': 1 },
      doubleAtk: 1,
    },
  });
  // collectItemEffects를 직접 호출해 ledger/unsupported를 확인한다.
  const itemEffectsSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'source', 'item-effects.js'), 'utf8');
  const { makeParseItemFn } = require('./_item-effect-harness');
  const collectItemEffects = new Function(itemEffectsSrc + '\nreturn collectItemEffects;')();
  const parseItemFn = makeParseItemFn(DB);
  const p = makePlayer('테스트무기 [1] <__deferred2>');
  const fx = collectItemEffects(p, DB, parseItemFn);
  const labels = fx.unsupported.map(u => u.label).join(' | ');
  assert.ok(labels.includes('magicRaceAtk'), 'unsupported[]에 magicRaceAtk 보류 표시 존재');
  assert.ok(labels.includes('skillDmg'), 'unsupported[]에 skillDmg 보류 표시 존재');
  assert.ok(labels.includes('doubleAtkCard'), 'unsupported[]에 doubleAtkCard 보류 표시 존재');
  console.log('OK - OFF 정적검사: 보류 3개 필드가 ledger/unsupported[]에서 구분 가능함');
}

// ── 정적 검사: 새 공격 코드가 DB.items를 직접 재파싱하지 않음 ──
{
  const offenseHelperCallSites = (html.match(/applyOutgoingRaceElemSizeBossAtk\(|getOutgoingAtkPctMul\(|getOutgoingDefIgnore\(/g) || []);
  assert.strictEqual(offenseHelperCallSites.length, 3, '정적검사: 3개 헬퍼가 정확히 1곳씩(평타 블록)에서만 호출됨');
  console.log('OK - OFF 정적검사: 오펜스 헬퍼 호출부 정확히 3곳(평타 블록 1세트)');
}

console.log('ALL TESTS PASS - item-effect-offense-smoke');
