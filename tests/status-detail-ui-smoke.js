'use strict';
// P1-B 상태창 3층 구조(기본 능력치 출처분해/전투 능력치 누락 보완/적용 효과) 회귀 테스트.
// getStatBonusBreakdown/getItemEffectDisplayRows/_unsupportedDisplayLabel는 template.html의
// getSeStatBonus(p){...}부터 _unsupportedDisplayLabel(u){...} 끝까지를 실제 소스 텍스트
// 그대로 추출해 실행한다(재구현 아님) -- statCost/STAT_CAP 등 P1-A 공식과 calcStats() 자체는
// 이 파일에서 건드리지 않는다(기존 stat-allocation-ui-smoke.js/item-effect-*-smoke.js가 계속
// 그 영역을 커버한다).
const assert = require('assert');
const { extractBetween, html, runCalcStats, makeDB, makePlayer } = require('./_item-effect-harness');

const statPanelSrc = extractBetween(html, 'function getSeStatBonus(p){', '// [스타일] 맵 분위기 틴트');

function makeStatPanelApi(DB) {
  const fn = new Function(
    'DB',
    statPanelSrc +
      '\nreturn { getSeStatBonus, getStatBonusBreakdown, getItemEffectDisplayRows, ' +
      '_unsupportedDisplayLabel, EFFECT_HIDE_KEYS, EFFECT_LEDGER_FORMATTERS };'
  );
  return fn(DB);
}

function findRow(groups, group, substr) {
  return (groups[group] || []).find(r => r.label.indexOf(substr) !== -1);
}
function allRows(groups) {
  return Object.keys(groups).reduce((acc, g) => acc.concat(groups[g]), []);
}

// ══════════════════════════════════════════════
// §27 — 기본 stat bonus 출처 분해
// ══════════════════════════════════════════════
{
  const api = makeStatPanelApi({});
  // 보너스 0
  {
    const p = { str: 10, statusEffects: {} };
    const s = { jobStr: 0, bonusStr: 0, itemEffects: { ledger: [] } };
    const br = api.getStatBonusBreakdown('str', s, p);
    assert.strictEqual(br.total, 0, '보너스 0이면 total 0 (+0 표시 안 함)');
  }
  // 과제 예시: 직업+3 장비+2 카드+1 버프+1 = +7
  {
    const p = { str: 10, statusEffects: { blessing: { str: 1 } } };
    const s = {
      jobStr: 3,
      bonusStr: 2 + 1 + 1, // 장비2 + 카드1 + 버프1(getSeStatBonus가 이미 bonus에 포함된 값 재현)
      itemEffects: {
        ledger: [
          { active: true, type: 'stat', key: 'str', value: 2, sourceType: 'equipment', source: 'A' },
          { active: true, type: 'stat', key: 'str', value: 1, sourceType: 'card', source: 'B 카드' },
        ],
      },
    };
    const br = api.getStatBonusBreakdown('str', s, p);
    assert.strictEqual(br.job, 3, '직업 보너스');
    assert.strictEqual(br.equip, 2, '장비 보너스(ledger sourceType=equipment 합)');
    assert.strictEqual(br.card, 1, '카드 보너스(ledger sourceType=card 합)');
    assert.strictEqual(br.buff, 1, '버프 보너스(getSeStatBonus)');
    assert.strictEqual(br.etc, 0, '장비+카드+버프로 전부 설명되면 기타 0');
    assert.strictEqual(br.total, 7, 'total = job + bonus (finalStat - investedStat)');
  }
  // 기타(패시브 스킬 등 ledger/버프로 설명 안 되는 잔여분)
  {
    const p = { str: 10, statusEffects: {} };
    const s = { jobStr: 0, bonusStr: 5, itemEffects: { ledger: [] } }; // 노비스 스킬 패시브류 -- ledger 없음
    const br = api.getStatBonusBreakdown('str', s, p);
    assert.strictEqual(br.equip, 0);
    assert.strictEqual(br.card, 0);
    assert.strictEqual(br.buff, 0);
    assert.strictEqual(br.etc, 5, '장비/카드/버프 어디에도 없는 값은 거짓 분해하지 않고 기타로 남긴다');
  }
  // 음수 장비(스켈레톤망토 AGI-4류)
  {
    const p = { agi: 20, statusEffects: {} };
    const s = { jobAgi: 0, bonusAgi: -4, itemEffects: { ledger: [
      { active: true, type: 'stat', key: 'agi', value: -4, sourceType: 'equipment', source: '스켈레톤망토' },
    ] } };
    const br = api.getStatBonusBreakdown('agi', s, p);
    assert.strictEqual(br.equip, -4);
    assert.strictEqual(br.total, -4);
  }
  console.log('OK - §27 기본 stat bonus 출처 분해(직업/장비/카드/버프/기타)');
}

// ══════════════════════════════════════════════
// §28 — PD 표시값이 실제 runtime perfect dodge와 일치
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '__pd 카드': { type: '카드', perfectFlee: 7 } });
  const p = makePlayer('테스트무기 [1] <__pd>');
  p.luk = 30;
  const s = runCalcStats(DB, { player: p });
  const expectedPd = Math.floor(30 / 10) + 7; // 기존 pd 공식(calcStats) 그대로 손으로 재확인
  assert.strictEqual(s.pd, expectedPd, 'PD = floor(LUK/10) + 카드 perfectFlee 합');
  console.log('OK - §28 PD 표시값이 실제 calcStats().pd와 일치');
}

// ══════════════════════════════════════════════
// §29 — ASPD 값 + delay 동시 표시
// ══════════════════════════════════════════════
{
  const DB = makeDB();
  const p = makePlayer('테스트무기');
  const s = runCalcStats(DB, { player: p });
  assert.ok(typeof s.aspdDisplay === 'number' && typeof s.aspdDelay === 'number', 'aspdDisplay/aspdDelay 둘 다 숫자로 존재');
  assert.strictEqual(s.aspdDisplay, Math.floor(190 - (s.aspdDelay / 200) * 10), '표시값-딜레이 관계식 불변(공식 변경 없음 재확인)');
  console.log('OK - §29 ASPD 값+delay 동시 존재 및 관계식 불변');
}

// ══════════════════════════════════════════════
// §30 — CAST 표시 데이터(castReduction/instantCast)
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '__cast 카드': { type: '카드', castReduction: 0.35 } });
  const p = makePlayer('테스트무기 [1] <__cast>');
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.instantCast, false);
  assert.ok(Math.floor(s.castReduction * 100) >= 35, '카드 castReduction이 표시 백분율 계산에 반영');
}
{
  const DB = makeDB({ '__cast2 카드': { type: '카드', castReduction: 1 } });
  const p = makePlayer('테스트무기 [1] <__cast2>');
  const s = runCalcStats(DB, { player: p });
  assert.strictEqual(s.instantCast, true, 'castReduction 누적 1.0 이상 -> instantCast=true(무캐스팅 표시로 이어짐)');
  console.log('OK - §30 CAST 표시 데이터(castReduction/instantCast) 정상');
}

// ══════════════════════════════════════════════
// §31 — active ledger 3그룹(방어/상태/기능) 정상 분류
// ══════════════════════════════════════════════
{
  const DB = makeDB({
    '__g 카드': {
      type: '카드',
      raceDmgReduce: { 인간형: 30 },
      immune: ['freeze'],
      grantSkill: { 텔레포테이션: 1 },
    },
  });
  const p = makePlayer('테스트무기 [1] <__g>');
  const s = runCalcStats(DB, { player: p });
  const uiApi = makeStatPanelApi({ statusEffects: { freeze: { name: '빙결' } } });
  const groups = uiApi.getItemEffectDisplayRows(s);
  assert.ok(findRow(groups, '방어', '인간형에게 받는 피해 -30%'), '방어 그룹: raceDmgReduce');
  assert.ok(findRow(groups, '상태', '빙결 면역'), '상태 그룹: immune (DB.statusEffects 이름 사용)');
  assert.ok(findRow(groups, '기능', '텔레포테이션 Lv.1 사용 가능'), '기능 그룹: grantSkill');
  console.log('OK - §31 active ledger가 방어/상태/기능 그룹에 정확히 분류됨');
}

// ══════════════════════════════════════════════
// §32 — deferred(magicRaceAtk/skillDmg/healBoost)는 일반 적용 효과에 나타나지 않음
// ══════════════════════════════════════════════
{
  const DB = makeDB({
    '__d 카드': { type: '카드', magicRaceAtk: { 인간형: 20 }, skillDmg: { 배쉬: 10 }, healBoost: 15 },
  });
  const p = makePlayer('테스트무기 [1] <__d>');
  const s = runCalcStats(DB, { player: p });
  const uiApi = makeStatPanelApi({});
  const groups = uiApi.getItemEffectDisplayRows(s);
  const rows = allRows(groups);
  assert.strictEqual(rows.length, 0, 'deferred 3개 필드는 어떤 그룹에도 나타나면 안 됨');
  // fx.unsupported에는 정상적으로 남아 있어야 한다(미지원 섹션이 담당)
  const unsupportedLabels = s.itemEffects.unsupported.map(u => u.label).join('|');
  ['magicRaceAtk', 'skillDmg', 'healBoost'].forEach(k => {
    assert.ok(unsupportedLabels.indexOf(k) !== -1, k + '는 fx.unsupported에 남아 있어야 함');
  });
  console.log('OK - §32 deferred 필드는 적용 효과 목록에 없고 unsupported[]에만 존재');
}

// ══════════════════════════════════════════════
// §33 — pending 카드는 active effect rows 0, pending count 1
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '__p 카드': { type: '카드', hit: 99, _pendingVerification: true } });
  const p = makePlayer('테스트무기 [1] <__p>');
  const s = runCalcStats(DB, { player: p });
  const uiApi = makeStatPanelApi({});
  const groups = uiApi.getItemEffectDisplayRows(s);
  assert.strictEqual(allRows(groups).length, 0, 'pending 카드는 active 효과 행이 0개');
  assert.strictEqual(s.itemEffects.pending.length, 1, 'pending[]에 정확히 1건');
  console.log('OK - §33 pending 카드는 active rows 0 / pending count 1');
}

// ══════════════════════════════════════════════
// §34 — 장착/해제 즉시 반영(잔류 금지)
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '__e 카드': { type: '카드', dmgReduceAll: 10 } });
  const uiApi = makeStatPanelApi({});
  const equipped = runCalcStats(DB, { player: makePlayer('테스트무기 [1] <__e>') });
  const unequipped = runCalcStats(DB, { player: makePlayer('테스트무기') });
  assert.ok(findRow(uiApi.getItemEffectDisplayRows(equipped), '방어', '모든 피해 -10%'), '장착 중엔 효과 표시');
  assert.strictEqual(allRows(uiApi.getItemEffectDisplayRows(unequipped)).length, 0, '해제 후 즉시 사라짐(잔류 없음)');
  console.log('OK - §34 장착/해제에 따라 적용 효과 목록 즉시 반영');
}

// ══════════════════════════════════════════════
// §35 — 단순 stat 효과 중복 표시 없음(기본 능력치에 이미 반영된 값은 적용효과 목록 제외)
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '__f 카드': { type: '카드', str: 3, bossAtk: 15 } });
  const p = makePlayer('테스트무기 [1] <__f>');
  const s = runCalcStats(DB, { player: p });
  const uiApi = makeStatPanelApi({});
  const groups = uiApi.getItemEffectDisplayRows(s);
  const rows = allRows(groups);
  assert.ok(!rows.some(r => /STR/.test(r.label)), '단순 STR+3은 적용 효과 목록에 나타나지 않아야 함(기본 능력치에 이미 반영)');
  assert.ok(findRow(groups, '공격', '보스(MVP) 피해 +15%'), 'bossAtk 같은 조건부 효과는 그대로 표시');
  console.log('OK - §35 단순 stat 효과 중복 표시 없음, 조건부 효과는 정상 표시');
}

// ══════════════════════════════════════════════
// 미지원 라벨 변환(_unsupportedDisplayLabel) — 개발자용 사유 문구를 짧은 한국어 이름으로
// ══════════════════════════════════════════════
{
  const api = makeStatPanelApi({});
  assert.strictEqual(
    api._unsupportedDisplayLabel({ label: 'healBoost: 소비처 없음(원작검증필요)' }),
    '회복량 증가'
  );
  assert.strictEqual(
    api._unsupportedDisplayLabel({ label: 'string effect: 옛날카드' }),
    'string effect: 옛날카드',
    '알려진 7개 필드가 아니면 원문 그대로(추측 라벨 금지)'
  );
  console.log('OK - 미지원 라벨 변환: 알려진 필드는 짧은 이름, 그 외는 원문 유지');
}

console.log('ALL TESTS PASS - status-detail-ui-smoke');
