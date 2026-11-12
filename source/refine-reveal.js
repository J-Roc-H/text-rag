// TextRAG refine result reveal v1
// 공통 비명 → [다음] → 성공/실패 공개. 첫 화면에서는 RNG/비용/장비 상태를 건드리지 않는다.
(function(){
'use strict';

const RR_REFINABLE_TYPES = new Set(['무기','방패','갑옷','투구_상단','투구_중단','투구_하단','걸칠것','신발']);
const RR_HOLGREN = '대장장이 홀그렌';
let rrPending = null;

function rrEsc(v){
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function rrSave(){ if(typeof saveLocal==='function'){ try{ saveLocal(); }catch(e){} } }
function rrRefiner(){
  if(typeof DB==='undefined'||!DB.npcs||typeof G==='undefined') return '대장장이';
  for(let name of Object.keys(DB.npcs)){
    let n=DB.npcs[name];
    if(n && n.service==='refine' && n.map===G.currentMap) return name;
  }
  return '대장장이';
}
function rrRefinerDisplay(name){ return String(name||'대장장이').replace(/^대장장이\s*/, '') || '대장장이'; }
function rrMeta(itemKey){
  let parsed = typeof parseItem==='function' ? parseItem(itemKey) : null;
  if(!parsed || !parsed.base || !RR_REFINABLE_TYPES.has(parsed.base.type)) return null;
  let cur=Number(parsed.refine)||0, refKey='방어구';
  if(parsed.base.type==='무기'){
    let wLv=parsed.base.weaponLv||1;
    refKey='무기'+Math.min(4,Math.max(1,wLv));
  }
  let refData=DB.refine&&DB.refine[refKey];
  let ore=refData?refData.ore:'에르늄';
  let cost=refData?refData.cost:2000;
  let rates=refData?refData.rates:[100,100,100,100,60,60,50,40,20,10];
  let rate=rates[cur]==null?20:rates[cur];
  return {key:itemKey,parsed,cur,refKey,ore,cost,rate};
}
function rrLiveTarget(target){
  let p=G.player;
  if(!target) return null;
  let key=target.source==='equip' ? (p.equip&&p.equip[target.slot]) : target.key;
  if(!key) return null;
  if(target.source==='inventory' && (p.inventory[key]||0)<=0) return null;
  return {target,key,meta:rrMeta(key)};
}
function rrWarn(msg){
  if(typeof log==='function') log(msg,'warning');
  if(typeof showRefineModal==='function') showRefineModal();
}
function rrSuspense(target,idx){
  let live=rrLiveTarget(target);
  if(!live||!live.meta){ rrWarn('⚠ 제련 대상 장비를 찾을 수 없습니다.'); return; }
  let m=live.meta, p=G.player;
  if(m.cur>=10){ rrWarn('⚠ 최대 제련도 +10에 도달했습니다.'); return; }
  if((p.inventory[m.ore]||0)<=0){ rrWarn(`⚠ ${m.ore}이(가) 부족합니다.`); return; }
  if(p.zeny<m.cost){ rrWarn(`⚠ 제니가 부족합니다. (필요: ${m.cost.toLocaleString()}z)`); return; }

  let refiner=rrRefiner();
  rrPending={idx,refiner,target:target,key:live.key};
  let itemName=typeof getItemDisplayName==='function' ? getItemDisplayName(m.parsed) : live.key;
  let body=`<div style="text-align:center;padding:20px 8px 14px;line-height:1.8;">
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;">${rrEsc(itemName)}</div>
    <div style="font-size:12px;margin-bottom:12px;">+${m.cur} → +${m.cur+1} · 성공률 ${m.rate}%<br>${rrEsc(m.ore)} 1개 + ${m.cost.toLocaleString()}z<br>${m.rate<100?'⚠ 실패 시 장비와 장착 카드가 파괴됩니다.':'이번 단계는 성공률 100%입니다.'}</div>
    <div style="font-size:20px;font-weight:900;letter-spacing:.04em;">으허허헉!!!!</div>
  </div>`;
  openModal(`🔨 ${rrEsc(rrRefinerDisplay(refiner))}`,body,[
    {label:'다음',cls:'ok',close:false,action:()=>rrResolvePending()}
  ]);
}
function rrHolgrenLines(success){
  if(success) return ['어... 어?','붙었잖아?!','하하하! 봤나? 이게 내 실력이라고!'];
  return ['어... 어흠...','실패했네. 면목없네...','장비가 부서졌군...','거... 거보게... 내가 말렸지 않았는가.','나를 원망하진 말아주게...'];
}
function rrFallbackLines(success){
  return success ? ['...오!','제대로 붙었군.'] : ['...이런.','장비가 버티지 못했군.'];
}
function rrResultDialog(refiner,success){
  let lines=refiner===RR_HOLGREN ? rrHolgrenLines(success) : rrFallbackLines(success);
  return lines.map(rrEsc).join('<br>');
}
function rrShowResult(refiner,success,oldName,newName,rate,newRefine){
  let result=success
    ? `<div style="margin-top:12px;padding:9px 11px;border:1px solid var(--border-gold);border-radius:5px;"><b>✅ ${rrEsc(newName)}</b><br><span style="font-size:10px;color:var(--text-dim);">제련 +${newRefine} 성공 · 성공률 ${rate}%</span></div>`
    : `<div style="margin-top:12px;padding:9px 11px;border:1px solid #c58b8b;border-radius:5px;"><b>💥 ${rrEsc(oldName)} 파괴</b><br><span style="font-size:10px;color:var(--text-dim);">제련 실패 · 성공률 ${rate}%</span></div>`;
  let body=`<div style="font-size:12px;line-height:1.75;">
    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:rgba(127,127,127,.045);">${rrResultDialog(refiner,success)}</div>
    ${result}
  </div>`;
  openModal(`🔨 ${rrEsc(rrRefinerDisplay(refiner))} · 제련 결과`,body,[
    {label:'계속 제련한다',cls:'ok',close:false,action:()=>{ if(typeof showRefineModal==='function') showRefineModal(); }},
    {label:'그만둔다',action:()=>{ if(typeof closeModal==='function') closeModal(); }}
  ]);
}
function rrResolvePending(){
  let pending=rrPending; rrPending=null;
  if(!pending) return;
  let p=G.player, live=rrLiveTarget(pending.target);
  if(!live||!live.meta||live.key!==pending.key){ rrWarn('⚠ 제련 대상이 바뀌어 시도를 취소했습니다.'); return; }
  let m=live.meta;
  if(m.cur>=10){ rrWarn('⚠ 최대 제련도 +10에 도달했습니다.'); return; }
  if((p.inventory[m.ore]||0)<=0){ rrWarn(`⚠ ${m.ore}이(가) 부족합니다.`); return; }
  if(p.zeny<m.cost){ rrWarn(`⚠ 제니가 부족합니다. (필요: ${m.cost.toLocaleString()}z)`); return; }

  // [다음]을 누른 이 시점에만 비용 차감과 성공/실패 판정을 수행한다.
  p.inventory[m.ore]--;
  if(p.inventory[m.ore]<=0) delete p.inventory[m.ore];
  p.zeny-=m.cost;
  if(pending.target.source==='inventory'){
    p.inventory[live.key]--;
    if(p.inventory[live.key]<=0) delete p.inventory[live.key];
  }

  let oldName=typeof getItemDisplayName==='function' ? getItemDisplayName(m.parsed) : live.key;
  let success=Math.random()*100<m.rate, newName='', newRefine=m.cur+1;
  if(success){
    let newKey=buildEquipKey(m.parsed.baseName,m.parsed.slots,m.parsed.cards,newRefine);
    if(pending.target.source==='equip') p.equip[pending.target.slot]=newKey;
    else p.inventory[newKey]=(p.inventory[newKey]||0)+1;
    p._maxRefineEver=Math.max(p._maxRefineEver||0,newRefine);
    newName=typeof getItemDisplayName==='function' ? getItemDisplayName(parseItem(newKey)) : newKey;
    if(typeof log==='function') log(`🔨 ${newName} 성공! (성공률 ${m.rate}%)`,'loot');
    if(typeof notify==='function') notify(`제련 +${newRefine} 성공`,'gold');
  }else{
    if(pending.target.source==='equip') p.equip[pending.target.slot]=null;
    if(typeof log==='function') log(`💥 ${oldName} 파괴! (성공률 ${m.rate}%)`,'error');
    if(typeof notify==='function') notify('제련 실패 · 파괴','red');
  }
  rrSave();
  if(typeof updateUI==='function') updateUI();
  rrShowResult(pending.refiner,success,oldName,newName,m.rate,newRefine);
}

// ── 자동 제련: 목표 제련도까지 연타 ─────────────────────────────
// 판정(비용 차감·성공/실패)은 시작 즉시 끝내 상태를 저장하고, 화면은 그 결과를
// "+1 +2 +3 …" 빠르게 재생한다. 실패하면 파괴(그 개체만), 재료/제니가 떨어지면 중단.
const RR_AUTO_START_MS=350, RR_AUTO_STEP_MS=110, RR_AUTO_FAIL_MS=650;
let rrAutoTimer=null;

function rrDisp(parsed,key){
  return typeof getItemDisplayName==='function' ? getItemDisplayName(parsed) : key;
}
function rrAutoRun(target,goal){
  let p=G.player;
  let t={source:target.source,slot:target.slot,key:target.key};
  let run={steps:[],reason:'missing',goal:goal,ore:0,zeny:0,oreName:'',startCur:0,
           startName:'',finalName:'',destroyedName:''};
  let first=rrLiveTarget(t);
  if(!first||!first.meta) return run;
  run.startCur=first.meta.cur;
  run.startName=run.finalName=rrDisp(first.meta.parsed,first.key);
  while(true){
    let live=rrLiveTarget(t);
    if(!live||!live.meta){ run.reason='missing'; break; }
    let m=live.meta;
    run.finalName=rrDisp(m.parsed,live.key);
    run.oreName=m.ore;
    if(m.cur>=goal||m.cur>=10){ run.reason='goal'; break; }
    if((p.inventory[m.ore]||0)<=0){ run.reason='ore'; break; }
    if(p.zeny<m.cost){ run.reason='zeny'; break; }

    p.inventory[m.ore]--;
    if(p.inventory[m.ore]<=0) delete p.inventory[m.ore];
    p.zeny-=m.cost;
    run.ore++; run.zeny+=m.cost;
    if(t.source==='inventory'){
      p.inventory[live.key]--;
      if(p.inventory[live.key]<=0) delete p.inventory[live.key];
    }
    let newRefine=m.cur+1;
    if(Math.random()*100<m.rate){
      let newKey=buildEquipKey(m.parsed.baseName,m.parsed.slots,m.parsed.cards,newRefine);
      if(t.source==='equip') p.equip[t.slot]=newKey;
      else{ p.inventory[newKey]=(p.inventory[newKey]||0)+1; t.key=newKey; }
      p._maxRefineEver=Math.max(p._maxRefineEver||0,newRefine);
      run.steps.push({from:m.cur,to:newRefine,ok:true,rate:m.rate});
    }else{
      if(t.source==='equip') p.equip[t.slot]=null;
      run.destroyedName=rrDisp(m.parsed,live.key);
      run.steps.push({from:m.cur,to:newRefine,ok:false,rate:m.rate});
      run.reason='destroyed';
      break;
    }
  }
  return run;
}
function rrAutoLog(run){
  let n=run.steps.length;
  if(run.reason==='destroyed'){
    let s=run.steps[n-1];
    if(typeof log==='function') log(`💥 [자동 제련] ${run.destroyedName} 파괴! (+${s.from}→+${s.to} 실패, 성공률 ${s.rate}%, ${n}회 시도)`,'error');
    if(typeof notify==='function') notify('제련 실패 · 파괴','red');
  }else if(run.reason==='goal'){
    if(typeof log==='function') log(`🔨 [자동 제련] ${run.startName} → ${run.finalName} (${n}회, ${run.oreName} ${run.ore}개 · ${run.zeny.toLocaleString()}z)`,'loot');
    if(typeof notify==='function') notify(`제련 +${run.startCur+n} 달성`,'gold');
  }else if(n>0){
    let why=run.reason==='ore' ? `${run.oreName} 부족` : '제니 부족';
    if(typeof log==='function') log(`⚠ [자동 제련] ${run.finalName}에서 중단 — ${why} (${n}회 성공)`,'warning');
  }
}
function rrAutoRender(refiner,run,upto,done){
  let shown=run.steps.slice(0,upto), last=shown[shown.length-1];
  let boom=!!(last&&!last.ok);
  let cur=last?(last.ok?last.to:last.from):run.startCur;
  let big='+'+cur, sub=rrEsc(run.startName), color='';
  if(boom){ big='💥 꽝!!'; sub=rrEsc(run.destroyedName)+' 파괴'; color='color:#c0392b;animation:rrShake .35s;'; }
  else if(!done){ sub='다라라라락…'; }
  else if(run.reason==='goal'){ big='+'+cur+' ✅'; sub='목표 +'+run.goal+' 달성!'; color='color:#2e8b57;'; }
  else{
    big='+'+cur;
    sub=run.reason==='ore' ? rrEsc(run.oreName)+' 부족으로 중단'
      : run.reason==='zeny' ? '제니 부족으로 중단' : '제련 대상이 바뀌어 중단';
  }
  let rows=shown.map(s=>s.ok
    ? `<div>+${s.from} ➜ +${s.to} <span style="color:#2e8b57;">✅ 성공</span> <span style="color:var(--text-dim);">(${s.rate}%)</span></div>`
    : `<div style="color:#c0392b;font-weight:700;">+${s.from} ➜ +${s.to} 💥 꽝! 파괴 <span style="font-weight:400;">(${s.rate}%)</span></div>`
  ).join('');
  let end='';
  if(done){
    let dlg=(run.reason==='goal'||boom)
      ? `<div style="margin-top:10px;padding:9px 11px;border:1px solid var(--border);border-radius:6px;background:rgba(127,127,127,.045);font-size:12px;line-height:1.75;">${rrResultDialog(refiner,!boom)}</div>`
      : '';
    end=`${dlg}<div style="margin-top:8px;font-size:10px;color:var(--text-dim);">${run.steps.length}회 시도 · ${rrEsc(run.oreName)} ${run.ore}개 · ${run.zeny.toLocaleString()}z 사용</div>`;
  }
  return `<div style="text-align:center;padding:6px 4px 2px;">
    <div style="font-size:11px;color:var(--text-dim);">${sub}</div>
    <div style="font-size:34px;font-weight:900;line-height:1.35;font-variant-numeric:tabular-nums;${color}">${big}</div>
    <div id="rr-auto-log" style="max-height:132px;overflow:auto;text-align:left;font-size:11px;line-height:1.65;margin-top:6px;padding:6px 9px;border:1px solid var(--border);border-radius:5px;">${rows||'&nbsp;'}</div>
    ${end}
  </div>`;
}
function rrAutoIsOpen(){
  if(typeof document==='undefined') return false;
  let ov=document.getElementById('modal-overlay');
  return !!(ov&&ov.classList.contains('open'));
}
function rrAutoScroll(){
  if(typeof document==='undefined') return;
  let el=document.getElementById('rr-auto-log');
  if(el) el.scrollTop=el.scrollHeight;
}
function rrAutoPlay(refiner,run){
  clearTimeout(rrAutoTimer);
  let name=rrEsc(rrRefinerDisplay(refiner)), n=run.steps.length, logged=false;
  const keyframes='<style>@keyframes rrShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}</style>';
  const wrap=(i,done)=>`${keyframes}<div id="rr-auto-box">${rrAutoRender(refiner,run,i,done)}</div>`;
  const logOnce=()=>{ if(!logged){ logged=true; rrAutoLog(run); } };
  function finish(){
    clearTimeout(rrAutoTimer);
    logOnce();
    openModal(`🔨 ${name} · 자동 제련 결과`,wrap(n,true),[
      {label:'계속 제련한다',cls:'ok',close:false,action:()=>{ if(typeof showRefineModal==='function') showRefineModal(); }},
      {label:'그만둔다',action:()=>{ if(typeof closeModal==='function') closeModal(); }}
    ]);
    rrAutoScroll();
  }
  if(typeof document==='undefined'||n===0){ finish(); return; }

  openModal(`🔨 ${name} · 자동 제련`,wrap(0,false),[
    {label:'건너뛰기',close:false,action:finish}
  ]);
  let box=document.getElementById('rr-auto-box'), i=0;
  function next(){
    let d=run.steps[i].ok ? (i===0?RR_AUTO_START_MS:RR_AUTO_STEP_MS) : RR_AUTO_FAIL_MS;
    rrAutoTimer=setTimeout(tick,d);
  }
  function tick(){
    // 창이 닫히거나 다른 창으로 바뀌었으면 연출만 멈춘다(상태는 이미 확정·저장됨).
    if(!box||!box.isConnected||!rrAutoIsOpen()){ logOnce(); return; }
    i++;
    if(i>=n){ finish(); return; }
    box.innerHTML=rrAutoRender(refiner,run,i,false);
    rrAutoScroll();
    next();
  }
  next();
}
window.serviceRefineAuto=function(idx,goalArg){
  let target=(window.__svcRefineTargets||[])[idx];
  let live=rrLiveTarget(target);
  if(!live||!live.meta){ rrWarn('⚠ 제련 대상 장비를 찾을 수 없습니다.'); return; }
  let m=live.meta, p=G.player;
  if(m.cur>=10){ rrWarn('⚠ 최대 제련도 +10에 도달했습니다.'); return; }
  let goal=Number(goalArg);
  if(goalArg==null){
    let el=typeof document!=='undefined' ? document.getElementById('svc-rf-goal-'+idx) : null;
    goal=el ? Number(el.value) : NaN;
  }
  goal=Math.floor(goal);
  if(!(goal>m.cur)||goal>10){ rrWarn('⚠ 목표 제련도를 다시 선택하세요.'); return; }
  if((p.inventory[m.ore]||0)<=0){ rrWarn(`⚠ ${m.ore}이(가) 부족합니다.`); return; }
  if(p.zeny<m.cost){ rrWarn(`⚠ 제니가 부족합니다. (필요: ${m.cost.toLocaleString()}z)`); return; }

  let refiner=rrRefiner();
  let run=rrAutoRun(target,goal);
  rrSave();
  if(typeof updateUI==='function') updateUI();
  rrAutoPlay(refiner,run);
};

const RR_LEGACY_REFINE=window.serviceRefineTarget;
window.serviceRefineTarget=function(idx){
  let target=(window.__svcRefineTargets||[])[idx];
  if(!target){
    if(typeof RR_LEGACY_REFINE==='function') return RR_LEGACY_REFINE(idx);
    return;
  }
  rrSuspense(target,idx);
};
window.refine=function(sl){
  let p=G.player,key=p.equip&&p.equip[sl];
  if(!key) return;
  window.__svcRefineTargets=[{source:'equip',slot:sl,key}];
  window.serviceRefineTarget(0);
};
window.__refineRevealV1={version:'1.1',currentRefiner:rrRefiner,resolve:rrResolvePending,autoRun:rrAutoRun};
})();
