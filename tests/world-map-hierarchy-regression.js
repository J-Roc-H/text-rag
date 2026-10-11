#!/usr/bin/env node
/*
 * 세계지도 입구·실맵 계층 회귀 게이트
 *
 * 개요 지도에는 도시·필드와 실제 던전 입구를 함께 둔다. 예전 압축 그룹명은
 * 저장 이관용 컨테이너일 뿐, 지도 노드나 실맵 목록의 행으로 다시 나오면 안 된다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const source = read('source', 'world-map.js');

assert(source.includes('isDungeonEntrance(name)'), 'overview must retain actual dungeon entrances');
assert(source.includes('overviewDungeonEntries()'), 'overview must build the entrance layer');
assert(source.includes('detailDungeonMaps(name)'), 'physical floors belong in the selected-dungeon detail');
assert(source.includes('worldMapToggleEntrances'), 'overview must offer a non-destructive entrance visibility control');
assert(source.includes('worldMapFocus'), 'overview must offer current/selected-map focus controls');
assert(source.includes("m.kind!=='group'"), 'legacy compression groups must stay invisible');
assert(!source.includes('worldMapOpenGroup'), 'world map must not reopen legacy compression-group detail');
new Function(source);

const groupKey = '알데바란 시계탑 심층';
const maps = {
  '프론테라': {type:'마을', emoji:'🏰', level:1, safe:true, connected:['알데바란', '페이욘 동굴 1층']},
  '알데바란': {type:'마을', emoji:'🕰️', level:40, safe:true, connected:['프론테라', 'c_tower1']},
  '루티에': {type:'마을', emoji:'🎄', level:40, safe:true, connected:['루티에 장난감 공장']},
  '페이욘 동굴 1층': {type:'던전', emoji:'⚰', level:20, connected:['페이욘 동굴 3층']},
  '페이욘 동굴 3층': {type:'던전', emoji:'🦊', level:40, connected:[]},
  '루티에 장난감 공장': {type:'던전', emoji:'🎁', level:45, connected:[]},
  [groupKey]: {
    kind:'group', groupId:'clock_tower', displayName:groupKey, type:'던전', emoji:'⌛', level:40,
    connected:['c_tower1'], members:['c_tower2','c_tower3','c_tower4','alde_dun01','alde_dun02','alde_dun03','alde_dun04']
  },
  c_tower1: {kind:'map', mapId:'c_tower1', displayName:'시계탑 지상 1층', type:'던전', emoji:'⌛', level:40, connected:['alde_dun01']},
  c_tower2: {kind:'map', mapId:'c_tower2', groupId:'clock_tower', displayName:'시계탑 지상 2층', type:'던전', emoji:'⌛', level:40, connected:[]},
  c_tower3: {kind:'map', mapId:'c_tower3', groupId:'clock_tower', displayName:'시계탑 지상 3층', type:'던전', emoji:'⌛', level:40, connected:[]},
  c_tower4: {kind:'map', mapId:'c_tower4', groupId:'clock_tower', displayName:'시계탑 지상 4층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun01: {kind:'map', mapId:'alde_dun01', groupId:'clock_tower', displayName:'시계탑 지하 1층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun02: {kind:'map', mapId:'alde_dun02', groupId:'clock_tower', displayName:'시계탑 지하 2층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun03: {kind:'map', mapId:'alde_dun03', groupId:'clock_tower', displayName:'시계탑 지하 3층', type:'던전', emoji:'⌛', level:40, connected:[]},
  alde_dun04: {kind:'map', mapId:'alde_dun04', groupId:'clock_tower', displayName:'시계탑 지하 4층', type:'던전', emoji:'⌛', level:40, connected:[]}
};

function render({runtimeMaps=maps, currentMap='프론테라'}={}) {
  let rendered='';
  const detail={innerHTML:''};
  const windowObj={};
  const documentObj={
    querySelectorAll(){ return []; },
    getElementById(){ return detail; }
  };
  const execute = new Function('DB', 'G', 'window', 'document', 'openModal', 'closeModal', 'setTimeout', 'getMap', `${source}\nreturn window;`);
  const world = execute(
    {maps:runtimeMaps}, {currentMap}, windowObj, documentObj,
    (_title, html)=>{ rendered=html; }, ()=>{}, callback=>callback(), ref=>runtimeMaps[ref] || null
  );
  world.showWorldMapModal();
  return {world, detail, get html(){ return rendered; }};
}

function globalNodeNames(html) {
  return Array.from(html.matchAll(/data-name="([^"]+)"/g), match=>match[1]);
}
function worldLabels(html) {
  return Array.from(html.matchAll(/<text class="wm-label"[^>]*>([^<]*)<\/text>/g), match=>match[1]);
}

const main = render();
const overviewNodes = globalNodeNames(main.html);
assert(overviewNodes.includes('루티에 장난감 공장'), 'Toy Factory remains on the world overview');
assert(overviewNodes.includes('페이욘 동굴 1층'), 'Payon Cave entrance remains on the world overview');
assert(overviewNodes.includes('c_tower1'), 'clock-tower physical entrance remains on the world overview');
assert(!overviewNodes.includes(groupKey), 'discarded clock-tower deep-group never appears as a world-map node');
assert(!worldLabels(main.html).includes(groupKey), 'discarded compression label is never user-facing');

// A dense world overview can fold entrance markers for orientation, but this
// must be presentation-only: one action restores the same physical entries.
main.world.worldMapToggleEntrances();
const geographyNodes=globalNodeNames(main.detail.innerHTML);
assert(!geographyNodes.includes('루티에 장난감 공장'), 'geographic view can hide an entrance marker without deleting the dungeon');
assert(!geographyNodes.includes('페이욘 동굴 1층'), 'geographic view can hide an independent entrance marker without deleting it');
main.world.worldMapToggleEntrances();
const restoredNodes=globalNodeNames(main.detail.innerHTML);
assert(restoredNodes.includes('루티에 장난감 공장'), 'entrance toggle restores Toy Factory');
assert(restoredNodes.includes('페이욘 동굴 1층'), 'entrance toggle restores Payon Cave');

main.world.worldMapSelect('c_tower1');
const clockLabels=['시계탑 지상 1층','시계탑 지상 2층','시계탑 지상 3층','시계탑 지상 4층','시계탑 지하 1층','시계탑 지하 2층','시계탑 지하 3층','시계탑 지하 4층'];
clockLabels.forEach(label=>assert(main.detail.innerHTML.includes(label), `${label}: clock-tower physical map is listed in the entry detail`));
assert(!main.detail.innerHTML.includes(groupKey), 'legacy compression label is not shown in the entry detail');
main.world.worldMapSelect('페이욘 동굴 1층');
assert(main.detail.innerHTML.includes('페이욘 동굴 3층'), 'ordinary dungeon floors remain reachable from their entrance detail');

// Run the renderer against the actual migration output, not only the compact mock.
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
  return {DB,installMapGroups,installMapSpawns,installMapConnections,rebuildMapIndex,getMap,mapKey};
`)();
live.DB.maps=JSON.parse(read('source','data','db-maps.json'));
live.DB.mapGroups=JSON.parse(read('source','data','db-map-groups.json'));
live.DB.mapSpawns=JSON.parse(read('source','data','db-map-spawns.json'));
live.DB.mapConnections=JSON.parse(read('source','data','db-map-connections.json'));
live.installMapGroups(); live.rebuildMapIndex();
live.installMapSpawns(); live.rebuildMapIndex();
live.installMapConnections(); live.rebuildMapIndex();

let fullHtml='';
const fullDetail={innerHTML:''};
const fullExecute=new Function('DB','G','window','document','openModal','closeModal','setTimeout','getMap',`${source}\nreturn window;`);
const fullWorld=fullExecute(
  live.DB, {currentMap:'프론테라'}, {},
  {querySelectorAll(){ return []; },getElementById(){ return fullDetail; }},
  (_title,html)=>{ fullHtml=html; }, ()=>{}, callback=>callback(), live.getMap
);
fullWorld.showWorldMapModal();
const liveNodes=globalNodeNames(fullHtml);
const liveLabels=worldLabels(fullHtml);
const liveGroups=Object.entries(live.DB.maps).filter(([,map])=>map && map.kind==='group');

['루티에 장난감 공장','페이욘 동굴 1층'].forEach(name=>assert(liveNodes.includes(name), `${name}: independent dungeon entrance remains visible in production data`));
liveGroups.forEach(([name])=>{
  assert(!liveNodes.includes(name), `${name}: compression group is not a world-map node`);
  assert(!liveLabels.includes(name), `${name}: compression group is not a world-map label`);
});

for(const [groupName, group] of liveGroups){
  const memberIds=(group.members||[]).map(live.mapKey).filter(Boolean);
  const linked=(group.connected||[]).map(live.mapKey).filter(key=>liveNodes.includes(key));
  const node=memberIds.find(id=>liveNodes.includes(id)) || linked[0];
  assert(node, `${groupName}: its physical-map entry is present on the overview`);
  fullWorld.worldMapSelect(node);
  memberIds.forEach(mapId=>{
    const map=live.getMap(mapId);
    assert(fullDetail.innerHTML.includes(map.displayName), `${groupName}: ${map.displayName} remains accessible from its entry`);
  });
  const exactLegacyLabel=new RegExp(`<b>${groupName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}</b>`);
  assert(!exactLegacyLabel.test(fullDetail.innerHTML), `${groupName}: no legacy compression label in its detail list`);
}

const points=Array.from(fullHtml.matchAll(/data-name="([^"]+)" transform="translate\(([^,]+),([^\)]+)\)"/g), match=>[match[1],Number(match[2]),Number(match[3])]);
for(const [name,x,y] of points){
  const map=live.getMap(name);
  if(map && map.type==='던전') assert(x>=100 && x<=1600 && y>=35 && y<=880, `${name}: dungeon entrance stays inside overview bounds`);
}
for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
  const [a,ax,ay]=points[i], [b,bx,by]=points[j];
  const aMap=live.getMap(a), bMap=live.getMap(b);
  if(!aMap || !bMap || (aMap.type!=='던전' && bMap.type!=='던전')) continue;
  assert(Math.abs(ax-bx)>=88 || Math.abs(ay-by)>=58, `${a} and ${b}: dungeon entrance overlaps another map node`);
}

const built = read('index.html');
assert(built.includes('id="world-map-v1"'), 'built page includes the world-map bundle');
assert(built.includes('overviewDungeonEntries()'), 'built page includes independent dungeon entrances');
assert(built.includes('detailDungeonMaps(name)'), 'built page includes selected-dungeon physical-map lists');
assert(!built.includes('worldMapOpenGroup'), 'built page does not expose discarded group drilldown');

console.log(`PASS world-map entrance regression: ${liveNodes.length} overview nodes, ${liveGroups.length} compression groups hidden, physical maps reachable from every group entry`);
