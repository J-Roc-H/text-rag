'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

global.window=global;
let modal=null, logs=[], notices=[], updateCount=0, saveCount=0;
global.openModal=(title,body,actions)=>{ modal={title,body,actions}; };
global.closeModal=()=>{};
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

Math.random=oldRandom;
console.log('OK - refine reveal smoke');
