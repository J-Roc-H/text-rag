// TextRAG quest guidance v1
// Rich quest cards derived from existing quest/NPC/map/monster/item-source data.
(function(){
  'use strict';

  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function fmt(n){
    const x = Number(n || 0);
    return Number.isFinite(x) ? x.toLocaleString() : String(n || 0);
  }

  function npcMap(name){
    if(!name || typeof DB==='undefined' || !DB.npcs) return '';
    const n = DB.npcs[name];
    if(n && n.map) return n.map;
    const exact = Object.keys(DB.npcs).find(k => k===name || k.startsWith(name) || name.startsWith(k));
    return exact && DB.npcs[exact] ? (DB.npcs[exact].map || '') : '';
  }

  function monsterMaps(name){
    if(!name || typeof DB==='undefined' || !DB.maps || !DB.monsters) return [];
    const out=[];
    Object.keys(DB.maps).forEach(mapName=>{
      const mp=DB.maps[mapName]||{};
      const ids=(mp.monsters||[]).slice();
      if(mp.hasMvp!=null) ids.push(mp.hasMvp);
      const found=ids.some(id=>{
        const mon=DB.monsters[String(id)] || DB.monsters[id];
        return mon && mon.name===name;
      });
      if(found) out.push(mapName);
    });
    return out;
  }

  function shortestRoute(start, dest){
    if(!start || !dest || typeof DB==='undefined' || !DB.maps || !DB.maps[start] || !DB.maps[dest]) return null;
    if(start===dest) return [start];
    const q=[[start]];
    const seen=new Set([start]);
    while(q.length){
      const path=q.shift();
      const cur=path[path.length-1];
      const next=(DB.maps[cur] && DB.maps[cur].connected) || [];
      for(const n of next){
        if(seen.has(n) || !DB.maps[n]) continue;
        const p2=path.concat(n);
        if(n===dest) return p2;
        seen.add(n); q.push(p2);
      }
    }
    return null;
  }

  function bestDestination(candidates){
    const uniq=[...new Set((candidates||[]).filter(Boolean))];
    if(!uniq.length) return {dest:'',route:null};
    let best=null;
    uniq.forEach(dest=>{
      const route=shortestRoute((typeof G!=='undefined'&&G.currentMap)||'',dest);
      const score=route ? route.length : 9999;
      if(!best || score<best.score) best={dest,route,score};
    });
    return best || {dest:uniq[0],route:null};
  }

  function routeText(destinations){
    const best=bestDestination(destinations);
    if(!best.dest) return '';
    if(best.route && best.route.length===1) return `현재 위치 · ${best.dest}`;
    if(best.route && best.route.length>1){
      const hops=best.route.length-1;
      let path=best.route;
      if(path.length>5) path=[path[0],path[1],'…',path[path.length-2],path[path.length-1]];
      return `${path.join(' → ')} · ${hops}회 이동`;
    }
    return best.dest;
  }

  function dropSources(item){
    if(!item || typeof DB==='undefined' || !DB.monsters) return [];
    const out=[];
    Object.keys(DB.monsters).forEach(id=>{
      const m=DB.monsters[id];
      if(!m || !m.drops || m.drops[item]==null) return;
      out.push({monster:m.name,rate:Number(m.drops[item])||0,maps:monsterMaps(m.name)});
    });
    out.sort((a,b)=>b.rate-a.rate);
    return out;
  }

  function shopSources(item){
    if(!item || typeof DB==='undefined' || !DB.npcs) return [];
    const out=[];
    Object.keys(DB.npcs).forEach(name=>{
      const n=DB.npcs[name];
      if(n && Array.isArray(n.sells) && n.sells.includes(item)) out.push({npc:name,map:n.map||''});
    });
    return out;
  }

  function itemSourceInfo(item){
    const shops=shopSources(item);
    const drops=dropSources(item);
    let text=[];
    let maps=[];
    if(shops.length){
      const s=shops.slice(0,2).map(x=>`${x.npc}${x.map?`(${x.map})`:''}`);
      text.push(`상점 ${s.join(', ')}`);
      maps.push(...shops.map(x=>x.map));
    }
    if(drops.length){
      const d=drops.slice(0,2).map(x=>`${x.monster} ${x.rate}%${x.maps[0]?`(${x.maps[0]})`:''}`);
      text.push(`드롭 ${d.join(', ')}`);
      drops.forEach(x=>maps.push(...x.maps));
    }
    return {text:text.join(' · '),maps:[...new Set(maps.filter(Boolean))]};
  }

  function firstNarrative(q, step){
    const pools=[];
    if(step){
      if(Array.isArray(step.dialog_start)) pools.push(step.dialog_start);
      if(Array.isArray(step.dialog)) pools.push(step.dialog);
    }
    if(q && Array.isArray(q.dialog)) pools.push(q.dialog);
    for(const arr of pools){
      const node=arr.find(x=>x && x.text);
      if(node){
        const t=String(node.text).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        return t.length>110 ? t.slice(0,109)+'…' : t;
      }
    }
    return '';
  }

  function rewardText(q){
    if(!q) return '';
    const r=q.reward||{};
    const parts=[];
    if(r.exp) parts.push(`Base EXP ${fmt(r.exp)}`);
    if(r.jexp) parts.push(`Job EXP ${fmt(r.jexp)}`);
    if(r.zeny) parts.push(`${fmt(r.zeny)} z`);
    if(r.job) parts.push(`전직: ${r.job}`);
    if(r.items && typeof r.items==='object'){
      Object.keys(r.items).forEach(k=>{ if(r.items[k]) parts.push(`${k} ×${r.items[k]}`); });
    }
    if(q.unlock) parts.push(`해금: ${q.unlock}`);
    return parts.join(' · ') || '표시 보상 없음';
  }

  function requirementText(q,isJob){
    const p=[];
    if(isJob){
      if(q.reqJob) p.push(q.reqJob);
      if(q.reqJobLv) p.push(`Job Lv.${q.reqJobLv}`);
      if(q.reqRebirth) p.push('전승 필요');
    }else{
      if(q.reqLv) p.push(`Base Lv.${q.reqLv}`);
      if(q.repeatable) p.push('반복 가능');
    }
    return p.join(' · ');
  }

  function objectiveInfo(q,state,qs,step){
    if(state==='available'){
      const npc=(step&&step.npc)||q.npc;
      return {label:`${npc}에게 퀘스트 수락`,maps:[npcMap(npc)].filter(Boolean),source:''};
    }
    if(state==='completable'){
      const npc=q.npc || (step&&step.npc);
      return {label:`${npc}에게 완료 보고`,maps:[npcMap(npc)].filter(Boolean),source:''};
    }
    const src=step||q;
    const type=src.type;
    if(type==='kill'){
      return {label:`${src.target} ${src.count}마리 처치`,maps:monsterMaps(src.target),source:''};
    }
    if(type==='gather'){
      const s=itemSourceInfo(src.target);
      return {label:`${src.target} ${src.count}개 수집`,maps:s.maps,source:s.text};
    }
    if(type==='gather_multi' && Array.isArray(src.targets)){
      const maps=[]; const detail=[];
      src.targets.forEach(t=>{
        const s=itemSourceInfo(t.item); maps.push(...s.maps);
        detail.push(`${t.item} ×${t.count}${s.text?` — ${s.text}`:' — 획득처 정보 없음'}`);
      });
      return {label:src.targets.map(t=>`${t.item} ×${t.count}`).join(', ')+' 수집',maps:[...new Set(maps)],source:detail.join('<br>')};
    }
    if(type==='interact'){
      const npc=src.target_npc || src.npc || q.npc;
      return {label:`${npc}에게 말 걸기`,maps:[npcMap(npc)].filter(Boolean),source:''};
    }
    if(type==='quiz'){
      const npc=src.npc || q.npc;
      return {label:`${npc}의 시험에 응하기`,maps:[npcMap(npc)].filter(Boolean),source:''};
    }
    const npc=src.npc || q.npc;
    return {label:`${npc}와 대화`,maps:[npcMap(npc)].filter(Boolean),source:''};
  }

  function progressHtml(src,state,qs,isJob){
    if(state!=='active' || !src) return '';
    if(src.type==='kill' || src.type==='gather'){
      let cur=0;
      if(isJob) cur=Number(qs && qs.stepData && qs.stepData.count)||0;
      else if(src.type==='gather' && typeof G!=='undefined' && G.player && G.player.inventory) cur=Number(G.player.inventory[src.target])||0;
      else cur=Number(qs && qs.count)||0;
      const total=Number(src.count)||0;
      const pct=total?Math.min(100,Math.floor(cur/total*100)):0;
      return `<div class="qg-progress"><div><span>진행</span><b>${Math.min(cur,total||cur)} / ${total}</b></div><div class="qg-bar"><i style="width:${pct}%"></i></div></div>`;
    }
    if(src.type==='gather_multi' && Array.isArray(src.targets)){
      const inv=(typeof G!=='undefined'&&G.player&&G.player.inventory)||{};
      return `<div class="qg-multi">${src.targets.map(t=>{
        const cur=Math.min(Number(inv[t.item])||0,Number(t.count)||0);
        return `<span>${esc(t.item)} <b>${cur}/${t.count}</b></span>`;
      }).join('')}</div>`;
    }
    return '';
  }

  function reportInfo(q,state,step){
    if(state==='done' || state==='available') return '';
    const npc=q.npc || (step&&step.npc);
    if(!npc) return '';
    const map=npcMap(npc);
    return `${npc}${map?` · ${map}`:''}`;
  }

  function card(q,state,qs,opt){
    opt=opt||{};
    const step=opt.step||null;
    const isJob=!!opt.isJob;
    const src=step||q;
    const obj=objectiveInfo(q,state,qs,step);
    const req=requirementText(q,isJob);
    const narrative=firstNarrative(q,step);
    const route=routeText(obj.maps);
    const report=reportInfo(q,state,step);
    const rew=rewardText(q);
    const progress=progressHtml(src,state,qs,isJob);
    const stateMeta={
      available:['수락 가능','qg-avail'], active:[isJob?'전직 진행중':'진행중','qg-active'],
      completable:['보고 가능','qg-ready'], done:[isJob?'전직 완료':'완료','qg-done']
    }[state] || [state,'qg-active'];

    let extra='';
    if(q.next && typeof TUTORIAL_QUESTS!=='undefined' && TUTORIAL_QUESTS[q.next]) extra=`<div class="qg-row"><span>연계</span><b>${esc(TUTORIAL_QUESTS[q.next].title)}</b></div>`;
    if(opt.stepLabel) extra+=`<div class="qg-row"><span>단계</span><b>${esc(opt.stepLabel)}</b></div>`;

    return `<div class="qg-card ${stateMeta[1]}">
      <div class="qg-head"><div><div class="qg-title">${esc(q.title)}</div>${req?`<div class="qg-req">${esc(req)}</div>`:''}</div><em>${stateMeta[0]}</em></div>
      ${narrative?`<div class="qg-story">${esc(narrative)}</div>`:''}
      <div class="qg-row qg-now"><span>지금 할 일</span><b>${esc(obj.label)}</b></div>
      ${route?`<div class="qg-row"><span>어디서</span><b>${esc(route)}</b></div>`:''}
      ${obj.source?`<div class="qg-source"><span>획득처</span><div>${obj.source}</div></div>`:''}
      ${progress}
      ${report?`<div class="qg-row"><span>보고</span><b>${esc(report)}</b></div>`:''}
      <div class="qg-row"><span>보상</span><b>${esc(rew)}</b></div>
      ${extra}
    </div>`;
  }

  function ensureStyle(){
    if(document.getElementById('quest-guide-v1-style')) return;
    const s=document.createElement('style');
    s.id='quest-guide-v1-style';
    s.textContent=`
      .qg-wrap{display:flex;flex-direction:column;gap:8px;max-height:68vh;overflow-y:auto;padding-right:3px}
      .qg-card{border:1px solid var(--border);border-left:4px solid var(--blue-light);border-radius:6px;background:var(--bg-dark);padding:10px 11px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
      .qg-card.qg-avail{border-left-color:#e67e22}.qg-card.qg-ready{border-left-color:var(--green)}.qg-card.qg-done{border-left-color:#93a1aa;opacity:.72}
      .qg-head{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;margin-bottom:6px}.qg-title{font-size:13px;font-weight:700;color:var(--gold-light)}
      .qg-head em{font-style:normal;font-size:10px;line-height:18px;padding:0 7px;border-radius:9px;background:var(--bg-panel);white-space:nowrap}.qg-req{font-size:10px;color:var(--text-dim);margin-top:2px}
      .qg-story{font-size:10px;line-height:1.55;color:var(--text-dim);padding:6px 7px;margin-bottom:6px;background:rgba(0,0,0,.025);border-radius:4px}
      .qg-row{display:grid;grid-template-columns:56px minmax(0,1fr);gap:6px;align-items:start;font-size:10px;line-height:1.5;margin-top:3px}.qg-row>span,.qg-source>span{color:var(--text-dim)}.qg-row>b{font-weight:600;color:var(--text);overflow-wrap:anywhere}.qg-now>b{color:var(--gold-light);font-size:11px}
      .qg-source{display:grid;grid-template-columns:56px minmax(0,1fr);gap:6px;font-size:10px;line-height:1.5;margin-top:3px}.qg-source>div{color:var(--text);overflow-wrap:anywhere}
      .qg-progress{margin:7px 0 2px 62px}.qg-progress>div:first-child{display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim)}.qg-bar{height:5px;background:#e0e8ed;border-radius:3px;overflow:hidden;margin-top:2px}.qg-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--blue-light),var(--gold))}
      .qg-multi{margin:6px 0 2px 62px;display:flex;flex-wrap:wrap;gap:4px}.qg-multi span{font-size:10px;border:1px solid var(--border);border-radius:9px;padding:1px 6px;background:var(--bg-panel)}
      .qg-section{display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer;user-select:none;font-size:10px;color:var(--text-dim);font-weight:700}.qg-empty{text-align:center;padding:28px;color:var(--text-dim);font-size:11px;line-height:1.7}
      @media(max-width:700px){.qg-wrap{max-height:72vh}.qg-card{padding:9px}.qg-row,.qg-source{grid-template-columns:52px minmax(0,1fr)}.qg-progress,.qg-multi{margin-left:58px}}
    `;
    document.head.appendChild(s);
  }

  showQuestModal=function(){
    const p=(typeof G!=='undefined')?G.player:null; if(!p) return;
    ensureStyle();
    if(!p.quests) p.quests={};
    let active='', available='', done='';
    let ac=0,av=0,dn=0;

    if(typeof TUTORIAL_QUESTS!=='undefined'){
      Object.keys(TUTORIAL_QUESTS).forEach(id=>{
        const q=TUTORIAL_QUESTS[id], qs=p.quests[id];
        if(!q||!qs) return;
        const state=qs.state;
        if(state==='done'){ done+=card(q,state,qs); dn++; }
        else if(state==='available'){ available+=card(q,state,qs); av++; }
        else { active+=card(q,state,qs); ac++; }
      });
    }

    if(p.jobQuests && typeof getJobQuest==='function'){
      Object.keys(p.jobQuests).forEach(qid=>{
        const jq=p.jobQuests[qid], q=getJobQuest(qid);
        if(!q||!jq||jq.state==='failed') return;
        const state=jq.state;
        const step=q.steps && q.steps[jq.step];
        const label=step ? `${Math.min((jq.step||0)+1,q.steps.length)}/${q.steps.length} · ${step.desc||step.id||step.type}` : '';
        const html=card(q,state,jq,{isJob:true,step,stepLabel:label});
        if(state==='done'){done+=html;dn++;}
        else if(state==='available'){available+=html;av++;}
        else {active+=html;ac++;}
      });
    }

    let h='<div class="qg-wrap">';
    if(!ac&&!av&&!dn){
      h+='<div class="qg-empty">현재 기록된 퀘스트가 없습니다.<br>마을의 NPC와 대화하거나 새로운 지역을 탐색해 보세요.</div>';
    }else{
      if(ac) h+=active;
      if(av){
        const open=(G.questAvailOpen!==false);
        h+=`<div class="qg-section" onclick="G.questAvailOpen=!${open};showQuestModal()">수락 가능한 퀘스트 ${av}개 · ${open?'▲ 접기':'▼ 펼치기'}</div>`;
        if(open) h+=available;
      }
      if(dn){
        const open=!!G.questDoneOpen;
        h+=`<div class="qg-section" onclick="G.questDoneOpen=!${open};showQuestModal()">완료된 퀘스트 ${dn}개 · ${open?'▲ 접기':'▼ 펼치기'}</div>`;
        if(open) h+=done;
      }
    }
    h+='</div>';
    openModal('📋 퀘스트 안내',h,[{label:'지도 열기',action:()=>{setTimeout(()=>{if(typeof showWorldMapModal==='function')showWorldMapModal();else if(typeof showMapModal==='function')showMapModal();},0);}},{label:'닫기',action:()=>{}}]);
  };
})();
