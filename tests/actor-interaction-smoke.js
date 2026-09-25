const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let lastModal = null;
let logs = [];
let notices = [];

global.window = global;
global.document = {
  readyState: 'complete',
  head: { appendChild(){} },
  getElementById(){ return null; },
  createElement(){ return { id:'', textContent:'' }; },
  querySelectorAll(){ return []; },
  addEventListener(){}
};
global.openModal = (title, body, actions) => { lastModal = { title, body, actions }; };
global.closeModal = () => {};
global.log = (msg, type) => logs.push({ msg, type });
global.logSep = () => {};
global.notify = (msg, type) => notices.push({ msg, type });
global.saveLocal = () => {};
global.updateUI = () => {};
global.showDialogModal = () => {};
global.handleDialogEnd = () => {};
global.showShopModal = () => {};
global.showRefineModal = () => {};
global.kafraSetSave = () => {};
global.kafraWarehouse = () => {};
global.kafraWarpMenu = () => {};
global.kafraTeleport = () => {};
global.serviceDungeonUnlock = () => {};
global.serviceRunExchange = () => {};
global.REBIRTH_DONATION = 1285000;
global.TRANS2ND_ENTRY_JOB = {};
global.JOB2_EXCLUSIVE_GROUPS = {};
global.checkRebirthEligibility = () => null;
global.startJobChangeDialog = () => true;
global.window.talkNPC = () => {};

global.DB = {
  maps: {
    '프론테라': { emoji:'🏰', entryDesc:'광장에는 사람들이 오간다.', firstVisitDesc:'처음 왕도에 도착했다.' },
    '페이욘': { emoji:'🏹', entryDesc:'숲의 마을이다.' },
    '유노': { emoji:'📚', entryDesc:'현자의 도시다.' },
    '침몰선': { emoji:'🚢', entryDesc:'낡은 배다.' }
  },
  npcs: {
    '징병관': { map:'프론테라', emoji:'🪖', dialog:'토벌대원을 모집한다.', service:'' },
    '카프라 직원(프론테라)': { map:'프론테라', emoji:'🧳', dialog:'무엇을 도와드릴까요?', service:'kafra' },
    '대장장이 홀그렌': { map:'프론테라', emoji:'🔨', dialog:'두들겨 주지!', service:'refine' },
    '미스터 스마일': { map:'페이욘', emoji:'😊', dialog:'재료를 가져오게.', service:'' },
    '전직 시험관': { map:'프론테라', emoji:'⚔️', dialog:'자격을 보겠다.', service:'job_change', targetClass:'소드맨' },
    '피스크': { map:'프론테라', emoji:'⚓', dialog:'침몰선에 갈 텐가?', service:'dungeon_access', cost:250, targetMap:'침몰선' },
    '이미르의 책': { map:'유노', emoji:'📖', dialog:'낡은 고서에서 빛이 난다.', service:'ymir_book' }
  }
};

global.G = {
  currentMap: '프론테라',
  autoHunt: false,
  battles: [],
  player: {
    job:'노비스', baseLv:1, jobLv:1, zeny:100,
    inventory:{}, quests:{}, jobQuests:{}, unlockedMaps:{},
    visitedMaps:{ '프론테라':true }, records:{}
  }
};

global.TUTORIAL_QUESTS = {
  tut_04: {
    title:'카프라 서비스 이용하기', npc:'친절한 노인', type:'interact', target_npc:'카프라 직원'
  },
  smile: {
    title:'미스터 스마일', npc:'미스터 스마일', type:'gather_multi',
    targets:[{item:'클로버',count:10},{item:'솜털',count:10},{item:'젤로피',count:10}]
  }
};
G.player.quests.tut_04 = { state:'active', count:0 };
G.player.quests.smile = { state:'active', count:0 };
G.player.inventory = { 클로버:7, 솜털:10, 젤로피:4 };

global.getJobQuestId = (npcName) => npcName === '전직 시험관' ? 'job_test' : null;
global.getJobQuest = (id) => id === 'job_test' ? {
  title:'전직 시험', targetJob:'소드맨', reqJobLv:10,
  steps:[{id:'intro',type:'dialog'}]
} : null;

const src = fs.readFileSync('source/actor-interaction.js','utf8');
vm.runInThisContext(src, { filename:'actor-interaction.js' });

// 1) 장소 장면은 재방문에서도 entryDesc를 사용하며, interact 목표를 드러낸다.
showNpcModal();
assert(lastModal.body.includes('광장에는 사람들이 오간다.'), 'entryDesc가 장소 장면에 보여야 함');
assert(!lastModal.body.includes('처음 왕도에 도착했다.'), 'firstVisitDesc가 반복 표시되면 안 됨');
assert(lastModal.body.includes('카프라 서비스 이용하기 · 지금 상호작용할 대상'), 'interact 목표가 장면에서 보여야 함');

// 2) 카프라를 열면 interact 목표 달성과 서비스가 동시에 살아 있어야 한다.
talkNPC('카프라 직원(프론테라)');
assert.strictEqual(G.player.quests.tut_04.state, 'completable');
assert(lastModal.body.includes('조건을 달성했습니다.'), 'interact 완료 안내가 패널에 있어야 함');
assert(lastModal.body.includes('창고를 이용한다'), '퀘스트 목표 달성 뒤에도 카프라 서비스가 있어야 함');

// 3) gather_multi 진행량이 항목별로 보여야 한다.
G.currentMap = '페이욘';
talkNPC('미스터 스마일');
assert(lastModal.body.includes('클로버'), 'gather_multi 첫 재료 누락');
assert(lastModal.body.includes('7 / 10'), 'gather_multi 현재 수량 누락');
assert(lastModal.body.includes('10 / 10 ✓'), '완료된 재료 표시 누락');
assert(lastModal.body.includes('4 / 10'), 'gather_multi 세 번째 재료 누락');

// 4) 전직 조건 미달은 로그가 아니라 패널에서 차단한다.
G.currentMap = '프론테라';
logs = [];
talkNPC('전직 시험관');
assert(lastModal.body.includes('Job Lv.10 이상 필요'), '전직 조건 미달 사유가 패널에 보여야 함');
assert(lastModal.body.includes('disabled'), '조건 미달 전직 행동은 비활성이어야 함');
assert.strictEqual(logs.length, 0, '전직 조건 미달이 로그-only 경로로 새면 안 됨');

// 5) 던전 제니 부족은 패널에서 보인다.
talkNPC('피스크');
assert(lastModal.body.includes('조건 미달'), '던전 조건 상태 누락');
assert(lastModal.body.includes('보유 100z'), '던전 보유 제니 누락');

// 6) 이미르의 책은 NPC가 아니라 사물로 표현한다.
G.currentMap = '유노';
talkNPC('이미르의 책');
assert(lastModal.body.includes('· 사물'), '이미르의 책 actorType 표시 누락');
assert(lastModal.body.includes('현자 메테우스 실페'), '후원 전 안내 누락');

// 7) 실제 정본 데이터의 대장장이 배치를 확인한다.
const npcDb = JSON.parse(fs.readFileSync('source/data/db-npcs.json','utf8'));
assert.strictEqual(npcDb['대장장이 홀그렌'].map, '프론테라');
assert.strictEqual(npcDb['대장장이 안토니오'].map, '페이욘');
assert.strictEqual(npcDb['대장장이 아라감'].map, '모로크');

console.log('OK - actor interaction runtime smoke');
