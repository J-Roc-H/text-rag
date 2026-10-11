#!/usr/bin/env node
/*
 * 세계지도 계층 회귀 게이트
 *
 * 실맵(mapId)은 대표 던전의 상세 화면에만 남겨야 한다. 세계지도 토글에서
 * 실맵을 원형으로 전부 배치하는 회귀를 막는다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const source = read('source', 'world-map.js');

assert(source.includes("isMapGroup(n) && !result[n]"), 'expanded view must select representative groups only');
assert(!source.includes('allNames().filter(n=>!result[n])'), 'physical maps must not be appended as global nodes');
assert(source.includes('displayNameFor(name)'), 'mapId must use a player-facing display name');
assert(source.includes('worldMapOpenGroup'), 'representative node must open its physical-map detail');
new Function(source);

const maps = {
  '프론테라': {type:'마을', emoji:'🏰', level:1, safe:true, connected:['알데바란']},
  '알데바란': {type:'마을', emoji:'🕰️', level:40, safe:true, connected:['프론테라', '알데바란 시계탑 1층']},
  '알데바란 시계탑 심층': {
    kind:'group', displayName:'알데바란 시계탑 심층', type:'던전', emoji:'⌛', level:40,
    connected:['알데바란 시계탑 1층'], members:['alde_dun01', 'alde_dun02']
  },
  c_tower1: {kind:'map', mapId:'c_tower1', displayName:'알데바란 시계탑 1층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun01: {kind:'map', mapId:'alde_dun01', displayName:'알데바란 시계탑 1층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun02: {kind:'map', mapId:'alde_dun02', displayName:'알데바란 시계탑 2층', type:'던전', emoji:'⌛', level:40, connected:[]}
};

function render({expanded=false}={}) {
  let rendered='';
  let openedGroup=null;
  const detail={innerHTML:''};
  const windowObj={};
  const documentObj={
    querySelectorAll(){ return []; },
    getElementById(){ return detail; }
  };
  const execute = new Function('DB', 'G', 'window', 'document', 'openModal', 'closeModal', 'setTimeout', 'showMapGroupModal', 'getMap', `${source}\nreturn window;`);
  const world = execute(
    {maps}, {currentMap:'프론테라'}, windowObj, documentObj,
    (_title, html)=>{ rendered=html; }, ()=>{}, callback=>callback(),
    group=>{ openedGroup=group; }, ref=>maps[ref==='알데바란 시계탑 1층' ? 'c_tower1' : ref] || null
  );
  world.showWorldMapModal();
  if(expanded) world.worldMapToggleAll();
  return {world, detail, get html(){ return rendered; }, get openedGroup(){ return openedGroup; }};
}

function globalNodeNames(html) {
  return Array.from(html.matchAll(/data-name="([^"]+)"/g), match=>match[1]);
}

const main = render();
assert(!globalNodeNames(main.html).includes('alde_dun01'), 'default world map excludes physical mapId');
assert(!globalNodeNames(main.html).includes('알데바란 시계탑 심층'), 'default world map keeps major routes only');

const expanded = render({expanded:true});
const expandedNodes = globalNodeNames(expanded.html);
assert(expandedNodes.includes('알데바란 시계탑 심층'), 'expanded world map includes one dungeon representative');
assert(!expandedNodes.includes('alde_dun01') && !expandedNodes.includes('alde_dun02'), 'expanded world map still excludes physical mapIds');
assert(!expanded.html.includes('alde_dun01'), 'raw mapId is not rendered into the world-map UI');
const clockNode = expanded.html.match(/data-name="알데바란 시계탑 심층" transform="translate\(([^,]+),([^\)]+)\)"/);
assert(clockNode, 'clock-tower representative is rendered');
assert.strictEqual(Number(clockNode[1]), 420, 'legacy floor connection anchors its group at Aldebaran, not the fallback city');
assert(Number(clockNode[2]) < 165, 'representative is placed beside its anchor');

expanded.world.worldMapSelect('알데바란 시계탑 심층');
assert(expanded.detail.innerHTML.includes('실제 맵 2곳 보기'), 'group detail exposes a physical-map drilldown');
expanded.world.worldMapOpenGroup();
assert.strictEqual(expanded.openedGroup, '알데바란 시계탑 심층', 'drilldown opens the selected representative group');

const built = read('index.html');
assert(built.includes('id="world-map-v1"'), 'built page includes the world-map bundle');
assert(built.includes("isMapGroup(n) && !result[n]"), 'built page uses representative-only expansion');
assert(!built.includes('allNames().filter(n=>!result[n])'), 'built page does not append physical maps globally');

console.log('PASS world map hierarchy regression: representative nodes only, physical maps stay in detail');
