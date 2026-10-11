#!/usr/bin/env node
/*
 * 세계지도 원작 실맵 회귀 게이트
 *
 * 세부 표시는 원작 던전 맵을 개별 노드로 보여야 한다. 예전 압축 그룹명은
 * 저장 이관용으로만 남고, 세계지도에는 다시 나타나면 안 된다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const source = read('source', 'world-map.js');

assert(source.includes("isDungeonMap(n)"), 'expanded view must select physical dungeon maps');
assert(source.includes("m.kind!=='group'"), 'legacy compression groups must stay invisible');
assert(source.includes('dungeonPosition(base,occupied)'), 'physical floors need collision-aware positions');
assert(!source.includes('worldMapOpenGroup'), 'world map must not reopen legacy compression-group detail');
new Function(source);

const groupKey = '알데바란 시계탑 심층';
const maps = {
  '프론테라': {type:'마을', emoji:'🏰', level:1, safe:true, connected:['알데바란']},
  '알데바란': {type:'마을', emoji:'🕰️', level:40, safe:true, connected:['프론테라', '알데바란 시계탑 1층']},
  [groupKey]: {
    kind:'group', groupId:'clock_tower', displayName:groupKey, type:'던전', emoji:'⌛', level:40,
    connected:['알데바란 시계탑 1층'], members:['c_tower2','c_tower3','c_tower4','alde_dun01','alde_dun02','alde_dun03','alde_dun04']
  },
  c_tower1: {kind:'map', mapId:'c_tower1', displayName:'시계탑 지상 1층', type:'던전', emoji:'⌛', level:40, connected:[]},
  c_tower2: {kind:'map', mapId:'c_tower2', groupId:'clock_tower', displayName:'시계탑 지상 2층', type:'던전', emoji:'⌛', level:40, connected:[]},
  c_tower3: {kind:'map', mapId:'c_tower3', groupId:'clock_tower', displayName:'시계탑 지상 3층', type:'던전', emoji:'⌛', level:40, connected:[]},
  c_tower4: {kind:'map', mapId:'c_tower4', groupId:'clock_tower', displayName:'시계탑 지상 4층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun01: {kind:'map', mapId:'alde_dun01', groupId:'clock_tower', displayName:'시계탑 지하 1층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun02: {kind:'map', mapId:'alde_dun02', groupId:'clock_tower', displayName:'시계탑 지하 2층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun03: {kind:'map', mapId:'alde_dun03', groupId:'clock_tower', displayName:'시계탑 지하 3층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun04: {kind:'map', mapId:'alde_dun04', groupId:'clock_tower', displayName:'시계탑 지하 4층', type:'던전', emoji:'⌛', level:40, connected:[]}
};

function render({expanded=false}={}) {
  let rendered='';
  const detail={innerHTML:''};
  const windowObj={};
  const documentObj={
    querySelectorAll(){ return []; },
    getElementById(){ return detail; }
  };
  const execute = new Function('DB', 'G', 'window', 'document', 'openModal', 'closeModal', 'setTimeout', 'getMap', `${source}\nreturn window;`);
  const world = execute(
    {maps}, {currentMap:'프론테라'}, windowObj, documentObj,
    (_title, html)=>{ rendered=html; }, ()=>{}, callback=>callback(),
    ref=>maps[ref==='알데바란 시계탑 1층' ? 'c_tower1' : ref] || null
  );
  world.showWorldMapModal();
  if(expanded) world.worldMapToggleAll();
  return {world, detail, get html(){ return rendered; }};
}

function globalNodeNames(html) {
  return Array.from(html.matchAll(/data-name="([^"]+)"/g), match=>match[1]);
}
function worldLabels(html) {
  return Array.from(html.matchAll(/<text class="wm-label"[^>]*>([^<]*)<\/text>/g), match=>match[1]);
}
function nodePoint(html, name) {
  const match=html.match(new RegExp(`data-name="${name}" transform="translate\\(([^,]+),([^\\)]+)\\)"`));
  assert(match, `${name}: world-map node missing`);
  return [Number(match[1]), Number(match[2])];
}

const main = render();
assert(!globalNodeNames(main.html).includes('c_tower1'), 'default view keeps only major routes');
assert(!globalNodeNames(main.html).includes(groupKey), 'default view excludes legacy compression group');

const expanded = render({expanded:true});
const expandedNodes = globalNodeNames(expanded.html);
const clockFloors=['c_tower1','c_tower2','c_tower3','c_tower4','alde_dun01','alde_dun02','alde_dun03','alde_dun04'];
clockFloors.forEach(mapId=>assert(expandedNodes.includes(mapId), `${mapId}: original clock-tower map is visible individually`));
assert(!expandedNodes.includes(groupKey), 'discarded clock-tower deep-group never appears as a world-map node');

const labels=worldLabels(expanded.html);
assert(labels.includes('시계탑 지상 2층') && labels.includes('시계탑 지하 4층'), 'physical maps use Korean canonical display names');
assert(!labels.includes(groupKey), 'discarded compression label is not visible');
assert(!labels.includes('c_tower2') && !labels.includes('alde_dun04'), 'raw mapIds are not user-facing labels');

const points=clockFloors.map(mapId=>nodePoint(expanded.html,mapId));
for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
  const [ax,ay]=points[i], [bx,by]=points[j];
  assert(Math.abs(ax-bx)>=88 || Math.abs(ay-by)>=58, 'clock-tower floors must not overlap');
}
assert(points.every(([x,y])=>x>=-80 && x<=2380 && y>=40 && y<=1820), 'clock-tower floors stay inside the expanded map viewport');

// Run the same renderer against the actual migration output.  A small mock can
// prove the clock-tower case, but this catches a later data addition that would
// make any original dungeon map disappear or overlap another node.
const template=read('source','template.html');
function section(from, to) {
  const start=template.indexOf(from);
  const end=template.indexOf(to,start);
  assert(start>=0 && end>=0, `template section missing: ${from}`);
  return template.slice(start,end);
}
const resolver=section('const DB = {};','\nfunction loadDB()');
const live=new Function(`
  const STAT_KEYS=[];
  function totalStatPointsAt(){ return 0; }
  ${resolver}
  return {DB,installMapGroups,installMapSpawns,installMapConnections,rebuildMapIndex,getMap};
`)();
live.DB.maps=JSON.parse(read('source','data','db-maps.json'));
live.DB.mapGroups=JSON.parse(read('source','data','db-map-groups.json'));
live.DB.mapSpawns=JSON.parse(read('source','data','db-map-spawns.json'));
live.DB.mapConnections=JSON.parse(read('source','data','db-map-connections.json'));
live.installMapGroups(); live.rebuildMapIndex();
live.installMapSpawns(); live.rebuildMapIndex();
live.installMapConnections(); live.rebuildMapIndex();

let fullHtml='';
const fullExecute=new Function('DB','G','window','document','openModal','closeModal','setTimeout','getMap',`${source}\nreturn window;`);
const fullWorld=fullExecute(
  live.DB, {currentMap:'프론테라'}, {},
  {querySelectorAll(){ return []; },getElementById(){ return {innerHTML:''}; }},
  (_title,html)=>{ fullHtml=html; }, ()=>{}, callback=>callback(), live.getMap
);
fullWorld.showWorldMapModal(); fullWorld.worldMapToggleAll();

const liveDungeons=Object.entries(live.DB.maps).filter(([,map])=>map && map.type==='던전' && map.kind!=='group').map(([name])=>name);
const liveGroups=Object.entries(live.DB.maps).filter(([,map])=>map && map.kind==='group').map(([name])=>name);
const liveNodes=globalNodeNames(fullHtml);
assert(liveDungeons.every(name=>liveNodes.includes(name)), 'every original dungeon map must be visible in detailed view');
assert(liveGroups.every(name=>!liveNodes.includes(name)), 'no legacy compression group may be visible in detailed view');
const livePoints=Array.from(fullHtml.matchAll(/data-name="([^"]+)" transform="translate\(([^,]+),([^\)]+)\)"/g), match=>[match[1],Number(match[2]),Number(match[3])]);
for(let i=0;i<livePoints.length;i++) for(let j=i+1;j<livePoints.length;j++) {
  const [a,ax,ay]=livePoints[i], [b,bx,by]=livePoints[j];
  if(!liveDungeons.includes(a) && !liveDungeons.includes(b)) continue; // pre-existing base-node layout
  assert(Math.abs(ax-bx)>=88 || Math.abs(ay-by)>=58, `${a} and ${b}: dungeon node overlap`);
}
const liveLabels=worldLabels(fullHtml);
assert(liveGroups.every(name=>!liveLabels.includes(name)), 'compression-group labels must not be user-facing');

const built = read('index.html');
assert(built.includes('id="world-map-v1"'), 'built page includes the world-map bundle');
assert(built.includes("isDungeonMap(n)"), 'built page includes physical dungeon expansion');
assert(!built.includes('worldMapOpenGroup'), 'built page does not expose the discarded group drilldown');

console.log(`PASS world-map physical-node regression: ${liveDungeons.length} original dungeon maps visible, ${liveGroups.length} compression groups hidden, labels separated`);
