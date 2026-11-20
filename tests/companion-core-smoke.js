'use strict';
// 동반자 상태·시간 진행 (P3-10 펫 1단계 Task 3). source/companion.js를 그대로 vm에서 실행한다.
// 규칙 근거: rAthena pet.cpp pet_hungry()/pet_food() — 배고픔은 HungryDelay초마다 Fullness만큼 줄고,
// 먹이면 HungerIncrease만큼 차며 75 이하에서 먹이면 친밀도 +IntimacyFed. 먹이가 없으면 친밀도는 그대로(설계).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'source', 'companion.js'), 'utf8');
const MIN = 60 * 1000, HOUR = 60 * MIN;

function env(food) {
  const ctx = {
    DB: {
      pets: {
        constants: { stages: [1, 100, 250, 750, 910, 1000], hungerStart: 100, feedAt: 25, fullGainMaxHunger: 75 },
        pets: { TEST: { name: '시험펫', food: '시험사료', fullness: 3, hungryDelaySec: 60, hungerIncrease: 20,
          intimacy: { start: 250, fed: 50, overfed: -100, hungry: -5, ownerDie: -20 } } },
      },
    },
    log: () => {}, notify: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const p = { inventory: { '시험사료': food } };
  ctx.companionNormalize(p);
  p.companions.pet = ctx.companionCreatePet('TEST', 0);
  return { ctx, p };
}

// normalize_idempotent
{
  const { ctx } = env(0);
  const p = { inventory: {} };
  ctx.companionNormalize(p); ctx.companionNormalize(p);
  assert.strictEqual(p.companions.pet, null);
  assert.strictEqual(p.companions.starterOffer, null);
  assert.deepStrictEqual(Object.keys(p.companions).sort(), ['advice', 'pet', 'starterOffer']);
}

// create_pet_start_values
{
  const { p } = env(0);
  assert.strictEqual(p.companions.pet.intimacy, 250);
  assert.strictEqual(p.companions.pet.hunger, 100);
}

// no_food_from_start: 6시간, 사료 0 -> 배고픔 0, 친밀도 그대로
{
  const { ctx, p } = env(0);
  const r = ctx.companionAdvance(p, 6 * HOUR);
  assert.strictEqual(p.companions.pet.hunger, 0);
  assert.strictEqual(p.companions.pet.intimacy, 250);
  assert.strictEqual(r.fed, 0);
}

// feeds_in_window: 25분 -> 100-3*25=25 -> 먹고 45, 친밀도 300, 사료 9
{
  const { ctx, p } = env(10);
  const r = ctx.companionAdvance(p, 25 * MIN);
  assert.strictEqual(r.fed, 1);
  assert.strictEqual(p.inventory['시험사료'], 9);
  assert.strictEqual(p.companions.pet.intimacy, 300);
  assert.strictEqual(p.companions.pet.hunger, 45);
  assert.strictEqual(r.stageFrom, 2);
  assert.strictEqual(r.stageTo, 2);
}

// stops_rising_when_out: 사료 1, 12시간 -> 300에서 멈춤, 사료 0
{
  const { ctx, p } = env(1);
  ctx.companionAdvance(p, 12 * HOUR);
  assert.strictEqual(p.companions.pet.intimacy, 300);
  assert.strictEqual(p.inventory['시험사료'] || 0, 0);  // 0개가 된 아이템은 키를 지운다(게임 관례)
  assert.strictEqual(p.companions.pet.hunger, 0);
}

// intimacy_cap: 사료 넉넉, 12시간 -> 1000을 넘지 않고 절친
{
  const { ctx, p } = env(999);
  const r = ctx.companionAdvance(p, 12 * HOUR);
  assert(p.companions.pet.intimacy <= 1000);
  assert.strictEqual(r.stageTo, 4);
}

// split_equals_whole: 12시간을 한 번에 = 1분씩 720번 (나머지 시간을 버리지 않음)
{
  const a = env(50), b = env(50);
  a.ctx.companionAdvance(a.p, 12 * HOUR);
  for (let t = 1; t <= 720; t++) b.ctx.companionAdvance(b.p, t * MIN - 7000);
  b.ctx.companionAdvance(b.p, 12 * HOUR);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.p)), JSON.parse(JSON.stringify(b.p)));
}

// no_backward_time: 과거 시각이면 아무것도 바뀌지 않음 (방치 정산 헤드리스가 시계를 과거로 돌림)
{
  const { ctx, p } = env(5);
  ctx.companionAdvance(p, 2 * HOUR);
  const before = JSON.stringify(p);
  const r = ctx.companionAdvance(p, 1 * HOUR);
  assert.strictEqual(JSON.stringify(p), before);
  assert.strictEqual(r.fed, 0);
}

// unknown_pet_data: 원작 수치가 없는 펫은 진행하지 않음 (근거 필요 상태)
{
  const { ctx, p } = env(5);
  ctx.DB.pets.pets.TEST.fullness = null;
  const r = ctx.companionAdvance(p, 6 * HOUR);
  assert.strictEqual(p.companions.pet.hunger, 100);
  assert.strictEqual(r.fed, 0);
}

// stage_names
{
  const { ctx } = env(0);
  assert.strictEqual(ctx.companionStage(99), 0);
  assert.strictEqual(ctx.companionStage(249), 1);
  assert.strictEqual(ctx.companionStage(250), 2);
  assert.strictEqual(ctx.companionStage(909), 3);
  assert.strictEqual(ctx.companionStage(910), 4);
  assert.strictEqual(ctx.COMPANION_STAGE_NAMES[4], '절친');
}

console.log('companion-core-smoke: OK');
