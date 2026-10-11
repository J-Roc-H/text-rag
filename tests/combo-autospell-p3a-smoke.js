'use strict';
// P3-A — combo event.autoSpell adapter 회귀 테스트(AutoSpell Skill Identity, 두 combo만).
// 실제 source/data/db-combos.json + source/combo-engine.js + source/item-effects.js의
// triggerItemEffects를 그대로 실행한다(재구현 아님). parser 쪽은 combo-autospell-p3a-test.py.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  runCalcStats, makeTriggerItemEffects, makeEquipmentCompareApi, makePlayer, makeDB, html,
} = require('./_item-effect-harness');

const combosData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'source', 'data', 'db-combos.json'), 'utf8'));
const byId = {};
combosData.combos.forEach(c => { byId[c.id] = c; });
const LB = byId['rathena-pre-0093-01'], FD = byId['rathena-pre-0096-01'];
const CARD = n => ({ type: '카드' });
const DBITEMS = {
  '아울 듀크 카드': CARD(), '아울 바론 카드': CARD(), '하티 베베 카드': CARD(), '하티 카드': CARD(),
  '테스트4슬롯검': { type: '무기', atk: 10, wType: '단검', weaponLv: 1, slots: 4 },
};
const DB = (combos) => makeDB(DBITEMS, combos);
const WEAPON = (cards) => '테스트4슬롯검 [4] <' + cards.join(', ') + '>';
const LB_CARDS = ['아울 듀크', '아울 바론'], FD_CARDS = ['하티 베베', '하티'];

function onHit(s) { return s.itemEffects.events.onHit; }
function comboLedger(s, id) {
  return s.itemEffects.ledger.filter(e => e.sourceType === 'combo' && e.sourceId === id && e.key === 'autoSpell');
}

// 데이터: 정확히 이 두 combo만 승격, 제외 대상은 여전히 verified 아님
{
  assert.strictEqual(LB.status, 'verified'); assert.strictEqual(FD.status, 'verified');
  assert.deepStrictEqual(LB.effects, [{ type: 'event', key: 'autoSpell', subKey: null, value: { skill: '라이트닝 볼트', lv: 5, rate: 0.02 }, reason: LB.effects[0].reason }]);
  assert.deepStrictEqual(FD.effects[0].value, { skill: '프로스트 다이버', lv: 3, rate: 0.25 });
  const m = combosData.meta.statusCounts;
  assert.deepStrictEqual([m.verified, m.unsupported, m['source-needed'], m['runtime-blocked']], [43, 49, 58, 6]);
  ['rathena-pre-0065-01', 'rathena-pre-0085-01', 'rathena-pre-0091-01', 'rathena-pre-0020-01'].forEach(id => {
    assert.notStrictEqual(byId[id].status, 'verified', id + ' 승격 금지');
  });
  const autos = combosData.combos.filter(c => c.effects.some(e => e.type === 'event' && e.key === 'autoSpell'));
  assert.deepStrictEqual(autos.map(c => c.id).sort(), ['rathena-pre-0093-01', 'rathena-pre-0096-01']);
  // 실제 DB.skills에 두 키가 존재(이름 유사 매핑이 아님)
  ['"라이트닝 볼트":{', '"프로스트 다이버":{'].forEach(k => assert.ok(html.indexOf(k) >= 0, 'DB.skills 키 없음: ' + k));
  console.log('OK - data: 두 combo만 verified, 제외 case 유지, 41→43/51→49');
}

// queue/ledger: 각 combo가 onHit 1건 + combo ledger 1건
{
  const s = runCalcStats(DB([LB, FD]), { player: makePlayer({ 무기: WEAPON(LB_CARDS) }) });
  assert.strictEqual(onHit(s).length, 1);
  assert.deepStrictEqual(onHit(s)[0], { source: LB.id, sourceId: LB.id, sourceType: 'combo', kind: 'autoSpell', skill: '라이트닝 볼트', lv: 5, rate: 0.02 });
  assert.strictEqual(comboLedger(s, LB.id).length, 1);
  assert.strictEqual(comboLedger(s, FD.id).length, 0);
  console.log('OK - queue/ledger: 정확히 1건');
}

// 비활성/인벤토리/한 장만 장착/카드 없음 → event 0
{
  const dbx = DB([LB, FD]);
  [makePlayer({ 무기: WEAPON(['아울 듀크']) }), makePlayer({ 무기: '테스트4슬롯검 [4]' })].forEach(p => {
    const s = runCalcStats(dbx, { player: p });
    assert.strictEqual(onHit(s).length, 0);
  });
  const inv = makePlayer({ 무기: WEAPON(['아울 듀크']) }); inv.inventory['아울 바론 카드'] = 1;
  assert.strictEqual(onHit(runCalcStats(dbx, { player: inv })).length, 0, '인벤토리 보유만으론 event 0');
  console.log('OK - inactive/loadout 차단');
}

// status가 verified 아니면 event 0
['unsupported', 'source-needed', 'runtime-blocked'].forEach(st => {
  const c = Object.assign({}, LB, { status: st });
  const s = runCalcStats(DB([c]), { player: makePlayer({ 무기: WEAPON(LB_CARDS) }) });
  assert.strictEqual(onHit(s).length, 0, st);
  assert.strictEqual(comboLedger(s, LB.id).length, 0, st);
});
console.log('OK - 비-verified combo는 event 0');

// multiplicity: 같은 카드 2장 요구 combo가 1장으로는 활성 안 됨은 P2-B1이 보장. 여기선 두 combo 동시 장착 → source order 별도 2건
{
  const s = runCalcStats(DB([LB, FD]), { player: makePlayer({ 무기: WEAPON(LB_CARDS.concat(FD_CARDS)) }) });
  assert.deepStrictEqual(onHit(s).map(e => e.sourceId), [LB.id, FD.id]);
  assert.strictEqual(comboLedger(s, LB.id).length + comboLedger(s, FD.id).length, 2);
  console.log('OK - 4-slot 무기에 두 combo 동시 → 별도 event 2건(source order)');
}

// 다른 event key(soulgain)는 여전히 drop
{
  const c = { id: 't-sg', status: 'verified', requiredItems: LB.requiredItems, effects: [{ type: 'event', key: 'soulgain', subKey: 'RC_Demon', value: 5 }], unsupportedEffects: [], conditionalRaw: [] };
  const s = runCalcStats(DB([c]), { player: makePlayer({ 무기: WEAPON(LB_CARDS) }) });
  assert.strictEqual(onHit(s).length, 0);
  assert.strictEqual(s.itemEffects.events.onKill.length, 0);
  console.log('OK - autoSpell 외 event는 켜지지 않음');
}

// runtime: 기존 P0 executor가 정확한 skill/lv로 1회 호출. strict random < rate
{
  const trigger = makeTriggerItemEffects();
  const s = runCalcStats(DB([LB, FD]), { player: makePlayer({ 무기: WEAPON(LB_CARDS.concat(FD_CARDS)) }) });
  function run(rands) {
    const calls = [];
    const mk = (name) => ({ effect(p, st, t, lv) { calls.push([name, lv]); return { msg: name + lv }; } });
    const seq = rands.slice();
    trigger('onHit', {
      player: {}, stats: {}, target: {}, log() {},
      DB: { skills: { '라이트닝 볼트': mk('LB'), '프로스트 다이버': mk('FD') } },
      random: () => seq.shift(),
    }, onHit(s));
    return calls;
  }
  assert.deepStrictEqual(run([0.0199999, 0.9]), [['LB', 5]]);
  assert.deepStrictEqual(run([0.02, 0.9]), [], '경계값 rate는 불발(strict <)');
  assert.deepStrictEqual(run([0.9, 0.2499999]), [['FD', 3]]);
  assert.deepStrictEqual(run([0.9, 0.25]), []);
  assert.deepStrictEqual(run([0.0, 0.0]), [['LB', 5], ['FD', 3]]);
  console.log('OK - runtime: 20→.02, 250→.25, strict <, 정확한 skill/lv');
}

// preview: candidate clone의 event row가 실제 장착 후 calcStats와 동일
{
  const dbx = DB([LB]);
  dbx.items['테스트4슬롯검 [4] <아울 듀크>'] = dbx.items['테스트4슬롯검'];
  const p = makePlayer({ 무기: WEAPON(['아울 듀크']) });
  const G = { player: p };
  const api = makeEquipmentCompareApi(dbx, G);
  const before = api.calcStats();
  assert.strictEqual(onHit(before).length, 0);
  p.inventory[WEAPON(['아울 듀크'])] = 0;
  const cand = WEAPON(['아울 듀크', '아울 바론']);
  dbx.items[cand] = dbx.items['테스트4슬롯검'];
  p.inventory[cand] = 1;
  const cmp = api.getEquipmentComparison(cand, dbx.items[cand]);
  const prevCount = onHit(cmp.candidateStats).length;
  api.equipItem(cand);
  const actual = api.calcStats();
  assert.strictEqual(prevCount, 1);
  assert.strictEqual(onHit(actual).length, prevCount);
  assert.deepStrictEqual(onHit(actual), onHit(cmp.candidateStats));
  console.log('OK - preview candidate == 실제 장착 후 calcStats');
}
console.log('combo-autospell-p3a-smoke: ALL PASS');
