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

const parseItemSrc = extractFunction(html, 'function parseItem(name) {');
const calcStatsSrc = extractFunction(html, 'function calcStats(){');
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
  runCalcStats, makeTriggerItemEffects, makeParseItemFn, makePlayer, makeDB, pickRealItems,
};
