'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const native=Date.now.bind(Date);Date.now=()=>{const t=localStorage.getItem('__airshipTestTime');return t===null?native():Number(t);};
  });
  const base=Math.floor(Date.now()/480000)*480000;
  const setTime=async offset=>page.evaluate(time=>{localStorage.setItem('__airshipTestTime',String(time));airshipTick();updateActionStatus();},base+offset);
  const snapshot=()=>page.evaluate(()=>({map:mapLabel(G.currentMap),home:mapLabel(G.player.savedMap),money:G.player.zeny,trip:G.player.airshipTrip,terminal:G.player.airshipTerminal,hunt:G.autoHunt,offline:G.player.offlineHunt}));
  const reloadCharacter=async()=>{await page.reload({waitUntil:'networkidle'});await page.locator('.char-slot:not(.empty)').first().click();};
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    await page.locator('.char-slot.empty').first().click();await page.locator('#nn').fill('비공정 검증');
    await page.getByRole('button',{name:'생성',exact:true}).click();await page.locator('.char-slot:not(.empty)').first().click();
    await page.evaluate(()=>{closeModal();G.player.zeny=5000;G.currentMap=mapKey('이즈루드');G.player.savedMap=mapKey('이즈루드');updateUI();});
    await setTime(1000);
    // Real surrounding actor -> service -> confirmation -> boarding.
    await page.evaluate(()=>showNpcModal());
    await page.getByRole('button',{name:/비공정 안내원/}).click();
    await page.getByRole('button',{name:'🛫 비공정 노선·탑승 안내',exact:true}).click();
    await page.locator('#airship-goal').selectOption('유노');
    await page.locator('#airship-board').click();
    assert(await page.locator('#modal-body').innerText().then(s=>s.includes('1,200z')));
    await page.getByRole('button',{name:'탑승 확정',exact:true}).click();
    let s=await snapshot();assert.equal(s.money,3800);assert.equal(s.map,'비공정 국제선');assert.equal(s.home,'이즈루드');
    await page.screenshot({path:'/tmp/airship-cabin.png'});
    assert.equal(await page.evaluate(()=>airshipCommitBoard('international','이즈루드','유노',true)),false);
    assert.equal((await snapshot()).money,3800);
    assert(await page.locator('#airship-disembark').isEnabled());
    await page.evaluate(()=>{toggleHunt();saveLocal();});assert.equal((await snapshot()).hunt,false);
    await setTime(20000);assert(await page.locator('#airship-disembark').isDisabled());
    await page.locator('#modal-actions').getByRole('button',{name:'닫기',exact:true}).click();
    await setTime(40000);await reloadCharacter();
    s=await snapshot();assert.equal(s.map,'비공정 국제선');assert.equal(s.money,3800);assert.equal(s.home,'이즈루드');assert(!s.offline);
    await setTime(80000);
    s=await snapshot();assert.equal(s.map,'유노 공항 환승구역');assert(s.terminal);assert(!s.trip);assert.equal(s.home,'이즈루드');
    console.log('PASS real NPC boarding, one-time fare, departure boundary, no hunting, midflight reload, automatic arrival');
    await setTime(320001);
    await page.evaluate(()=>showAirshipModal('domestic'));
    assert(await page.locator('#modal-body').innerText().then(s=>s.includes('추가 요금 없음')));
    await page.locator('#airship-goal').selectOption('휘겔');await page.locator('#airship-board').click();
    await page.getByRole('button',{name:'탑승 확정',exact:true}).click();
    s=await snapshot();assert.equal(s.money,3800);assert.equal(s.map,'비공정 국내선');
    await setTime(400000);s=await snapshot();assert.equal(s.map,'휘겔');assert.equal(s.home,'휘겔');
    // Manual travel continues through missed stops, and disembark is only legal at a dock.
    await page.evaluate(()=>showAirshipModal('domestic'));await page.locator('#airship-goal').selectOption('유노');
    await page.locator('#airship-auto').uncheck();await page.locator('#airship-board').click();await page.getByRole('button',{name:'탑승 확정',exact:true}).click();
    assert.equal((await snapshot()).money,2600);
    await setTime(480000);assert.equal((await snapshot()).map,'비공정 국내선');
    await setTime(500000);assert(await page.locator('#airship-disembark').isDisabled());
    await setTime(800000);await page.locator('#airship-disembark').click();assert((await snapshot()).terminal);
    await reloadCharacter();assert.equal((await snapshot()).map,'유노 공항 환승구역');
    await page.evaluate(()=>showAirshipModal());await page.getByRole('button',{name:'유노 시내로',exact:true}).click();
    await page.getByRole('button',{name:'시내로 나간다',exact:true}).click();
    s=await snapshot();assert.equal(s.map,'유노');assert.equal(s.home,'유노');assert(!s.terminal);
    console.log('PASS free Juno transfer, paid boarding after airport exit, manual missed-stop loop, terminal reload');
    // A late reload must land at the selected destination, not the vessel's current stop.
    await page.evaluate(()=>showAirshipModal('domestic'));await page.locator('#airship-goal').selectOption('리히타르젠');
    await page.locator('#airship-board').click();await page.getByRole('button',{name:'탑승 확정',exact:true}).click();
    assert.equal((await snapshot()).money,1400);
    await page.evaluate(()=>saveLocal());
    await page.evaluate(time=>localStorage.setItem('__airshipTestTime',String(time)),base+86400000*7);
    await reloadCharacter();s=await snapshot();assert.equal(s.map,'리히타르젠');assert(!s.trip);assert(!s.offline);
    // Guard legacy/corrupt states, and ensure unrelated external movement ends a trip.
    await page.evaluate(()=>{G.currentMap=mapKey('비공정 국내선');G.player.airshipTrip={line:'bogus'};G.player.savedMap='비공정 국내선';saveLocal();});
    await reloadCharacter();s=await snapshot();assert.equal(s.map,'프론테라');assert(!s.trip);
    console.log('PASS week-long offline destination recovery and malformed save fallback');
    await setTime(1000);
    await page.evaluate(()=>{G.currentMap=mapKey('이즈루드');G.player.savedMap=mapKey('프론테라');G.player.zeny=5000;airshipCommitBoard('international','이즈루드','유노',true);G.player.inventory['나비의 날개']=1;useItem('나비의 날개');});
    assert.equal((await snapshot()).map,'프론테라');assert(!(await snapshot()).trip);
    await setTime(160000);assert.equal((await snapshot()).map,'프론테라');
    await page.evaluate(()=>{G.currentMap=mapKey('이즈루드');G.player.zeny=100;showAirshipModal('international');});
    await setTime(1000);assert(await page.locator('#airship-board').isDisabled());
    assert.equal(await page.evaluate(()=>airshipCommitBoard('international','이즈루드','유노',true)),false);
    assert.equal((await snapshot()).money,100);
    await page.evaluate(()=>{G.currentMap=mapKey('유노');G.player.zeny=5000;});
    await setTime(320001);
    assert.equal(await page.evaluate(()=>airshipCommitBoard('domestic','유노','휘겔',true,0)),false);
    assert.equal((await snapshot()).money,5000);
    await page.evaluate(()=>{closeModal();showWorldMapModal();worldMapSelect('유노');});
    // Public helper is also used directly by the map details; no walking edge is added.
    const info=await page.evaluate(()=>({html:airshipRouteInfoHtml('유노'),cabin:getMap('비공정 국내선').connected}));
    assert.equal(await page.locator('.wm-flight.domestic').count(),3);
    assert.equal(await page.locator('.wm-flight.international').count(),3);
    assert(info.html.includes('국내선')&&info.html.includes('국제선'));assert.deepEqual(info.cabin,[]);
    console.log('PASS external return cancels transit, insufficient funds, route display without free walking bypass');
    await setTime(1000);
    await page.evaluate(()=>{
      closeModal();G.currentMap=mapKey('이즈루드');G.player.zeny=5000;
      airshipCommitBoard('international','이즈루드','유노',true);saveLocal();closeModal();
      initLobby();slots[activeSlot]=null;saveSlots();
    });
    await setTime(160000);await page.waitForTimeout(600);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('rmc_v3'))[activeSlot]),null);
    assert.equal(await page.evaluate(()=>airshipSync()),false);
    console.log('PASS lobby timer cannot restore a deleted character slot');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
