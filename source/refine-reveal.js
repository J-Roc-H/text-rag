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
    {label:'계속 제련한다',cls:'ok',action:()=>{ if(typeof showRefineModal==='function') showRefineModal(); }},
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
window.__refineRevealV1={version:'1.0',currentRefiner:rrRefiner,resolve:rrResolvePending};
})();
