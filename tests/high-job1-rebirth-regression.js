'use strict';

// 브라우저 없이도 전직 엔진의 실제 소스 함수를 실행한다. 이 시험은 전승 뒤
// 비전승 job1_* 완료 기록이 남은 세이브를 직접 재현한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const CASES = [
  ['JOB_SWD', '소드맨 하이'], ['JOB_MG', '마법사 하이'],
  ['JOB_ARC', '궁수 하이'],  ['JOB_ACO', '복사 하이'],
  ['JOB_THF', '도둑 하이'],  ['JOB_MER', '상인 하이']
];
const source = fs.readFileSync('source/template.html', 'utf8');
const actorSource = fs.readFileSync('source/actor-interaction.js', 'utf8');

function extractFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} source not found`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`${name} source is not balanced`);
}

const highCodes = {
  JOB_SWD: 'JOB_HSWD', JOB_MG: 'JOB_HMG', JOB_ARC: 'JOB_HARC',
  JOB_ACO: 'JOB_HACO', JOB_THF: 'JOB_HTHF', JOB_MER: 'JOB_HMER'
};
const jobCode = {
  JOB_HNOV: '노비스 하이', JOB_HSWD: '소드맨 하이', JOB_HMG: '마법사 하이',
  JOB_HARC: '궁수 하이', JOB_HACO: '복사 하이', JOB_HTHF: '도둑 하이',
  JOB_HMER: '상인 하이'
};
const jobNameToCode = Object.fromEntries(Object.entries(jobCode).map(([code, name]) => [name, code]));

const context = {
  DB: { jobCode },
  JOB_NAME2CODE: jobNameToCode,
  BASE1ST_TO_HIGH: highCodes,
  TRANS2ND_ENTRY_JOB: {}, JOB2_EXCLUSIVE_GROUPS: {},
  normalizeJob: name => name,
  josa: name => name,
  REBIRTH_ELIGIBLE_2ND: [],
  G: { player: null },
  logs: [],
  log: msg => context.logs.push(msg),
  notify() {}, updateUI() {}, closeModal() {},
  initJobQuest(p, questId) {
    p.jobQuests ||= {};
    p.jobQuests[questId] ||= { state: 'available', step: 0, stepData: {} };
  },
  processJobQuestStep: (questId, q, jq) => { context.lastProcessed = { questId, q, jq }; },
  getJobQuest() { return null; },
  doJob: target => { context.G.player.job = target; },
  checkRebirthEligibility() { return null; },
  expelFromValhalla() {}
};
vm.createContext(context);
[
  extractFunction(source, 'getHighJob1QuestEntry'),
  extractFunction(source, 'restartHighJob1Quest'),
  extractFunction(source, 'resolveJobQuestTarget'),
  extractFunction(source, 'handleJobQuestNpc'),
  extractFunction(source, 'doJobQuestFinish'),
  extractFunction(source, 'jobTreeEntryJob'),
  extractFunction(source, 'jobTreeStatus'),
  extractFunction(actorSource, 'aiJobContext')
].forEach(code => vm.runInContext(code, context));

for (const [prevJobCode, highJob] of CASES) {
  const p = {
    job: '노비스 하이', rebirth: true, prevJobCode,
    baseLv: 23, jobLv: 10, skillPoints: 0, inventory: {}, zeny: 0,
    jobQuests: { job1: { state: 'done', step: 1, stepData: {} } }
  };
  const q = { targetJob: highJob.replace(' 하이', ''), highTargetJob: highJob, reqJobLv: 10,
    steps: [{ id: 'intro', type: 'dialog' }], reward: { job: highJob.replace(' 하이', ''), zeny: 0, items: {} } };
  context.G.player = p;
  context.handleJobQuestNpc('전직 NPC', 'job1', q);
  assert.equal(p.jobQuests.job1.state, 'available', `${prevJobCode}: old job1 record must reopen`);
  assert.equal(context.lastProcessed.questId, 'job1', `${prevJobCode}: reopened quest must continue`);
  context.doJobQuestFinish('job1', q, p.jobQuests.job1);
  assert.equal(p.job, highJob, `${prevJobCode}: must become only its matching high job`);

  const tree = context.jobTreeStatus(highCodes[prevJobCode], { questId: 'job1', q, viaHigh: true }, {
    ...p, job: '노비스 하이', jobQuests: { job1: { state: 'done', step: 1, stepData: {} } }
  });
  assert.equal(tree.st, 'ready', `${prevJobCode}: matching high job must be ready in job tree`);
}

const merchant = { targetJob: '상인', highTargetJob: '상인 하이', reqJobLv: 10,
  steps: [{ id: 'intro', type: 'dialog' }], reward: { job: '상인', zeny: 0, items: {} } };
const wrong = {
  job: '노비스 하이', rebirth: true, prevJobCode: 'JOB_SWD', baseLv: 23, jobLv: 10,
  skillPoints: 0, inventory: {}, zeny: 0, jobQuests: { job1_merchant: { state: 'done', step: 1, stepData: {} } }
};
context.G.player = wrong;
context.logs = [];
context.handleJobQuestNpc('상인 조합장', 'job1_merchant', merchant);
assert.equal(wrong.jobQuests.job1_merchant.state, 'done', 'wrong lineage must not reopen a completed job1 quest');
assert(context.logs.some(msg => msg.includes('소드맨 하이')), 'wrong lineage must explain the permitted high job');

const userSave = {
  job: '노비스 하이', rebirth: true, prevJobCode: 'JOB_MER', baseLv: 23, jobLv: 10,
  skillPoints: 0, jobQuests: { job1_merchant: { state: 'done', step: 1, stepData: {} } }
};
context.getJobQuestId = (npc, job) => npc === '상인 조합장' && job === '노비스 하이' ? 'job1_merchant' : null;
context.getJobQuest = id => id === 'job1_merchant' ? merchant : null;
const actor = context.aiJobContext('상인 조합장', userSave);
assert.equal(actor.ok, true, 'actor UI must offer the high merchant action despite old normal-job completion');
assert(!actor.reason.includes('이미 상인의 절차를 마쳤습니다.'), 'actor UI must not show the old completion lock');

console.log('PASS high first-job rebirth: six lineages, save migration, actor gate, job tree, wrong-line block');
