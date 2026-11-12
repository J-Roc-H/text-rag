'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const spec=JSON.parse(fs.readFileSync('source/data/db-airships.json','utf8'));
const maps=JSON.parse(fs.readFileSync('source/data/db-maps.json','utf8'));
const c=vm.createContext({DB:{airships:spec},G:{player:null},
  getMap:ref=>maps[ref],mapKey:ref=>maps[ref]?ref:null,mapLabel:ref=>ref,
  notify:()=>{},clearTimeout:()=>{},log:()=>{},enterMap:()=>{},renderMonsters:()=>{},updateUI:()=>{},saveLocal:()=>{},
  isSafeMap:ref=>!!maps[ref]?.safe});
vm.runInContext(fs.readFileSync('source/airship.js','utf8'),c);
const domestic=spec.routes.domestic,international=spec.routes.international;
assert.equal(c.airshipPhase(domestic,0).port,'유노');assert(c.airshipPhase(domestic,19999).docked);
assert(!c.airshipPhase(domestic,20000).docked);assert.equal(c.airshipPhase(domestic,80000).port,'아인브로크');
assert.equal(c.airshipNextDock(domestic,'유노',20000),320000);
assert.equal(c.airshipNextDock(domestic,'아인브로크',100000),240000);
assert.equal(c.airshipNextDock(domestic,'휘겔',0),400000);
assert.equal(c.airshipNextDock(international,'라헬 필드',0),160000);
assert.equal(c.airshipNextDock(international,'이즈루드',20000),240000);
for(const route of Object.values(spec.routes))for(let block=0;block<route.stops.length*2;block++){
  const time=block*80000;assert.equal(c.airshipPhase(route,time).port,route.stops[block%route.stops.length]);
  assert.equal(c.airshipNextDock(route,route.stops[block%route.stops.length],time+1),time);
}
let p={savedMap:'프론테라',airshipTrip:{line:'international',origin:'이즈루드',goal:'유노',boardedAt:1000,goalSetAt:1000,autoDisembark:true}};
assert(c.airshipValidTrip(p.airshipTrip));c.airshipNormalize(p);assert(p.airshipTrip);
p.airshipTrip.goal='프론테라';c.airshipNormalize(p);assert(!p.airshipTrip);
p={savedMap:'비공정 국내선',airshipTrip:{line:'unknown'},airshipTerminal:false};c.airshipNormalize(p);assert.equal(p.savedMap,'프론테라');assert(!p.airshipTrip);assert(!p.airshipTerminal);
for(const value of [null,[],{line:'__proto__'},{line:'constructor'},{line:'domestic'}, {line:'domestic',origin:'유노',goal:'휘겔',boardedAt:20000,goalSetAt:20000,autoDisembark:true}])assert(!c.airshipValidTrip(value));
console.log('PASS airship schedule, repeated stops, docking boundaries, save normalization');
