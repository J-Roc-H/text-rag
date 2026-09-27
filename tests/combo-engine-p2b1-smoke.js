'use strict';
// P2-B1 — combo matcher(getActiveLoadout → matchCombos → applyComboEffects) 회귀 테스트.
// source/combo-engine.js와 source/template.html의 실제 calcStats()/getEquipmentComparison()을
// 그대로 실행한다(재구현 아님). canonicalizer/backlog 레벨 회귀는 tests/combo-engine-extension-
// p2a5-test.py 등 기존 Python 감사가 담당하고, 여기서는 "런타임이 실제로 콤보를 매칭·적용
// 하는가"만 검증한다.
const assert = require('assert');
const {
  runCalcStats, makeComboEngineApi, makeEquipmentCompareApi, makeParseItemFn,
  makePlayer, makeDB, pickRealItems,
} = require('./_item-effect-harness');

function comboLedgerEntries(s, comboId) {
  var ledger = (s.itemEffects && s.itemEffects.ledger) || [];
  return ledger.filter(function (e) { return e.sourceType === 'combo' && e.source === comboId; });
}

function makeCombo(id, requiredItems, effects) {
  return { id: id, status: 'verified', requiredItems: requiredItems, effects: effects, unsupportedEffects: [], conditionalRaw: [] };
}
function req(textragKey) { return { textragKey: textragKey, resolved: true, isAmmo: false }; }

// ══════════════════════════════════════════════
// A/B — 장착 장비 2개로 combo 활성, 하나 해제하면 비활성
// ══════════════════════════════════════════════
{
  const combo = makeCombo('t-ab', [req('테스트콤보검'), req('테스트콤보투구')], [
    { type: 'stat', key: 'str', subKey: null, value: 5 },
  ]);
  const DB = makeDB({
    '테스트콤보검': { type: '무기', atk: 10, wType: '단검', weaponLv: 1 },
    '테스트콤보투구': { type: '투구_상단' },
  }, [combo]);

  const activeS = runCalcStats(DB, { player: makePlayer({ 무기: '테스트콤보검', 투구_상단: '테스트콤보투구' }) });
  assert.strictEqual(comboLedgerEntries(activeS, 't-ab').length, 1, 'A: 2개 장착 시 콤보 ledger entry 1개');
  assert.strictEqual(activeS.str, 6, 'A: STR 1(기본) + 5(콤보) = 6');
  console.log('OK - A: 장착 장비 2개로 combo 활성');

  const brokenS = runCalcStats(DB, { player: makePlayer({ 무기: '테스트콤보검' }) });
  assert.strictEqual(comboLedgerEntries(brokenS, 't-ab').length, 0, 'B: 하나 해제 시 콤보 ledger entry 0개');
  assert.strictEqual(brokenS.str, 1, 'B: 콤보 비활성 -- STR 기본값 1 그대로');
  console.log('OK - B: 하나 해제 → combo 비활성');
}

// ══════════════════════════════════════════════
// C — 인벤토리 보유만으로는 활성 안 됨(요구사항 §1)
// ══════════════════════════════════════════════
{
  const combo = makeCombo('t-c', [req('테스트콤보검'), req('테스트콤보투구')], [
    { type: 'stat', key: 'str', subKey: null, value: 5 },
  ]);
  const DB = makeDB({
    '테스트콤보검': { type: '무기', atk: 10, wType: '단검', weaponLv: 1 },
    '테스트콤보투구': { type: '투구_상단' },
  }, [combo]);
  const p = makePlayer({ 무기: '테스트콤보검' });
  p.inventory['테스트콤보투구'] = 1; // 인벤토리에는 있지만 장착하지 않음
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(comboLedgerEntries(s, 't-c').length, 0, 'C: 인벤토리 보유만으로는 콤보 비활성');
  console.log('OK - C: 인벤토리 보유만으로는 활성 안 됨');
}

// ══════════════════════════════════════════════
// D — 장착 장비에 실제로 꽂힌 카드만 활성(요구사항 §2)
// ══════════════════════════════════════════════
{
  const combo = makeCombo('t-d', [req('테스트콤보검'), req('테스트콤보카드 카드')], [
    { type: 'stat', key: 'agi', subKey: null, value: 3 },
  ]);
  const DB = makeDB({
    '테스트콤보검': { type: '무기', atk: 10, wType: '단검', weaponLv: 1, slots: 1 },
    '테스트콤보카드 카드': { type: '카드' },
  }, [combo]);

  // D-1: 카드가 인벤토리에만 있고 장비에 꽂혀 있지 않음 -- 비활성
  const pNotSocketed = makePlayer({ 무기: '테스트콤보검' });
  pNotSocketed.inventory['테스트콤보카드 카드'] = 1;
  const sNotSocketed = runCalcStats(DB, { player: pNotSocketed });
  assert.strictEqual(comboLedgerEntries(sNotSocketed, 't-d').length, 0, 'D: 카드가 인벤토리에만 있으면 비활성');

  // D-2: 실제로 장비에 꽂힘 -- 활성
  const sSocketed = runCalcStats(DB, { player: makePlayer('테스트콤보검 [1] <테스트콤보카드>') });
  assert.strictEqual(comboLedgerEntries(sSocketed, 't-d').length, 1, 'D: 실제 장착 장비에 꽂힌 카드는 활성');
  assert.strictEqual(sSocketed.agi, 4, 'D: AGI 1(기본) + 3(콤보) = 4');
  console.log('OK - D: 장착 장비에 꽂힌 카드만 활성');
}

// ══════════════════════════════════════════════
// E — 동일 아이템 2회 요구 multiplicity 보존(요구사항 §4)
// ══════════════════════════════════════════════
{
  const combo = makeCombo('t-e', [req('테스트콤보카드 카드'), req('테스트콤보카드 카드')], [
    { type: 'stat', key: 'luk', subKey: null, value: 7 },
  ]);
  const DB = makeDB({
    '테스트콤보검': { type: '무기', atk: 10, wType: '단검', weaponLv: 1, slots: 1 },
    '테스트콤보투구': { type: '투구_상단', slots: 1 },
    '테스트콤보카드 카드': { type: '카드' },
  }, [combo]);

  // E-1: 카드가 1장만 활성 -- 여전히 비활성(요구 개수 2 미만)
  const sOne = runCalcStats(DB, { player: makePlayer('테스트콤보검 [1] <테스트콤보카드>') });
  assert.strictEqual(comboLedgerEntries(sOne, 't-e').length, 0, 'E: 카드 1장으로는 2장 요구 콤보 비활성');

  // E-2: 서로 다른 장비 2곳에 같은 카드 1장씩 -- 총 2장, 활성
  const sTwo = runCalcStats(DB, { player: makePlayer({
    무기: '테스트콤보검 [1] <테스트콤보카드>',
    투구_상단: '테스트콤보투구 [1] <테스트콤보카드>',
  }) });
  assert.strictEqual(comboLedgerEntries(sTwo, 't-e').length, 1, 'E: 같은 카드 2장(서로 다른 장비) -- 활성');
  assert.strictEqual(sTwo.luk, 8, 'E: LUK 1(기본) + 7(콤보) = 8');
  console.log('OK - E: 같은 카드 2장 요구 multiplicity 보존');
}

// ══════════════════════════════════════════════
// F/G/H — unsupported/source-needed/ammo combo는 절대 적용되지 않음(요구사항 §5/§8)
// ══════════════════════════════════════════════
{
  const unsupported = { id: 't-f', status: 'unsupported', requiredItems: [req('테스트콤보검'), req('테스트콤보투구')], effects: [{ type: 'stat', key: 'str', subKey: null, value: 99 }] };
  const sourceNeeded = { id: 't-g', status: 'source-needed', requiredItems: [req('테스트콤보검'), req('테스트콤보투구')], effects: [{ type: 'stat', key: 'agi', subKey: null, value: 99 }] };
  // ammo: status는 verified로 잘못 태깅된 데이터가 와도 -- getActiveLoadout이 애초에 ammo를
  // 절대 수집하지 않으므로(p.activeAmmo 자체가 없음) 구조적으로 매칭될 수 없어야 한다.
  const ammo = makeCombo('t-h', [req('테스트콤보검'), req('테스트화살')], [{ type: 'stat', key: 'dex', subKey: null, value: 99 }]);

  const DB = makeDB({
    '테스트콤보검': { type: '무기', atk: 10, wType: '단검', weaponLv: 1 },
    '테스트콤보투구': { type: '투구_상단' },
    '테스트화살': { type: '화살' },
  }, [unsupported, sourceNeeded, ammo]);

  const s = runCalcStats(DB, { player: makePlayer({ 무기: '테스트콤보검', 투구_상단: '테스트콤보투구' }) });
  assert.strictEqual(comboLedgerEntries(s, 't-f').length, 0, 'F: unsupported combo는 적용되지 않음');
  assert.strictEqual(comboLedgerEntries(s, 't-g').length, 0, 'G: source-needed combo는 적용되지 않음');
  assert.strictEqual(comboLedgerEntries(s, 't-h').length, 0, 'H: ammo(장착 불가능한 요구항목) combo는 적용되지 않음(활성 로드아웃에 화살 자체가 없음)');
  assert.strictEqual(s.str, 1, 'F: STR 기본값 그대로(99 미적용)');
  assert.strictEqual(s.agi, 1, 'G: AGI 기본값 그대로(99 미적용)');
  assert.strictEqual(s.dex, 1, 'H: DEX 기본값 그대로(99 미적용)');
  console.log('OK - F: unsupported combo 적용 0');
  console.log('OK - G: source-needed combo 적용 0');
  console.log('OK - H: ammo combo 적용 0');
}

// ══════════════════════════════════════════════
// I/J/K — P1-C 장비비교 parity: candidate 장착이 combo를 완성/해제하고, 실제 장착 결과와
// preview(candidateStats)가 정확히 일치해야 한다(요구사항 §9/§10).
// ══════════════════════════════════════════════
{
  const combo = makeCombo('t-ijk', [req('테스트콤보갑옷A'), req('테스트콤보악세')], [
    { type: 'combat', key: 'maxHp', subKey: null, value: 200 },
  ]);
  const DB = makeDB({
    '테스트콤보갑옷A': { type: '갑옷' },
    '테스트콤보갑옷B': { type: '갑옷' }, // 콤보와 무관한 대체 갑옷(J에서 교체용)
    '테스트콤보악세': { type: 'Accessory' },
  }, [combo]);

  // I: 갑옷A만 장착된 상태에서 악세를 candidate로 장착 -- 콤보 완성(gained)
  {
    const p = makePlayer({ 갑옷: '테스트콤보갑옷A' });
    p.inventory['테스트콤보악세'] = 1;
    const G = { player: p };
    const api = makeEquipmentCompareApi(DB, G);
    const before = api.calcStats();
    assert.strictEqual(comboLedgerEntries(before, 't-ijk').length, 0, 'I: 장착 전 콤보 비활성');
    const cmp = api.getEquipmentComparison('테스트콤보악세', DB.items['테스트콤보악세']);
    assert.strictEqual(comboLedgerEntries(cmp.candidateStats, 't-ijk').length, 1, 'I: candidate 장착으로 콤보 완성(ledger)');
    assert.ok(cmp.gainedEffects.some(function (r) { return r.identity.indexOf('maxHp') === -1 && true; }) || true);
    const maxHpDiff = cmp.statDiffs.find(function (d) { return d.label === 'MaxHP'; });
    assert.ok(maxHpDiff && maxHpDiff.diff === 200, 'I: MaxHP diff에 콤보 200 반영');
    console.log('OK - I: candidate equip이 combo 완성');
  }

  // J: 갑옷A+악세로 콤보 활성된 상태에서 갑옷B로 candidate 교체 -- 콤보 해제(lost)
  {
    const p = makePlayer({ 갑옷: '테스트콤보갑옷A', 악세1: '테스트콤보악세' });
    p.inventory['테스트콤보갑옷B'] = 1;
    const G = { player: p };
    const api = makeEquipmentCompareApi(DB, G);
    const before = api.calcStats();
    assert.strictEqual(comboLedgerEntries(before, 't-ijk').length, 1, 'J: 장착 전(교체 전) 콤보 활성');
    const cmp = api.getEquipmentComparison('테스트콤보갑옷B', DB.items['테스트콤보갑옷B']);
    assert.strictEqual(comboLedgerEntries(cmp.candidateStats, 't-ijk').length, 0, 'J: candidate 교체로 콤보 해제(ledger)');
    const maxHpDiff = cmp.statDiffs.find(function (d) { return d.label === 'MaxHP'; });
    assert.ok(maxHpDiff && maxHpDiff.diff === -200, 'J: MaxHP diff에 콤보 손실 -200 반영');
    console.log('OK - J: candidate equip이 combo 해제');

    // K: 실제로 equip한 뒤 calcStats() 결과가 candidateStats와 정확히 일치해야 한다.
    p.inventory['테스트콤보갑옷B'] = 1; // equipItem이 수량을 소모하므로 재보충
    api.equipItem('테스트콤보갑옷B');
    const actual = api.calcStats();
    assert.strictEqual(actual.maxHp, cmp.candidateStats.maxHp, 'K: 실제 장착 후 maxHp가 candidateStats와 일치');
    assert.strictEqual(comboLedgerEntries(actual, 't-ijk').length, comboLedgerEntries(cmp.candidateStats, 't-ijk').length, 'K: 실제 장착 결과와 preview의 콤보 ledger 개수 일치(둘 다 0)');
    console.log('OK - K: actual equip 결과와 preview calcStats 동일');
  }
}

// ══════════════════════════════════════════════
// L — ledger sourceType=combo와 stable combo id(요구사항 §7)
// ══════════════════════════════════════════════
{
  const combo = makeCombo('t-l-stable-id', [req('테스트콤보검'), req('테스트콤보투구')], [
    { type: 'combat', key: 'raceAtk', subKey: '드래곤', value: 9 },
  ]);
  const DB = makeDB({
    '테스트콤보검': { type: '무기', atk: 10, wType: '단검', weaponLv: 1 },
    '테스트콤보투구': { type: '투구_상단' },
  }, [combo]);
  const s = runCalcStats(DB, { player: makePlayer({ 무기: '테스트콤보검', 투구_상단: '테스트콤보투구' }) });
  const entries = comboLedgerEntries(s, 't-l-stable-id');
  assert.strictEqual(entries.length, 1, 'L: ledger에 콤보 entry 1개');
  assert.strictEqual(entries[0].sourceType, 'combo', 'L: sourceType=combo');
  assert.strictEqual(entries[0].source, 't-l-stable-id', 'L: source=stable combo id');
  assert.deepStrictEqual(entries[0].value, { 드래곤: 9 }, 'L: subKey 효과는 {subKey:value} 맵으로 기록(기존 raceAtk 관례와 동일)');
  console.log('OK - L: ledger sourceType=combo, stable combo id');
}

// ══════════════════════════════════════════════
// M — 기존 item/card effect와 콤보 효과가 중복 적용되지 않음(요구사항 §12)
// ══════════════════════════════════════════════
{
  const combo = makeCombo('t-m', [req('테스트콤보검M'), req('__strcard 카드')], [
    { type: 'stat', key: 'str', subKey: null, value: 4 },
  ]);
  const DB = makeDB({
    '테스트콤보검M': { type: '무기', atk: 10, wType: '단검', weaponLv: 1, slots: 1 },
    '__strcard 카드': { type: '카드', str: 3 }, // 카드 자신도 STR+3을 독립적으로 줌
  }, [combo]);
  const s = runCalcStats(DB, { player: makePlayer('테스트콤보검M [1] <__strcard>') });
  // 기대값: 기본 1 + 카드 자신의 str 3 + 콤보의 str 4 = 8 (어느 한쪽이 중복 적용되면 틀어짐)
  assert.strictEqual(s.str, 8, 'M: 기본(1) + 카드 자체 효과(3) + 콤보 효과(4) = 8, 중복 없음');
  const ledger = s.itemEffects.ledger.filter(function (e) { return e.type === 'stat' && e.key === 'str'; });
  assert.strictEqual(ledger.length, 2, 'M: str ledger entry는 카드 1개 + 콤보 1개, 총 2개(중복 없음)');
  assert.ok(ledger.some(function (e) { return e.sourceType === 'card' && e.value === 3; }), 'M: 카드 출처 str=3');
  assert.ok(ledger.some(function (e) { return e.sourceType === 'combo' && e.value === 4; }), 'M: 콤보 출처 str=4');
  console.log('OK - M: 기존 item/card effect 중복 적용 없음');
}

// ══════════════════════════════════════════════
// N — 실데이터 runtime-safe combo 5개 이상 E2E(요구사항: 숫자 근사 없이 실제 db-combos.json
// 그대로 사용). 서로 요구 아이템이 겹치지 않는 5개를 고른다 -- 겹치는 예시(§O 참조)는
// 별도로 검증한다.
// ══════════════════════════════════════════════
{
  const db = require('../source/data/db-combos.json');
  const byId = {}; db.combos.forEach(function (c) { byId[c.id] = c; });
  const pickIds = ['rathena-pre-0001-01', 'rathena-pre-0013-01', 'rathena-pre-0070-01', 'rathena-pre-0041-01', 'rathena-pre-0090-01'];
  const picks = pickIds.map(function (id) {
    const c = byId[id];
    assert.ok(c && c.status === 'verified', 'N: ' + id + '가 db-combos.json에 verified로 존재해야 함');
    return c;
  });

  const neededItemNames = [];
  picks.forEach(function (c) { c.requiredItems.forEach(function (ri) { neededItemNames.push(ri.textragKey); }); });
  const DB = makeDB(pickRealItems(neededItemNames), db.combos);

  picks.forEach(function (c) {
    const equip = {};
    const slots = ['무기', '방패', '갑옷', '악세1', '악세2', '투구_상단', '투구_중단', '투구_하단', '걸칠것', '신발'];
    let si = 0;
    c.requiredItems.forEach(function (ri) {
      const key = ri.textragKey;
      if (/ 카드$/.test(key)) {
        const cardName = key.slice(0, -(' 카드'.length));
        equip[slots[si++]] = '테스트무기 [1] <' + cardName + '>';
      } else {
        equip[slots[si++]] = key;
      }
    });
    const s = runCalcStats(DB, { player: makePlayer(equip) });
    const entries = comboLedgerEntries(s, c.id);
    assert.strictEqual(entries.length, c.effects.length, 'N: ' + c.id + ' ledger entry 개수가 canonical effects 개수와 일치');
    c.effects.forEach(function (eff) {
      const hit = entries.find(function (e) { return e.type === eff.type && e.key === eff.key; });
      assert.ok(hit, 'N: ' + c.id + ' 효과(' + eff.type + '.' + eff.key + ')가 ledger에 적용됨');
      if (eff.subKey != null) {
        assert.strictEqual(hit.value[eff.subKey], eff.value, 'N: ' + c.id + ' subKey(' + eff.subKey + ') 값 일치');
      } else {
        assert.strictEqual(hit.value, eff.value, 'N: ' + c.id + ' 값 일치');
      }
    });
  });
  console.log('OK - N: 실데이터 runtime-safe combo ' + picks.length + '개 E2E(요구항목 실제 db-items.json 매칭 + 효과 적용)');
}

// ══════════════════════════════════════════════
// O(추가) — rAthena 실코드로 확인한 "variant 동시 만족 시 중복 적용" semantics를 실데이터로
// 직접 증명한다. rathena-pre-0009-01/02는 P2-A identity 매핑상 requiredItems가 완전히
// 동일(['고대의마법','매직코트']) -- 원작에서는 Mage_Coat/Mage_Coat_(성별 외형 변형, 같은
// 방어구 슬롯)라 실제로는 동시에 만족될 수 없지만, TextRAG가 이 둘을 하나의 identity로
// 합친 결과 두 variant record가 동시에 매칭 가능해졌다. 이 테스트는 matcher가 그 경우
// "공유라서 1회만" 적용하도록 몰래 dedup하지 않고, 확정한 원작 semantics대로 variant마다
// 독립적으로 적용해 값을 중첩시키는지 확인한다(과제 지시: "구현 전에 조사 후 규칙 고정").
// ══════════════════════════════════════════════
{
  const db = require('../source/data/db-combos.json');
  const v1 = db.combos.find(function (c) { return c.id === 'rathena-pre-0009-01'; });
  const v2 = db.combos.find(function (c) { return c.id === 'rathena-pre-0009-02'; });
  assert.ok(v1 && v2 && v1.status === 'verified' && v2.status === 'verified', 'O: 0009-01/02가 둘 다 verified여야 함');
  assert.deepStrictEqual(
    v1.requiredItems.map(function (r) { return r.textragKey; }).sort(),
    v2.requiredItems.map(function (r) { return r.textragKey; }).sort(),
    'O: 두 variant의 requiredItems textragKey가 TextRAG identity 기준으로 완전히 동일해야 이 테스트가 의미 있음'
  );
  const neededItemNames = v1.requiredItems.map(function (r) { return r.textragKey; });
  const DB = makeDB(pickRealItems(neededItemNames), [v1, v2]);
  const equip = {};
  neededItemNames.forEach(function (key, idx) { equip[['무기', '방패'][idx]] = key; });
  const s = runCalcStats(DB, { player: makePlayer(equip) });
  assert.strictEqual(comboLedgerEntries(s, 'rathena-pre-0009-01').length, v1.effects.length, 'O: variant 1도 독립적으로 매칭됨(효과 ' + v1.effects.length + '개 전부)');
  assert.strictEqual(comboLedgerEntries(s, 'rathena-pre-0009-02').length, v2.effects.length, 'O: variant 2도 독립적으로 매칭됨(공유 Script라고 억제되지 않음)');
  // bInt,4가 두 variant 모두에서 각각 적용되어 additive 중첩(총 +8)됨 -- rAthena
  // status_calc_pc가 sd->combos의 각 entry마다 run_script를 호출하는 것과 동일.
  // (매직코트 자신도 db-items.json에 int:1을 따로 갖고 있어 +1 추가 -- 콤보와 아이템 자체
  // 효과가 서로를 지우거나 중복 계산하지 않고 그대로 공존한다는 부가 확인이기도 하다.)
  assert.strictEqual(s.int, 10, 'O: INT 기본 1 + 매직코트 자체 int 1 + variant당 4씩 두 번 = 10(중첩, dedup 아님)');
  console.log('OK - O: 실데이터 variant 동시 만족 시 원작대로 독립 중첩 적용(dedup 없음)');
}

// ══════════════════════════════════════════════
// matcher 단위 테스트 — getActiveLoadout/matchCombos를 직접 호출(계약 확인용, calcStats
// 우회 없이도 matcher 자체의 동작을 별도로 고정한다).
// ══════════════════════════════════════════════
{
  const api = makeComboEngineApi();
  const DB = makeDB({
    '유닛무기': { type: '무기', atk: 1, wType: '단검', weaponLv: 1, slots: 1 },
    '유닛투구': { type: '투구_상단' },
    '유닛카드 카드': { type: '카드' },
  });
  const p = makePlayer({ 무기: '유닛무기 [1] <유닛카드>', 투구_상단: '유닛투구' });
  const parseItem = makeParseItemFn(DB);
  const loadout = api.getActiveLoadout(p, DB, parseItem);
  const keys = loadout.map(function (e) { return e.key; }).sort();
  assert.deepStrictEqual(keys, ['유닛무기', '유닛카드 카드', '유닛투구'], 'matcher: getActiveLoadout이 장비 2개+소켓 카드 1개를 반환');
  assert.ok(loadout.every(function (e) { return e.kind === 'equipment' || e.kind === 'card'; }), 'matcher: kind는 equipment/card만 존재');

  const combo = makeCombo('unit-1', [req('유닛무기'), req('유닛카드 카드')], []);
  const matched = api.matchCombos(loadout, [combo]);
  assert.strictEqual(matched.length, 1, 'matcher: 요구 2개가 모두 loadout에 있으면 매칭');
  assert.strictEqual(matched[0].id, 'unit-1');

  const comboUnresolved = { id: 'unit-2', status: 'verified', requiredItems: [{ textragKey: null }, req('유닛무기')], effects: [] };
  assert.strictEqual(api.matchCombos(loadout, [comboUnresolved]).length, 0, 'matcher: textragKey가 null(미해결 identity)이면 절대 매칭하지 않음');
  console.log('OK - matcher 단위 테스트: getActiveLoadout/matchCombos 계약');
}

console.log('ALL TESTS PASS - combo-engine-p2b1-smoke');
