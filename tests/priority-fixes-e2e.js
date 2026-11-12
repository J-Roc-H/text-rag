'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'../index.html')));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
    await page.locator('.char-slot.empty').first().click();
    await page.locator('#nn').fill('개선 검증');
    await page.getByRole('button',{name:'생성',exact:true}).click();
    await page.locator('.char-slot:not(.empty)').first().click();
    await page.evaluate(()=>{
      closeModal();
      const p=G.player;
      for(let i=0;i<40;i++){
        const k='검증 장비 '+String(i).padStart(2,'0');
        DB.items[k]={type:'갑옷',def:1,emoji:'🛡️',weight:1};p.inventory[k]=1;
      }
      p.equip['무기']='+10 나이프 [4] <바포메트, 터틀 제너럴, 타나토스의기억>';
      updateUI();openCharDetail('equip');
    });
    for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:844});
      assert(await page.locator('.cd-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'equipment must fit '+width);
      assert(await page.locator('.eq-slot').first().evaluate(e=>e.getBoundingClientRect().width<200));
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{closeCharDetail();showInvModal('equip');});
    await page.locator('#bag-search').fill('검증 장비');
    await page.locator('#bag-list').evaluate(e=>e.scrollTop=600);
    let before=await page.locator('#bag-list').evaluate(e=>e.scrollTop);
    await page.locator('.bag-row:visible').filter({hasText:'검증 장비 15'}).click();
    before=await page.evaluate(()=>G.bagScroll.equip);
    assert(before>0);
    await page.getByRole('button',{name:'장착',exact:true}).click();
    assert(await page.locator('#modal-overlay').evaluate(e=>e.classList.contains('open')));
    assert.equal(await page.locator('#bag-search').inputValue(),'검증 장비');
    assert.equal(await page.evaluate(()=>G.invTab),'equip');
    assert.equal(await page.locator('#bag-list').evaluate(e=>e.scrollTop),before);
    await page.locator('.bag-row:visible').filter({hasText:'검증 장비 15'}).getByRole('button',{name:'해제',exact:true}).click();
    assert(await page.locator('#modal-overlay').evaluate(e=>e.classList.contains('open')));
    assert.equal(await page.locator('#bag-list').evaluate(e=>e.scrollTop),before);
    console.log('PASS equipment widths; bag detail/equip/unequip retains modal, search, tab, scroll');
    await page.evaluate(()=>{G.player.equip['무기']='나이프';showRefineModal();});
    await page.getByText('단계별 확률·실패 안내',{exact:true}).first().click();
    assert(await page.locator('#modal-body').innerText().then(s=>s.includes('연속 성공률')&&s.includes('반환되지 않습니다')));
    console.log('PASS refine step probabilities and destruction/cost guide');
    const result=await page.evaluate(()=>{
      const p=G.player;
      const target={name:'검증 적',element:'무속성',size:'중형',race:'동물형',def:40,softDef:60,lv:1,flee:0,currentHp:100000,distance:1};
      DB.items['검증검']={type:'무기',wType:'한손검',atk:100,weaponLv:1,slots:4,weight:1};
      function stats(cards){p.equip={'무기':`검증검 [4]${cards?' <'+cards+'>':''}`};return calcStats();}
      let base=stats('');let turtle=stats('터틀 제너럴');
      const ordinary=physicalCardDamage(1000,target,base,60,40,true);
      const amplified=physicalCardDamage(1000,target,turtle,60,40,true);
      const thana=stats('타나토스의기억');
      const pierce=physicalCardDamage(1000,target,thana,60,40,true);
      const low=physicalCardDamage(1000,{...target,def:5,softDef:5},thana,5,5,true);
      const critical=physicalCardDamage(1000,target,thana,60,40,false);
      p.sp=10;triggerWeaponCardHit(p,thana,target,DB,()=>{},false);const sp=p.sp;
      p.sp=0;triggerWeaponCardHit(p,thana,target,DB,()=>{},false);const floor=p.sp;
      const both=stats('타나토스의기억, 터틀 제너럴');
      const combined=physicalCardDamage(1000,target,both,60,40,true);
      let magicTarget={...target};DB.skills['화이어 볼트'].effect(p,base,magicTarget,1);const magicBase=target.currentHp-magicTarget.currentHp;
      magicTarget={...target};DB.skills['화이어 볼트'].effect(p,turtle,magicTarget,1);const magicTurtle=target.currentHp-magicTarget.currentHp;
      const skill=DB.skills['배쉬'];let t={...target};skill.effect(p,base,t,1);const bashBase=target.currentHp-t.currentHp;
      t={...target};skill.effect(p,turtle,t,1);const bashTurtle=target.currentHp-t.currentHp;
      const orig=DB.skills['매그넘 브레이크'].effect;let calls=[];
      DB.skills['매그넘 브레이크'].effect=(p,s,t,lv)=>{calls.push(lv);return {msg:'검증'};};
      const random=Math.random;
      try{
        const events=turtle.itemEffects.events.onHit.filter(e=>e.kind==='autoSpell');
        triggerItemEffects('onHit',{player:p,target,stats:turtle,DB,random:()=>0.029},events);
        triggerItemEffects('onHit',{player:p,target,stats:turtle,DB,random:()=>0.03},events);
        Math.random=()=>0.029;
        triggerWeaponCardHit(p,turtle,target,DB,()=>{},true);
      }finally{DB.skills['매그넘 브레이크'].effect=orig;Math.random=random;}
      p.equip={};const inactive=calcStats().itemEffects.combat;
      return {ordinary,amplified,pierce,low,critical,sp,floor,combined,bashBase,bashTurtle,magicBase,magicTurtle,calls,inactive};
    });
    assert.equal(result.ordinary,564);assert.equal(result.amplified,684);
    assert.equal(result.pierce,1000);assert.equal(result.low,100);assert.equal(result.critical,564);
    assert.equal(result.sp,9);assert.equal(result.floor,0);assert.equal(result.combined,1200);
    assert(result.bashTurtle>result.bashBase);assert.equal(result.magicBase,result.magicTurtle);assert.deepEqual(result.calls,[10,10]);
    assert.equal(result.inactive.physicalDamagePct,0);assert.equal(result.inactive.defRatioAttack,0);
    console.log('PASS real card data, DEF scaling, crit exclusion, SP floor, stacking, physical skill bonus, 3% threshold, Lv10 proc, unequip');
    const splash=await page.evaluate(()=>{
      const p=G.player;p.equip={'무기':'검증검 [4] <바포메트>'};p.str=99;p.dex=99;p.skills={};p.hotbar={};p.statusEffects={};p.hp=100000;p.options.huntStyle='immediate';
      G.autoHunt=false;G.currentMap='프론테라 남쪽 평원';
      const mon=Object.values(DB.monsters).find(m=>m.name==='포링')||Object.values(DB.monsters)[0];
      const mk=(name,hp,distance)=>({...structuredClone(mon),name,hp,maxHp:hp,currentHp:hp,distance,def:0,softDef:0,flee:0,lv:1,element:'무속성',size:'중형',exp:1,jexp:1,zeny:[1,1],drops:{},statusEffects:{}});
      G.battles=[mk('범위 주대상',100,1),mk('범위 근처',110,2),mk('범위 바깥',120,5)];
      const kills=p.totalKills||0;const random=Math.random;Math.random=()=>0.5;
      try{processTurn();}finally{Math.random=random;}
      return {kills:p.totalKills-kills,remaining:G.battles.map(m=>m.name),counts:p.killCount};
    });
    assert.equal(splash.kills,2);assert.deepEqual(splash.remaining,['범위 바깥']);assert.equal(splash.counts['범위 근처'],1);
    console.log('PASS splash distance bounds and secondary kill rewards in actual processTurn');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
