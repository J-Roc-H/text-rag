'use strict';
// 튜토리얼 현장 완료(DEVREF-E-C P2-16) 회귀 검사.
// template.html의 실제 TUTORIAL_QUESTS와 퀘스트 함수 텍스트를 그대로 추출해 Node vm에서 돌린다(재구현 아님).
// 확인: 노인 방문은 처음(퀴즈)과 마지막(전직 갈림길) 두 번 · 보상 총량 불변 · 옛 'completable' 세이브 호환 ·
// 지역 퀘스트는 기존처럼 보고 필요.
const assert = require('assert');
const vm = require('vm');
const { extractBetween, extractFunction, html } = require('./_item-effect-harness');

const src = [
  extractFunction(html, 'const TUTORIAL_QUESTS = {') + ';',
  extractFunction(html, 'function checkQuestKill(monsterName) {'),
  extractFunction(html, 'function checkQuestGather() {'),
  extractFunction(html, 'function giveQuestReward(q) {'),
  extractBetween(html, '// ── 튜토리얼 현장 완료', '// ── 다음 퀘스트 해금'),
  extractFunction(html, 'function unlockNextQuest(q) {'),
  extractFunction(html, 'function handleDialogEnd(questId, branch) {'),
].join('\n');

function makeEnv() {
  const logs = [];
  const ctx = {
    G: { player: { quests: {}, inventory: {}, zeny: 0, jobExp: 0, jobLv: 1, job: '노비스', unlockedMaps: {} } },
    log: (m) => logs.push(String(m)),
    notify: () => {},
    updateUI: () => {},
    gainBaseExp: () => {},
    getJobLvCap: () => 10,
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.__api={TUTORIAL_QUESTS,checkQuestKill,checkQuestGather,handleDialogEnd,autoCompleteTutorialStep,isTutorialAutoStep};', ctx);
  return { ctx, api: ctx.__api, p: ctx.G.player, logs };
}
const st = (p, id) => p.quests[id] && p.quests[id].state;

// 1) 처음부터 끝까지: 노인은 퀴즈와 전직 갈림길에서만 만난다
{
  const { api, p } = makeEnv();
  p.quests.tut_01 = { state: 'available', count: 0 };
  api.handleDialogEnd('tut_01', 'quiz_correct');            // 노인 방문 1
  assert.strictEqual(st(p, 'tut_01'), 'done');
  assert.strictEqual(st(p, 'tut_02'), 'active', '퀴즈 직후 첫 사냥이 바로 수락된다');

  for (let i = 0; i < 3; i++) api.checkQuestKill('포링');
  assert.strictEqual(st(p, 'tut_02'), 'done', '포링 3마리째에 그 자리에서 완료');
  assert.strictEqual(st(p, 'tut_03'), 'active');

  p.inventory['젤로피'] = 5;
  api.checkQuestGather();
  assert.strictEqual(st(p, 'tut_03'), 'done', '젤로피 5개째에 그 자리에서 완료');
  assert.strictEqual(st(p, 'tut_04'), 'active');

  // 카프라 대화 지점은 NPC 대화 함수 안이라, 그 지점과 같은 순서(completable → 자동 완료)로 부른다
  p.quests.tut_04.state = 'completable';
  assert.strictEqual(api.autoCompleteTutorialStep('tut_04'), true);
  assert.strictEqual(st(p, 'tut_04'), 'done');
  assert.strictEqual(st(p, 'tut_05'), 'available', '전직 갈림길은 노인에게 가서 받는다'); // 노인 방문 2

  // 보상 총량 = 기존 정의 합계 (젤로피는 원래도 회수하지 않는다)
  assert.strictEqual(p.zeny, 200 + 300);
  assert.strictEqual(p.inventory['빨간포션'], 5 + 3);
  assert.strictEqual(p.inventory['주홍포션'], 3);
  assert.strictEqual(p.inventory['나비의 날개'], 2);
  assert.strictEqual(p.inventory['젤로피'], 5);
}

// 2) 포링을 잡는 동안 젤로피를 이미 5개 모았다면, 사냥 완료 순간 수집도 바로 끝난다
{
  const { api, p } = makeEnv();
  p.quests.tut_02 = { state: 'active', count: 2 };
  p.inventory['젤로피'] = 6;
  api.checkQuestKill('포링');
  assert.strictEqual(st(p, 'tut_02'), 'done');
  assert.strictEqual(st(p, 'tut_03'), 'done');
  assert.strictEqual(st(p, 'tut_04'), 'active');
}

// 3) 옛 세이브: 'completable'로 저장된 단계는 노인에게 보고하면 다음 단계가 바로 수락된다
{
  const { api, p } = makeEnv();
  p.quests.tut_02 = { state: 'completable', count: 3 };
  api.handleDialogEnd('tut_02', 'complete');
  assert.strictEqual(st(p, 'tut_02'), 'done');
  assert.strictEqual(st(p, 'tut_03'), 'active');
  // 옛 세이브의 'available' 단계는 건드리지 않는다(노인에게 받으면 된다)
  const b = makeEnv();
  b.p.quests.tut_03 = { state: 'available', count: 0 };
  b.api.checkQuestGather();
  assert.strictEqual(st(b.p, 'tut_03'), 'available');
}

// 4) 대상 밖: 전직 갈림길과 지역 퀘스트는 자동 완료하지 않는다
{
  const { api, p, logs } = makeEnv();
  assert.strictEqual(api.isTutorialAutoStep(api.TUTORIAL_QUESTS.tut_05), false);
  assert.strictEqual(api.isTutorialAutoStep(api.TUTORIAL_QUESTS.tut_02), true);
  const rq = api.TUTORIAL_QUESTS.Q_PAY_RENO;
  p.quests.Q_PAY_RENO = { state: 'active', count: rq.count - 1 };
  api.checkQuestKill(rq.target);
  assert.strictEqual(st(p, 'Q_PAY_RENO'), 'completable', '지역 퀘스트는 기존대로 보고 필요');
  assert(logs.some(m => m.includes('보고하세요')));
}

// 5) 카프라 대화 두 지점 모두 자동 완료로 배선됐는지 (NPC 대화 함수는 vm 추출 범위 밖)
{
  const autoCalls = (html.match(/(?<!function )autoCompleteTutorialStep\(id\)/g) || []).length;
  assert.strictEqual(autoCalls, 4, 'kill·gather·interact 2곳 = 4곳에서 호출');
  // talkNPC를 덮어쓰는 두 모듈도 카프라 단계를 그 자리에서 완료해야 한다 (브라우저 실측에서 발견)
  const fs = require('fs'), path = require('path');
  for (const f of ['actor-interaction.js', 'services.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'source', f), 'utf8');
    assert(s.includes('autoCompleteTutorialStep(id)'), `${f}: 카프라 단계 자동 완료 배선 누락`);
  }
}

console.log('tutorial-shortcut-smoke: OK');
