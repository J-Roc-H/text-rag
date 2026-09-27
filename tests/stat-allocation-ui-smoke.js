'use strict';
// P1-A 회귀 테스트 — 상태 포인트 배분 UX 개편(다음 비용 항상 표시 / +10 제거 / +1·최대 /
// canSpendStatPoint 단일 판정 / 레벨업 로그)이 실제 소스 텍스트 그대로 동작하는지 검증한다.
// source/template.html에서 statCost/levelStatPoints/statCostTo/gainBaseExp/addStat/
// getMaxAffordableStatUps/canSpendStatPoint/addStatMax를 실제 텍스트로 추출해 실행한다
// (재구현 아님). 기존 statCost 공식/STAT_CAP은 절대 바꾸지 않았다는 것도 이 테스트 자체가
// 증명한다(추출한 실제 함수를 그대로 돌려서 공식이 동일한지 확인하므로).
const assert = require('assert');
const { extractBetween, extractFunction, html } = require('./_item-effect-harness');

const statsBlockSrc =
  extractBetween(html, 'const STAT_CAP = 99;', 'function addStatMax(st){') +
  extractFunction(html, 'function addStatMax(st){');

function makeApi(G, DB, logs) {
  const fn = new Function(
    'G', 'DB', 'log', 'notify', 'pbReact', 'updateUI', 'calcStats',
    statsBlockSrc + '\nreturn {statCost, levelStatPoints, statCostTo, totalStatPointsAt, ' +
      'gainBaseExp, addStat, getMaxAffordableStatUps, canSpendStatPoint, addStatMax, STAT_CAP, STAT_KEYS};'
  );
  return fn(
    G, DB || { expTable: {} },
    (m, t) => logs.push({ msg: m, type: t }),
    () => {}, () => {}, () => {},
    () => ({ maxHp: 100, maxSp: 100 })
  );
}

function makePlayer(overrides) {
  return Object.assign({ str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1, statPoints: 0 }, overrides || {});
}

// ══════════════════════════════════════════════
// statCost 경계값 (과제 §21) — 공식 자체는 손대지 않았음을 증명
// ══════════════════════════════════════════════
{
  const G = { player: null };
  const api = makeApi(G, null, []);
  const cases = [
    [1, 2], [10, 2], [11, 3], [20, 3], [21, 4], [91, 11], [98, 11],
  ];
  cases.forEach(([cur, expected]) => {
    assert.strictEqual(api.statCost(cur), expected, `statCost(${cur})는 ${expected}이어야 함(기존 공식 불변)`);
  });
  assert.strictEqual(api.STAT_CAP, 99, 'STAT_CAP은 99 그대로');
  console.log('OK - STATCOST: 경계값 전부 기존 공식과 일치, STAT_CAP=99 불변');
}

// ══════════════════════════════════════════════
// getMaxAffordableStatUps 경계값 (과제 §22)
// ══════════════════════════════════════════════
{
  const G = { player: null };
  const api = makeApi(G, null, []);
  // 과제 §6/§22 명시 예시: STR 41, 보유 20 -> +3 / 보유 18 -> +3 / 보유 17 -> +2
  assert.strictEqual(api.getMaxAffordableStatUps(41, 20), 3, 'cur41/pts20 -> +3(과제 명시 예시)');
  assert.strictEqual(api.getMaxAffordableStatUps(41, 18), 3, 'cur41/pts18 -> +3(정확히 소진)');
  assert.strictEqual(api.getMaxAffordableStatUps(41, 17), 2, 'cur41/pts17 -> +2(1점 부족)');
  // cur 1 경계
  assert.strictEqual(api.getMaxAffordableStatUps(1, 1), 0, 'cur1/pts1 -> +0(cost 2에 못 미침)');
  assert.strictEqual(api.getMaxAffordableStatUps(1, 2), 1, 'cur1/pts2 -> +1');
  assert.strictEqual(api.getMaxAffordableStatUps(1, 20), 10, 'cur1/pts20 -> 1~10구간(비용 2씩) 정확히 10칸 소진');
  // cur 9->10->11 비용 구간 경계(2점 구간 -> 3점 구간)
  assert.strictEqual(api.getMaxAffordableStatUps(9, 3), 1, 'cur9/pts3 -> 9->10(비용2)만, 10->11은 비용3이라 부족');
  assert.strictEqual(api.getMaxAffordableStatUps(9, 4), 2, 'cur9/pts4 -> 9->10->11(비용2+2=4) 정확히 소진');
  // cur 19->20->21 비용 구간 경계(3점 구간 -> 4점 구간)
  assert.strictEqual(api.getMaxAffordableStatUps(19, 6), 2, 'cur19/pts6 -> 19->20->21(비용3+3=6) 정확히 소진');
  assert.strictEqual(api.getMaxAffordableStatUps(19, 9), 2, 'cur19/pts9 -> 21->22 비용4라 3점 남아도 못 감');
  // cur 98 -> 99 (상한 직전)
  assert.strictEqual(api.getMaxAffordableStatUps(98, 11), 1, 'cur98/pts11(충분) -> +1(98->99, 상한 도달)');
  assert.strictEqual(api.getMaxAffordableStatUps(98, 100), 1, 'cur98/pts100(과다) -> 상한(99)에서 멈춰 +1만');
  // cur 99(이미 상한)
  assert.strictEqual(api.getMaxAffordableStatUps(99, 999), 0, 'cur99(이미 상한) -> +0');
  console.log('OK - MAXUPS: 모든 비용 구간 경계 정확히 일치');
}

// ══════════════════════════════════════════════
// canSpendStatPoint A-E (과제 §23)
// ══════════════════════════════════════════════
{
  const G = { player: null };
  const api = makeApi(G, null, []);

  // A. pts 0 -> false
  assert.strictEqual(api.canSpendStatPoint(makePlayer({ statPoints: 0 })), false, 'A: 포인트 0 -> false');

  // B. pts 2, 모든 스탯 다음 비용 >=3(전부 11 이상) -> false
  assert.strictEqual(
    api.canSpendStatPoint(makePlayer({ str: 11, agi: 11, vit: 11, int: 11, dex: 11, luk: 11, statPoints: 2 })),
    false, 'B: 포인트는 있지만 최저 비용(3)보다 적음 -> false'
  );

  // C. pts 3, 하나의 스탯 cost 3(11) -> true
  assert.strictEqual(
    api.canSpendStatPoint(makePlayer({ str: 11, agi: 11, vit: 11, int: 11, dex: 11, luk: 11, statPoints: 3 })),
    true, 'C: 포인트가 최저 비용과 같음 -> true'
  );

  // D. 전부 99 + pts 100 -> false
  assert.strictEqual(
    api.canSpendStatPoint(makePlayer({ str: 99, agi: 99, vit: 99, int: 99, dex: 99, luk: 99, statPoints: 100 })),
    false, 'D: 전부 상한이면 포인트 있어도 false'
  );

  // E. 5개 99 / 1개 1 / pts2 -> true
  assert.strictEqual(
    api.canSpendStatPoint(makePlayer({ str: 99, agi: 99, vit: 99, int: 99, dex: 99, luk: 1, statPoints: 2 })),
    true, 'E: 하나라도 감당 가능하면 true'
  );

  console.log('OK - CANSPEND: A-E 전부 과제 명세와 일치');
}

// ══════════════════════════════════════════════
// 실제 클릭(함수 실행) — +1 / 최대 / 부족 (과제 §24)
// ══════════════════════════════════════════════

// +1: 실제 스탯 +1, 정확한 cost 차감
{
  const logs = [];
  const G = { player: makePlayer({ str: 41, statPoints: 20 }) };
  const api = makeApi(G, null, logs);
  api.addStat('str', 1);
  assert.strictEqual(G.player.str, 42, '+1 클릭: str 42로 증가');
  assert.strictEqual(G.player.statPoints, 20 - api.statCost(41), '+1 클릭: 정확한 cost만 차감');
  console.log('OK - CLICK +1: 실제 실행 결과 정확');
}

// 최대: UI가 예고하는 계산값과 실제 실행 결과가 정확히 같음
{
  const logs = [];
  const G = { player: makePlayer({ str: 41, statPoints: 20 }) };
  const api = makeApi(G, null, logs);
  const predicted = api.getMaxAffordableStatUps(41, 20);
  const before = G.player.statPoints;
  api.addStatMax('str');
  assert.strictEqual(G.player.str, 41 + predicted, '최대 클릭: UI 예고 칸수(3)만큼 정확히 상승');
  const spent = before - G.player.statPoints;
  const expectedSpent = api.statCostTo(41 + predicted) - api.statCostTo(41);
  assert.strictEqual(spent, expectedSpent, '최대 클릭: 실제 차감 포인트가 statCostTo 차이(독립 검증)와 일치');
  console.log('OK - CLICK 최대: UI 계산값(getMaxAffordableStatUps)과 실제 addStat 실행 결과 완전 일치');
}

// 부족: 클릭해도 변화 없음
{
  const logs = [];
  const G = { player: makePlayer({ str: 11, statPoints: 2 }) }; // cost(11)=3, 보유 2 -> 부족
  const api = makeApi(G, null, logs);
  api.addStat('str', 1);
  assert.strictEqual(G.player.str, 11, '부족: str 변화 없음');
  assert.strictEqual(G.player.statPoints, 2, '부족: 포인트 변화 없음');
  assert.ok(logs.some(l => l.msg.includes('부족')), '부족: 경고 로그 존재');
  console.log('OK - CLICK 부족: 변화 없음, 경고 로그만 발생');
}

// 상한: 이미 99인 스탯은 addStat/addStatMax 둘 다 무변화
{
  const logs = [];
  const G = { player: makePlayer({ str: 99, statPoints: 999 }) };
  const api = makeApi(G, null, logs);
  api.addStat('str', 1);
  assert.strictEqual(G.player.str, 99, '상한: addStat(1)도 무변화');
  api.addStatMax('str');
  assert.strictEqual(G.player.str, 99, '상한: addStatMax도 무변화');
  assert.strictEqual(G.player.statPoints, 999, '상한: 포인트도 전혀 소모되지 않음');
  console.log('OK - CLICK 상한: STAT_CAP 도달 시 +1/최대 둘 다 무변화');
}

// ══════════════════════════════════════════════
// 레벨업 (과제 §25)
// ══════════════════════════════════════════════
{
  const logs = [];
  const G = { player: makePlayer({ statPoints: 0, baseLv: 10, baseExp: 0 }) };
  const DB = { expTable: { 10: 100 } }; // baseLv 10 -> 11로 정확히 1회 레벨업하도록 구성
  const api = makeApi(G, DB, logs);
  const expectedGain = api.levelStatPoints(10); // 올리기 전 레벨(10) 기준
  const before = G.player.statPoints;
  api.gainBaseExp(G.player, 100);
  assert.strictEqual(G.player.baseLv, 11, '레벨업: baseLv 11로 증가');
  assert.strictEqual(G.player.statPoints, before + expectedGain, '레벨업: 실제 levelStatPoints() 반환값만큼 정확히 증가(하드코딩 아님)');
  const lvUpLog = logs.find(l => l.msg.includes('Base Lv.11'));
  assert.ok(lvUpLog, '레벨업 로그 존재');
  assert.ok(lvUpLog.msg.includes(`+${expectedGain}`), '레벨업 로그: 획득량이 실제 값과 일치');
  assert.ok(lvUpLog.msg.includes(`보유 ${G.player.statPoints}`), '레벨업 로그: 보유량이 갱신된 실제 값과 일치');
  const canSpendNow = api.canSpendStatPoint(G.player);
  assert.strictEqual(lvUpLog.msg.includes('능력치 배분 가능'), canSpendNow, '레벨업 로그: 배분가능 문구는 canSpendStatPoint 결과와 정확히 일치');
  console.log('OK - LEVELUP: 획득량/보유량/로그/canSpendStatPoint 전부 일치');
}

// 레벨업 후 실제로 배분 불가능한 경우(포인트를 얻어도 문구가 붙지 않아야 함)
{
  const logs = [];
  // 모든 스탯을 99로 만들어 포인트를 얻어도 canSpendStatPoint가 false가 되게 구성
  const G = { player: makePlayer({ str: 99, agi: 99, vit: 99, int: 99, dex: 99, luk: 99, statPoints: 0, baseLv: 10, baseExp: 0 }) };
  const DB = { expTable: { 10: 100 } };
  const api = makeApi(G, DB, logs);
  api.gainBaseExp(G.player, 100);
  const lvUpLog = logs.find(l => l.msg.includes('Base Lv.11'));
  assert.ok(lvUpLog, '레벨업 로그 존재');
  assert.ok(!lvUpLog.msg.includes('능력치 배분 가능'), '전부 상한이면 포인트를 얻어도 배분가능 문구 없음(포인트 획득 != 항상 배분 가능)');
  console.log('OK - LEVELUP 배분불가: 전부 상한이면 포인트 획득해도 배분가능 문구 없음');
}

console.log('ALL TESTS PASS - stat-allocation-ui-smoke');
