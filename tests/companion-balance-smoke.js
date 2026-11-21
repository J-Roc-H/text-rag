'use strict';
// 친밀도 속도 균형 (사용자 확정 2026-11-21): 초희귀 펫이 대략 한 달이면 절친.
// 실제 db-pets.json(원작 수치 + constants.hungryDelayRate)으로, 먹이를 넉넉히 둔 채 시간을 돌린다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PETS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'source', 'data', 'db-pets.json'), 'utf8'));
const ctx = { DB: { pets: PETS } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'source', 'companion.js'), 'utf8'), ctx);
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

function daysToLoyal(key) {
  const d = PETS.pets[key];
  const p = { inventory: { [d.food]: 1e6 } };
  ctx.companionNormalize(p);
  p.companions.pet = ctx.companionCreatePet(key, 0);
  for (let h = 1; h <= 120 * 24; h++) {
    ctx.companionAdvance(p, h * HOUR);
    if (ctx.companionStage(p.companions.pet.intimacy) === 4) return h / 24;
  }
  return Infinity;
}

assert(PETS.constants.hungryDelayRate > 1, '방치형 속도 배율이 있어야 함');
const rare = Object.keys(PETS.pets).filter((k) => PETS.pets[k].tier === 'rare');
const days = rare.map(daysToLoyal);
const avg = days.reduce((a, b) => a + b, 0) / days.length;
assert(avg >= 25 && avg <= 35, `초희귀 평균 ${avg.toFixed(1)}일 (대략 한 달)`);
days.forEach((d, i) => assert(d >= 14 && d <= 50, `${rare[i]} ${d.toFixed(1)}일`));

// 레벨대 순서: 저레벨 평균이 초희귀보다 빠르다 (첫 알 고르기의 의미)
const tierAvg = (t) => { const ks = Object.keys(PETS.pets).filter((k) => PETS.pets[k].tier === t); return ks.map(daysToLoyal).reduce((a, b) => a + b, 0) / ks.length; };
assert(tierAvg('low') < avg, '저레벨이 초희귀보다 빨리 친해짐');

if (process.argv.includes('--table')) {
  const order = { low: 0, mid: 1, high: 2, rare: 3 };
  Object.keys(PETS.pets).filter((k) => PETS.pets[k].tier).sort((a, b) => order[PETS.pets[a].tier] - order[PETS.pets[b].tier])
    .forEach((k) => console.log(`${PETS.pets[k].tier}\t${PETS.pets[k].name}\t${daysToLoyal(k).toFixed(1)}일`));
}
console.log(`companion-balance-smoke: OK (초희귀 평균 ${avg.toFixed(1)}일)`);
