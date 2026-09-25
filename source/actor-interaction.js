// TextRAG actor interaction v1
// 장소 장면 → 대상 선택 → 공통 상호작용 패널.
// 기존 퀘스트/전직/상점/제련/카프라 엔진은 정본으로 유지하고 진입 UX만 통일한다.
(function(){
'use strict';

const AI_OBJECT_NAMES = new Set(['이미르의 책','바이오랩 트리거']);
const AI_FACILITY_SERVICES = new Set(['kafra','shop','refine']);
const AI_STATE = { actions: [], sceneTargets: [], currentActor: null };
const AI_LEGACY_TALK = window.talkNPC;

function aiEsc(v){
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function aiNum(v){ return Number(v||0).toLocaleString(); }
function aiPlayer(){ return (typeof G!=='undefined' && G.player) ? G.player : null; }
function aiActor(name){ return (typeof DB!=='undefined' && DB.npcs) ? DB.npcs[name] : null; }
function aiMap(name){ return (typeof DB!=='undefined' && DB.maps) ? DB.maps[name] : null; }
function aiQuestState(p,id){ return p && p.quests && p.quests[id] ? p.quests[id].state : 'locked'; }
function aiActorType(name,n){ return (n && n.actorType) || (AI_OBJECT_NAMES.has(name) ? 'object' : 'npc'); }
function aiBaseName(name){
  let map=(typeof G!=='undefined'&&G.currentMap)||'';
  return String(name||'').replace(new RegExp('\\s*\\('+aiRegex(map)+'\\)$'),'');
}
function aiRegex(v){ return String(v||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function aiTrim(v,max){
  let s=String(v||'').trim();
  return s.length>max ? s.slice(0,max-1)+'…' : s;
}
function aiSave(){ if(typeof saveLocal==='function'){ try{ saveLocal(); }catch(e){} } }

function aiInstallStyle(){
  if(document.getElementById('actor-interaction-style')) return;
  let st=document.createElement('style'); st.id='actor-interaction-style';
  st.textContent=`
    #modal-overlay:has(.ai-shell) .modal-box{width:min(540px,94vw);max-width:540px}
    .ai-shell{font-size:12px;color:var(--text);line-height:1.55}
    .ai-scene-desc{padding:10px 12px;margin-bottom:12px;border-left:3px solid var(--border-gold);background:rgba(127,127,127,.055);color:var(--text-dim);line-height:1.7}
    .ai-section{margin-top:12px}.ai-section-title{font-size:10px;font-weight:800;letter-spacing:.06em;color:var(--text-dim);margin:0 0 5px;padding-bottom:4px;border-bottom:1px solid var(--border)}
    .ai-scene-list{display:flex;flex-direction:column;gap:5px}
    .ai-scene-row{width:100%;display:flex;gap:10px;align-items:center;text-align:left;padding:9px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-dark);color:var(--text);cursor:pointer}
    .ai-scene-row:hover{border-color:var(--border-gold);background:rgba(127,127,127,.06)}
    .ai-scene-icon{width:29px;flex:0 0 29px;text-align:center;font-size:21px}.ai-scene-main{min-width:0;flex:1}.ai-scene-name{font-size:12px;font-weight:750;display:flex;gap:5px;align-items:center}.ai-scene-summary{font-size:10px;color:var(--text-dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai-badge{font-size:11px;flex:0 0 auto}
    .ai-actor-head{display:flex;gap:10px;align-items:center;padding-bottom:9px;border-bottom:1px solid var(--border)}.ai-actor-icon{font-size:31px;width:38px;text-align:center}.ai-actor-name{font-weight:800;font-size:14px}.ai-actor-map{font-size:10px;color:var(--text-dim);margin-top:2px}
    .ai-dialog{margin:11px 0;padding:11px 12px;border:1px solid var(--border);border-radius:7px;background:rgba(127,127,127,.045);line-height:1.75}.ai-dialog.object{font-style:italic;color:var(--text-dim)}
    .ai-notice{margin:7px 0;padding:8px 10px;border-radius:5px;border:1px solid var(--border);font-size:11px;background:rgba(127,127,127,.045)}.ai-notice.warn{border-color:var(--border-gold)}.ai-notice.good{border-color:#86a78f}.ai-notice.bad{border-color:#c58b8b}
    .ai-card{padding:9px 10px;border:1px solid var(--border);border-radius:6px;margin:6px 0;background:rgba(127,127,127,.035)}.ai-card-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.ai-card-title{font-size:11px;font-weight:800}.ai-card-state{font-size:10px;color:var(--text-dim)}.ai-progress{font-size:10px;color:var(--text-dim);margin-top:5px;line-height:1.55}.ai-progress-row{display:flex;justify-content:space-between;gap:10px}.ai-progress-row.done{opacity:.65}
    .ai-actions{display:flex;flex-direction:column;gap:6px;margin-top:12px}.ai-action{width:100%;min-height:39px;padding:8px 11px;border-radius:5px;border:1px solid var(--border);background:var(--bg-dark);color:var(--text);font-size:11px;text-align:left;cursor:pointer}.ai-action:hover:not(:disabled){border-color:var(--border-gold)}.ai-action.primary{border-color:var(--border-gold);font-weight:800}.ai-action.service{background:rgba(127,127,127,.045)}.ai-action.quiet{opacity:.72}.ai-action:disabled{opacity:.42;cursor:not-allowed}.ai-action-hint{display:block;font-size:9px;color:var(--text-dim);font-weight:400;margin-top:2px}
    .ai-cond{margin-top:5px;font-size:10px;color:var(--text-dim)}.ai-cond div{display:flex;justify-content:space-between;gap:8px;padding:2px 0}
    @media(max-width:700px){
      #modal-overlay:has(.ai-shell){align-items:flex-end;padding:0}
      #modal-overlay:has(.ai-shell) .modal-box{width:100%;max-width:none;max-height:80dvh;margin:0;border-radius:12px 12px 0 0}
      #modal-overlay:has(.ai-shell) .modal-body{overflow:auto}
      .ai-scene-row{padding:10px}.ai-action{min-height:44px}
    }
  `;
  document.head.appendChild(st);
}

function aiPatchEntryButton(){
  document.querySelectorAll('[onclick]').forEach(el=>{
    let oc=el.getAttribute('onclick')||'';
    if(!oc.includes('showNpcModal')) return;
    let txt=(el.textContent||'').trim();
    if(/NPC|대화/.test(txt)) el.textContent='👥 주변';
    el.setAttribute('aria-label','현재 장소의 주변 인물과 서비스를 본다');
  });
}

function aiSceneDescription(mapName,m,p){
  if(!m) return '';
  // 최초방문 연출은 enterMap()이 visitedMaps와 firstVisitDesc로 이미 처리한다.
  // 주변 패널은 현재 장소의 지속적인 장면이므로 entryDesc를 우선한다.
  return m.entryDesc || m.firstVisitDesc || m.desc || '';
}

function aiOwnedQuestEntries(name,p){
  let out=[];
  if(typeof TUTORIAL_QUESTS==='undefined') return out;
  for(let id in TUTORIAL_QUESTS){
    let q=TUTORIAL_QUESTS[id], qs=p&&p.quests&&p.quests[id];
    if(q.npc!==name || !qs) continue;
    out.push({id,q,qs,state:qs.state});
  }
  return out;
}
function aiQuestRank(state){ return state==='completable'?0:state==='available'?1:state==='active'?2:9; }
function aiTopQuest(name,p){
  return aiOwnedQuestEntries(name,p)
    .filter(x=>['available','active','completable'].includes(x.state))
    .sort((a,b)=>aiQuestRank(a.state)-aiQuestRank(b.state))[0] || null;
}
function aiInteractTargetQuest(name,p){
  if(!p||!p.quests||typeof TUTORIAL_QUESTS==='undefined') return null;
  for(let id in TUTORIAL_QUESTS){
    let q=TUTORIAL_QUESTS[id], qs=p.quests[id];
    if(!qs||qs.state!=='active'||q.type!=='interact'||!q.target_npc) continue;
    if(name===q.target_npc||name.startsWith(q.target_npc)) return {id,q,qs};
  }
  return null;
}
function aiScenePriority(name,n,p){
  let q=aiTopQuest(name,p);
  if(q) return aiQuestRank(q.state);
  if(aiInteractTargetQuest(name,p)) return 0.5;
  if(n.service==='job_change') return 3;
  if(!AI_FACILITY_SERVICES.has(n.service||'')) return 4;
  return 6;
}
function aiSceneBadge(name,p){
  let q=aiTopQuest(name,p);
  if(q){
    if(q.state==='completable') return '✅';
    if(q.state==='available') return '❗';
    return '•';
  }
  return aiInteractTargetQuest(name,p) ? '❗' : '';
}
function aiSceneSummary(name,n,p){
  let q=aiTopQuest(name,p);
  if(q){
    if(q.state==='completable') return `${q.q.title} · 보고 가능`;
    if(q.state==='available') return `${q.q.title} · 새로운 이야기`;
    return `${q.q.title} · 진행 중`;
  }
  let target=aiInteractTargetQuest(name,p);
  if(target) return `${target.q.title} · 지금 상호작용할 대상`;
  if(n.service==='job_change') return n.targetClass ? `${n.targetClass}의 길을 안내한다.` : '전직과 전승의 길을 맡고 있다.';
  if(n.service==='dungeon_access') return `${n.targetMap||'다음 지역'}로 가는 길을 안내한다.`;
  if(n.service==='exchange_gem'||n.service==='exchange_smile'||n.service==='exchange') return '물건을 교환해 준다.';
  return aiTrim(n.dialog||n.desc||'',78);
}
function aiFacilityLabel(name,n){
  if(n.service==='kafra') return '카프라 서비스';
  if(n.service==='shop'){
    if(name.includes('도구점')) return '도구점';
    if(name.includes('무기점')) return '무기점';
    if(name.includes('방어구점')) return '방어구점';
    return aiBaseName(name);
  }
  if(n.service==='refine') return `${aiBaseName(name).replace(/^대장장이\s*/, '')} · 제련`;
  return aiBaseName(name);
}
function aiSceneRow(name,n,p,idx,facility){
  let badge=aiSceneBadge(name,p), label=facility?aiFacilityLabel(name,n):aiBaseName(name);
  let target=aiInteractTargetQuest(name,p);
  let summary=target ? `${target.q.title} · 지금 상호작용할 대상` : facility ? (n.service==='kafra'?'저장 · 창고 · 워프':n.service==='shop'?'물품을 사고판다.':'장비를 제련한다.') : aiSceneSummary(name,n,p);
  return `<button type="button" class="ai-scene-row" onclick="actorOpenFromScene(${idx})">
    <span class="ai-scene-icon">${aiEsc(n.emoji||'💬')}</span>
    <span class="ai-scene-main"><span class="ai-scene-name">${aiEsc(label)}</span>${summary?`<span class="ai-scene-summary">${aiEsc(summary)}</span>`:''}</span>
    ${badge?`<span class="ai-badge">${badge}</span>`:''}
  </button>`;
}

function aiRenderLocalScene(){
  aiInstallStyle(); aiPatchEntryButton();
  if(typeof DB==='undefined'||!DB.npcs||typeof G==='undefined'){
    openModal('👥 주변','주변 정보를 불러올 수 없습니다.',[{label:'닫기',action:()=>{}}]); return;
  }
  let p=aiPlayer(), mapName=G.currentMap, m=aiMap(mapName);
  let rows=Object.keys(DB.npcs).filter(k=>DB.npcs[k]&&DB.npcs[k].map===mapName).map(name=>({name,n:DB.npcs[name]}));
  let people=rows.filter(x=>aiActorType(x.name,x.n)!=='object'&&!AI_FACILITY_SERVICES.has(x.n.service||''));
  let facilities=rows.filter(x=>aiActorType(x.name,x.n)!=='object'&&AI_FACILITY_SERVICES.has(x.n.service||''));
  let objects=rows.filter(x=>aiActorType(x.name,x.n)==='object');
  people.sort((a,b)=>aiScenePriority(a.name,a.n,p)-aiScenePriority(b.name,b.n,p)||a.name.localeCompare(b.name,'ko'));
  facilities.sort((a,b)=>aiScenePriority(a.name,a.n,p)-aiScenePriority(b.name,b.n,p)||a.name.localeCompare(b.name,'ko'));
  objects.sort((a,b)=>aiScenePriority(a.name,a.n,p)-aiScenePriority(b.name,b.n,p)||a.name.localeCompare(b.name,'ko'));
  AI_STATE.sceneTargets=[];
  function section(title,list,facility){
    if(!list.length) return '';
    let html=list.map(x=>{ let idx=AI_STATE.sceneTargets.push(x.name)-1; return aiSceneRow(x.name,x.n,p,idx,facility); }).join('');
    return `<section class="ai-section"><div class="ai-section-title">${title}</div><div class="ai-scene-list">${html}</div></section>`;
  }
  let desc=aiSceneDescription(mapName,m,p);
  let body=`<div class="ai-shell ai-scene">
    ${desc?`<div class="ai-scene-desc">${aiEsc(desc)}</div>`:''}
    ${section('주변 인물',people,false)}
    ${section('이용할 곳',facilities,true)}
    ${section('주변 사물',objects,false)}
    ${rows.length?'':'<div class="ai-notice">이곳에는 지금 상호작용할 대상이 없습니다.</div>'}
  </div>`;
  openModal(`${m&&m.emoji?m.emoji:'📍'} ${mapName} · 주변`,body,[{label:'닫기',action:()=>{}}]);
}
window.actorOpenFromScene=function(idx){
  let name=AI_STATE.sceneTargets[idx]; if(name) aiRenderActor(name);
};

function aiUtanBlocked(n,name,p){
  if(n.race!=='우탄족') return false;
  let done=p.quests&&p.quests['Q_UMB_LANGUAGE']&&p.quests['Q_UMB_LANGUAGE'].state==='done';
  if(done) return false;
  let q=typeof TUTORIAL_QUESTS!=='undefined'&&TUTORIAL_QUESTS['Q_UMB_LANGUAGE'];
  let qs=p.quests&&p.quests['Q_UMB_LANGUAGE'];
  let reachable=qs&&['available','active','completable'].includes(qs.state);
  return !(q&&q.npc===name&&reachable);
}
function aiMarkInteractTargets(name,p){
  let done=[]; if(!p.quests||typeof TUTORIAL_QUESTS==='undefined') return done;
  for(let id in TUTORIAL_QUESTS){
    let q=TUTORIAL_QUESTS[id], qs=p.quests[id];
    if(!qs||qs.state!=='active'||q.type!=='interact'||!q.target_npc) continue;
    if(name===q.target_npc||name.startsWith(q.target_npc)){
      qs.state='completable'; done.push(q.title);
      if(typeof log==='function') log(`📋 [퀘스트] ${q.title} — 완료 조건 달성! ${q.npc}에게 보고하세요.`,'quest');
      if(typeof notify==='function') notify('퀘스트 조건 달성!','gold');
    }
  }
  if(done.length) aiSave();
  return done;
}
function aiQuestProgress(q,qs,p){
  if(q.type==='kill'){
    let cur=Math.min(Number(qs.count||0),Number(q.count||0));
    return `<div class="ai-progress-row${cur>=q.count?' done':''}"><span>${aiEsc(q.target||'처치')}</span><span>${cur} / ${q.count||0}</span></div>`;
  }
  if(q.type==='gather'){
    let have=(p.inventory&&p.inventory[q.target])||0, need=Number(q.count||0);
    return `<div class="ai-progress-row${have>=need?' done':''}"><span>${aiEsc(q.target||'수집')}</span><span>${have} / ${need}${have>=need?' ✓':''}</span></div>`;
  }
  if(q.type==='gather_multi'){
    return (q.targets||[]).map(t=>{ let have=(p.inventory&&p.inventory[t.item])||0, need=Number(t.count||0); return `<div class="ai-progress-row${have>=need?' done':''}"><span>${aiEsc(t.item)}</span><span>${have} / ${need}${have>=need?' ✓':''}</span></div>`; }).join('');
  }
  if(q.type==='interact') return `<div>대상: <b>${aiEsc(q.target_npc||'상호작용 대상')}</b></div>`;
  if(q.type==='talk') return '<div>대화를 마치면 다음 단계로 진행됩니다.</div>';
  return '';
}
function aiQuestCard(entry,p){
  let stateLabel=entry.state==='completable'?'보고 가능':entry.state==='available'?'수락 가능':entry.state==='active'?'진행 중':'완료';
  let progress=entry.state==='active'?aiQuestProgress(entry.q,entry.qs,p):'';
  return `<div class="ai-card"><div class="ai-card-head"><span class="ai-card-title">${entry.state==='completable'?'✅':entry.state==='available'?'❗':'📋'} ${aiEsc(entry.q.title)}</span><span class="ai-card-state">${stateLabel}</span></div>${progress?`<div class="ai-progress">${progress}</div>`:''}</div>`;
}

function aiAddAction(label,kind,run,opts){
  opts=opts||{}; AI_STATE.actions.push({label,kind:kind||'',run,disabled:!!opts.disabled,hint:opts.hint||''});
}
function aiActionHtml(a,i){
  return `<button type="button" class="ai-action ${a.kind||''}" onclick="actorInteractionRun(${i})" ${a.disabled?'disabled':''}>${aiEsc(a.label)}${a.hint?`<span class="ai-action-hint">${aiEsc(a.hint)}</span>`:''}</button>`;
}
window.actorInteractionRun=function(idx){
  let a=AI_STATE.actions[idx]; if(!a||a.disabled||typeof a.run!=='function') return;
  try{ a.run(); }catch(e){
    console.error('[actor-interaction]',e);
    if(typeof notify==='function') notify('상호작용 처리 중 오류가 발생했습니다.','red');
  }
};

function aiJobContext(name,p){
  if(typeof getJobQuestId!=='function'||typeof getJobQuest!=='function') return {ok:true,reason:'',questId:null,q:null,jq:null};
  let questId=getJobQuestId(name,p.job);
  if(!questId) return {ok:false,reason:'현재 직업으로 이 인물에게서 진행할 전직 절차가 없습니다.',questId:null,q:null,jq:null};
  let q=getJobQuest(questId);
  if(!q) return {ok:false,reason:'전직 정보를 찾을 수 없습니다.',questId,jq:null,q:null};
  let jq=p.jobQuests&&p.jobQuests[questId];

  if(q.reqRebirth&&!p.rebirth) return {ok:false,reason:'전승을 마친 뒤 받을 수 있는 시험입니다.',questId,q,jq};
  let needJob=q.reqJob;
  if(needJob&&q.reqRebirth&&typeof TRANS2ND_ENTRY_JOB!=='undefined'&&TRANS2ND_ENTRY_JOB[needJob]) needJob=TRANS2ND_ENTRY_JOB[needJob];
  if(needJob&&p.job!==needJob) return {ok:false,reason:`${needJob} 상태여야 이 시험을 받을 수 있습니다.`,questId,q,jq};
  if(q.reqJobLv&&(p.jobLv||1)<q.reqJobLv) return {ok:false,reason:`Job Lv.${q.reqJobLv} 이상 필요 · 현재 ${p.jobLv||1}`,questId,q,jq};
  if(q.reqBaseLv&&(p.baseLv||1)<q.reqBaseLv) return {ok:false,reason:`Base Lv.${q.reqBaseLv} 이상 필요 · 현재 ${p.baseLv||1}`,questId,q,jq};
  if(q.reqRebirthEligible&&typeof checkRebirthEligibility==='function'){
    let reason=checkRebirthEligibility(p); if(reason) return {ok:false,reason,questId,q,jq};
  }
  if(jq&&jq.state==='done') return {ok:false,reason:`이미 ${q.targetJob||'이 전직'}의 절차를 마쳤습니다.`,questId,q,jq};
  if(jq&&jq.state==='failed') return {ok:false,reason:'이미 다른 전직의 길을 선택했습니다.',questId,q,jq};

  if(typeof JOB2_EXCLUSIVE_GROUPS!=='undefined'&&p.jobQuests){
    let group=JOB2_EXCLUSIVE_GROUPS[questId];
    if(group){
      let competing=group.find(id=>id!==questId&&p.jobQuests[id]&&['active','done'].includes(p.jobQuests[id].state));
      if(competing){
        let other=getJobQuest(competing), target=other&&other.targetJob?other.targetJob:'다른 직업';
        return {ok:false,reason:`이미 ${target}의 길을 선택했습니다.`,questId,q,jq};
      }
    }
  }

  if(jq&&jq.state==='active'&&q.steps){
    let step=q.steps[jq.step];
    if(step&&(step.type==='kill'||step.type==='gather')){
      let cur=Number((jq.stepData&&jq.stepData.count)||0), total=Number(step.count||0);
      if(cur<total){
        let msg=(step.dialog_progress||'{target} {remain}개/마리 더 필요합니다.')
          .replace('{cur}',cur).replace('{total}',total).replace('{remain}',Math.max(0,total-cur)).replace('{target}',step.target||'목표');
        return {ok:false,reason:msg,progress:true,questId,q,jq,step};
      }
    }
  }
  return {ok:true,reason:'',questId,q,jq};
}

function aiDungeonState(n,p){
  let target=n.targetMap||'', reqLv=Math.max(0,Number(n.reqLv)||0), reqItems=n.reqItems||{}, reqQuests=[];
  if(n.reqQuest) reqQuests.push(n.reqQuest); if(Array.isArray(n.reqQuests)) reqQuests=reqQuests.concat(n.reqQuests);
  let rows=[], reasons=[];
  if(!target||!aiMap(target)) reasons.push('목적지 데이터 없음');
  if(reqLv){ let ok=(p.baseLv||1)>=reqLv; rows.push([`Base Lv.${reqLv}`,ok,`현재 ${p.baseLv||1}`]); if(!ok) reasons.push(`Base Lv.${reqLv} 필요`); }
  reqQuests.forEach(id=>{ let ok=aiQuestState(p,id)==='done'; rows.push([`퀘스트 ${id}`,ok,'']); if(!ok) reasons.push(`퀘스트 ${id} 완료 필요`); });
  Object.keys(reqItems).forEach(k=>{ let have=(p.inventory&&p.inventory[k])||0, need=Number(reqItems[k]||0), ok=have>=need; rows.push([`${k} ${have}/${need}`,ok,'']); if(!ok) reasons.push(`${k} ${need}개 필요`); });
  let cost=Math.max(0,Number(n.cost)||0); if(cost){ let ok=p.zeny>=cost; rows.push([`${aiNum(cost)}z`,ok,`보유 ${aiNum(p.zeny)}z`]); if(!ok) reasons.push(`${aiNum(cost)}z 필요`); }
  return {target,cost,rows,reasons,already:!!(p.unlockedMaps&&p.unlockedMaps[target]),canEnter:reasons.length===0};
}
function aiDungeonHtml(st){
  let rows=st.rows.map(r=>`<div><span>${aiEsc(r[0])}</span><span>${r[1]?'✅':'❌'}${r[2]?` ${aiEsc(r[2])}`:''}</span></div>`).join('');
  return `<div class="ai-card"><div class="ai-card-head"><span class="ai-card-title">🗺️ ${aiEsc(st.target||'입장 허가')}</span><span class="ai-card-state">${st.already?'해금 완료':st.canEnter?'입장 가능':'조건 미달'}</span></div>${rows?`<div class="ai-cond">${rows}</div>`:''}</div>`;
}
function aiExchangeRecipes(n){
  if(Array.isArray(n.exchanges)) return n.exchanges;
  if(n.service==='exchange_gem'){
    let gems=['루비','자수정','지르콘']; return gems.map((g,i)=>({label:`${g} x2 → ${gems[(i+1)%gems.length]} x1`,give:{[g]:2},receive:{[gems[(i+1)%gems.length]]:1}}));
  }
  if(n.service==='exchange_smile') return [{label:'육류 x1 → 재료 랜덤 3개',give:{'육류':1},random:{pool:['솜털','젤로피','클로버'],rolls:3}}];
  return [];
}
function aiExchangeMax(r,p){
  let max=999; Object.keys(r.give||{}).forEach(k=>{ let need=Math.max(1,Number(r.give[k])||1); max=Math.min(max,Math.floor(((p.inventory&&p.inventory[k])||0)/need)); });
  if((r.zeny||0)>0) max=Math.min(max,Math.floor((p.zeny||0)/r.zeny)); return Math.max(0,max);
}
function aiShowExchange(name,n){
  let p=aiPlayer(), recipes=aiExchangeRecipes(n); window.__svcExchangeContext={nm:name};
  let rows=recipes.map((r,i)=>{
    let max=aiExchangeMax(r,p), give=Object.keys(r.give||{}).map(k=>`${aiEsc(k)} x${r.give[k]} (보유 ${(p.inventory&&p.inventory[k])||0})`).join(', ');
    let recv=Object.keys(r.receive||{}).map(k=>`${aiEsc(k)} x${r.receive[k]}`).join(', '); if(r.random) recv=`${(r.random.pool||[]).map(aiEsc).join('/')} 중 ${r.random.rolls||1}회`;
    return `<div class="ai-card"><div class="ai-card-title">${aiEsc(r.label||`교환 ${i+1}`)}</div><div class="ai-progress">${give} → ${recv}</div><div style="display:flex;gap:4px;margin-top:6px"><button class="m-btn" onclick="serviceRunExchange(${i},1)" ${max<1?'disabled':''}>1회</button><button class="m-btn" onclick="serviceRunExchange(${i},10)" ${max<1?'disabled':''}>10회</button><button class="m-btn ok" onclick="serviceRunExchange(${i},'max')" ${max<1?'disabled':''}>최대 ${max}</button></div></div>`;
  }).join('');
  openModal(`${n.emoji||'🔄'} ${aiBaseName(name)} · 교환`,`<div class="ai-shell">${rows||'<div class="ai-notice">등록된 교환식이 없습니다.</div>'}</div>`,[{label:'닫기',action:()=>{}}]);
}

function aiConfirmYmirDonate(name){
  let p=aiPlayer(), cost=(typeof REBIRTH_DONATION!=='undefined'?REBIRTH_DONATION:1285000);
  openModal('📜 이미르 연구 후원',`<div class="ai-shell"><div class="ai-notice warn">후원금 <b>${aiNum(cost)}z</b>를 지불합니다.<br>보유 제니: ${aiNum(p.zeny)}z</div></div>`,[
    {label:`후원한다 (${aiNum(cost)}z)`,cls:'ok',close:false,action:()=>{ if(p.zeny<cost){ aiRenderActor(name,'후원금이 부족합니다.'); return; } p.zeny-=cost; p.ymirDonated=true; if(typeof log==='function') log(`💰 -${aiNum(cost)}z (이미르 연구 후원)`,'warning'); if(typeof notify==='function') notify('이미르의 책 사용 가능','gold'); aiSave(); if(typeof updateUI==='function') updateUI(); aiRenderActor(name,'후원이 완료되었습니다.'); }},
    {label:'취소',action:()=>{}}
  ]);
}
function aiConfirmYmirBook(name){
  openModal('📖 이미르의 책',`<div class="ai-shell"><div class="ai-notice warn">빛에 몸을 맡기면 <b>발할라</b>로 이동합니다. 전승 자격을 갖추지 못했다면 발키리에게 쫓겨날 수 있습니다.</div></div>`,[
    {label:'몸을 맡긴다',cls:'ok',close:false,action:()=>{
      let p=aiPlayer(); if(!p.unlockedMaps) p.unlockedMaps={}; p.unlockedMaps['발할라']=true;
      G.battles=[]; G.autoHunt=false; G.currentMap='발할라';
      if(typeof logSep==='function') logSep();
      if(typeof log==='function'){ log('📖 <b>[이미르의 책]</b> 빛이 온몸을 감싼다. 발밑의 감각이 사라진다...','narrate'); log('☁ <b>[발할라]</b> 눈을 뜨니 구름 위였다. 북쪽 끝에 <b>발키리</b>가 서 있다.','location'); }
      if(typeof logSep==='function') logSep(); if(typeof notify==='function') notify('발할라 도착','gold'); aiSave(); if(typeof updateUI==='function') updateUI(); if(typeof closeModal==='function') closeModal();
    }},
    {label:'아직은 아니다',action:()=>{}}
  ]);
}

function aiRenderActor(name,extraNotice){
  aiInstallStyle();
  let n=aiActor(name), p=aiPlayer(); if(!n||!p){ aiRenderLocalScene(); return; }
  AI_STATE.currentActor=name; AI_STATE.actions=[];
  let actorType=aiActorType(name,n), autoBlocked=!!G.autoHunt, languageBlocked=!autoBlocked&&aiUtanBlocked(n,name,p);
  let completedTargets=[];
  if(!autoBlocked&&!languageBlocked) completedTargets=aiMarkInteractTargets(name,p);

  let phrases=['우가가! 타타 무무 카이야~','아이야~ 오파파 우탄 카라칸!','우탄 우탄! 쿠쿠쿠 마마야~','이야이야! 보보 타타 우가가!','카이카이~ 우우 탄탄 무무!'];
  let message=languageBlocked?phrases[Math.floor(Math.random()*phrases.length)]:(n.dialog||n.desc||'');
  let quests=aiOwnedQuestEntries(name,p).filter(x=>['available','active','completable'].includes(x.state)).sort((a,b)=>aiQuestRank(a.state)-aiQuestRank(b.state));

  quests.forEach(e=>{
    if(autoBlocked||languageBlocked) return;
    if(e.state==='completable') aiAddAction(`✅ ${e.q.title} · 완료를 보고한다`,'primary',()=>{ if(e.q.dialog_complete&&typeof showDialogModal==='function') showDialogModal(e.id,'complete'); else if(typeof handleDialogEnd==='function') handleDialogEnd(e.id,'complete'); });
    else if(e.state==='available') aiAddAction(`❗ ${e.q.title} · 이야기를 듣는다`,'primary',()=>{ if(typeof showDialogModal==='function') showDialogModal(e.id,'main'); });
  });

  let special='';
  if(autoBlocked){ special+='<div class="ai-notice warn">⚔️ 자동전투 중에는 대화와 서비스를 이용할 수 없습니다. 자동사냥을 멈춘 뒤 다시 시도하세요.</div>'; }
  if(languageBlocked){ special+='<div class="ai-notice warn">📘 무슨 말인지 알아들을 수 없다. 우탄 언어를 배워야 할 것 같다.</div>'; }
  if(extraNotice) special+=`<div class="ai-notice good">${aiEsc(extraNotice)}</div>`;
  completedTargets.forEach(t=>{ special+=`<div class="ai-notice good">✅ ${aiEsc(t)} · 조건을 달성했습니다.</div>`; });

  if(!autoBlocked&&!languageBlocked){
    if(n.service==='job_change'){
      let gate=aiJobContext(name,p);
      let label=n.targetClass?`⚔️ ${n.targetClass} 전직에 대해 묻는다`:'⚔️ 전직에 대해 묻는다';
      if(!gate.ok){
        special+=`<div class="ai-notice warn">🔒 ${aiEsc(gate.reason)}</div>`;
        aiAddAction(gate.progress?'📋 전직 시험 진행 상황':label,'primary',()=>{}, {disabled:true,hint:gate.reason});
      }else{
        aiAddAction(label,'primary',()=>{
          if(typeof startJobChangeDialog!=='function') return AI_LEGACY_TALK&&AI_LEGACY_TALK(name);
          let handled=startJobChangeDialog(name); if(!handled) aiRenderActor(name,'아직 그대에게 전수할 것이 없다고 한다. 더 수련이 필요하다.');
        });
      }
    }
    if(n.service==='kafra'){
      aiAddAction('📍 귀환 지점을 여기로 설정','service',()=>{ if(typeof kafraSetSave==='function'){ kafraSetSave(); aiRenderActor(name,'귀환 지점을 설정했습니다.'); } });
      aiAddAction('📦 창고를 이용한다','service',()=>{ if(typeof kafraWarehouse==='function') kafraWarehouse(); });
      aiAddAction('🚃 워프 서비스를 이용한다','service',()=>{ if(typeof kafraWarpMenu==='function') kafraWarpMenu(); });
      aiAddAction('🌀 저장 지점으로 이동 · 1,200z','service',()=>{ if(typeof kafraTeleport==='function') kafraTeleport(); },{disabled:p.zeny<1200,hint:p.zeny<1200?`제니 부족 · 보유 ${aiNum(p.zeny)}z`:''});
    }
    if(n.service==='shop') aiAddAction('🛒 물건을 본다','service',()=>{ if(typeof showShopModal==='function') showShopModal(name,n); });
    if(n.service==='refine') aiAddAction('🔨 장비를 제련한다','service',()=>{ if(typeof showRefineModal==='function') showRefineModal(); });
    if(n.service==='dungeon_access'){
      let st=aiDungeonState(n,p); special+=aiDungeonHtml(st);
      if(!st.already) aiAddAction(st.cost?`🗺️ ${aiNum(st.cost)}z 지불하고 입장 허가받기`:'🗺️ 입장 허가받기','service',()=>{ if(typeof serviceDungeonUnlock==='function') serviceDungeonUnlock(name); else if(AI_LEGACY_TALK) AI_LEGACY_TALK(name); },{disabled:!st.canEnter,hint:!st.canEnter?st.reasons.join(' · '):''});
    }
    if(n.service==='exchange_gem'||n.service==='exchange_smile'||n.service==='exchange') aiAddAction('🔄 물건을 교환한다','service',()=>aiShowExchange(name,n));
    if(n.service==='ymir_donate'){
      let cost=(typeof REBIRTH_DONATION!=='undefined'?REBIRTH_DONATION:1285000);
      if(p.rebirth) special+='<div class="ai-notice good">✅ 이미 전승을 마쳤다. 더 후원할 필요가 없다.</div>';
      else if(p.ymirDonated) special+='<div class="ai-notice good">✅ 연구 후원 완료 · 다음: 이미르의 책</div>';
      else {
        special+=`<div class="ai-card"><div class="ai-card-head"><span class="ai-card-title">📜 이미르 연구 후원</span><span class="ai-card-state">${aiNum(cost)}z</span></div><div class="ai-progress">보유 제니: ${aiNum(p.zeny)}z</div></div>`;
        aiAddAction(`📜 이미르 연구를 후원한다 · ${aiNum(cost)}z`,'primary',()=>aiConfirmYmirDonate(name),{disabled:p.zeny<cost,hint:p.zeny<cost?`${aiNum(cost-p.zeny)}z 부족`:''});
      }
    }
    if(n.service==='ymir_book'){
      if(!p.ymirDonated&&!p.rebirth) special+='<div class="ai-notice warn">📖 글자가 흩어져 읽히지 않는다. 현자 메테우스 실페의 도움이 필요해 보인다.</div>';
      else aiAddAction('📖 빛에 몸을 맡긴다','primary',()=>aiConfirmYmirBook(name));
    }
  }

  aiAddAction(actorType==='object'?'← 주변으로 돌아간다':'← 주변 인물로 돌아간다','quiet',()=>aiRenderLocalScene());
  let questHtml=quests.map(e=>aiQuestCard(e,p)).join('');
  let actions=AI_STATE.actions.map(aiActionHtml).join('');
  let display=aiBaseName(name), dialogClass=actorType==='object'?'ai-dialog object':'ai-dialog';
  let dialog=actorType==='object'?aiEsc(message):`“${aiEsc(message)}”`;
  let body=`<div class="ai-shell ai-actor">
    <div class="ai-actor-head"><div class="ai-actor-icon">${aiEsc(n.emoji||'💬')}</div><div><div class="ai-actor-name">${aiEsc(display)}</div><div class="ai-actor-map">${aiEsc(n.map||G.currentMap)}${actorType==='object'?' · 사물':''}</div></div></div>
    ${message?`<div class="${dialogClass}">${dialog}</div>`:''}
    ${special}
    ${questHtml?`<section class="ai-section"><div class="ai-section-title">현재 상태</div>${questHtml}</section>`:''}
    <div class="ai-actions">${actions}</div>
  </div>`;
  openModal(`${n.emoji||'💬'} ${display}`,body,[{label:'닫기',action:()=>{}}]);
}

window.showNpcModal=aiRenderLocalScene;
window.talkNPC=aiRenderActor;
window.interactActor=aiRenderActor;
window.showLocalScene=aiRenderLocalScene;

aiInstallStyle();
aiPatchEntryButton();
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',aiPatchEntryButton,{once:true});

window.__actorInteractionV1={
  version:'1.1',
  showScene:aiRenderLocalScene,
  interact:aiRenderActor,
  objectFallback:Array.from(AI_OBJECT_NAMES)
};
})();
