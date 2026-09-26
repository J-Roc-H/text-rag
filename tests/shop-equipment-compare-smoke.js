'use strict';
// SHOP비교 트랙: 상점 구매 상세(renderShopBuyDetail)가 이제 P1-C 정본
// (getEquipmentComparison/renderEquipmentCompareHtml)을 그대로 재사용하는지 확인한다.
// 상점 후보의 결정적 특징은 "인벤토리에 없는 순수 베이스 아이템명"이라는 점 — 모든
// 시나리오에서 후보를 p.inventory에 절대 넣지 않고 계산한다(실제 renderShopBuyDetail이
// itemName을 DB.items에서 직접 조회하는 방식과 동일).
const assert = require('assert');
const { makeEquipmentCompareApi, makeDB, makePlayer } = require('./_item-effect-harness');

function setup(extraItems) {
  const DB = makeDB(extraItems);
  const p = makePlayer();
  const G = { player: p };
  const api = makeEquipmentCompareApi(DB, G);
  return { DB, G, p, api };
}

// ══════════════════════════════════════════════
// A — 악세 슬롯 둘 다 비어 있음: 상점 후보(미소유) 비교가 실제 equip 규칙과 일치
// ══════════════════════════════════════════════
{
  const { DB, p, api } = setup({ '반지A': { type:'Accessory', str: 3 } });
  assert.strictEqual(p.inventory['반지A'], undefined, '사전조건: 인벤토리에 없음(상점 미구매 상태)');
  const cmp = api.getEquipmentComparison('반지A', DB.items['반지A']);
  assert.strictEqual(cmp.slot, '악세1', '두 슬롯 다 비었으면 악세1(실제 equipItem 규칙과 동일)');
  assert.strictEqual(cmp.statDiffs.find(d => d.label === 'STR').diff, 3);
  console.log('OK - A: 악세 슬롯 둘 다 빈 상태에서 미소유 후보 비교 = 실제 규칙과 일치');
}

// ══════════════════════════════════════════════
// B — 악세1만 사용 중: 상점 후보 → 악세2
// ══════════════════════════════════════════════
{
  const { DB, p, api } = setup({
    '반지A': { type:'Accessory', str: 3 }, '반지B': { type:'Accessory', agi: 4 },
  });
  p.inventory['반지A'] = 1;
  api.equipItem('반지A');
  const cmp = api.getEquipmentComparison('반지B', DB.items['반지B']); // 반지B는 인벤토리에 없음(상점 미구매)
  assert.strictEqual(cmp.slot, '악세2');
  assert.strictEqual(cmp.prevAtSlot, undefined, '악세2는 원래 비어 있었음');
  console.log('OK - B: 악세1만 사용 중 → 미소유 상점 후보는 악세2로 판정');
}

// ══════════════════════════════════════════════
// C — 악세1/악세2 모두 사용 중: 상점 후보 → 실제 규칙대로 악세2 교체(구형 버그 회귀)
// ══════════════════════════════════════════════
{
  const { DB, p, api } = setup({
    '반지A': { type:'Accessory', str: 3 }, '반지B': { type:'Accessory', agi: 4 },
    '반지C': { type:'Accessory', luk: 5 },
  });
  p.inventory['반지A'] = 1; p.inventory['반지B'] = 1;
  api.equipItem('반지A'); api.equipItem('반지B');
  assert.deepStrictEqual(p.equip, { 악세1: '반지A', 악세2: '반지B' });

  // 반지C는 상점에만 있고 인벤토리에는 없다 — 구형 getEquipCompareHtml이었다면
  // p.equip['Accessory']=반지C로 잘못 들어가 반지B(AGI+4)가 사라지는 손실을 놓쳤을 것.
  assert.strictEqual(p.inventory['반지C'], undefined, '사전조건: 상점 미구매 상태');
  const cmp = api.getEquipmentComparison('반지C', DB.items['반지C']);
  assert.strictEqual(cmp.slot, '악세2', '실제 equipItem()과 동일하게 악세2를 교체 대상으로 판정');
  assert.strictEqual(cmp.prevAtSlot, '반지B', '악세2의 반지B가 교체됨을 인지');
  const lukDiff = cmp.statDiffs.find(d => d.label === 'LUK');
  const agiDiff = cmp.statDiffs.find(d => d.label === 'AGI');
  assert.strictEqual(lukDiff.diff, 5, 'LUK+5 획득');
  assert.strictEqual(agiDiff.diff, -4, 'AGI-4 손실(반지B 해제) — 구형 버그였다면 누락됐을 값');

  // 실제로 반지C를 인벤토리에 넣고 장착해 parity 확인
  p.inventory['반지C'] = 1;
  api.equipItem('반지C');
  const actual = api.calcStats();
  assert.strictEqual(actual.luk, cmp.candidateStats.luk);
  assert.strictEqual(actual.agi, cmp.candidateStats.agi);
  console.log('OK - C: 악세 2슬롯 만석 상태에서 미소유 상점 후보 비교 = 악세2 교체 정확히 예측(구형 버그 없음)');
}

// ══════════════════════════════════════════════
// D — 양손무기: 방패 제거 포함 diff가 실제 equip과 일치
// ══════════════════════════════════════════════
{
  const { DB, p, api } = setup({
    '버클러': { type:'방패', def: 10 }, '창': { type:'무기', atk: 60, wType: '창', weaponLv: 1 },
  });
  p.inventory['버클러'] = 1;
  api.equipItem('버클러');
  assert.strictEqual(p.inventory['창'], undefined, '사전조건: 창은 상점 미구매 상태');
  const cmp = api.getEquipmentComparison('창', DB.items['창']);
  assert.strictEqual(cmp.shieldRemoved, '버클러', '양손무기 상점 후보도 방패 자동해제를 반영');
  const defDiff = cmp.statDiffs.find(d => d.label === 'DEF');
  assert.strictEqual(defDiff.diff, -10, '방패 DEF 10 손실이 diff에 정확히 반영');
  p.inventory['창'] = 1;
  api.equipItem('창');
  assert.strictEqual(p.equip['방패'], undefined, '실제 장착도 방패 해제');
  assert.strictEqual(api.calcStats().hardDef, cmp.candidateStats.hardDef);
  console.log('OK - D: 양손무기 미소유 상점 후보 — 방패 자동해제 diff가 실제 equip과 일치');
}

// ══════════════════════════════════════════════
// E — 직업 제한: 상점 후보가 장착 불가면 blocked=true(수치 비교 없음)
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '대검': { type:'무기', atk: 50, wType: '양손검', weaponLv: 1 } });
  DB.jobName2Code = { '마법사': 'JOB_MG' };
  const p = makePlayer();
  p.job = '마법사';
  const G = { player: p };
  const { makeEquipmentCompareApi: mkApi } = require('./_item-effect-harness');
  const api = mkApi(DB, G);
  assert.strictEqual(p.inventory['대검'], undefined, '사전조건: 상점 미구매 상태');
  const cmp = api.getEquipmentComparison('대검', DB.items['대검']);
  assert.strictEqual(cmp.blocked, true);
  assert.strictEqual(cmp.statDiffs, undefined, '장착 불가면 수치 비교 자체를 만들지 않음');
  console.log('OK - E: 직업 제한 상점 후보(미소유) — blocked=true, 수치 비교 없음');
}

// ══════════════════════════════════════════════
// F — 일반 장비: 상점 비교 결과와 실제 구매 후 장착 결과 parity
// ══════════════════════════════════════════════
{
  const { DB, p, api } = setup({ '무쇠갑옷': { type:'갑옷', def: 20, str: 1 } });
  assert.strictEqual(p.inventory['무쇠갑옷'], undefined, '사전조건: 상점 미구매 상태');
  const cmp = api.getEquipmentComparison('무쇠갑옷', DB.items['무쇠갑옷']);
  const html = api.renderEquipmentCompareHtml('무쇠갑옷', DB.items['무쇠갑옷']);
  assert.ok(html.indexOf('eqcmp-box') !== -1, '렌더 결과가 실제로 만들어짐(빈 문자열 아님)');
  // "구매" 후(인벤토리에 들어옴) 장착 — 실제 상점 구매 흐름과 동일한 순서
  p.inventory['무쇠갑옷'] = 1;
  api.equipItem('무쇠갑옷');
  const actual = api.calcStats();
  assert.strictEqual(actual.hardDef, cmp.candidateStats.hardDef);
  assert.strictEqual(actual.str, cmp.candidateStats.str);
  console.log('OK - F: 일반 장비 — 상점 비교(미소유) 예측과 구매 후 실제 장착 결과 parity');
}

// ══════════════════════════════════════════════
// G — state invariance: 상점 비교 호출 전후 G.player 완전 불변
// ══════════════════════════════════════════════
{
  const { DB, p, api } = setup({ '무쇠갑옷': { type:'갑옷', def: 20 } });
  // weaponType/weaponElement는 calcStats()가 p.equip으로부터 매번 새로 도출하는
  // 결정적 파생값이다(부작용이되 멱등) — 실제 플레이가 그렇듯 최소 한 번은 이미
  // calcStats()가 돌았다고 가정하고 그 이후 상태를 "before"로 잡는다. 비교 호출이
  // 이 값을 실제로 바꾸는지가 검증 대상이지, 최초 1회 설정 자체는 아니다.
  api.calcStats();
  const before = JSON.parse(JSON.stringify({
    equip: p.equip, inventory: p.inventory, hp: p.hp, sp: p.sp,
    statusEffects: p.statusEffects, weaponType: p.weaponType, weaponElement: p.weaponElement,
  }));
  api.getEquipmentComparison('무쇠갑옷', DB.items['무쇠갑옷']);
  api.renderEquipmentCompareHtml('무쇠갑옷', DB.items['무쇠갑옷']);
  assert.deepStrictEqual(p.equip, before.equip, 'equip 불변');
  assert.deepStrictEqual(p.inventory, before.inventory, 'inventory 불변(상점 비교가 구매를 일으키지 않음)');
  assert.strictEqual(p.hp, before.hp); assert.strictEqual(p.sp, before.sp);
  assert.deepStrictEqual(p.statusEffects, before.statusEffects);
  assert.strictEqual(p.weaponType, before.weaponType);
  assert.strictEqual(p.weaponElement, before.weaponElement);
  console.log('OK - G: 상점 비교(계산+렌더) 호출 전후 G.player 완전 불변');
}

console.log('ALL TESTS PASS - shop-equipment-compare-smoke');
