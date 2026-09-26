'use strict';
// 아이템/카드 효과 테스트 공용 하네스 (P0-A 교정 + P0-B 컬렉터 테스트가 공유).
// source/template.html의 실제 calcStats()/parseItem()/카드 effect-on-hit 블록과
// source/item-effects.js를 그대로 읽어 Node에서 실행 가능한 형태로 조립한다.
// 재구현이 아니라 실제 소스 텍스트 추출이므로, 여기서 검증한 동작은 실제 빌드 산출물의
// 동작과 항상 같다(추출 위치가 바뀌면 marker를 못 찾아 즉시 에러로 드러난다).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const HTML_PATH = path.join(__dirname, '..', 'source', 'template.html');
const ITEM_EFFECTS_PATH = path.join(__dirname, '..', 'source', 'item-effects.js');
const ITEMS_PATH = path.join(__dirname, '..', 'source', 'data', 'db-items.json');

function extractFunction(src, startMarker) {
  const startIdx = src.indexOf(startMarker);
  assert(startIdx >= 0, `marker not found: ${startMarker}`);
  let depth = 0, i = src.indexOf('{', startIdx);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(startIdx, i + 1);
}

function extractBetween(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  assert(s >= 0, `start marker not found: ${startMarker}`);
  const e = src.indexOf(endMarker, s);
  assert(e >= 0, `end marker not found: ${endMarker}`);
  return src.slice(s, e);
}

const html = fs.readFileSync(HTML_PATH, 'utf8');
const itemEffectsSrc = fs.readFileSync(ITEM_EFFECTS_PATH, 'utf8');
const items = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8'));

// template.html에 인라인으로 박혀 있는 <script id="...">JSON</script> 정본 데이터를
// 그대로 읽는다(재구현 아님) -- db-size/db-element는 별도 source/data/*.json 파일이 아니라
// template.html 안에 직접 박혀 있다.
function extractInlineJson(src, scriptId) {
  const re = new RegExp('<script id="' + scriptId + '"[^>]*>([\\s\\S]*?)</script>');
  const m = src.match(re);
  assert(m, `inline script not found: ${scriptId}`);
  return JSON.parse(m[1]);
}
const sizeMatrix = extractInlineJson(html, 'db-size');
const elementMatrix = extractInlineJson(html, 'db-element');

const parseItemSrc = extractFunction(html, 'function parseItem(name) {');
const calcStatsSrc = extractFunction(html, 'function calcStats(playerOverride){');
const normalizeJobSrc = extractFunction(html, 'function normalizeJob(name){');

// calcStats()의 마지막 s.statBreakdowns 계산은 UI 표시용 상세 브레이크다운이라
// 최종 수치(s.dex/s.hit/...) 검증과는 무관하다 -- no-op으로 스텁.
const BREAKDOWN_STUBS = [
  'buildStatBreakdown', 'buildAtkBreakdown', 'buildMatkBreakdown', 'buildDefBreakdown',
  'buildMdefBreakdown', 'buildHitBreakdown', 'buildFleeBreakdown', 'buildCritBreakdown',
  'buildAspdBreakdown', 'buildMaxHpBreakdown', 'buildMaxSpBreakdown',
].map(n => `function ${n}(){ return null; }`).join('\n');

function runCalcStats(DB, G) {
  const fn = new Function(
    'G', 'DB',
    itemEffectsSrc + '\n' + BREAKDOWN_STUBS + '\n' + normalizeJobSrc + '\n' + parseItemSrc + '\n' + calcStatsSrc + '\nreturn calcStats();'
  );
  return fn(G, DB);
}

// P0-C1: 실제 실행기(triggerItemEffects)를 item-effects.js에서 그대로 가져온다.
// processTurn()의 인라인 재파싱 블록은 제거됐으므로, 실행 로직은 이제 이 함수 하나뿐이다.
function makeTriggerItemEffects() {
  return new Function(itemEffectsSrc + '\nreturn triggerItemEffects;')();
}

// P0-C2: getSkillSpCost()도 item-effects.js에서 그대로 가져온다.
function makeGetSkillSpCost() {
  return new Function(itemEffectsSrc + '\nreturn getSkillSpCost;')();
}

// P0-C3: applyIncomingItemReduction()/isStatusImmune()도 item-effects.js에서 그대로 가져온다.
function makeApplyIncomingItemReduction() {
  return new Function(itemEffectsSrc + '\nreturn applyIncomingItemReduction;')();
}
function makeIsStatusImmune() {
  return new Function(itemEffectsSrc + '\nreturn isStatusImmune;')();
}

// P0-C4: getEffectiveSkills()/getItemDropBonus()도 item-effects.js에서 그대로 가져온다.
function makeGetEffectiveSkills() {
  return new Function(itemEffectsSrc + '\nreturn getEffectiveSkills;')();
}
function makeGetItemDropBonus() {
  return new Function(itemEffectsSrc + '\nreturn getItemDropBonus;')();
}

// P1-C: 장비 비교(getEquipmentComparison) 정본 코드 3블록을 실제 소스 텍스트 그대로
// 추출한다. equipSrc는 equipItem() 자신까지 포함한다 -- 실제 equip parity 테스트(§28)가
// "getEquipmentComparison의 candidateStats"와 "실제 equipItem() 실행 후 calcStats()"를
// 같은 소스로 검증해야 하기 때문이다.
const statPanelSrc = extractBetween(html, 'function getSeStatBonus(p){', '// [스타일] 맵 분위기 틴트');
const equipSrc = extractBetween(html, 'const JOB_WEAPON_ALLOW', 'function unequipItem(type){');
const equipCompareSrc = extractBetween(html, 'function _cloneLoadoutForComparison(p){', '/** 장비 후보를 슬롯에');

// G/DB/log 등은 전부 실제 인자로 주입한다(스텁이 아니라 실제 계산에 필요한 값만 넘긴다).
// updateUI/showInvModal은 equipItem()이 호출하지만 장착 판정/결과 자체와는 무관해 no-op.
function makeEquipmentCompareApi(DB, G) {
  const fn = new Function(
    'G', 'DB', 'log', 'josa', 'updateUI', 'showInvModal',
    // JOB_NAME2CODE는 실제 부트스트랩에서 `window.JOB_NAME2CODE = DB.jobName2Code`로
    // 만들어지는 별칭이다(재구현 아님) -- 여기서도 같은 한 줄로 재현한다.
    'var JOB_NAME2CODE = DB.jobName2Code || {};\n' +
      itemEffectsSrc + '\n' + BREAKDOWN_STUBS + '\n' + normalizeJobSrc + '\n' + parseItemSrc + '\n' +
      calcStatsSrc + '\n' + statPanelSrc + '\n' + equipSrc + '\n' + equipCompareSrc +
      '\nreturn { getEquipmentComparison, resolveEquipSlot, applyCandidateEquip, equipItem, calcStats };'
  );
  const logs = [];
  return fn(
    G, DB, (msg, type) => logs.push({ msg, type }), (n) => (/[가-힣]$/.test(n) ? '이' : '가'),
    () => {}, () => {}
  );
}

const rollDropsSrc = extractFunction(html, 'function rollDrops(p, mon, opts, stats){');

// 실제 rollDrops()를 그대로 실행한다(재구현 아님). 로그/이벤트 기록/오토픽업 등록 등
// 드롭 확률 계산과 무관한 부수효과는 no-op으로 스텁하되, 확률 계산에 관여하는
// ensureSettings·returnerMult·getItemDropBonus는 실제 함수/실제 값을 그대로 쓴다.
// window.__dropWarn 분기는 DB에 없는 아이템일 때만 타므로 정상 fixture에서는 도달하지 않는다.
function runRollDrops(DB, G, p, mon, stats) {
  const getItemDropBonus = makeGetItemDropBonus();
  const fn = new Function(
    'G', 'DB', 'ensureSettings', 'returnerMult', 'getItemDropBonus',
    'registerLegacyAutoPickup', 'recordCombatEvent', 'logEvent', 'log', 'pbReact',
    rollDropsSrc + '\nreturn rollDrops;'
  );
  const rollDropsFn = fn(
    G, DB, (pl) => pl.settings, () => 1, getItemDropBonus,
    () => {}, () => {}, () => {}, () => {}, () => {}
  );
  rollDropsFn(p, mon, null, stats);
}

// P0-C5: processTurn()의 평타(정상 공격) 데미지 공식을 실제 소스 텍스트 그대로 추출한다.
// processTurn() 전체는 거대한 함수라 통째로 실행할 수 없으므로, "── [ 플레이어: 평타 및
// 크리티컬 처리 ] ──" 주석부터 "카드 프록" 주석 직전(= 실제 dmg 계산이 끝나는 지점,
// t.currentHp -= dmg; 까지)만 잘라 쓴다 -- 이 지점 이후는 상태이상/흡혈 등 데미지 계산과
// 무관한 후속 처리라 잘라내도 데미지 공식 자체의 실행에는 영향이 없다.
const normalAttackBody = extractBetween(
  html,
  '// ── [ 플레이어: 평타 및 크리티컬 처리 ] ──',
  '// 카드 프록: HP흡수 / SP흡수 / 상태이상 / 오토스펠'
);

// 실제 평타 공식을 그대로 실행한다(재구현 아님). 명중/크리 굴림에 쓰는 Math.random은
// 함수 파라미터로 그림자 처리해 완전히 통제한다(전역 Math를 건드리지 않는다).
// 반환: 명중 실패 시 {missed:true}, 명중 시 {missed:false, dmg, isC}.
function runNormalAttackFormula(p, t, s, se, DB, randomFn) {
  const fnSrc =
    itemEffectsSrc + '\n' +
    'let sUsed = false;\n' +
    normalAttackBody +
    'return { dmg: dmg, isC: isC, missed: false };\n' +
    '}\n}\n' +
    'return { missed: true };';
  const fn = new Function('p', 't', 's', 'se', 'DB', 'Math', fnSrc);
  // Math의 메서드(min/max/floor 등)는 비열거형이라 Object.assign으로는 복사되지 않는다 --
  // getOwnPropertyNames로 전부 끌어온 뒤 random만 통제된 함수로 덮어쓴다.
  const shadowedMath = {};
  Object.getOwnPropertyNames(Math).forEach(function (k) { shadowedMath[k] = Math[k]; });
  shadowedMath.random = randomFn;
  return fn(p, t, s, se, DB, shadowedMath);
}

const useSkillSrc = extractFunction(html, 'function useSkill(name){');

// 실제 useSkill()을 그대로 실행한다(재구현 아님). 전투/처치 이후 로직(퀘스트 체크·드롭·
// EXP 등)은 SP 비용 일관성 검증과 무관하므로 no-op으로 스텁하되, SP 판정/차감/환불과
// P0-C4의 grantSkill/soulgain 판정에 관여하는 calcStats·getSkillSpCost·parseItem·
// getEffectiveSkills·triggerItemEffects는 실제 함수를 그대로 쓴다.
function runUseSkill(DB, G, name) {
  const logs = [];
  const getSkillSpCost = makeGetSkillSpCost();
  const getEffectiveSkills = makeGetEffectiveSkills();
  const triggerItemEffects = makeTriggerItemEffects();
  const parseItemFn = makeParseItemFn(DB);
  const fn = new Function(
    'G', 'DB', 'calcStats', 'getSkillSpCost', 'getEffectiveSkills', 'triggerItemEffects',
    'parseItem', 'log', 'closeModal',
    'queueManualCombatOverride', 'spawnDmg', 'gainBaseExp', 'getJobLvCap', 'addZoneKill',
    'idleTrack', 'returnerMult', 'rollDrops', 'checkQuestKill', 'checkJobQuestKill',
    'logSep', 'updateUI',
    useSkillSrc + '\nreturn useSkill;'
  );
  const useSkillFn = fn(
    G, DB, () => runCalcStats(DB, G), getSkillSpCost, getEffectiveSkills, triggerItemEffects,
    parseItemFn,
    (msg, type) => logs.push({ msg, type }), () => {},
    () => false, () => {}, () => {}, () => 1, () => {},
    () => {}, () => 1, () => {}, () => {}, () => {}, () => {}, () => {}
  );
  useSkillFn(name);
  return logs;
}

function makeParseItemFn(DB) {
  return new Function('DB', normalizeJobSrc + '\n' + parseItemSrc.replace('function parseItem', 'return function parseItem'))(DB);
}

// equip: 문자열이면 무기 슬롯 단축형, 객체면 {슬롯:아이템명, ...} 그대로.
function makePlayer(equip) {
  const equipMap = typeof equip === 'string' ? (equip ? { 무기: equip } : {}) : (equip || {});
  return {
    str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1,
    lv: 1, job: 'JOB_NOVICE',
    equip: equipMap,
    statusEffects: {},
    skills: {},
    inventory: {},
  };
}

// extraItems: {이름: itemObj, ...} db-items.json 실제 항목 또는 합성 fixture를 얹는다.
function makeDB(extraItems) {
  return {
    items: Object.assign(
      { '테스트무기': { type: '무기', atk: 10, wType: '단검', weaponLv: 1, slots: 1 } },
      extraItems || {}
    ),
    jobAlias: {},
    statusEffects: {},
    sizeMatrix: sizeMatrix,
    elementMatrix: elementMatrix,
  };
}

function pickRealItems(names) {
  const out = {};
  names.forEach(n => {
    if (!(n in items)) throw new Error('fixture item missing from db-items.json: ' + n);
    out[n] = items[n];
  });
  return out;
}

module.exports = {
  extractFunction, extractBetween, html, items,
  runCalcStats, makeTriggerItemEffects, makeGetSkillSpCost, runUseSkill,
  makeApplyIncomingItemReduction, makeIsStatusImmune,
  makeGetEffectiveSkills, makeGetItemDropBonus, runRollDrops,
  runNormalAttackFormula, makeEquipmentCompareApi,
  makeParseItemFn, makePlayer, makeDB, pickRealItems,
};
