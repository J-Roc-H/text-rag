'use strict';
// P1-C 장비 비교 UI 회귀 테스트. getEquipmentComparison()은 반드시
// "현재 loadout→calcStats()" vs "후보 loadout(clone)→calcStats()" 두 결과의 diff만 만든다
// (별도 stat 공식 금지 — 과제 최우선 원칙). resolveEquipSlot/applyCandidateEquip/equipItem은
// template.html에서 실제 소스 텍스트 그대로 추출해 실행한다(재구현 아님).
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
// §36 — 단순 장비: ATK 100 → 110 → +10, 실제 equip 후 110과 일치
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({ '롱소드': { type:'무기', atk: 30, wType: '한손검', weaponLv: 1 } });
  p.inventory['롱소드'] = 1;
  const before = api.calcStats().totalAtk;
  const cmp = api.getEquipmentComparison('롱소드', DB.items['롱소드']);
  const atkDiff = cmp.statDiffs.find(d => d.label === 'ATK');
  assert.ok(atkDiff, 'ATK 변화가 diff에 있어야 함');
  assert.strictEqual(atkDiff.diff, cmp.candidateStats.totalAtk - before, 'diff = candidate - current');
  api.equipItem('롱소드');
  const actual = api.calcStats();
  assert.strictEqual(actual.totalAtk, cmp.candidateStats.totalAtk, '실제 equip 후 totalAtk가 비교 결과와 일치');
  console.log('OK - §36 단순 장비 ATK diff, 실제 equip과 일치');
}

// ══════════════════════════════════════════════
// §37 — 복합: STR/FLEE/PD/MaxHP/ASPD를 함께 주는 장비
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({
    '복합갑옷': { type:'갑옷', str: 2, flee: 5, perfectFlee: 3, maxHp: 100, aspd: 2 },
  });
  p.inventory['복합갑옷'] = 1;
  const cmp = api.getEquipmentComparison('복합갑옷', DB.items['복합갑옷']);
  const byLabel = {}; cmp.statDiffs.forEach(d => byLabel[d.label] = d.diff);
  assert.strictEqual(byLabel['STR'], 2);
  assert.strictEqual(byLabel['FLEE'], 5);
  assert.strictEqual(byLabel['PD'], 3);
  assert.strictEqual(byLabel['MaxHP'], 100);
  assert.ok(cmp.aspdDiff, 'ASPD 변화(aspd 보너스로 delay 감소)가 감지되어야 함');
  api.equipItem('복합갑옷');
  const actual = api.calcStats();
  ['str','flee','pd','maxHp','aspdDisplay','aspdDelay'].forEach(k => {
    assert.strictEqual(actual[k], cmp.candidateStats[k], k + ' 실제 equip과 candidateStats 일치');
  });
  console.log('OK - §37 복합 효과 diff 전부 실제 calcStats와 일치');
}

// ══════════════════════════════════════════════
// §38 — 카드 장착 장비: ledger gained/lost와 숫자 diff 정확
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({ '카드갑옷': { type:'갑옷', def: 5, slots: 1 } });
  DB.items['히드라 카드'] = { type: '카드', raceDmgReduce: { 인간형: 20 } };
  const candidateKey = '카드갑옷 [1] <히드라>';
  p.inventory[candidateKey] = 1;
  const cmp = api.getEquipmentComparison(candidateKey, DB.items['카드갑옷']);
  const defDiff = cmp.statDiffs.find(d => d.label === 'DEF');
  assert.strictEqual(defDiff.diff, 5);
  assert.strictEqual(cmp.gainedEffects.length, 1, '카드 효과 1개가 gained로 나타나야 함');
  assert.ok(cmp.gainedEffects[0].label.indexOf('인간형에게 받는 피해 -20%') !== -1);
  assert.strictEqual(cmp.gainedEffects[0].source, '히드라 카드');
  console.log('OK - §38 카드 장착 장비 — ledger gained + 숫자 diff 정확');
}

// ══════════════════════════════════════════════
// §39 — unsupported: deferred 효과는 숫자 증가처럼 보이면 안 되고 "현재 미지원"만
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({ '이상한장갑': { type:'갑옷', def: 3, slots: 1 } });
  DB.items['마종카드 카드'] = { type: '카드', magicRaceAtk: { 인간형: 20 } };
  const candidateKey = '이상한장갑 [1] <마종카드>';
  p.inventory[candidateKey] = 1;
  const cmp = api.getEquipmentComparison(candidateKey, DB.items['이상한장갑']);
  assert.strictEqual(cmp.gainedEffects.length, 0, 'magicRaceAtk는 일반 gainedEffects에 나타나면 안 됨');
  assert.strictEqual(cmp.gainedUnsupported.length, 1, 'unsupported로만 잡혀야 함');
  assert.strictEqual(cmp.gainedUnsupported[0].label.indexOf('magicRaceAtk') === 0, true);
  console.log('OK - §39 unsupported 효과는 gained로 잡히지 않고 별도 목록으로만 표시');
}

// ══════════════════════════════════════════════
// §40 — pending: 검증 대기 1, 실제 numeric diff 0
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({
    '보류장비': { type:'갑옷', def: 0, slots: 1 },
  });
  DB.items['보류카드 카드'] = { type: '카드', hit: 50, _pendingVerification: true };
  const candidateKey = '보류장비 [1] <보류카드>';
  p.inventory[candidateKey] = 1;
  const cmp = api.getEquipmentComparison(candidateKey, DB.items['보류장비']);
  assert.strictEqual(cmp.gainedPending.length, 1, '검증 대기 1건');
  assert.strictEqual(cmp.statDiffs.length, 0, 'pending 카드의 hit은 실제 수치에 반영되지 않아야 함');
  console.log('OK - §40 pending 카드 — 검증 대기 1건, numeric diff 0');
}

// ══════════════════════════════════════════════
// §41 — 같은 장비: 이미 장착 중인 아이템을 후보로 비교 -> 변화 없음(diff 전부 0/빈 배열)
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({ '갑옷A': { type:'갑옷', def: 10 } });
  p.inventory['갑옷A'] = 1;
  api.equipItem('갑옷A');
  // 이미 장착된 바로 그 이름으로 다시 비교 -- 실제 UI는 isEq 체크로 이 호출 자체를 막지만,
  // 함수 단위로도 "자기 자신과 비교하면 변화 없음"이 성립해야 한다.
  const cmp = api.getEquipmentComparison('갑옷A', DB.items['갑옷A']);
  assert.strictEqual(cmp.statDiffs.length, 0);
  assert.strictEqual(cmp.gainedEffects.length + cmp.lostEffects.length + cmp.changedEffects.length, 0);
  console.log('OK - §41 같은 장비로 비교 시 변화 없음');
}

// ══════════════════════════════════════════════
// §42 — 빈 슬롯: 빈 슬롯 → 후보 장착, 실제 equip 결과와 candidateStats 일치(이미 §36/§37이
// 빈 슬롯에서 시작하므로 여기서는 명시적으로 슬롯이 비어 있었음을 확인만 한다)
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({ '신발A': { type:'신발', flee: 8 } });
  p.inventory['신발A'] = 1;
  assert.strictEqual(p.equip['신발'], undefined, '사전조건: 신발 슬롯이 비어 있음');
  const cmp = api.getEquipmentComparison('신발A', DB.items['신발A']);
  assert.strictEqual(cmp.prevAtSlot, undefined, '빈 슬롯이므로 prevAtSlot 없음');
  api.equipItem('신발A');
  assert.strictEqual(api.calcStats().flee, cmp.candidateStats.flee);
  console.log('OK - §42 빈 슬롯 → 후보 장착 parity');
}

// ══════════════════════════════════════════════
// §43 — 실제 equip parity(E2E): snapshot → comparison → 실제 equipItem → 비교 → snapshot 복원
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({
    '파티': { type:'무기', atk: 40, wType: '단검', weaponLv: 2, slots: 1 },
  });
  DB.items['가재 카드'] = { type: '카드', bossAtk: 15, immune: ['freeze'] };
  const candidateKey = '파티 [1] <가재>';
  p.inventory[candidateKey] = 1;
  const before = JSON.parse(JSON.stringify({ equip: p.equip, hp: p.hp, sp: p.sp, inventory: p.inventory, statusEffects: p.statusEffects }));

  const cmp = api.getEquipmentComparison(candidateKey, DB.items['파티']);

  // §29: 원본 상태 불변 — comparison 호출이 G.player를 조금도 바꾸지 않아야 한다.
  assert.deepStrictEqual(p.equip, before.equip, 'comparison 호출 후에도 p.equip 불변');
  assert.strictEqual(p.hp, before.hp); assert.strictEqual(p.sp, before.sp);
  assert.deepStrictEqual(p.statusEffects, before.statusEffects);

  api.equipItem(candidateKey);
  const actual = api.calcStats();

  ['str','agi','vit','int','dex','luk','totalAtk','totalMAtk','hardDef','hardMDef',
   'hit','flee','crit','pd','aspdDisplay','aspdDelay','castReduction','instantCast',
   'maxHp','maxSp'].forEach(k => {
    assert.strictEqual(actual[k], cmp.candidateStats[k], k + ' 실제 equip 결과와 candidateStats 완전 일치');
  });

  // ledger semantic set 비교 — active 효과 identity 집합이 동일해야 한다.
  const actualIds = actual.itemEffects.ledger.filter(e => e.active).map(e => e.type + ':' + e.key + ':' + JSON.stringify(e.value)).sort();
  const candIds = cmp.candidateStats.itemEffects.ledger.filter(e => e.active).map(e => e.type + ':' + e.key + ':' + JSON.stringify(e.value)).sort();
  assert.deepStrictEqual(actualIds, candIds, 'active ledger semantic set 완전 일치');

  console.log('OK - §43 실제 equip parity(E2E) — candidateStats/ledger 완전 일치, 원본 불변 확인');
}

// ══════════════════════════════════════════════
// 장착 불가(§24): 직업 무기 제한으로 blocked인 경우 "장착 불가"만, 숫자 diff 없음
// ══════════════════════════════════════════════
{
  // JOB_NAME2CODE는 api 생성 시점에 DB.jobName2Code를 한 번 읽어 고정하므로(실제
  // 부트스트랩의 window.JOB_NAME2CODE=DB.jobName2Code 재현), api를 만들기 전에 세팅한다.
  const DB = makeDB({ '대검': { type:'무기', atk: 50, wType: '양손검', weaponLv: 1 } });
  DB.jobName2Code = { '마법사': 'JOB_MG' }; // 실제 부트스트랩의 DB.jobCode 역인덱스를 축약 재현
  const p = makePlayer();
  p.job = '마법사';
  p.inventory['대검'] = 1;
  const G = { player: p };
  const api = makeEquipmentCompareApi(DB, G);
  const cmp = api.getEquipmentComparison('대검', DB.items['대검']);
  assert.strictEqual(cmp.blocked, true, '직업이 허용하지 않는 무기는 blocked=true');
  assert.ok(cmp.reason && cmp.reason.length > 0);
  assert.strictEqual(cmp.statDiffs, undefined, 'blocked면 statDiffs 자체를 만들지 않는다');
  console.log('OK - 장착 불가 무기는 blocked=true, 숫자 diff 없음');
}

// ══════════════════════════════════════════════
// 양손무기 → 방패 자동 해제가 비교 결과에도 반영되는지(§8)
// ══════════════════════════════════════════════
{
  const { DB, G, p, api } = setup({
    '버클러': { type:'방패', def: 10 },
    '창': { type:'무기', atk: 60, wType: '창', weaponLv: 1 },
  });
  p.inventory['버클러'] = 1; p.inventory['창'] = 1;
  api.equipItem('버클러');
  assert.strictEqual(p.equip['방패'], '버클러');
  const cmp = api.getEquipmentComparison('창', DB.items['창']);
  assert.strictEqual(cmp.shieldRemoved, '버클러', '양손무기 후보는 방패 자동해제를 candidate에도 반영');
  const defDiff = cmp.statDiffs.find(d => d.label === 'DEF');
  assert.ok(defDiff && defDiff.diff === -10, '방패 DEF 10이 후보 loadout에서 사라져야 함(diff -10)');
  api.equipItem('창');
  assert.strictEqual(p.equip['방패'], undefined, '실제 장착도 방패 해제');
  assert.strictEqual(api.calcStats().hardDef, cmp.candidateStats.hardDef);
  console.log('OK - 양손무기 장착 시 방패 자동해제가 비교/실제 장착 모두 동일하게 반영');
}

console.log('ALL TESTS PASS - equipment-compare-smoke');
