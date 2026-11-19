'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('source/template.html', 'utf8');
const actor = fs.readFileSync('source/actor-interaction.js', 'utf8');
function fn(text, name) {
  let start = text.indexOf(`function ${name}(`), open = text.indexOf('{', start), depth = 0;
  assert(start >= 0);
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw Error(name);
}
const context = { G:{player:null}, DB:{jobCode:{JOB_HNOV:'노비스 하이'}}, logs:[],
  getHighJob1QuestEntry:(q,p)=>({isHigh:!!(q.highTargetJob && p.rebirth && p.job === '노비스 하이'),allowed:true}),
  renderJobDialogNode(){}, openModal(title, html){context.lastHtml=html}, doJobQuestFinish(){},
  closeModal(){}, josa:()=>'', log:()=>{} };
vm.createContext(context);
const start=src.indexOf('const JOB_QUESTS = {');
const end=src.indexOf('// ── 전직 퀘스트 엔진',start);
vm.runInContext(src.slice(start,end), context);
vm.runInContext(src.slice(src.indexOf('const HIGH_JOB1_GREETING = {'),src.indexOf('function showJobQuestDialog(')),context);
for (const name of ['getJobQuestId','getJobQuest','showJobQuestDialog','completeJobQuest','buildJobDialogHtml']) vm.runInContext(fn(src,name),context);
vm.runInContext(fn(actor,'aiJobContext'),context);
vm.runInContext(`globalThis.data={JOB_QUESTS,JOB1_QUESTS,TRANS2ND_ENTRY_JOB}; globalThis.dialog=()=>_jobDialogState`,context);
for(const [id,q] of Object.entries(context.data.JOB1_QUESTS)) {
  const normal={job:'노비스',rebirth:false}; context.G.player=normal;
  context.showJobQuestDialog(id,q,{},q.steps[0],'main');
  assert.equal(context.dialog().nodes[0].text,q.steps[0].dialog[0].text,`${id} normal greeting`);
  const high={job:'노비스 하이',rebirth:true}; context.G.player=high;
  context.showJobQuestDialog(id,q,{},q.steps[0],'main');
  assert.notEqual(context.dialog().nodes[0].text,q.steps[0].dialog[0].text,`${id} rebirth greeting`);
  assert.equal(context.dialog().nodes[1],q.steps[0].dialog[1],`${id} choices preserved`);
  context.completeJobQuest(id,q,{},q.steps[1]); assert(context.lastHtml.includes(q.highTargetJob),`${id} rebirth reward title`);
  context.G.player=normal; context.completeJobQuest(id,q,{},q.steps[1]);
  assert(context.lastHtml.includes(q.steps[1].dialog[0].text),`${id} normal reward`);
}
let count=0;
for(const [id,q] of Object.entries(context.data.JOB_QUESTS)) {
  if(!id.startsWith('job3_')) continue;
  const job=context.data.TRANS2ND_ENTRY_JOB[q.reqJob];
  const p={job,rebirth:true,jobLv:50,baseLv:99,jobQuests:{}};
  for(const key of Object.keys(context.data.JOB_QUESTS).filter(k=>k.startsWith('job2_'))) p.jobQuests[key]={state:'done'};
  const result=context.aiJobContext(q.npc,p);
  assert.equal(result.questId,id,`${id} NPC route`);
  assert.equal(result.ok,true,`${id}: ${result.reason}`);
  assert(q.steps[0].dialog.some(n=>n.text && /전승|돌아|다시|경험|기억/.test(n.text)),`${id} recognition`);
  count++;
}
assert.equal(count,13);
console.log('PASS 6 rebirth greetings and completion dialogs, normal dialogs, 13 trans second-job NPC routes');
