'use strict';
// P1(P1-A/B/C) 종료감사 closeout 테스트 — 개별 스테이지 테스트(stat-allocation-ui-smoke.js/
// status-detail-ui-smoke.js/equipment-compare-smoke.js)가 이미 보장하는 것을 반복하지
//않는다. 여기서는 감사 중 새로 확인이 필요했던 두 가지 교차 검증만 담는다:
//   1. 기본 stat 출처 분해(직업+장비+카드+버프+기타)가 job/equip/card/buff가 "동시에"
//      전부 존재하는 실제 calcStats() 경로에서도 오차 없이 최종값과 일치하는가
//      (§9 — 개별 테스트는 이미 있었지만 4종 동시 존재 케이스는 없었다).
//   2. 악세서리 두 슬롯이 모두 찬 상태에서 세 번째 후보를 비교하면(실제 equipItem()과
//      동일하게) 악세2를 "교체"로 정확히 예측하는가 — 구형 getEquipCompareHtml이 갖고
//      있던 "Accessory를 실제 슬롯이 아닌 자리로 취급" 버그가 신규 경로(P1-C)에는 없음을
//      실제 equip parity로 재확인한다(§14 accessory 케이스, equipment-compare-smoke.js
//      에는 없던 시나리오).
const assert = require('assert');
const { extractBetween, html, runCalcStats, makeEquipmentCompareApi, makeDB, makePlayer } = require('./_item-effect-harness');

const statPanelSrc = extractBetween(html, 'function getSeStatBonus(p){', '// [스타일] 맵 분위기 틴트');
function makeStatPanelApi() {
  return (new Function('return (function(){' + statPanelSrc + '\nreturn { getStatBonusBreakdown, getSeStatBonus };})()'))();
}

// ══════════════════════════════════════════════
// §9 — 직업 + 장비 + 카드 + 버프 동시 존재 시 breakdown 합계 == 최종 s.str
// ══════════════════════════════════════════════
{
  const DB = makeDB({ '테스트장갑': { type:'갑옷', str: 2, slots: 1 } });
  DB.items['파워카드 카드'] = { type:'카드', str: 3 };
  DB.classJobBonus = { JOB_SWD: { str: 20, agi:0, vit:0, int:0, dex:0, luk:0 } };
  DB.jobName2Code = { '소드맨': 'JOB_SWD' };
  const candidateKey = '테스트장갑 [1] <파워카드>';
  const p = makePlayer(candidateKey);
  p.job = '소드맨'; p.jobLv = 50; p.str = 10;
  p.statusEffects = { blessing: { turns: 10, str: 5 } };

  const s = runCalcStats(DB, { player: p });
  const api = makeStatPanelApi();
  const br = api.getStatBonusBreakdown('str', s, p);

  assert.strictEqual(br.job, 20, '직업 보너스(JOB_SWD str20 × jobLv50/50)');
  assert.strictEqual(br.equip, 2, '장비 str+2');
  assert.strictEqual(br.card, 3, '카드 str+3');
  assert.strictEqual(br.buff, 5, '블레싱 str+5');
  assert.strictEqual(br.etc, 0, '4종이 전부 설명되므로 기타 잔여 0(중복/누락 없음)');
  assert.strictEqual(
    p.str + br.job + br.equip + br.card + br.buff + br.etc, s.str,
    '투자값+직업+장비+카드+버프+기타 합계가 실제 calcStats() 최종값과 정확히 일치'
  );
  assert.strictEqual(br.total, s.jobStr + s.bonusStr, 'total = job + bonus(calcStats 기존 필드)');
  console.log('OK - §9 job+equip+card+buff 동시 존재 시 breakdown 합계 == 최종 s.str(중복/누락 없음)');
}

// ══════════════════════════════════════════════
// §14 — 악세서리: 두 슬롯이 이미 찬 상태에서 세 번째 후보 비교 → 악세2 교체로 정확히
// 예측(구형 getEquipCompareHtml의 "Accessory 슬롯" 버그가 신규 경로엔 없음을 재확인)
// ══════════════════════════════════════════════
{
  const DB = makeDB({
    '반지A': { type:'Accessory', str: 3 },
    '반지B': { type:'Accessory', agi: 4 },
    '반지C': { type:'Accessory', luk: 5 },
  });
  const p = makePlayer();
  p.inventory['반지A'] = 1; p.inventory['반지B'] = 1; p.inventory['반지C'] = 1;
  const G = { player: p };
  const api = makeEquipmentCompareApi(DB, G);

  api.equipItem('반지A'); // 악세1
  api.equipItem('반지B'); // 악세2
  assert.deepStrictEqual(p.equip, { 악세1: '반지A', 악세2: '반지B' }, '사전조건: 두 슬롯 모두 참');

  const cmp = api.getEquipmentComparison('반지C', DB.items['반지C']);
  assert.strictEqual(cmp.slot, '악세2', '실제 equipItem()과 동일하게 악세2를 교체 대상으로 판정');
  assert.strictEqual(cmp.prevAtSlot, '반지B', '악세2에 있던 반지B가 교체됨을 인지');
  const lukDiff = cmp.statDiffs.find(d => d.label === 'LUK');
  const agiDiff = cmp.statDiffs.find(d => d.label === 'AGI');
  assert.strictEqual(lukDiff.diff, 5, '반지C의 LUK+5 획득');
  assert.strictEqual(agiDiff.diff, -4, '반지B 해제로 AGI-4 손실 — 구형 버그였다면 이 손실이 diff에 안 잡혔을 것');

  api.equipItem('반지C');
  const actual = api.calcStats();
  assert.strictEqual(actual.luk, cmp.candidateStats.luk, '실제 장착 후 LUK가 비교 예측과 일치');
  assert.strictEqual(actual.agi, cmp.candidateStats.agi, '실제 장착 후 AGI(반지B 손실 반영)가 비교 예측과 일치');
  assert.deepStrictEqual(p.equip, { 악세1: '반지A', 악세2: '반지C' }, '실제 슬롯 배정도 악세2 교체');
  console.log('OK - §14 악세서리 2슬롯 만석 상태에서 3번째 후보 비교 — 악세2 교체를 정확히 예측(구형 Accessory 버그 없음)');
}

console.log('ALL TESTS PASS - status-ui-p1-close-smoke');
