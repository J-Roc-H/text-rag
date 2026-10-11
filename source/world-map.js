// TextRAG dynamic world map v1
// Source of truth: DB.maps.connected. This file only owns presentation/layout.
(function(){
  'use strict';

  const WM_LAYOUT = {
    '루티에':[420,70],
    '알데바란':[420,165],
    '슈발츠발드 국경':[570,135],
    '유노 필드':[720,115],
    '유노':[870,115],
    '휘겔 필드':[790,225],
    '휘겔':[690,225],
    '아인브로크 필드':[1020,175],
    '아인브로크':[1160,175],
    '리히타르젠 필드':[1030,290],
    '리히타르젠':[1160,290],
    '라헬 필드':[1030,405],
    '라헬':[1160,405],
    '베인스 필드':[1030,520],
    '베인스':[1160,520],

    '프론테라 북쪽 평원':[610,255],
    '묘르닐 산맥':[475,275],
    '게펜':[225,385],
    '게펜 필드':[365,385],
    '프론테라 서쪽 평원':[505,385],
    '프론테라':[650,385],
    '프론테라 동쪽 평원':[790,385],
    '페이욘 숲 북부':[860,465],
    '페이욘 숲 남부':[860,560],
    '페이욘':[860,655],
    '알베르타':[1030,625],
    '로컬라이징 투어':[1180,650],

    '프론테라 남쪽 평원':[650,500],
    '이즈루드':[650,610],
    '소그라트 사막 동부':[515,515],
    '소그라트 사막 서부':[370,535],
    '모로크':[225,535],
    '오크 마을':[365,465],
    '코모도 필드':[370,655],
    '코모도':[260,745],
    '움발라 필드':[475,735],
    '움발라':[585,735],
    '이그드라실 줄기':[690,760],
    '니플헤임':[805,760],
    '니플헤임 필드':[920,760],

    '차원 균열':[1210,745],
    '이세계 캠프(아쉬바쿰)':[1340,745],
    '스플렌디드 필드':[1450,665],
    '마누크 필드':[1450,815]
  };

  const WM_REGION_LABELS = [
    {x:620,y:55,text:'룬 미드가츠 · 슈발츠발드'},
    {x:1090,y:95,text:'아루나펠츠'},
    {x:1325,y:610,text:'이세계'}
  ];
  // 던전 입구는 본 지도 안에서 도시·필드 곁에 보인다. 실제 층별 맵은 선택
  // 패널에서만 펼친다. 모든 층을 전역 캔버스에 뿌려 지도를 망가뜨리지 않는다.
  const WM_BOUNDS = {minX:100,maxX:1600,minY:35,maxY:880};

  // Keep every original dungeon entrance available, while allowing the player
  // to temporarily read the geographic backbone without 40+ entrance labels.
  // The filter only affects the overview canvas; it never removes a map,
  // dungeon detail, monster roster, or movement route.
  const WM_STATE = {selected:null, showDungeonEntrances:true};

  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // DB/G는 block-engine에서 최상위 const/let로 선언된다 — 클래식 <script>의 최상위
  // let/const 바인딩은 window에 올라가지 않는다(var와 다름). 그래서 window.DB로는
  // 항상 undefined만 나온다 — typeof로 전역 바인딩 존재 여부를 확인해야 한다.
  function mapData(name){
    if(typeof DB==='undefined' || !DB.maps) return null;
    if(DB.maps[name]) return DB.maps[name];
    // Connections in the legacy map graph may still use a Korean floor name.
    // Resolve it to its mapId record before doing presentation-only graph work.
    return typeof getMap==='function' ? getMap(name) : null;
  }
  function allNames(){ return (typeof DB!=='undefined' && DB.maps) ? Object.keys(DB.maps) : []; }
  function canonicalMapName(name){
    const m=mapData(name);
    if(!m) return String(name);
    if(m.mapId) return m.mapId;
    if(typeof DB!=='undefined' && DB.mapKeyByRecord) return DB.mapKeyByRecord.get(m) || String(name);
    return String(name);
  }
  function mapConnections(name){
    const m=mapData(name);
    return m && Array.isArray(m.connected)
      ? m.connected.map(canonicalMapName).filter(ref=>!!mapData(ref))
      : [];
  }
  function displayNameFor(name){
    const m=mapData(name);
    return m ? (m.displayName || name) : String(name);
  }
  function isDungeonMap(name){
    const m=mapData(name);
    // `kind:group` is retained solely for legacy-save migration and unlock state.
    // It is never a playable or visible world-map node.
    return !!(m && m.type==='던전' && m.kind!=='group');
  }
  function groupRecord(groupId){
    if(!groupId) return null;
    return allNames().find(name=>{
      const m=mapData(name);
      return m && m.kind==='group' && m.groupId===groupId;
    }) || null;
  }
  function dungeonAnchor(name){
    const m=mapData(name);
    // Split floors inherit the original entrance area's anchor through their
    // legacy group. This is layout-only; it never invents a movement edge.
    const group=groupRecord(m && m.groupId);
    return group ? nearestBase(group) : nearestBase(name);
  }
  function dungeonPosition(base, occupied){
    // 입구끼리는 겹치지 않되, 전역 지도 바깥으로 흩어지지 않게 배치한다.
    for(let ring=1;ring<=8;ring++){
      for(let dx=-ring;dx<=ring;dx++){
        for(let dy=-ring;dy<=ring;dy++){
          if(Math.max(Math.abs(dx),Math.abs(dy))!==ring) continue;
          const point=[base[0]+dx*100, base[1]+dy*72];
          if(point[0]<WM_BOUNDS.minX || point[0]>WM_BOUNDS.maxX || point[1]<WM_BOUNDS.minY || point[1]>WM_BOUNDS.maxY) continue;
          const clear=occupied.every(other=>Math.abs(point[0]-other[0])>=88 || Math.abs(point[1]-other[1])>=58);
          if(clear) return point;
        }
      }
    }
    // Last-resort scan also preserves the no-overlap rule.
    for(let y=WM_BOUNDS.minY+36;y<=WM_BOUNDS.maxY-36;y+=72){
      for(let x=WM_BOUNDS.minX+50;x<=WM_BOUNDS.maxX-50;x+=100){
        const point=[x,y];
        const clear=occupied.every(other=>Math.abs(point[0]-other[0])>=88 || Math.abs(point[1]-other[1])>=58);
        if(clear) return point;
      }
    }
    return [base[0],base[1]];
  }

  function undirectedNeighbors(name){
    const out = new Set();
    const key=canonicalMapName(name);
    mapConnections(name).forEach(n=>out.add(n));
    allNames().forEach(n=>{
      if(mapConnections(n).includes(key)) out.add(n);
    });
    return Array.from(out);
  }

  function nearestBase(name){
    if(WM_LAYOUT[name]) return name;
    const q=[name], seen=new Set([name]);
    while(q.length){
      const cur=q.shift();
      for(const n of undirectedNeighbors(cur)){
        if(seen.has(n)) continue;
        if(WM_LAYOUT[n]) return n;
        seen.add(n); q.push(n);
      }
    }
    return '프론테라';
  }

  function isNonDungeonRegion(name){
    const m=mapData(name);
    return !!(m && m.kind!=='group' && m.type!=='던전');
  }

  // 개요 지도에는 실제로 마을/필드에서 닿는 던전 입구만 놓는다. 2·3층처럼
  // 내부에서만 이어지는 맵은 아래 detailDungeonMaps()에서 원작 층별 목록으로 보여 준다.
  function isDungeonEntrance(name){
    const m=mapData(name);
    if(!isDungeonMap(name)) return false;
    if(m.kind==='map' && m.groupId) return false;
    return undirectedNeighbors(name).some(isNonDungeonRegion);
  }

  function groupEntryMap(groupName){
    const group=mapData(groupName);
    if(!group || group.kind!=='group') return null;
    const linked=mapConnections(groupName).map(canonicalMapName).find(isDungeonEntrance);
    // When the historic group had only an exterior connection, show its first
    // *physical* map as the representative.  This is visual grouping only;
    // it does not invent a movement edge.
    return linked || (group.members||[]).find(mapData) || null;
  }

  function overviewDungeonEntries(){
    const entries=new Map();
    allNames().forEach(name=>{
      if(!isDungeonEntrance(name)) return;
      const key=canonicalMapName(name);
      entries.set(key,key);
    });
    allNames().forEach(groupName=>{
      const group=mapData(groupName);
      if(!group || group.kind!=='group') return;
      const entry=groupEntryMap(groupName);
      if(entry) entries.set(canonicalMapName(entry),canonicalMapName(entry));
    });
    return Array.from(entries.values()).sort((a,b)=>displayNameFor(a).localeCompare(displayNameFor(b),'ko'));
  }

  // A selected entry unfolds only its own original maps.  Legacy group records
  // are traversal containers, never list rows or world-map nodes.
  function detailDungeonMaps(name){
    const result=[], queued=[canonicalMapName(name)], seen=new Set();
    while(queued.length){
      const current=canonicalMapName(queued.shift());
      if(seen.has(current)) continue;
      seen.add(current);
      const m=mapData(current);
      if(!m) continue;
      if(m.kind==='group'){
        (m.members||[]).forEach(member=>queued.push(member));
        continue;
      }
      if(m.type!=='던전') continue;
      result.push(current);
      const group=groupRecord(m.groupId);
      if(group){
        const groupData=mapData(group);
        (groupData.members||[]).forEach(member=>queued.push(member));
      }
      mapConnections(current).forEach(next=>{
        const target=mapData(next);
        if(target && (target.kind==='group' || target.type==='던전')) queued.push(next);
      });
    }
    return result;
  }

  function visibleLayout(){
    const result={};
    Object.keys(WM_LAYOUT).forEach(n=>{
      if(mapData(n)) result[n]=WM_LAYOUT[n].slice();
    });
    const clusters={};
    // Preserve every independent dungeon entrance (e.g. Payon Cave and Toy
    // Factory) in the overview.  A discarded compression label never enters
    // this collection because groupEntryMap() returns a real physical map.
    overviewDungeonEntries().filter(n=>!result[n]).forEach(n=>{
      const anchor=dungeonAnchor(n);
      (clusters[anchor]||(clusters[anchor]=[])).push(n);
    });

    const occupied=Object.values(result).map(point=>point.slice());
    Object.keys(clusters).sort((a,b)=>a.localeCompare(b,'ko')).forEach(anchor=>{
      const base=result[anchor] || WM_LAYOUT[anchor] || [650,385];
      clusters[anchor].forEach(name=>{
        const point=dungeonPosition(base,occupied);
        result[name]=point;
        occupied.push(point);
      });
    });
    return result;
  }

  function shortestPath(start, goal){
    if(start===goal) return [start];
    if(!mapData(start) || !mapData(goal)) return [];
    const q=[start], prev=new Map([[start,null]]);
    while(q.length){
      const cur=q.shift();
      const next=mapConnections(cur);
      for(const n of next){
        if(prev.has(n) || !mapData(n)) continue;
        prev.set(n,cur);
        if(n===goal){
          const path=[goal]; let p=cur;
          while(p){ path.push(p); p=prev.get(p); }
          return path.reverse();
        }
        q.push(n);
      }
    }
    return [];
  }

  function edgeKey(a,b){ return a<b ? a+'||'+b : b+'||'+a; }

  function typeClass(m){
    if(!m) return 'unknown';
    if(m.type==='마을') return 'town';
    if(m.type==='던전') return 'dungeon';
    return 'field';
  }

  function routeText(path){
    if(!path.length) return '현재 데이터 기준 이동 경로 없음';
    if(path.length===1) return '현재 위치';
    const short=path.length>7 ? path.slice(0,3).concat(['…'],path.slice(-3)) : path;
    return short.map(displayNameFor).join(' → ') + ` · ${path.length-1}구간`;
  }

  function monsterRoster(name){
    const m=mapData(name);
    const monsters=(m&&m.monsters||[]).map(id=>{
      const row=(typeof DB!=='undefined' && DB.monsters) ? DB.monsters[String(id)] : null;
      return row && row.name;
    }).filter(Boolean);
    if(!monsters.length) return m&&m.spawnVerified ? '출현군 확인 · 기록 없음' : '출현군 근거 보류';
    return `${m&&m.spawnVerified?'출현군 확인':'출현 몬스터'} · ${monsters.join(', ')}`;
  }

  function dungeonDetailList(name){
    if(!isDungeonMap(name)) return '';
    const maps=detailDungeonMaps(name);
    if(!maps.length) return '';
    const cards=maps.map(mapName=>{
      const m=mapData(mapName);
      return `<li><b>${esc(displayNameFor(mapName))}</b><span>${esc(monsterRoster(mapName))}</span></li>`;
    }).join('');
    return `<div class="wm-dungeon-list"><div class="wm-list-title">원작 실맵 · ${maps.length}곳</div><ul>${cards}</ul></div>`;
  }

  function detailHtml(name){
    const m=mapData(name);
    if(!m) return '<div class="wm-empty">지역 정보를 찾을 수 없습니다.</div>';
    const cur=(typeof G!=='undefined' && G.currentMap) ? G.currentMap : '프론테라';
    const path=shortestPath(cur,name);
    const adjacent=cur!==name && mapConnections(cur).includes(canonicalMapName(name));
    const mvp=m.hasMvp ? '<span class="wm-badge danger">MVP</span>' : '';
    const safe=m.safe ? '<span class="wm-badge safe">안전</span>' : '';
    let action='';
    if(cur===name) action='<button class="wm-action" disabled>현재 위치</button>';
    else if(adjacent) action=`<button class="wm-action primary" onclick="worldMapMoveSelected()">이 지역으로 이동</button>`;
    else action='<button class="wm-action" disabled>인접 지역에서 이동 가능</button>';

    return `<div class="wm-detail-head"><div class="wm-detail-icon">${esc(m.emoji||'📍')}</div><div><b>${esc(displayNameFor(name))}</b><div class="wm-sub">${esc(m.type||'미상')} · 권장 Lv.${esc(m.level||'?')}</div></div></div>
      <div class="wm-badges">${safe}${mvp}</div>
      <p class="wm-desc">${esc(m.desc||'')}</p>
      ${dungeonDetailList(name)}
      <div class="wm-route-label">현재 위치에서</div>
      <div class="wm-route">${esc(routeText(path))}</div>
      ${action}`;
  }

  function renderSvg(){
    const layout=visibleLayout();
    const current=(typeof G!=='undefined' && G.currentMap) ? G.currentMap : '프론테라';
    const currentAnchor=layout[current] ? current : (Object.keys(layout).find(entry=>detailDungeonMaps(entry).includes(canonicalMapName(current)) && isDungeonMap(entry)) || nearestBase(current));
    const selected=WM_STATE.selected && mapData(WM_STATE.selected) ? WM_STATE.selected : current;
    // A compact geographic view still retains the current/selected entrance so
    // the player never loses the context of the map they are inspecting.
    const names=Object.keys(layout).filter(name=>
      WM_STATE.showDungeonEntrances || !!WM_LAYOUT[name] || name===currentAnchor || name===selected
    );
    const visible=new Set(names);
    const path=shortestPath(current,selected);
    const routeEdges=new Set();
    for(let i=0;i<path.length-1;i++) routeEdges.add(edgeKey(path[i],path[i+1]));

    const edges=[];
    const seen=new Set();
    names.forEach(a=>{
      const m=mapData(a);
      if(!m) return;
      mapConnections(a).forEach(b=>{
        if(!layout[b] || !visible.has(b)) return;
        const key=edgeKey(a,b);
        if(seen.has(key)) return;
        seen.add(key);
        const [x1,y1]=layout[a], [x2,y2]=layout[b];
        const route=routeEdges.has(key) ? ' route' : '';
        const oneWay=!mapConnections(b).includes(a);
        edges.push(`<line class="wm-edge${route}${oneWay?' one-way':''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`);
      });
    });

    const labels=WM_REGION_LABELS.map(r=>`<text class="wm-region-label" x="${r.x}" y="${r.y}">${esc(r.text)}</text>`).join('');
    const nodes=names.map(name=>{
      const m=mapData(name), [x,y]=layout[name];
      const cls=typeClass(m);
      const isCurrent=(name===currentAnchor);
      const isSelected=(name===selected);
      const compact=!WM_LAYOUT[name];
      const displayName=displayNameFor(name);
      const label=displayName.length>12 ? displayName.slice(0,11)+'…' : displayName;
      return `<g class="wm-node ${cls}${isCurrent?' current':''}${isSelected?' selected':''}${compact?' compact':''}" data-name="${esc(name)}" data-x="${x}" data-y="${y}" transform="translate(${x},${y})" onclick="worldMapSelect(this.getAttribute('data-name'))">
        <circle class="wm-ring" r="${compact?18:23}"></circle>
        <circle class="wm-core" r="${compact?14:18}"></circle>
        <text class="wm-emoji" text-anchor="middle" y="5">${esc(m.emoji||'📍')}</text>
        <text class="wm-label" text-anchor="middle" y="${compact?32:39}">${esc(label)}</text>
        ${m.hasMvp?`<text class="wm-mvp" x="${compact?10:14}" y="${compact?-10:-14}">◆</text>`:''}
      </g>`;
    }).join('');

    return `<svg class="wm-svg" viewBox="100 20 1500 860" role="img" aria-label="룬 미드가츠 세계지도">
      ${labels}<g class="wm-edges">${edges.join('')}</g><g class="wm-nodes">${nodes}</g>
    </svg>`;
  }

  function mapHtml(){
    const current=(typeof G!=='undefined' && G.currentMap) ? G.currentMap : '프론테라';
    if(!WM_STATE.selected || !mapData(WM_STATE.selected)) WM_STATE.selected=current;
    const entranceCount=overviewDungeonEntries().length;
    const entranceLabel=WM_STATE.showDungeonEntrances
      ? `던전 입구 ${entranceCount}곳 숨기기`
      : `던전 입구 ${entranceCount}곳 표시`;
    return `<style>
      .wm-shell{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;min-height:560px;color:var(--text)}
      .wm-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;font-size:11px}
      .wm-legend{display:flex;gap:10px;flex-wrap:wrap;color:var(--text-dim)}
      .wm-view-controls{display:flex;gap:5px;margin-left:auto}.wm-control{padding:4px 7px;border:1px solid var(--border);border-radius:4px;background:var(--bg-panel);color:var(--text);font-size:10px;cursor:pointer}.wm-control.active{background:var(--blue-light);border-color:var(--blue-light);color:#fff}
      .wm-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:3px;vertical-align:-1px}.wm-dot.town{background:#4f8c77}.wm-dot.field{background:#5d87a4}.wm-dot.dungeon{background:#9a6060}
      .wm-canvas{border:1px solid var(--border);background:linear-gradient(180deg,#f7fbfd,#eef5f8);border-radius:8px;overflow:auto;min-height:520px}
      html[data-theme="dark"] .wm-canvas{background:linear-gradient(180deg,#101923,#15212d)}
      .wm-svg{display:block;width:100%;min-width:1200px;height:auto;min-height:620px}
      .wm-region-label{font-size:22px;fill:var(--text-dim);opacity:.22;font-weight:700;letter-spacing:2px}
      .wm-edge{stroke:#9fb2bf;stroke-width:2;opacity:.55}.wm-edge.one-way{stroke-dasharray:5 4}.wm-edge.route{stroke:#d39a35;stroke-width:4;opacity:.95}
      .wm-node{cursor:pointer}.wm-node .wm-ring{fill:transparent;stroke:transparent;stroke-width:4}.wm-node .wm-core{stroke-width:2}.wm-node.town .wm-core{fill:#e9f4ef;stroke:#4f8c77}.wm-node.field .wm-core{fill:#eaf2f7;stroke:#5d87a4}.wm-node.dungeon .wm-core{fill:#f6eaea;stroke:#9a6060}
      html[data-theme="dark"] .wm-node.town .wm-core{fill:#183027} html[data-theme="dark"] .wm-node.field .wm-core{fill:#172c39} html[data-theme="dark"] .wm-node.dungeon .wm-core{fill:#352020}
      .wm-node.current .wm-ring{stroke:#d39a35}.wm-node.selected .wm-ring{stroke:#3979a8;stroke-dasharray:3 2}.wm-node.current.selected .wm-ring{stroke:#d39a35;stroke-dasharray:none}
      .wm-emoji{font-size:16px;pointer-events:none}.wm-label{font-size:11px;fill:var(--text);font-weight:600;pointer-events:none}.wm-node.compact .wm-label{font-size:10px;font-weight:500}.wm-mvp{font-size:11px;fill:#a34f4f;pointer-events:none}
      .wm-side{border:1px solid var(--border);border-radius:8px;background:var(--bg-dark);padding:12px;align-self:stretch}.wm-side h4{font-size:11px;color:var(--text-dim);margin:0 0 10px}.wm-detail-head{display:flex;align-items:center;gap:9px}.wm-detail-head b{font-size:14px}.wm-detail-icon{font-size:26px}.wm-sub{font-size:10px;color:var(--text-dim);margin-top:2px}.wm-badges{margin:9px 0 4px}.wm-badge{display:inline-block;font-size:9px;padding:2px 5px;border:1px solid var(--border);border-radius:10px;margin-right:4px}.wm-badge.safe{color:#3b745d}.wm-badge.danger{color:#9a4c4c}.wm-desc{font-size:11px;line-height:1.55;color:var(--text);min-height:34px}.wm-dungeon-list{margin:10px 0;padding:8px;background:var(--bg-panel);border-radius:5px}.wm-list-title{font-size:10px;font-weight:700;color:var(--text-dim);margin-bottom:5px}.wm-dungeon-list ul{margin:0;padding:0;list-style:none;max-height:190px;overflow:auto}.wm-dungeon-list li{padding:5px 0;border-top:1px solid var(--border);font-size:10px;line-height:1.4}.wm-dungeon-list li:first-child{border-top:0}.wm-dungeon-list li b{display:block;color:var(--text)}.wm-dungeon-list li span{display:block;color:var(--text-dim);font-size:9px}.wm-route-label{font-size:10px;color:var(--text-dim);margin-top:14px}.wm-route{font-size:11px;line-height:1.5;margin:4px 0 12px;padding:7px;background:var(--bg-panel);border-radius:5px;word-break:keep-all}.wm-action{width:100%;padding:7px;border-radius:5px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text);font-size:11px}.wm-action.primary{background:var(--blue-light);border-color:var(--blue-light);color:#fff;cursor:pointer}.wm-action:disabled{opacity:.6}
      .wm-note{grid-column:1/-1;color:var(--text-dim);font-size:10px;margin-top:-5px}
      @media(max-width:760px){.wm-toolbar{align-items:flex-start}.wm-view-controls{margin-left:0;width:100%}.wm-control{flex:1}.wm-shell{grid-template-columns:1fr;min-height:0}.wm-side{min-height:180px}.wm-canvas{min-height:430px}.wm-svg{min-width:1200px;min-height:680px}.wm-note{grid-column:1}}
    </style>
    <div class="wm-toolbar">
      <div class="wm-legend"><span><i class="wm-dot town"></i>마을</span><span><i class="wm-dot field"></i>필드</span><span><i class="wm-dot dungeon"></i>던전</span><span>◎ 현재 위치</span><span>━ 선택 경로</span><span>┄ 단방향 연결</span></div>
      <div class="wm-view-controls"><button class="wm-control ${WM_STATE.showDungeonEntrances?'active':''}" onclick="worldMapToggleEntrances()">${entranceLabel}</button><button class="wm-control" onclick="worldMapFocus('current')">현재 위치 보기</button><button class="wm-control" onclick="worldMapFocus('selected')">선택 위치 보기</button></div>
    </div>
    <div class="wm-shell"><div class="wm-canvas">${renderSvg()}</div><aside class="wm-side"><h4>선택 지역</h4><div id="wm-detail">${detailHtml(WM_STATE.selected)}</div></aside><div class="wm-note">던전 입구 ${entranceCount}곳은 실제 입구 노드입니다. 지형 우선 보기는 노드만 잠시 접고, 선택한 던전의 원작 층별 실맵·출현군·이동 경로는 그대로 유지합니다. 이전 압축 그룹명은 지도에 표시하지 않습니다.</div></div>`;
  }

  function renderMapModal(){
    const body=typeof document!=='undefined' ? document.getElementById('modal-body') : null;
    if(body) body.innerHTML=mapHtml();
  }

  function focusMap(target){
    const current=(typeof G!=='undefined' && G.currentMap) ? G.currentMap : '프론테라';
    const name=target==='current' ? current : WM_STATE.selected;
    if(!name || typeof document==='undefined' || typeof document.querySelector!=='function') return;
    const node=document.querySelector(`.wm-node[data-name="${String(name).replace(/"/g,'\\"')}"]`);
    const canvas=document.querySelector('.wm-canvas');
    if(!node || !canvas) return;
    const x=Number(node.getAttribute('data-x'));
    const y=Number(node.getAttribute('data-y'));
    if(!Number.isFinite(x) || !Number.isFinite(y)) return;
    // ViewBox is 1500×860 from x=100/y=20. Convert that stable map coordinate
    // to the scrollable SVG width so the same focus works on desktop and mobile.
    canvas.scrollLeft=Math.max(0,((x-100)/1500)*canvas.scrollWidth-canvas.clientWidth/2);
    canvas.scrollTop=Math.max(0,((y-20)/860)*canvas.scrollHeight-canvas.clientHeight/2);
  }

  window.worldMapSelect=function(name){
    if(!mapData(name)) return;
    WM_STATE.selected=name;
    document.querySelectorAll('.wm-node.selected').forEach(el=>el.classList.remove('selected'));
    document.querySelectorAll('.wm-node').forEach(el=>{ if(el.getAttribute('data-name')===name) el.classList.add('selected'); });
    const d=document.getElementById('wm-detail'); if(d) d.innerHTML=detailHtml(name);
  };

  window.worldMapToggleEntrances=function(){
    WM_STATE.showDungeonEntrances=!WM_STATE.showDungeonEntrances;
    renderMapModal();
    setTimeout(()=>focusMap('selected'),0);
  };

  window.worldMapFocus=function(target){ focusMap(target); };

  window.worldMapMoveSelected=function(){
    const dest=WM_STATE.selected;
    if(!dest || typeof tryMove!=='function') return;
    tryMove(dest);
  };

  // Overrides the legacy hard-coded ASCII world map after the main bundle loads.
  window.showWorldMapModal=function(){
    if(typeof DB==='undefined' || !DB.maps){
      if(typeof openModal==='function') openModal('🗺 세계지도','지도 데이터를 불러오지 못했습니다.',[{label:'닫기',action:()=>{}}]);
      return;
    }
    if(!WM_STATE.selected || !mapData(WM_STATE.selected)) WM_STATE.selected=(typeof G!=='undefined'&&G.currentMap)||'프론테라';
    openModal('🗺 세계지도', mapHtml(), [{label:'닫기',action:()=>{}}]);
    setTimeout(()=>focusMap('current'),0);
  };
})();
