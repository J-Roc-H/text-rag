'use strict';
// 조언 통로·펫 조언·펫 일상 대사 (P3-10 펫 1단계 Task 6, 쓰러진 원인 Task 7은 아래 별도 절).
// 조언 = 친밀도 축(낮으면 암시, 높으면 수치+권유), 일상 대사 = 배고픔 축(원작 pettalktable 구조).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'source', 'companion.js'), 'utf8');
const TALK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'source', 'data', 'db-pet-talk.json'), 'utf8'));
const MIN = 60 * 1000;

function env(opt) {
  opt = opt || {};
  const logs = [];
  const fakeDate = { now: () => 0 };
  const ctx = {
    DB: {
      pets: { constants: { stages: [1, 100, 250, 750, 910, 1000], hungerStart: 100, feedAt: 25, fullGainMaxHunger: 75 },
        pets: { PORING: { name: '포링', food: '사과 주스', fullness: 3, hungryDelaySec: 60, hungerIncrease: 20,
          intimacy: { start: 250, fed: 50 } } } },
      petTalk: TALK,
      monsters: {
        1: { name: '물렁이', lv: 5, hit: 10, flee: 5 },
        2: { name: '단단이', lv: 20, hit: 5, flee: 20 },      // 명중 95% · 피격 55% -> 부족 없음
        3: { name: '오크 전사', lv: 30, hit: 200, flee: 120 },
      },
      maps: {
        '초원': { monsters: [1] }, '언덕': { monsters: [2] }, '오크 마을': { monsters: [3] }, '마을': { safe: true, monsters: [] },
      },
    },
    log: (m) => logs.push(String(m)), notify: () => {},
    Date: opt.window ? fakeDate : Date,
  };
  if (opt.window) ctx.window = {};
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const p = { inventory: { '사과 주스': 10, '빨간포션': 20 } };
  ctx.companionNormalize(p);
  p.companions.pet = ctx.companionCreatePet('PORING', 0);
  return { ctx, p, logs, fakeDate };
}
const S = { hit: 60, flee: 30, carriedWeight: 100, maxWeight: 2000 };   // 오크 전사: 내 명중 20%, 피격 95%

// stage_info_level: 같은 위험 지역 진입, 친밀도 단계에 따라 정보량이 다름
{
  const lines = {};
  for (const [stage, intim] of [[0, 50], [2, 300], [4, 950]]) {
    const { ctx, p, logs } = env();
    p.companions.pet.intimacy = intim;
    ctx.companionPetAdvice(p, S, 'enter', { map: '오크 마을', now: 10 * MIN });
    assert.strictEqual(logs.length, 1, `stage ${stage}`);
    lines[stage] = logs[0];
  }
  assert(!/[0-9]/.test(lines[0].replace(/<[^>]*>/g, '')) && !lines[0].includes('오크 전사'), lines[0]);
  assert(lines[2].includes('오크 전사') && !/[0-9]/.test(lines[2].replace(/<[^>]*>/g, '')), lines[2]);
  assert(lines[4].includes('오크 전사') && /[0-9]/.test(lines[4]), lines[4]);
}

// safe_map_silent: 안전한 곳·쉬운 곳에선 조언하지 않음
{
  const { ctx, p, logs } = env();
  p.companions.pet.intimacy = 950;
  ctx.companionPetAdvice(p, S, 'enter', { map: '마을', now: MIN });
  ctx.companionPetAdvice(p, S, 'enter', { map: '초원', now: 20 * MIN });
  assert.strictEqual(logs.length, 0, logs.join('\n'));
}

// no_spam: 같은 지역 1분 간격 3번 -> 1번, 급하지 않은 말은 공용 쉼 동안 하나만
{
  const { ctx, p, logs } = env();
  for (let i = 0; i < 3; i++) ctx.companionPetAdvice(p, S, 'enter', { map: '오크 마을', now: (10 + i) * MIN });
  assert.strictEqual(logs.length, 1);
  p.inventory['빨간포션'] = 2; p.inventory['사과 주스'] = 1;
  ctx.companionPetAdvice(p, S, 'tick', { now: 20 * MIN });
  ctx.companionPetAdvice(p, S, 'tick', { now: 21 * MIN });
  assert.strictEqual(logs.length, 2, logs.join('\n'));             // 물약 또는 먹이 중 하나만
  ctx.companionPetAdvice(p, S, 'tick', { now: 30 * MIN });
  assert.strictEqual(logs.length, 3, '쉼이 끝나면 다음 말');
}

// off_switch
{
  const { ctx, p, logs } = env();
  p.companions.advice.on = false;
  ctx.companionPetAdvice(p, S, 'enter', { map: '오크 마을', now: MIN });
  assert.strictEqual(ctx.companionPetTalk(p, 'idle', 2 * MIN), false);
  assert.strictEqual(logs.length, 0);
}

// weight_thresholds: 50% 자연 회복 정지, 90% 공격 불가 (원작)
{
  const { ctx, p, logs } = env();
  p.companions.pet.intimacy = 950;
  ctx.companionPetAdvice(p, Object.assign({}, S, { carriedWeight: 1850 }), 'tick', { now: MIN });
  assert(logs[0].includes('90'), logs[0]);
}

// ask_recommends_reachable: 부족 없이 잡을 수 있는 가장 높은 레벨 사냥터 + 다음 목표
{
  const { ctx, p, logs } = env();
  p.companions.pet.intimacy = 950;
  ctx.companionPetAdvice(p, S, 'ask', { now: MIN });
  assert(logs[0].includes('언덕') && logs[0].includes('오크 전사'), logs[0]);
  const low = env(); low.p.companions.pet.intimacy = 300;
  low.ctx.companionPetAdvice(low.p, S, 'ask', { now: MIN });
  assert(low.logs[0].includes('언덕') && !/[0-9]/.test(low.logs[0].replace(/<[^>]*>/g, '')), low.logs[0]);
}

// weak_hits_ignored: 자주 맞아도 한 대가 아프지 않으면 회피 부족으로 치지 않음 (브라우저 실측: Lv1이 포링까지 "버겁다")
{
  const { ctx, p, logs } = env();
  p.companions.pet.intimacy = 950;
  ctx.DB.monsters[1] = { name: '포링', lv: 1, hit: 7, flee: 1, atk: 8 };
  ctx.DB.monsters[3].atk = 400;
  const novice = { hit: 9, flee: 3, maxHp: 40, carriedWeight: 0, maxWeight: 2000 };
  ctx.companionPetAdvice(p, novice, 'ask', { now: MIN });
  assert(logs[0].includes('초원') && !logs[0].includes('버거워'), logs[0]);
}

// talk_band_by_hunger: 일상 대사는 배고픔 구간에서 뽑힘
{
  for (const [hunger, band] of [[10, 'hungry'], [50, 'normal'], [90, 'full']]) {
    const { ctx, p, logs } = env();
    p.companions.pet.hunger = hunger;
    assert.strictEqual(ctx.companionPetTalk(p, 'idle', 5 * MIN), true);
    assert(TALK.pets.PORING.lines.idle[band].some((l) => logs[0].includes(l)), `${band}: ${logs[0]}`);
  }
}

// advice_wins_talk: 같은 순간 조언을 했으면 대사는 하지 않음
{
  const { ctx, p, logs } = env();
  ctx.companionPetAdvice(p, S, 'enter', { map: '오크 마을', now: 10 * MIN });
  assert.strictEqual(ctx.companionPetTalk(p, 'connect', 10 * MIN), false);
  assert.strictEqual(logs.length, 1);
}

// replay_silent: 방치 정산 헤드리스(Date.now를 바꿔 끼움) 중에는 말하지 않음
{
  const { ctx, p, logs, fakeDate } = env({ window: true });
  fakeDate.now = () => 123;                                          // 헤드리스가 Date.now를 교체
  assert.strictEqual(ctx.companionPetTalk(p, 'hunt', 5 * MIN), false);
  ctx.companionPetAdvice(p, S, 'enter', { map: '오크 마을', now: 10 * MIN });
  assert.strictEqual(logs.length, 0);
}

console.log('companion-advice-smoke: OK');
