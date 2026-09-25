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

  const WM_STATE = {selected:null, showAll:false};

  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function mapData(name){ return (window.DB && DB.maps) ? DB.maps[name] : null; }
  function allNames(){ return (window.DB && DB.maps) ? Object.keys(DB.maps) : []; }

  function undirectedNeighbors(name){
    const out = new Set();
    const m = mapData(name);
    if(m && Array.isArray(m.connected)) m.connected.forEach(n=>out.add(n));
    allNames().forEach(n=>{
      const x=mapData(n);
      if(x && Array.isArray(x.connected) && x.connected.includes(name)) out.add(n);
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

  function visibleLayout(){
    const result={};
    Object.keys(WM_LAYOUT).forEach(n=>{
      if(mapData(n)) result[n]=WM_LAYOUT[n].slice();
    });
    if(!WM_STATE.showAll) return result;

    const groups={};
    allNames().filter(n=>!result[n]).sort((a,b)=>a.localeCompare(b,'ko')).forEach(n=>{
      const anchor=nearestBase(n);
      (groups[anchor]||(groups[anchor]=[])).push(n);
    });

    Object.keys(groups).forEach(anchor=>{
      const base=result[anchor] || WM_LAYOUT[anchor] || [650,385];
      groups[anchor].forEach((name,i)=>{
        const ring=Math.floor(i/8);
        const slot=i%8;
        const r=48 + ring*38;
        const angle=(-Math.PI/2) + slot*(Math.PI*2/8) + ring*0.22;
        result[name]=[base[0]+Math.cos(angle)*r, base[1]+Math.sin(angle)*r];
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
      const m=mapData(cur);
      const next=(m && Array.isArray(m.connected)) ? m.connected : [];
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
    return short.join(' → ') + ` · ${path.length-1}구간`;
  }

  function detailHtml(name){
    const m=mapData(name);
    if(!m) return '<div class="wm-empty">지역 정보를 찾을 수 없습니다.</div>';
    const cur=(window.G && G.currentMap) ? G.currentMap : '프론테라';
    const path=shortestPath(cur,name);
    const adjacent=cur!==name && mapData(cur) && Array.isArray(mapData(cur).connected) && mapData(cur).connected.includes(name);
    const mvp=m.hasMvp ? '<span class="wm-badge danger">MVP</span>' : '';
    const safe=m.safe ? '<span class="wm-badge safe">안전</span>' : '';
    let action='';
    if(cur===name) action='<button class="wm-action" disabled>현재 위치</button>';
    else if(adjacent) action=`<button class="wm-action primary" onclick="worldMapMoveSelected()">이 지역으로 이동</button>`;
    else action='<button class="wm-action" disabled>인접 지역에서 이동 가능</button>';

    return `<div class="wm-detail-head"><div class="wm-detail-icon">${esc(m.emoji||'📍')}</div><div><b>${esc(name)}</b><div class="wm-sub">${esc(m.type||'미상')} · 권장 Lv.${esc(m.level||'?')}</div></div></div>
      <div class="wm-badges">${safe}${mvp}</div>
      <p class="wm-desc">${esc(m.desc||'')}</p>
      <div class="wm-route-label">현재 위치에서</div>
      <div class="wm-route">${esc(routeText(path))}</div>
      ${action}`;
  }

  function renderSvg(){
    const layout=visibleLayout();
    const names=Object.keys(layout);
    const current=(window.G && G.currentMap) ? G.currentMap : '프론테라';
    const currentAnchor=layout[current] ? current : nearestBase(current);
    const selected=WM_STATE.selected && mapData(WM_STATE.selected) ? WM_STATE.selected : current;
    const path=shortestPath(current,selected);
    const routeEdges=new Set();
    for(let i=0;i<path.length-1;i++) routeEdges.add(edgeKey(path[i],path[i+1]));

    const edges=[];
    const seen=new Set();
    names.forEach(a=>{
      const m=mapData(a);
      if(!m || !Array.isArray(m.connected)) return;
      m.connected.forEach(b=>{
        if(!layout[b]) return;
        const key=edgeKey(a,b);
        if(seen.has(key)) return;
        seen.add(key);
        const [x1,y1]=layout[a], [x2,y2]=layout[b];
        const route=routeEdges.has(key) ? ' route' : '';
        const oneWay=!(mapData(b) && Array.isArray(mapData(b).connected) && mapData(b).connected.includes(a));
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
      const label=name.length>12 ? name.slice(0,11)+'…' : name;
      return `<g class="wm-node ${cls}${isCurrent?' current':''}${isSelected?' selected':''}${compact?' compact':''}" data-name="${esc(name)}" transform="translate(${x},${y})" onclick="worldMapSelect(this.getAttribute('data-name'))">
        <circle class="wm-ring" r="${compact?18:23}"></circle>
        <circle class="wm-core" r="${compact?14:18}"></circle>
        <text class="wm-emoji" text-anchor="middle" y="5">${esc(m.emoji||'📍')}</text>
        <text class="wm-label" text-anchor="middle" y="${compact?32:39}">${esc(label)}</text>
        ${m.hasMvp?`<text class="wm-mvp" x="${compact?10:14}" y="${compact?-10:-14}">◆</text>`:''}
      </g>`;
    }).join('');

    return `<svg class="wm-svg" viewBox="100 20 1450 850" role="img" aria-label="룬 미드가츠 세계지도">
      ${labels}<g class="wm-edges">${edges.join('')}</g><g class="wm-nodes">${nodes}</g>
    </svg>`;
  }

  function mapHtml(){
    const current=(window.G && G.currentMap) ? G.currentMap : '프론테라';
    if(!WM_STATE.selected || !mapData(WM_STATE.selected)) WM_STATE.selected=current;
    const toggle=WM_STATE.showAll ? '주요 경로만' : '던전·세부지역 표시';
    return `<style>
      .wm-shell{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;min-height:560px;color:var(--text)}
      .wm-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;font-size:11px}
      .wm-legend{display:flex;gap:10px;flex-wrap:wrap;color:var(--text-dim)}
      .wm-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:3px;vertical-align:-1px}.wm-dot.town{background:#4f8c77}.wm-dot.field{background:#5d87a4}.wm-dot.dungeon{background:#9a6060}
      .wm-toggle{margin-left:auto;border:1px solid var(--border);background:var(--bg-dark);color:var(--text);padding:5px 8px;border-radius:5px;cursor:pointer;font-size:11px}
      .wm-canvas{border:1px solid var(--border);background:linear-gradient(180deg,#f7fbfd,#eef5f8);border-radius:8px;overflow:auto;min-height:520px}
      html[data-theme="dark"] .wm-canvas{background:linear-gradient(180deg,#101923,#15212d)}
      .wm-svg{display:block;width:100%;min-width:980px;height:auto;min-height:520px}
      .wm-region-label{font-size:22px;fill:var(--text-dim);opacity:.22;font-weight:700;letter-spacing:2px}
      .wm-edge{stroke:#9fb2bf;stroke-width:2;opacity:.55}.wm-edge.one-way{stroke-dasharray:5 4}.wm-edge.route{stroke:#d39a35;stroke-width:4;opacity:.95}
      .wm-node{cursor:pointer}.wm-node .wm-ring{fill:transparent;stroke:transparent;stroke-width:4}.wm-node .wm-core{stroke-width:2}.wm-node.town .wm-core{fill:#e9f4ef;stroke:#4f8c77}.wm-node.field .wm-core{fill:#eaf2f7;stroke:#5d87a4}.wm-node.dungeon .wm-core{fill:#f6eaea;stroke:#9a6060}
      html[data-theme="dark"] .wm-node.town .wm-core{fill:#183027} html[data-theme="dark"] .wm-node.field .wm-core{fill:#172c39} html[data-theme="dark"] .wm-node.dungeon .wm-core{fill:#352020}
      .wm-node.current .wm-ring{stroke:#d39a35}.wm-node.selected .wm-ring{stroke:#3979a8;stroke-dasharray:3 2}.wm-node.current.selected .wm-ring{stroke:#d39a35;stroke-dasharray:none}
      .wm-emoji{font-size:16px;pointer-events:none}.wm-label{font-size:11px;fill:var(--text);font-weight:600;pointer-events:none}.wm-node.compact .wm-label{font-size:9px;font-weight:500}.wm-mvp{font-size:11px;fill:#a34f4f;pointer-events:none}
      .wm-side{border:1px solid var(--border);border-radius:8px;background:var(--bg-dark);padding:12px;align-self:stretch}.wm-side h4{font-size:11px;color:var(--text-dim);margin:0 0 10px}.wm-detail-head{display:flex;align-items:center;gap:9px}.wm-detail-head b{font-size:14px}.wm-detail-icon{font-size:26px}.wm-sub{font-size:10px;color:var(--text-dim);margin-top:2px}.wm-badges{margin:9px 0 4px}.wm-badge{display:inline-block;font-size:9px;padding:2px 5px;border:1px solid var(--border);border-radius:10px;margin-right:4px}.wm-badge.safe{color:#3b745d}.wm-badge.danger{color:#9a4c4c}.wm-desc{font-size:11px;line-height:1.55;color:var(--text);min-height:34px}.wm-route-label{font-size:10px;color:var(--text-dim);margin-top:14px}.wm-route{font-size:11px;line-height:1.5;margin:4px 0 12px;padding:7px;background:var(--bg-panel);border-radius:5px;word-break:keep-all}.wm-action{width:100%;padding:7px;border-radius:5px;border:1px solid var(--border);background:var(--bg-panel);color:var(--text);font-size:11px}.wm-action.primary{background:var(--blue-light);border-color:var(--blue-light);color:#fff;cursor:pointer}.wm-action:disabled{opacity:.6}
      .wm-note{grid-column:1/-1;color:var(--text-dim);font-size:10px;margin-top:-5px}
      @media(max-width:760px){.wm-shell{grid-template-columns:1fr;min-height:0}.wm-side{min-height:180px}.wm-canvas{min-height:430px}.wm-svg{min-width:920px;min-height:430px}.wm-toggle{margin-left:0}.wm-note{grid-column:1}}
    </style>
    <div class="wm-toolbar">
      <div class="wm-legend"><span><i class="wm-dot town"></i>마을</span><span><i class="wm-dot field"></i>필드</span><span><i class="wm-dot dungeon"></i>던전</span><span>◎ 현재 위치</span><span>━ 선택 경로</span><span>┄ 단방향 연결</span></div>
      <button class="wm-toggle" onclick="worldMapToggleAll()">${toggle}</button>
    </div>
    <div class="wm-shell"><div class="wm-canvas">${renderSvg()}</div><aside class="wm-side"><h4>선택 지역</h4><div id="wm-detail">${detailHtml(WM_STATE.selected)}</div></aside><div class="wm-note">DB.maps.connected를 직접 시각화합니다. 지도 좌표는 표시 전용이며 실제 이동 가능 여부는 게임 데이터가 결정합니다.</div></div>`;
  }

  window.worldMapSelect=function(name){
    if(!mapData(name)) return;
    WM_STATE.selected=name;
    document.querySelectorAll('.wm-node.selected').forEach(el=>el.classList.remove('selected'));
    document.querySelectorAll('.wm-node').forEach(el=>{ if(el.getAttribute('data-name')===name) el.classList.add('selected'); });
    const d=document.getElementById('wm-detail'); if(d) d.innerHTML=detailHtml(name);
  };

  window.worldMapToggleAll=function(){
    WM_STATE.showAll=!WM_STATE.showAll;
    if(typeof closeModal==='function') closeModal();
    setTimeout(()=>window.showWorldMapModal(),0);
  };

  window.worldMapMoveSelected=function(){
    const dest=WM_STATE.selected;
    if(!dest || typeof tryMove!=='function') return;
    tryMove(dest);
  };

  // Overrides the legacy hard-coded ASCII world map after the main bundle loads.
  window.showWorldMapModal=function(){
    if(!window.DB || !DB.maps){
      if(typeof openModal==='function') openModal('🗺 세계지도','지도 데이터를 불러오지 못했습니다.',[{label:'닫기',action:()=>{}}]);
      return;
    }
    if(!WM_STATE.selected || !mapData(WM_STATE.selected)) WM_STATE.selected=(window.G&&G.currentMap)||'프론테라';
    openModal('🗺 세계지도', mapHtml(), [{label:'닫기',action:()=>{}}]);
  };
})();
