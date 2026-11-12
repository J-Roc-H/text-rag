// Airship phase 1. Route order, fares and timing: DB.airships (pinned pre-RE source).
// The clock is absolute, shared by tabs, and has no per-frame state to replay on load.
function airshipRoutes(){ return (typeof DB!=='undefined' && DB.airships && DB.airships.routes)||{}; }
function airshipTerminal(){ return DB.airships.terminal; }
function airshipMap(ref){ return typeof getMap==='function' ? getMap(ref) : null; }
function airshipSame(a,b){ return !!a && !!b && mapKey(a)===mapKey(b); }
function airshipEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function airshipPorts(route){ return Array.from(new Set(route.stops)); }
function airshipPlaying(){
  if(typeof document==='undefined') return true;
  const app=document.getElementById('app');
  return !!(app && app.style.display==='block');
}
function airshipAtTerminal(){ return !!(G.player && G.player.airshipTerminal===true && airshipSame(G.currentMap,airshipTerminal())); }
function airshipPort(){ return airshipAtTerminal() ? '유노' : mapLabel(G.currentMap); }
function airshipAvailableLines(port){ return Object.keys(airshipRoutes()).filter(id=>airshipPorts(airshipRoutes()[id]).some(p=>airshipSame(p,port))); }
function airshipIsPlace(){
  return !!(G.player && (G.player.airshipTrip || airshipAtTerminal() || airshipAvailableLines(airshipPort()).length));
}

// A slot starts with docking, then flight to the next entry. Repeated stops are
// intentional: domestic flights visit Einbroch and Juno twice per six-stop loop.
function airshipPhase(route,now){
  const slot=route.dockMs+route.flightMs;
  const block=Math.floor(now/slot), start=block*slot;
  const index=((block%route.stops.length)+route.stops.length)%route.stops.length;
  const docked=now-start<route.dockMs;
  return {index,docked,port:route.stops[index],next:route.stops[(index+1)%route.stops.length],
    endAt:docked?start+route.dockMs:start+slot,startAt:start};
}
function airshipNextDock(route,port,at){
  const slot=route.dockMs+route.flightMs;
  const block=Math.floor(at/slot);
  for(let offset=0;offset<=route.stops.length;offset++){
    const start=(block+offset)*slot;
    const index=(((block+offset)%route.stops.length)+route.stops.length)%route.stops.length;
    if(route.stops[index]===port && (offset>0 || at<start+route.dockMs)) return start;
  }
  return null;
}
function airshipValidTrip(trip){
  if(!trip || typeof trip!=='object' || Array.isArray(trip)) return false;
  if(!Object.prototype.hasOwnProperty.call(airshipRoutes(),trip.line)) return false;
  const route=airshipRoutes()[trip.line];
  if(!route || !airshipPorts(route).includes(trip.origin) || !airshipPorts(route).includes(trip.goal)) return false;
  if(!Number.isFinite(trip.boardedAt) || trip.boardedAt<0 || trip.boardedAt>8640000000000000) return false;
  if(!Number.isFinite(trip.goalSetAt) || trip.goalSetAt<trip.boardedAt || trip.goalSetAt>8640000000000000) return false;
  if(typeof trip.autoDisembark!=='boolean') return false;
  const phase=airshipPhase(route,trip.boardedAt);
  return phase.docked && phase.port===trip.origin;
}
function airshipNormalize(p){
  if(p.airshipTrip && !airshipValidTrip(p.airshipTrip)) delete p.airshipTrip;
  if(p.airshipTerminal!==true || p.airshipTrip) delete p.airshipTerminal;
  if((airshipMap(p.savedMap)||{}).noSavePoint) p.savedMap='프론테라';
}
function airshipStopCombat(){
  G.autoHunt=false; G.battles=[]; clearTimeout(G.huntTimer);
  G.pendingManualOverride=null; G.nextSpawnAt=0;
  delete G.player.offlineHunt;
}
function airshipMoveTo(port){
  const p=G.player;
  delete p.airshipTrip;
  if(port==='유노'){
    p.airshipTerminal=true;
    G.currentMap=mapKey(airshipTerminal());
  }else{
    delete p.airshipTerminal;
    G.currentMap=mapKey(port);
    if(isSafeMap(G.currentMap)) p.savedMap=G.currentMap;
  }
  airshipStopCombat();
  enterMap(G.currentMap);
  log(`🛬 <b>[비공정]</b> ${airshipEsc(port)}에 도착해 하차했습니다.${port==='유노'?' 공항 내부에서 추가 요금 없이 환승할 수 있습니다.':''}`,'location');
}
let airshipSyncing=false;
function airshipSync(now=Date.now(),options={}){
  if(airshipSyncing || !G.player) return false;
  // The lobby retains G.player. Its old HUD timer must not write a deleted slot.
  if(options.persist!==false && !airshipPlaying()) return false;
  const p=G.player, trip=p.airshipTrip;
  if(!trip){
    if(p.airshipTerminal && !airshipSame(G.currentMap,airshipTerminal())) delete p.airshipTerminal;
    return false;
  }
  const route=airshipRoutes()[trip.line];
  if(!airshipValidTrip(trip) || !airshipSame(G.currentMap,route&&route.cabin)){
    delete p.airshipTrip;
    return false;
  }
  const arrival=airshipNextDock(route,trip.goal,trip.goalSetAt);
  if(!trip.autoDisembark || now<arrival) return false;
  airshipSyncing=true;
  try{
    airshipMoveTo(trip.goal);
    if(options.render!==false){ renderMonsters(); updateUI(); }
    if(options.persist!==false) saveLocal();
  }finally{ airshipSyncing=false; }
  return true;
}
function airshipRestore(){
  const p=G.player;
  airshipNormalize(p);
  if(p.airshipTrip){
    G.currentMap=mapKey(airshipRoutes()[p.airshipTrip.line].cabin);
    airshipStopCombat();
    airshipSync(Date.now(),{render:false,persist:false});
    return true;
  }
  if(p.airshipTerminal){
    G.currentMap=mapKey(airshipTerminal());
    airshipStopCombat();
    return true;
  }
  return false;
}
function airshipSummary(now=Date.now()){
  const trip=G.player&&G.player.airshipTrip;
  if(!trip) return airshipAtTerminal()?'유노 공항 · 환승 대기':'';
  const route=airshipRoutes()[trip.line], phase=airshipPhase(route,Math.max(now,trip.boardedAt));
  const seconds=Math.max(0,Math.ceil((phase.endAt-now)/1000));
  return phase.docked?`${phase.port} 정박 · ${seconds}초 뒤 출항`:`${phase.port} → ${phase.next} · 도착까지 ${seconds}초`;
}
function airshipFail(message){ notify(message,'warning'); return false; }
function airshipCanBoard(line,origin,now=Date.now()){
  if(!airshipPlaying()) return false;
  if(!Object.prototype.hasOwnProperty.call(airshipRoutes(),line)) return false;
  const p=G.player, route=airshipRoutes()[line];
  if(!p || !route || p.airshipTrip || p.hp<=0 || G.autoHunt || G.battles.length) return false;
  if(!airshipSame(airshipPort(),origin)) return false;
  const phase=airshipPhase(route,now);
  return phase.docked && airshipSame(phase.port,origin);
}
function airshipCommitBoard(line,origin,goal,autoDisembark,expectedFare){
  const route=airshipRoutes()[line], now=Date.now();
  if(!airshipCanBoard(line,origin,now)) return airshipFail('현재 위치와 정박 시간을 확인하세요. 전투·자동사냥 중에는 탑승할 수 없습니다.');
  if(!airshipPorts(route).includes(goal) || goal===origin) return airshipFail('다른 목적지를 선택하세요.');
  const p=G.player, fare=airshipAtTerminal()?0:route.fare;
  if(expectedFare!==undefined && expectedFare!==fare) return airshipFail('공항 이용 상태가 바뀌었습니다. 요금을 다시 확인하세요.');
  if(p.zeny<fare) return airshipFail('탑승료가 부족합니다.');
  // Check all preconditions before changing money; a second click cannot charge twice.
  p.zeny-=fare;
  p.airshipTrip={line,origin,goal,boardedAt:now,goalSetAt:now,autoDisembark:!!autoDisembark};
  delete p.airshipTerminal;
  airshipStopCombat();
  G.currentMap=mapKey(route.cabin);
  enterMap(G.currentMap);
  log(`🛫 <b>[비공정]</b> ${airshipEsc(route.name)} 탑승 · ${fare?'-'+fare.toLocaleString()+'z':'공항 내부 무료 환승'} · 목적지 ${airshipEsc(goal)}`,'location');
  renderMonsters(); updateUI(); saveLocal(); showAirshipModal();
  return true;
}
function airshipConfirmBoard(line){
  const route=airshipRoutes()[line]; if(!route) return;
  const origin=airshipPort(), goal=document.getElementById('airship-goal').value;
  const auto=document.getElementById('airship-auto').checked;
  const fare=airshipAtTerminal()?0:route.fare;
  openModal('🛫 비공정 탑승 확인',`<div style="font-size:12px;line-height:1.8;">
    <b>${airshipEsc(route.name)}</b><br>${airshipEsc(origin)} → ${airshipEsc(goal)}<br>
    ${fare?'탑승료 '+fare.toLocaleString()+'z':'공항 내부 환승 · 추가 요금 없음'}<br>
    ${auto?'목적지에서 자동 하차합니다.':'정박 중 직접 하차해야 합니다. 정박을 놓치면 계속 순환합니다.'}<br>
    탑승 후에는 운항 일정에 따라 이동하며, 유노에서 시내로 나가면 다음 탑승 시 요금을 다시 냅니다.</div>`,[
      {label:'탑승 확정',cls:'ok',close:false,action:()=>airshipCommitBoard(line,origin,goal,auto,fare)},
      {label:'취소',close:false,action:()=>showAirshipModal(line)}
    ]);
}
function airshipDisembark(){
  if(!airshipPlaying()) return false;
  if(airshipSync()) { showAirshipModal(); return true; }
  const trip=G.player&&G.player.airshipTrip;
  if(!airshipValidTrip(trip)) return false;
  const phase=airshipPhase(airshipRoutes()[trip.line],Math.max(Date.now(),trip.boardedAt));
  if(!phase.docked) return airshipFail('비행 중에는 하차할 수 없습니다.');
  airshipMoveTo(phase.port);
  renderMonsters(); updateUI(); saveLocal();
  if(airshipAtTerminal()) showAirshipModal(); else closeModal();
  return true;
}
function airshipSetDestination(){
  if(!airshipPlaying()) return;
  const trip=G.player&&G.player.airshipTrip;
  if(!airshipValidTrip(trip)) return;
  const goal=document.getElementById('airship-goal').value;
  if(!airshipPorts(airshipRoutes()[trip.line]).includes(goal)) return;
  trip.goal=goal;trip.autoDisembark=document.getElementById('airship-auto').checked;
  trip.goalSetAt=Math.max(Date.now(),trip.boardedAt);
  saveLocal(); airshipSync(); showAirshipModal();
}
function airshipExitTerminal(){
  if(!airshipPlaying() || !airshipAtTerminal()) return;
  openModal('유노 시내로 나가기','공항 밖으로 나가면 다음 탑승 때 입장료 1,200z를 다시 냅니다.',[
    {label:'시내로 나간다',close:false,action:()=>{
      if(!airshipAtTerminal()) return;
      delete G.player.airshipTerminal;G.currentMap=mapKey('유노');
      G.player.savedMap=G.currentMap;enterMap(G.currentMap);updateUI();saveLocal();closeModal();
    }},
    {label:'환승구역에 머문다',close:false,action:()=>showAirshipModal()}
  ]);
}
function airshipRouteInfoHtml(port){
  const lines=airshipAvailableLines(port);
  if(!lines.length) return '';
  return '<div style="font-size:12px;line-height:1.7;margin:10px 0;padding:8px;border:1px solid var(--border);"><b>🛫 비공정 노선</b>'+lines.map(id=>{
    const r=airshipRoutes()[id];return `<div>${airshipEsc(r.name)} · ${r.fare.toLocaleString()}z<br>${r.stops.map(airshipEsc).join(' → ')} → …</div>`;
  }).join('')+'<div>유노 공항 내부에서 노선 간 환승 가능 · 구간 비행 60초 / 정박 20초</div></div>';
}
function showAirshipModal(line){
  if(!airshipPlaying()) return;
  airshipSync();
  const p=G.player;if(!p) return;
  const trip=p.airshipTrip;
  const port=airshipPort();
  const lines=trip?[trip.line]:airshipAvailableLines(port);
  if(!lines.length) return airshipFail('비공정 공항에서 이용할 수 있습니다.');
  if(!lines.includes(line)) line=lines[0];
  const route=airshipRoutes()[line],terminal=airshipAtTerminal();
  const mode=trip?'cabin':terminal?'terminal':'port';
  const goals=airshipPorts(route).filter(x=>trip||x!==port);
  const selected=trip?trip.goal:goals[0];
  const body=`<div class="airship-panel" data-mode="${mode}" data-port="${airshipEsc(port)}" data-line="${line}" style="font-size:12px;line-height:1.8;overflow-wrap:anywhere;">
    ${!trip&&lines.length>1?lines.map(id=>`<button class="m-btn ${id===line?'ok':''}" onclick="showAirshipModal('${id}')">${airshipEsc(airshipRoutes()[id].name)}</button>`).join(' '):''}
    <b>${airshipEsc(route.name)}</b><div>${route.stops.map(airshipEsc).join(' → ')} → …</div>
    <div id="airship-live" role="status" style="padding:10px 0;font-weight:700;"></div>
    <div>비행 60초 · 정박 20초 · 창을 닫아도 운항은 계속됩니다.</div>
    ${trip?'':`<div>${terminal?'공항 내부 환승 · 추가 요금 없음':`탑승료 ${route.fare.toLocaleString()}z · 보유 ${p.zeny.toLocaleString()}z`}</div>`}
    <label>목적지 <select id="airship-goal">${goals.map(x=>`<option value="${airshipEsc(x)}"${x===selected?' selected':''}>${airshipEsc(x)}</option>`).join('')}</select></label>
    <label style="display:block;margin:8px 0;"><input id="airship-auto" type="checkbox"${!trip||trip.autoDisembark?' checked':''}> 선택한 목적지에서 자동 하차</label>
    ${trip?'<div id="airship-goal-status"></div><button class="m-btn" onclick="airshipSetDestination()">목적지·자동 하차 설정 저장</button><button id="airship-disembark" class="m-btn ok" onclick="airshipDisembark()">하차</button>':`<button id="airship-board" class="m-btn ok" onclick="airshipConfirmBoard('${line}')">${terminal?'환승':'탑승'}</button>`}
    ${terminal?'<div style="margin-top:12px;">유노가 목적지라면 공항을 나가세요. 시내로 나갔다 재입장하면 요금을 다시 냅니다.</div><button class="m-btn" onclick="airshipExitTerminal()">유노 시내로</button>':''}
    ${!trip?'<div style="margin-top:8px;color:var(--text-dim);">비공정이 현재 공항에 정박했을 때 탑승할 수 있습니다. 전투·자동사냥 중에는 이용할 수 없습니다.</div>':''}
  </div>`;
  openModal(trip?'🛫 비공정 기내':terminal?'🛬 유노 공항 환승구역':'🛫 비공정 공항',body,[{label:'닫기',action:()=>{}}]);
  airshipUpdatePanel();
}
function airshipUpdatePanel(){
  const panel=document.querySelector('.airship-panel');if(!panel||!G.player) return;
  const trip=G.player.airshipTrip, mode=trip?'cabin':airshipAtTerminal()?'terminal':'port';
  if(mode!==panel.dataset.mode || (!trip && panel.dataset.port!==airshipPort())){
    if(airshipIsPlace()) showAirshipModal();else closeModal();return;
  }
  const route=airshipRoutes()[panel.dataset.line],now=Date.now();
  const live=document.getElementById('airship-live');
  if(trip){
    live.textContent=airshipSummary(now);
    const phase=airshipPhase(route,Math.max(now,trip.boardedAt));
    document.getElementById('airship-disembark').disabled=!phase.docked;
    const goal=document.getElementById('airship-goal-status');
    const arrive=airshipNextDock(route,trip.goal,trip.goalSetAt);
    goal.textContent=trip.autoDisembark?`${trip.goal}에서 자동 하차 · 약 ${Math.max(0,Math.ceil((arrive-now)/1000))}초 뒤`:'직접 하차 · 정박지를 확인하세요.';
  }else{
    const port=airshipPort(),phase=airshipPhase(route,now),dock=airshipNextDock(route,port,now);
    const here=phase.docked&&phase.port===port;
    live.textContent=here?`${port} 정박 중 · ${Math.ceil((phase.endAt-now)/1000)}초 뒤 출항`:`${port} 도착까지 ${Math.max(0,Math.ceil((dock-now)/1000))}초 · ${airshipSummaryForRoute(route,now)}`;
    document.getElementById('airship-board').disabled=!airshipCanBoard(panel.dataset.line,port,now)||G.player.zeny<(airshipAtTerminal()?0:route.fare);
  }
}
function airshipSummaryForRoute(route,now){
  const phase=airshipPhase(route,now);return phase.docked?`${phase.port} 정박 중`:`${phase.port} → ${phase.next} 운항 중`;
}
function airshipTick(){ if(airshipPlaying()){ airshipSync(); airshipUpdatePanel(); } }
