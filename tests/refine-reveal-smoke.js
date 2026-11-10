'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

global.window=global;
let modal=null, logs=[], notices=[], updateCount=0, saveCount=0;
global.openModal=(title,body,actions)=>{ modal={title,body,actions}; };
let closeCount=0;
global.closeModal=()=>{ closeCount++; };
// openModal 버튼 규칙 재현: action() 실행 뒤 close!==false 이면 closeModal() 자동 호출
function clickBtn(b){ b.action(); if(b.close!==false) closeModal(); }
global.log=(msg,type)=>logs.push({msg,type});
global.notify=(msg,type)=>notices.push({msg,type});
global.updateUI=()=>{ updateCount++; };
global.saveLocal=()=>{ saveCount++; };

global.DB={
  npcs:{
    '대장장이 홀그렌':{map:'프론테라',service:'refine'},
    '대장장이 안토니오':{map:'페이욘',service:'refine'},
    '대장장이 아라감':{map:'모로크',service:'refine'}
  },
  refine:{'무기1':{ore:'프라코니',cost:100,rates:[100,0,0,0,0,0,0,0,0,0]}}
};
global.G={currentMap:'프론테라',player:null};

function parseKey(key){
  const m=String(key).match(/^\+(\d+)\s+(.+)$/);
  const refine=m?Number(m[1]):0;
  const baseName=m?m[2]:String(key);
  return {baseName,refine,slots:0,cards:[],base:{type:'무기',weaponLv:1}};
}
global.parseItem=parseKey;
global.buildEquipKey=(baseName,slots,cards,refine)=>`+${refine} ${baseName}`;
global.getItemDisplayName=p=>p.refine>0?`+${p.refine} ${p.baseName}`:p.baseName;

global.showRefineModal=()=>{ modal={title:'REFINE_LIST',body:'',actions:[]}; };

const code=fs.readFileSync('source/refine-reveal.js','utf8');
vm.runInThisContext(code,{filename:'source/refine-reveal.js'});

function resetPlayer(key,ore=3,zeny=1000){
  G.player={
    zeny,
    inventory:{'프라코니':ore},
    equip:{'무기':key},
    _maxRefineEver:0
  };
  window.__svcRefineTargets=[{source:'equip',slot:'무기',key}];
  modal=null; logs=[]; notices=[]; updateCount=0; saveCount=0;
}

// 1) 첫 클릭: 공통 비명만 보이고 어떤 상태도 변하지 않는다.
resetPlayer('나이프');
assert.strictEqual(window.__refineRevealV1.currentRefiner(),'대장장이 홀그렌');
const oldRandom=Math.random;
Math.random=()=>0;
window.serviceRefineTarget(0);
assert(modal && modal.body.includes('으허허헉!!!!'));
assert(!modal.body.includes('성공'));
assert(!modal.body.includes('실패'));
assert.strictEqual(G.player.zeny,1000);
assert.strictEqual(G.player.inventory['프라코니'],3);
assert.strictEqual(G.player.equip['무기'],'나이프');
assert.strictEqual(logs.length,0);
assert.strictEqual(notices.length,0);
assert.strictEqual(updateCount,0);
assert.strictEqual(saveCount,0);

// 2) [다음]: 이 순간에 비용 차감 + 성공 판정 + 결과 공개.
modal.actions[0].action();
assert.strictEqual(G.player.zeny,900);
assert.strictEqual(G.player.inventory['프라코니'],2);
assert.strictEqual(G.player.equip['무기'],'+1 나이프');
assert(logs.some(x=>x.msg.includes('성공')));
assert(notices.some(x=>x.msg.includes('성공')));
assert(modal.title.includes('홀그렌'));
assert(modal.body.includes('제련 +1 성공'));
assert(updateCount>0 && saveCount>0);

// 2-b) 결과창의 [계속 제련한다]: 제련 목록 창이 열린 채로 남아야 한다(버튼 기본 자동닫기에 닫히면 안 됨).
const cont=modal.actions.find(a=>a.label==='계속 제련한다');
const stop=modal.actions.find(a=>a.label==='그만둔다');
assert(cont && stop);
closeCount=0;
clickBtn(cont);
assert.strictEqual(modal.title,'REFINE_LIST');
assert.strictEqual(closeCount,0,'계속 제련한다 뒤 창이 닫히면 안 된다');
modal={title:'RESULT',body:'',actions:[]};
closeCount=0;
clickBtn(stop);
assert(closeCount>=1,'그만둔다는 창을 닫아야 한다');

// 3) 실패도 [다음] 전에는 노출되지 않으며, 이후 장비가 파괴된다.
resetPlayer('+1 나이프');
Math.random=()=>0.5; // +1 단계 성공률 0%
window.serviceRefineTarget(0);
assert(modal.body.includes('으허허헉!!!!'));
assert.strictEqual(G.player.equip['무기'],'+1 나이프');
assert.strictEqual(G.player.zeny,1000);
modal.actions[0].action();
assert.strictEqual(G.player.equip['무기'],null);
assert.strictEqual(G.player.zeny,900);
assert.strictEqual(G.player.inventory['프라코니'],2);
assert(logs.some(x=>x.msg.includes('파괴')));
assert(notices.some(x=>x.msg.includes('실패')));
assert(modal.body.includes('파괴'));
assert(modal.body.includes('나를 원망하진 말아주게'));

// 4) 자동 제련 — 목표 제련도까지 연속 판정, 실패 시 파괴, 자원 부족 시 중단.
const baseRates=DB.refine['무기1'].rates.slice();
function setRates(r){ DB.refine['무기1'].rates=r; }
function autoModalOpenSafe(){ return modal && /자동 제련 결과/.test(modal.title); }
function resetInv(key,qty,ore,zeny){
  G.player={zeny,inventory:{'프라코니':ore},equip:{},_maxRefineEver:0};
  G.player.inventory[key]=qty;
  window.__svcRefineTargets=[{source:'inventory',key}];
  modal=null; logs=[]; notices=[]; updateCount=0; saveCount=0;
}

// 4-a) 목표 달성: 100% 구간을 연달아 통과
setRates([100,100,100,100,100,100,100,100,100,100]);
resetPlayer('나이프',10,10000);
window.serviceRefineAuto(0,3);
assert.strictEqual(G.player.equip['무기'],'+3 나이프');
assert.strictEqual(G.player.zeny,10000-300);
assert.strictEqual(G.player.inventory['프라코니'],7);
assert.strictEqual(G.player._maxRefineEver,3);
assert(autoModalOpenSafe());
assert(modal.body.includes('목표 +3 달성'));
assert(logs.some(x=>x.msg.includes('자동 제련')&&x.msg.includes('+3 나이프')));
assert(notices.some(x=>x.msg.includes('+3')));
assert(saveCount>0 && updateCount>0);
// 결과창 버튼: 계속 제련한다는 창을 닫지 않는다
const autoCont=modal.actions.find(a=>a.label==='계속 제련한다');
closeCount=0; clickBtn(autoCont);
assert.strictEqual(modal.title,'REFINE_LIST');
assert.strictEqual(closeCount,0);

// 4-b) 중간 실패: +2→+3 단계에서 꽝 → 그 시점 장비만 파괴, 이후 단계는 진행하지 않음
setRates([100,100,0,100,100,100,100,100,100,100]);
resetPlayer('나이프',10,10000);
window.serviceRefineAuto(0,6);
assert.strictEqual(G.player.equip['무기'],null);
assert.strictEqual(G.player.zeny,10000-300);          // 3회 시도(성공2+실패1)만 과금
assert.strictEqual(G.player.inventory['프라코니'],7);
assert(modal.body.includes('꽝'));
assert(modal.body.includes('+2 나이프 파괴'));
assert(modal.body.includes('나를 원망하진 말아주게'));
assert(logs.some(x=>x.msg.includes('파괴')&&x.msg.includes('자동 제련')));
assert(notices.some(x=>x.msg.includes('파괴')));

// 4-c) 재료 부족: 있는 만큼만 올리고 멈춘다(파괴 없음)
setRates([100,100,100,100,100,100,100,100,100,100]);
resetPlayer('나이프',2,10000);
window.serviceRefineAuto(0,5);
assert.strictEqual(G.player.equip['무기'],'+2 나이프');
assert.strictEqual(G.player.inventory['프라코니'],undefined);
assert(modal.body.includes('부족으로 중단'));
assert(!modal.body.includes('꽝'));

// 4-d) 제니 부족
resetPlayer('나이프',10,250);
window.serviceRefineAuto(0,5);
assert.strictEqual(G.player.equip['무기'],'+2 나이프');
assert.strictEqual(G.player.zeny,50);
assert(modal.body.includes('제니 부족으로 중단'));

// 4-e) 가방 장비(2개 보유): 1개만 올리고 나머지 1개는 그대로
resetInv('나이프',2,10,10000);
window.serviceRefineAuto(0,3);
assert.strictEqual(G.player.inventory['나이프'],1);
assert.strictEqual(G.player.inventory['+3 나이프'],1);
assert.strictEqual(G.player.zeny,10000-300);

// 4-f) 잘못된 목표/자원 없음: 아무것도 소모하지 않고 경고 후 제련 목록으로
resetPlayer('+2 나이프',5,1000);
window.serviceRefineAuto(0,2);   // 목표 ≤ 현재
window.serviceRefineAuto(0,11);  // 목표 > 10
window.serviceRefineAuto(0,NaN); // 선택 없음
assert.strictEqual(G.player.zeny,1000);
assert.strictEqual(G.player.equip['무기'],'+2 나이프');
assert.strictEqual(modal.title,'REFINE_LIST');
assert(logs.filter(x=>x.type==='warning').length>=3);
resetPlayer('나이프',0,1000);
window.serviceRefineAuto(0,3);   // 재료 0
assert.strictEqual(G.player.equip['무기'],'나이프');
assert.strictEqual(G.player.zeny,1000);

setRates(baseRates);

Math.random=oldRandom;
console.log('OK - refine reveal smoke');
