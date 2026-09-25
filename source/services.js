(function(){
'use strict';

// TextRAG service-system completion layer.
// Built after block-engine-logic so existing globals remain canonical;
// this layer replaces only the five scoped systems for this session.

const SVC_REFINABLE_TYPES = new Set(['무기','방패','갑옷','투구_상단','투구_중단','투구_하단','걸칠것','신발']);
const SVC_CRAFT_SKILLS = new Set([
  '파머시','화살 제조',
  '단검 제작','검 제작','양손검 제작','도끼 제작','너클 제작','메이스 제작','창 제작',
  '철 제조','속성석 제조','강철 제조'
]);
const SVC_TARGET_SERVICES = new Set(['dungeon_access','exchange','exchange_gem','exchange_smile']);

function svcHtml(v){
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function svcCloneInventory(inv){ return Object.assign({}, inv || {}); }
function svcSave(){
  if(typeof saveLocal === 'function'){
    try{ saveLocal(); }catch(e){}
  }
}
function svcStopHunt(){
  G.battles = [];
  clearTimeout(G.huntTimer);
  G.autoHunt = false;
  let hb = document.getElementById('hunt-btn');
  if(hb){ hb.classList.remove('hunt-on'); hb.textContent = '▶ 자동사냥'; }
}

// ══════════════════════════════════════════════
// 1차-1. 제련 — 장착/인벤토리 공용
// ══════════════════════════════════════════════

function svcRefineMeta(itemKey){
  let parsed = parseItem(itemKey);
  if(!parsed || !parsed.base || !SVC_REFINABLE_TYPES.has(parsed.base.type)) return null;
  let cur = Number(parsed.refine)||0;
  let refKey = '방어구';
  if(parsed.base.type === '무기'){
    let wLv = parsed.base.weaponLv || 1;
    refKey = '무기' + Math.min(4, Math.max(1, wLv));
  }
  let refData = DB.refine && DB.refine[refKey];
  let ore = refData ? refData.ore : '에르늄';
  let cost = refData ? refData.cost : 2000;
  let rates = refData ? refData.rates : [100,100,100,100,60,60,50,40,20,10];
  let rate = rates[cur] == null ? 20 : rates[cur];
  return {key:itemKey, parsed, def:parsed.base, cur, refKey, ore, cost, rate};
}
function svcRefineRow(target, label, qty){
  let p = G.player, m = svcRefineMeta(target.key);
  if(!m) return '';
  let oreHave = p.inventory[m.ore] || 0;
  let maxed = m.cur >= 10;
  let affordable = !maxed && oreHave > 0 && p.zeny >= m.cost;
  let idx = window.__svcRefineTargets.push(target) - 1;
  let q = qty > 1 ? ` <span style="color:var(--text-dim);">x${qty}</span>` : '';
  let state = maxed
    ? '<b style="color:var(--gold-light);">MAX +10</b>'
    : `+${m.cur} → <b>+${m.cur+1}</b> · 성공 ${m.rate}% · ${svcHtml(m.ore)} 1 (${oreHave}) · ${m.cost.toLocaleString()}z`;
  return `<div style="padding:7px 4px;border-bottom:1px dashed var(--border);display:flex;gap:8px;align-items:center;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}${q}</div>
      <div style="font-size:10px;color:var(--text-dim);">${state}</div>
    </div>
    <button class="m-btn ${affordable?'ok':''}" style="padding:4px 9px;flex-shrink:0;" onclick="serviceRefineTarget(${idx})" ${affordable?'':'disabled'}>제련</button>
  </div>`;
}
window.showRefineModal = function(){
  let p = G.player;
  window.__svcRefineTargets = [];
  let equipRows = '', invRows = '';

  ['무기','방패','갑옷','투구_상단','투구_중단','투구_하단','걸칠것','신발'].forEach(sl=>{
    let key = p.equip && p.equip[sl];
    if(!key) return;
    let pr = parseItem(key);
    let label = `착용 · ${svcHtml(pr ? getItemDisplayName(pr) : key)}`;
    equipRows += svcRefineRow({source:'equip', slot:sl, key}, label, 1);
  });

  Object.keys(p.inventory || {}).forEach(key=>{
    let qty = p.inventory[key] || 0;
    if(qty <= 0 || !svcRefineMeta(key)) return;
    let pr = parseItem(key);
    let label = `가방 · ${svcHtml(pr ? getItemDisplayName(pr) : key)}`;
    invRows += svcRefineRow({source:'inventory', key}, label, qty);
  });

  let body = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;">
    장착 장비뿐 아니라 가방 장비도 1개씩 제련합니다. 실패 시 해당 1개가 파괴됩니다.
  </div>
  <div style="font-size:11px;font-weight:700;color:var(--gold-light);margin:6px 0;">착용 장비</div>
  ${equipRows || '<div style="font-size:10px;color:var(--text-dim);padding:6px;">제련 가능한 착용 장비 없음</div>'}
  <div style="font-size:11px;font-weight:700;color:var(--gold-light);margin:10px 0 6px;">가방 장비</div>
  ${invRows || '<div style="font-size:10px;color:var(--text-dim);padding:6px;">제련 가능한 가방 장비 없음</div>'}`;
  openModal('🔨 제련', body, [{label:'닫기',action:()=>{}}]);
};
window.serviceRefineTarget = function(idx){
  let p = G.player;
  let target = (window.__svcRefineTargets || [])[idx];
  if(!target) return;
  let key = target.source === 'equip' ? (p.equip && p.equip[target.slot]) : target.key;
  if(!key || (target.source === 'inventory' && (p.inventory[key]||0) <= 0)){
    log('⚠ 제련 대상 장비가 없습니다.','warning'); showRefineModal(); return;
  }
  let m = svcRefineMeta(key);
  if(!m) { log('⚠ 제련할 수 없는 장비입니다.','warning'); return; }
  if(m.cur >= 10){ log('⚠ 최대 제련도 +10에 도달했습니다.','warning'); return; }
  if((p.inventory[m.ore]||0) <= 0){ log(`${m.ore} 부족`,'error'); return; }
  if(p.zeny < m.cost){ log(`제니 부족 (필요: ${m.cost.toLocaleString()}z)`,'error'); return; }

  p.inventory[m.ore]--;
  if(p.inventory[m.ore] <= 0) delete p.inventory[m.ore];
  p.zeny -= m.cost;

  if(target.source === 'inventory'){
    p.inventory[key]--;
    if(p.inventory[key] <= 0) delete p.inventory[key];
  }

  let displayOld = getItemDisplayName(m.parsed);
  if(Math.random()*100 < m.rate){
    let newRefine = m.cur + 1;
    let newKey = buildEquipKey(m.parsed.baseName, m.parsed.slots, m.parsed.cards, newRefine);
    if(target.source === 'equip') p.equip[target.slot] = newKey;
    else p.inventory[newKey] = (p.inventory[newKey]||0) + 1;
    p._maxRefineEver = Math.max(p._maxRefineEver||0, newRefine);
    log(`🔨 ${getItemDisplayName(parseItem(newKey))} 성공! (성공률 ${m.rate}%)`,'loot');
    notify(`제련 +${newRefine} 성공`,'gold');
  } else {
    if(target.source === 'equip') p.equip[target.slot] = null;
    log(`💥 ${displayOld} 파괴! (성공률 ${m.rate}%)`,'error');
    notify('제련 실패 · 파괴','red');
  }
  svcSave();
  updateUI();
  showRefineModal();
};
window.refine = function(sl){
  let p = G.player, key = p.equip && p.equip[sl];
  if(!key) return;
  window.__svcRefineTargets = [{source:'equip',slot:sl,key}];
  serviceRefineTarget(0);
};

// ══════════════════════════════════════════════
// 1차-2. 카프라 — 이동 공용화 + 창고 수량 이동
// ══════════════════════════════════════════════

function svcKafraMove(dest, cost, label){
  let p = G.player;
  cost = Math.max(0, Number(cost)||0);
  if(!DB.maps[dest]){ log(`⚠ 목적지 데이터가 없습니다: ${dest}`,'error'); return false; }
  if(G.currentMap === dest){ log(`⚠ 이미 <b>${dest}</b>에 있습니다.`,'system'); closeModal(); return false; }
  if(p.zeny < cost){
    log(`⚠ 제니가 부족합니다. (필요: ${cost.toLocaleString()}z / 보유: ${p.zeny.toLocaleString()}z)`,'error');
    return false;
  }
  p.zeny -= cost;
  svcStopHunt();
  G.currentMap = dest;
  log(`${label} <b>${dest}</b>(으)로 이동했습니다. (${cost?`-${cost.toLocaleString()}z`:'무료'})`,'system');
  renderMonsters();
  updateUI();
  svcSave();
  closeModal();
  return true;
}
window.kafraTeleport = function(){
  let p = G.player;
  svcKafraMove(p.savedMap || '프론테라', 1200, '🌀 <b>[카프라 텔레포트]</b>');
};
window.kafraWarpTo = function(dest, cost){
  svcKafraMove(dest, cost, '🚃 <b>[카프라 워프]</b>');
};

function svcReadWarehouse(){
  try{
    let raw = localStorage.getItem('rmc_warehouse');
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    log('⚠ 창고 데이터를 읽을 수 없습니다.','error');
    return {};
  }
}
function svcWriteWarehouse(wh){
  try{
    localStorage.setItem('rmc_warehouse', JSON.stringify(wh));
    return true;
  }catch(e){
    log('⚠ 창고 저장에 실패했습니다. 이동을 취소했습니다.','error');
    return false;
  }
}
function svcWarehouseButtons(idx, direction, qty){
  let n10 = Math.min(10, qty);
  return `<span style="display:flex;gap:2px;flex-shrink:0;">
    <button class="m-btn" style="padding:2px 5px;font-size:9px;" onclick="serviceWarehouseTransfer(${idx},'${direction}',1)">1</button>
    <button class="m-btn" style="padding:2px 5px;font-size:9px;" onclick="serviceWarehouseTransfer(${idx},'${direction}',${n10})">${n10}</button>
    <button class="m-btn ok" style="padding:2px 5px;font-size:9px;" onclick="serviceWarehouseTransfer(${idx},'${direction}','all')">전부</button>
  </span>`;
}
window.kafraWarehouse = function(){
  let p = G.player, wh = svcReadWarehouse();
  let invKeys = Object.keys(p.inventory||{}).filter(k=>(p.inventory[k]||0)>0);
  let whKeys = Object.keys(wh).filter(k=>(wh[k]||0)>0);
  window.__svcWarehouseTargets = [];

  let invRows = invKeys.map(k=>{
    let idx = window.__svcWarehouseTargets.push(k)-1;
    let pr = parseItem(k), it = pr ? pr.base : DB.items[k], qty=p.inventory[k];
    let nm = pr ? getItemDisplayName(pr) : k;
    return `<div style="display:flex;justify-content:space-between;gap:5px;align-items:center;padding:4px 3px;border-bottom:1px dashed var(--border);font-size:10px;">
      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it?it.emoji:'📦'} ${svcHtml(nm)} <span style="color:var(--text-dim);">x${qty}</span></span>
      ${svcWarehouseButtons(idx,'deposit',qty)}
    </div>`;
  }).join('');

  let whRows = whKeys.map(k=>{
    let idx = window.__svcWarehouseTargets.push(k)-1;
    let pr = parseItem(k), it = pr ? pr.base : DB.items[k], qty=wh[k];
    let nm = pr ? getItemDisplayName(pr) : k;
    return `<div style="display:flex;justify-content:space-between;gap:5px;align-items:center;padding:4px 3px;border-bottom:1px dashed var(--border);font-size:10px;">
      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it?it.emoji:'📦'} ${svcHtml(nm)} <span style="color:var(--text-dim);">x${qty}</span></span>
      ${svcWarehouseButtons(idx,'withdraw',qty)}
    </div>`;
  }).join('');

  let body = `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;height:55vh;">
    <div style="display:flex;flex-direction:column;overflow:hidden;">
      <div style="font-weight:700;font-size:11px;color:var(--blue-light);padding:5px;">🎒 내 인벤토리</div>
      <div style="flex:1;overflow:auto;border:1px solid var(--border);padding:3px;">${invRows||'<div style="padding:10px;color:var(--text-dim);font-size:10px;">아이템 없음</div>'}</div>
    </div>
    <div style="display:flex;flex-direction:column;overflow:hidden;">
      <div style="font-weight:700;font-size:11px;color:var(--gold-light);padding:5px;">📦 공유 창고</div>
      <div style="flex:1;overflow:auto;border:1px solid var(--border-gold);padding:3px;">${whRows||'<div style="padding:10px;color:var(--text-dim);font-size:10px;">창고 비어있음</div>'}</div>
    </div>
  </div>
  <div style="font-size:10px;color:var(--text-dim);margin-top:6px;">각 아이템을 1개 · 10개 · 전부 단위로 이동합니다. 창고는 전 캐릭터 공용입니다.</div>`;
  openModal('📦 카프라 창고', body, [{label:'닫기',action:()=>{}}]);
};
window.serviceWarehouseTransfer = function(idx, direction, requested){
  let p = G.player, item = (window.__svcWarehouseTargets||[])[idx];
  if(!item) return;
  let wh = svcReadWarehouse();
  let sourceQty = direction === 'deposit' ? (p.inventory[item]||0) : (wh[item]||0);
  let qty = requested === 'all' ? sourceQty : Math.min(sourceQty, Math.max(1, Number(requested)||1));
  if(qty <= 0){ log('이동할 아이템이 없습니다.','warning'); return; }

  let nextWh = Object.assign({}, wh);
  if(direction === 'deposit') nextWh[item] = (nextWh[item]||0) + qty;
  else {
    nextWh[item] = (nextWh[item]||0) - qty;
    if(nextWh[item] <= 0) delete nextWh[item];
  }
  // 창고 쓰기가 실패하면 캐릭터 인벤토리는 건드리지 않는다.
  if(!svcWriteWarehouse(nextWh)) return;

  if(direction === 'deposit'){
    p.inventory[item] -= qty;
    if(p.inventory[item] <= 0) delete p.inventory[item];
    log(`📦 <b>[창고]</b> ${item} x${qty} 맡김`,'system');
  }else{
    p.inventory[item] = (p.inventory[item]||0) + qty;
    log(`📦 <b>[창고]</b> ${item} x${qty} 찾음`,'system');
  }
  svcSave();
  updateUI();
  kafraWarehouse();
};
window.warehouseDeposit = function(itemName, qty){ 
  window.__svcWarehouseTargets=[itemName];
  serviceWarehouseTransfer(0,'deposit',qty||1);
};
window.warehouseWithdraw = function(itemName, qty){
  window.__svcWarehouseTargets=[itemName];
  serviceWarehouseTransfer(0,'withdraw',qty||1);
};

// ══════════════════════════════════════════════
// 1차-3. 던전 입장 — 1회 해금 + 데이터 기반 조건
// ══════════════════════════════════════════════

function svcDungeonState(n,p){
  let target = n.targetMap || '';
  let reqLv = Math.max(0, Number(n.reqLv)||0);
  let reqItems = n.reqItems || {};
  let reqQuests = [];
  if(n.reqQuest) reqQuests.push(n.reqQuest);
  if(Array.isArray(n.reqQuests)) reqQuests = reqQuests.concat(n.reqQuests);
  let reasons = [], rows = [];
  if(!target || !DB.maps[target]) reasons.push('목적지 데이터 없음');
  if(reqLv){
    let ok = (p.baseLv||1) >= reqLv;
    rows.push(`Base Lv.${reqLv} ${ok?'✅':`❌ (현재 ${p.baseLv||1})`}`);
    if(!ok) reasons.push(`Base Lv.${reqLv} 필요`);
  }
  reqQuests.forEach(qid=>{
    let done = p.quests && p.quests[qid] && p.quests[qid].state === 'done';
    rows.push(`퀘스트 ${svcHtml(qid)} ${done?'✅':'❌'}`);
    if(!done) reasons.push(`퀘스트 ${qid} 완료 필요`);
  });
  Object.keys(reqItems).forEach(item=>{
    let need = Math.max(0, Number(reqItems[item])||0), have=(p.inventory&&p.inventory[item])||0;
    rows.push(`${svcHtml(item)} ${have}/${need} ${have>=need?'✅':'❌'}`);
    if(have < need) reasons.push(`${item} ${need}개 필요`);
  });
  let cost = Math.max(0, Number(n.cost)||0);
  if(cost){
    rows.push(`${cost.toLocaleString()}z ${p.zeny>=cost?'✅':`❌ (보유 ${p.zeny.toLocaleString()}z)`}`);
    if(p.zeny < cost) reasons.push(`${cost.toLocaleString()}z 필요`);
  }
  return {
    target, cost, reqItems, reqQuests, rows, reasons,
    already: !!(p.unlockedMaps && p.unlockedMaps[target]),
    canEnter: reasons.length===0
  };
}
function svcShowDungeonAccess(nm,n){
  let p=G.player, st=svcDungeonState(n,p);
  if(st.already){
    openModal(`${n.emoji||'🗺️'} ${nm}`,
      `<div style="font-size:12px;line-height:1.8;"><b>${svcHtml(st.target)}</b> 입장 허가는 이미 등록되어 있습니다.<br><span style="font-size:10px;color:var(--text-dim);">입장료를 다시 지불하지 않습니다.</span></div>`,
      [{label:'확인',action:()=>{}}]);
    return;
  }
  let cond = st.rows.length ? st.rows.map(x=>`<div>${x}</div>`).join('') : '<div>추가 조건 없음</div>';
  let body = `<div style="font-size:12px;line-height:1.7;">
    <b>${svcHtml(st.target)}</b> 입장 허가
    <div style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:3px;font-size:10px;">${cond}</div>
    ${n.consumeReqItems?'<div style="margin-top:5px;font-size:10px;color:var(--text-dim);">요구 아이템은 허가 시 소모됩니다.</div>':''}
  </div>`;
  let buttons = [];
  if(st.canEnter){
    buttons.push({label:st.cost?`허가받기 (${st.cost.toLocaleString()}z)`:'허가받기',cls:'ok',close:false,action:()=>serviceDungeonUnlock(nm)});
  }
  buttons.push({label:'닫기',action:()=>{}});
  openModal(`${n.emoji||'🗺️'} ${nm}`,body,buttons);
}
window.serviceDungeonUnlock = function(nm){
  let n=DB.npcs[nm], p=G.player;
  if(!n) return;
  let st=svcDungeonState(n,p);
  if(st.already){ log(`🗺️ ${st.target} 입장은 이미 해금되어 있습니다.`,'system'); closeModal(); return; }
  if(!st.canEnter){ log(`⚠ 입장 조건 미달: ${st.reasons.join(' / ')}`,'warning'); svcShowDungeonAccess(nm,n); return; }

  if(n.consumeReqItems){
    Object.keys(st.reqItems).forEach(item=>{
      p.inventory[item]-=st.reqItems[item];
      if(p.inventory[item]<=0) delete p.inventory[item];
    });
  }
  p.zeny -= st.cost;
  if(!p.unlockedMaps) p.unlockedMaps={};
  p.unlockedMaps[st.target]=true;
  if(st.cost) log(`💰 -${st.cost.toLocaleString()}z (입장 허가)`,'warning');
  log(`🗺️ <b>[${st.target}]</b> 입장이 해금되었습니다!`,'quest');
  notify(`던전 해금: ${st.target}`,'gold');
  if(typeof checkQuestGather==='function') checkQuestGather();
  svcSave(); updateUI(); closeModal();
};

// ══════════════════════════════════════════════
// 2차-1. 공용 NPC 교환 엔진
// ══════════════════════════════════════════════

function svcExchangeRecipes(n){
  if(Array.isArray(n.exchanges)) return n.exchanges;
  if(n.service === 'exchange_gem'){
    let gems=['루비','자수정','지르콘'];
    return gems.map((g,i)=>({
      label:`${g} x2 → ${gems[(i+1)%gems.length]} x1`,
      give:{[g]:2}, receive:{[gems[(i+1)%gems.length]]:1}
    }));
  }
  if(n.service === 'exchange_smile'){
    return [{
      label:'육류 x1 → 재료 랜덤 3개',
      give:{'육류':1},
      random:{pool:['솜털','젤로피','클로버'],rolls:3}
    }];
  }
  return [];
}
function svcRecipeOutputsValid(r){
  let names = Object.keys(r.receive||{});
  if(r.random && Array.isArray(r.random.pool)) names = names.concat(r.random.pool);
  return names.every(k=>!!DB.items[k]);
}
function svcExchangeMax(r,p){
  let max=999;
  Object.keys(r.give||{}).forEach(item=>{
    let need=Math.max(1,Number(r.give[item])||1);
    max=Math.min(max,Math.floor(((p.inventory&&p.inventory[item])||0)/need));
  });
  if((r.zeny||0)>0) max=Math.min(max,Math.floor(p.zeny/r.zeny));
  return Math.max(0,max);
}
function svcRecipeDesc(r,p){
  let give=Object.keys(r.give||{}).map(k=>`${svcHtml(k)} x${r.give[k]} (보유 ${(p.inventory&&p.inventory[k])||0})`).join(', ');
  let recv=Object.keys(r.receive||{}).map(k=>`${svcHtml(k)} x${r.receive[k]}`).join(', ');
  if(r.random) recv=`${(r.random.pool||[]).map(svcHtml).join('/')} 중 ${r.random.rolls||1}회`;
  return `${give||'입력 없음'} → ${recv||'출력 없음'}${r.zeny?` · ${Number(r.zeny).toLocaleString()}z`:''}`;
}
function svcShowExchange(nm,n){
  let p=G.player, recipes=svcExchangeRecipes(n);
  window.__svcExchangeContext={nm};
  let rows=recipes.map((r,i)=>{
    let max=svcExchangeMax(r,p), valid=svcRecipeOutputsValid(r);
    let disable=!valid || max<1;
    return `<div style="padding:7px 3px;border-bottom:1px dashed var(--border);">
      <div style="font-size:11px;font-weight:600;">${svcHtml(r.label||`교환 ${i+1}`)}</div>
      <div style="font-size:10px;color:var(--text-dim);margin:2px 0 5px;">${svcRecipeDesc(r,p)}</div>
      ${valid?'':`<div style="font-size:10px;color:var(--red-light);">⚠ 출력 아이템이 DB에 없어 교환 차단</div>`}
      <div style="display:flex;gap:3px;">
        <button class="m-btn" onclick="serviceRunExchange(${i},1)" ${disable?'disabled':''}>1회</button>
        <button class="m-btn" onclick="serviceRunExchange(${i},10)" ${disable?'disabled':''}>10회</button>
        <button class="m-btn ok" onclick="serviceRunExchange(${i},'max')" ${disable?'disabled':''}>최대 ${max}</button>
      </div>
    </div>`;
  }).join('');
  openModal(`${n.emoji||'🔄'} 교환`, rows||'<div style="padding:10px;color:var(--text-dim);">등록된 교환식이 없습니다.</div>', [{label:'닫기',action:()=>{}}]);
}
window.serviceRunExchange = function(index,requested){
  let ctx=window.__svcExchangeContext||{}, n=DB.npcs[ctx.nm], p=G.player;
  if(!n) return;
  let recipes=svcExchangeRecipes(n), r=recipes[index];
  if(!r) return;
  if(!svcRecipeOutputsValid(r)){ log('⚠ 미등록 출력 아이템이 있어 교환을 중단했습니다.','error'); return; }
  let max=svcExchangeMax(r,p);
  let count=requested==='max'?max:Math.min(max,Math.max(1,Number(requested)||1));
  if(count<=0){ log('⚠ 교환 재료가 부족합니다.','warning'); return; }

  Object.keys(r.give||{}).forEach(item=>{
    p.inventory[item]-=r.give[item]*count;
    if(p.inventory[item]<=0) delete p.inventory[item];
  });
  p.zeny -= (Number(r.zeny)||0)*count;
  let got={};
  Object.keys(r.receive||{}).forEach(item=>{
    let q=r.receive[item]*count;
    p.inventory[item]=(p.inventory[item]||0)+q; got[item]=(got[item]||0)+q;
  });
  if(r.random){
    let pool=r.random.pool||[], rolls=Math.max(1,Number(r.random.rolls)||1);
    for(let i=0;i<count*rolls;i++){
      let item=pool[Math.floor(Math.random()*pool.length)];
      p.inventory[item]=(p.inventory[item]||0)+1; got[item]=(got[item]||0)+1;
    }
  }
  let gotText=Object.keys(got).map(k=>`${k} x${got[k]}`).join(', ');
  log(`🔄 <b>[교환]</b> ${count}회 완료${gotText?` · ${gotText}`:''}`,'loot');
  if(typeof checkQuestGather==='function') checkQuestGather();
  svcSave(); updateUI(); svcShowExchange(ctx.nm,n);
};
window.exchangeGem = function(give,receive){
  let p=G.player, r={give:{[give]:2},receive:{[receive]:1}};
  if(!svcRecipeOutputsValid(r)){ log('⚠ 미등록 출력 아이템입니다.','error'); return; }
  if(svcExchangeMax(r,p)<1){ log('보석이 부족합니다.','warning'); return; }
  p.inventory[give]-=2; if(p.inventory[give]<=0) delete p.inventory[give];
  p.inventory[receive]=(p.inventory[receive]||0)+1;
  log(`💎 ${give} x2 → ${receive} x1 교환 완료`,'loot');
  svcSave(); updateUI(); closeModal();
};

// ══════════════════════════════════════════════
// 2차-2. 제조/파머시 — 공용 메뉴·수량 제작·유령 산출물 차단
// ══════════════════════════════════════════════

function svcCraftRate(sk,lv,s){
  if(!sk.successRate) return 100;
  let sr=(Number(sk.successRate.base)||0)+(lv-1)*(Number(sk.successRate.perLv)||0)+(s.dex/50)*5+(s.luk/50)*3;
  return Math.max(10,Math.min(100,sr));
}
function svcCraftMaterials(name,lv){
  let sk=DB.skills[name];
  if(sk && sk.mats && sk.mats[lv]) return sk.mats[lv];
  if(name==='파머시') return {'빈 병':3,'약초':1};
  if(name==='화살 제조') return {'목재':5,'깃털':1};
  if(name==='철 제조') return {'철광석':1+lv};
  if(name==='속성석 제조') return {'속성석 원석':2+lv};
  if(name==='강철 제조') return {'철':1+lv,'석탄':1};
  return {};
}
function svcCraftOutputNames(name,lv,pharmacyProduct){
  if(name==='파머시') return [pharmacyProduct];
  if(name==='화살 제조') return ['화살'];
  if(name==='단검 제작') return [['나이프','카타르','쇼텔'][lv-1]||'나이프'];
  if(name==='검 제작') return [['소드','롱소드','투핸드소드'][lv-1]||'소드'];
  if(name==='양손검 제작') return ['투핸드소드'];
  if(name==='도끼 제작') return ['도끼'];
  if(name==='너클 제작') return ['브라스 너클'];
  if(name==='메이스 제작') return ['클럽'];
  if(name==='창 제작') return ['스피어'];
  if(name==='철 제조') return ['철'];
  if(name==='속성석 제조') return ['Red Gem','Blue Gem','Yellow Gem','Green Gem'];
  if(name==='강철 제조') return ['강철'];
  return [];
}
function svcCraftOutputLabel(name,lv,pharmacyProduct){
  if(name==='파머시'){
    let q=1+Math.floor(lv/3);
    return `${pharmacyProduct} x${q}`;
  }
  if(name==='화살 제조') return '화살 x100';
  if(name==='철 제조') return `철 x${lv}`;
  if(name==='강철 제조') return `강철 x${lv}`;
  if(name==='속성석 제조') return '속성석 랜덤';
  return svcCraftOutputNames(name,lv,pharmacyProduct).join('/');
}
function svcHasMats(p,mats,count){
  return Object.keys(mats).every(k=>((p.inventory&&p.inventory[k])||0) >= mats[k]*count);
}
function svcMaxCraft(p,mats,spCost){
  let max=20;
  Object.keys(mats).forEach(k=>{
    let need=Math.max(1,Number(mats[k])||1);
    max=Math.min(max,Math.floor(((p.inventory&&p.inventory[k])||0)/need));
  });
  if(spCost>0) max=Math.min(max,Math.floor((p.sp||0)/spCost));
  return Math.max(0,max);
}
function svcCraftOutputValid(names){ return names.length>0 && names.every(k=>!!DB.items[k]); }

function svcCraftCard(name,product){
  let p=G.player, sk=DB.skills[name], lv=(p.skills&&p.skills[name])||0, s=calcStats();
  if(!sk||lv<=0) return '';
  let mats=svcCraftMaterials(name,lv);
  let sp=typeof sk.spCost==='function'?sk.spCost(lv):(sk.spCost||0);
  let outputs=svcCraftOutputNames(name,lv,product);
  let valid=svcCraftOutputValid(outputs);
  let max=svcMaxCraft(p,mats,sp);
  let matText=Object.keys(mats).map(k=>`${svcHtml(k)} ${mats[k]} (보유 ${(p.inventory&&p.inventory[k])||0})`).join(' · ')||'재료 없음';
  let rate=svcCraftRate(sk,lv,s);
  let id=window.__svcCraftRecipes.push({name,product})-1;
  return `<div style="padding:8px 4px;border-bottom:1px dashed var(--border);">
    <div style="display:flex;justify-content:space-between;gap:8px;">
      <b style="font-size:11px;">${sk.emoji||'🛠️'} ${svcHtml(name)} Lv.${lv}${product?` · ${svcHtml(product)}`:''}</b>
      <span style="font-size:10px;color:var(--gold-light);">성공 ${Math.round(rate)}%</span>
    </div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:3px;">${matText}</div>
    <div style="font-size:10px;margin-top:2px;">→ ${svcHtml(svcCraftOutputLabel(name,lv,product))} · SP ${sp}/회</div>
    ${valid?'':`<div style="font-size:10px;color:var(--red-light);margin-top:3px;">⚠ 산출물 DB 미등록 — 유령 아이템 생성을 차단했습니다.</div>`}
    <div style="display:flex;gap:3px;margin-top:5px;">
      <button class="m-btn" onclick="serviceCraftBatch(${id},1)" ${!valid||max<1?'disabled':''}>1회</button>
      <button class="m-btn" onclick="serviceCraftBatch(${id},5)" ${!valid||max<1?'disabled':''}>5회</button>
      <button class="m-btn ok" onclick="serviceCraftBatch(${id},'max')" ${!valid||max<1?'disabled':''}>최대 ${max}</button>
    </div>
  </div>`;
}
function svcShowCraftHub(focusName){
  let p=G.player;
  window.__svcCraftRecipes=[];
  let learned=Array.from(SVC_CRAFT_SKILLS).filter(n=>((p.skills&&p.skills[n])||0)>0);
  let rows='';
  learned.forEach(name=>{
    if(name==='파머시'){
      let lv=p.skills[name]||0;
      [['빨간포션',1],['노란포션',3],['하얀포션',5]].forEach(([product,minLv])=>{
        if(lv>=minLv) rows+=svcCraftCard(name,product);
      });
    }else rows+=svcCraftCard(name,null);
  });
  let head = focusName ? `<div style="font-size:10px;color:var(--text-dim);margin-bottom:5px;">선택 스킬: <b>${svcHtml(focusName)}</b> · 배운 제조 스킬을 한 곳에서 처리합니다.</div>` : '';
  openModal('🛠️ 제조',head+(rows||'<div style="padding:10px;color:var(--text-dim);">배운 제조 스킬이 없습니다.</div>'),[{label:'닫기',action:()=>{}}]);
}
function svcRunPharmacy(sk,learnedLv,product,s){
  let p=G.player, mats=svcCraftMaterials('파머시',learnedLv);
  if(!svcHasMats(p,mats,1)) return {msg:'❌ 재료 부족',type:'error'};
  if(!consumeMats(p,mats)) return {msg:'❌ 재료 부족',type:'error'};
  let sr=svcCraftRate(sk,learnedLv,s);
  if(Math.random()*100>sr) return {msg:`❌ [파머시] ${product} 제조 실패`,type:'warning'};
  let q=1+Math.floor(learnedLv/3);
  p.inventory[product]=(p.inventory[product]||0)+q;
  return {msg:`⚗️ ${product} x${q} 제조 성공`,type:'level-up'};
}
window.serviceCraftBatch = function(idx,requested){
  let recipe=(window.__svcCraftRecipes||[])[idx];
  if(!recipe) return;
  let p=G.player, name=recipe.name, sk=DB.skills[name], lv=(p.skills&&p.skills[name])||0;
  if(!sk||lv<=0) return;
  if(G.cooldowns[name]>0){ log(`⏳ <b>[${name}]</b> 쿨타임 중`,'warning'); return; }

  let mats=svcCraftMaterials(name,lv);
  let spCost=typeof sk.spCost==='function'?sk.spCost(lv):(sk.spCost||0);
  let outputNames=svcCraftOutputNames(name,lv,recipe.product);
  if(!svcCraftOutputValid(outputNames)){
    log(`⚠ <b>[${name}]</b> 산출물이 아이템 DB에 없어 제조를 차단했습니다: ${outputNames.join(', ')}`,'error');
    return;
  }
  let max=svcMaxCraft(p,mats,spCost);
  let count=requested==='max'?max:Math.min(max,Math.max(1,Number(requested)||1));
  if(count<=0){ log(`⚠ <b>[${name}]</b> 재료 또는 SP가 부족합니다.`,'warning'); return; }

  let s=calcStats(), success=0, fail=0, attempted=0, ghostBlocked=false;
  for(let i=0;i<count;i++){
    if((p.sp||0)<spCost || !svcHasMats(p,mats,1)) break;
    let before=svcCloneInventory(p.inventory);
    p.sp-=spCost;
    let result;
    if(name==='파머시') result=svcRunPharmacy(sk,lv,recipe.product,s);
    else result=sk.effect(p,s,null,lv);
    attempted++;

    // 어떤 제조 스킬도 DB 미등록 키를 새로 만들 수 없다.
    let ghost=Object.keys(p.inventory||{}).find(k=>(p.inventory[k]||0)>(before[k]||0) && !DB.items[k]);
    if(ghost){
      p.inventory=before;
      p.sp+=spCost;
      attempted--;
      ghostBlocked=true;
      log(`⚠ <b>[${name}]</b> 미등록 산출물 "${ghost}" 생성을 감지해 해당 시도를 되돌렸습니다.`,'error');
      break;
    }
    if(result && result.type==='level-up') success++;
    else if(result && result.type==='error'){
      p.sp+=spCost;
      attempted--;
      break;
    }else fail++;
  }
  if(attempted>0){
    if(sk.cooldown>0) G.cooldowns[name]=Math.max(1,Math.round(sk.cooldown/(s.aspdDelay||300)));
    log(`🛠️ <b>[${name}]</b> ${attempted}회 제작 · 성공 ${success} / 실패 ${fail}`,(success?'loot':'warning'));
    if(typeof checkQuestGather==='function') checkQuestGather();
    svcSave(); updateUI();
  }
  if(!ghostBlocked) svcShowCraftHub(name);
};

// 기존 useSkill은 전투/일반 스킬의 정본으로 그대로 두고 제조 계열만 메뉴로 라우팅.
const svcLegacyUseSkill = window.useSkill;
window.useSkill = function(name){
  if(SVC_CRAFT_SKILLS.has(name)){
    let p=G.player, sk=DB.skills[name], lv=(p.skills&&p.skills[name])||0;
    if(!sk) return;
    if(lv<=0){ log('⚠ 아직 배우지 않은 스킬입니다.','warning'); return; }
    if(G.autoHunt && G.battles.length){ log('⚠ 자동전투 중에는 제조 메뉴를 열 수 없습니다.','warning'); return; }
    svcShowCraftHub(name);
    return;
  }
  return svcLegacyUseSkill(name);
};

// ══════════════════════════════════════════════
// NPC 라우터 — 기존 퀘스트/언어 장벽은 우선권 유지
// ══════════════════════════════════════════════

function svcNpcHasQuestPriority(nm,p){
  for(let id in TUTORIAL_QUESTS){
    let q=TUTORIAL_QUESTS[id], qs=p.quests&&p.quests[id];
    if(q.npc===nm && qs && ['available','active','completable'].includes(qs.state)) return true;
  }
  return false;
}
function svcUtanBlocked(n,nm,p){
  if(n.race!=='우탄족') return false;
  let done=p.quests&&p.quests['Q_UMB_LANGUAGE']&&p.quests['Q_UMB_LANGUAGE'].state==='done';
  if(done) return false;
  let q=TUTORIAL_QUESTS['Q_UMB_LANGUAGE'];
  let isQuestNpc=q&&q.npc===nm;
  let qs=p.quests&&p.quests['Q_UMB_LANGUAGE'];
  let reachable=qs&&['available','active','completable'].includes(qs.state);
  return !(isQuestNpc&&reachable);
}
function svcMarkInteractTarget(nm,p){
  if(!p.quests) return;
  for(let id in TUTORIAL_QUESTS){
    let q=TUTORIAL_QUESTS[id], qs=p.quests[id];
    if(!qs||qs.state!=='active'||q.type!=='interact') continue;
    if(nm===q.target_npc||nm.startsWith(q.target_npc)){
      qs.state='completable';
      log(`📋 [퀘스트] ${q.title} — 완료 조건 달성! ${q.npc}에게 보고하세요.`,'quest');
      notify('퀘스트 조건 달성!','gold');
      break;
    }
  }
}
const svcLegacyTalkNPC = window.talkNPC;
window.talkNPC = function(nm){
  let n=DB.npcs[nm];
  if(!n || !SVC_TARGET_SERVICES.has(n.service)) return svcLegacyTalkNPC(nm);
  let p=G.player;
  // 기존 공통 게이트/퀘스트 대화가 필요한 경우 정본 talkNPC에 맡긴다.
  if(G.autoHunt || svcUtanBlocked(n,nm,p) || svcNpcHasQuestPriority(nm,p)) return svcLegacyTalkNPC(nm);

  logSep();
  log(`${n.emoji||'💬'} ${nm}: "${n.dialog||''}"`,'npc');
  svcMarkInteractTarget(nm,p);

  if(n.service==='dungeon_access') return svcShowDungeonAccess(nm,n);
  return svcShowExchange(nm,n);
};

window.__serviceSystemsV2 = {
  version:'1.0',
  scope:['refine','kafra','dungeon_access','exchange','crafting'],
  craftingSkills:Array.from(SVC_CRAFT_SKILLS)
};
})();
