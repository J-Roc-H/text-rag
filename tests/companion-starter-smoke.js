'use strict';
// 「첫 동료」 — 첫 알 3개 굴림·고르기·노인의 맡아 두기와 24시간 바꾸기 (P3-10 펫 1단계 Task 5).
// 실제 db-pets.json(사용자 확정 레벨대 명단)과 template.html의 TUTORIAL_QUESTS를 그대로 쓴다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction, html } = require('./_item-effect-harness');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'source', 'companion.js'), 'utf8');
const PETS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'source', 'data', 'db-pets.json'), 'utf8'));
const DAY = 24 * 3600 * 1000;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function env() {
  const logs = [];
  const ctx = { DB: { pets: PETS }, log: (m) => logs.push(String(m)), notify: () => {}, updateUI: () => {},
    Math: Object.create(Math) };
  vm.createContext(ctx);
  vm.runInContext(extractFunction(html, 'const TUTORIAL_QUESTS = {') + ';\nthis.TUTORIAL_QUESTS = TUTORIAL_QUESTS;', ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, logs };
}
function player(ctx) { const p = { inventory: {}, quests: {} }; ctx.companionNormalize(p); return p; }
const tierOf = (k) => PETS.pets[k].tier;

// tutorial_quest_defined: tut_05 다음이 「첫 동료」
{
  const { ctx } = env();
  const Q = ctx.TUTORIAL_QUESTS;
  assert.strictEqual(Q.tut_05.next, 'tut_06');
  assert.strictEqual(Q.tut_06.title, '첫 동료');
  assert.strictEqual(Q.tut_06.type, 'pet_choice');
  assert.strictEqual(Q.tut_06.npc, '친절한 노인');
}

// roll_no_dup_and_odds: 알 3개 중복 없음, 알마다 레벨대 40/30/20/10 (±1%p)
{
  const { ctx } = env();
  const rng = mulberry32(20261121);
  const n = 100000, cnt = { low: 0, mid: 0, high: 0, rare: 0 };
  for (let i = 0; i < n; i++) {
    const eggs = ctx.companionRollStarter(rng);
    assert.strictEqual(eggs.length, 3);
    assert.strictEqual(new Set(eggs).size, 3);
    eggs.forEach((k) => { cnt[tierOf(k)]++; });
  }
  const want = { low: 0.40, mid: 0.30, high: 0.20, rare: 0.10 };
  for (const t in want) assert(Math.abs(cnt[t] / (3 * n) - want[t]) < 0.01, `${t} ${cnt[t] / (3 * n)}`);
}

// choose_sets_offer
{
  const { ctx } = env();
  const p = player(ctx);
  p.quests.tut_06 = { state: 'active', count: 0 };
  p.companions.starterRoll = ['PORING', 'SPORE', 'ISIS'];
  ctx.companionChooseStarter(p, 'SPORE', 1000);
  assert.strictEqual(p.companions.pet.key, 'SPORE');
  assert.deepStrictEqual(p.companions.starterOffer.eggs.slice().sort(), ['ISIS', 'PORING']);
  assert.strictEqual(p.companions.starterOffer.expiresAt, 1000 + DAY);
  assert.strictEqual(p.companions.starterOffer.swapped, false);
  assert.strictEqual(p.quests.tut_06.state, 'done');
  assert(!('starterRoll' in p.companions) || p.companions.starterRoll == null);
  assert.strictEqual(ctx.companionChooseStarter(p, 'PORING', 2000), false, '이미 펫이 있으면 다시 고르지 못함');
}

// swap_window: 24시간 직전엔 바꾸기 1회, 지나면 사라짐
{
  const { ctx, logs } = env();
  const p = player(ctx);
  p.quests.tut_06 = { state: 'active', count: 0 };
  p.companions.starterRoll = ['PORING', 'SPORE', 'ISIS'];
  ctx.companionChooseStarter(p, 'PORING', 0);
  assert(logs.some((m) => m.includes('언제 누가 가져갈지')), '맡아 두며 하는 말');
  assert.strictEqual(ctx.companionVisitElder(p, DAY - 1000), 'offer');
  assert.strictEqual(ctx.companionSwapStarter(p, 'ISIS', DAY - 1000), true);
  assert.strictEqual(p.companions.pet.key, 'ISIS');
  assert.strictEqual(p.companions.pet.intimacy, PETS.pets.ISIS.intimacy.start);
  assert(p.companions.starterOffer.eggs.includes('PORING'), '원래 펫은 남은 알 자리로');
  assert.strictEqual(ctx.companionSwapStarter(p, 'PORING', DAY - 500), false, '두 번째 바꾸기는 안 됨');
  assert.strictEqual(ctx.companionVisitElder(p, DAY - 400), 'none', '바꾼 뒤엔 바꾸기 제안 없음');

  const b = env(), q = player(b.ctx);
  q.quests.tut_06 = { state: 'active', count: 0 };
  q.companions.starterRoll = ['PORING', 'SPORE', 'ISIS'];
  b.ctx.companionChooseStarter(q, 'PORING', 0);
  assert.strictEqual(b.ctx.companionSwapStarter(q, 'ISIS', DAY + 1), false, '기한 지나면 바꾸기 불가');
  assert.strictEqual(b.ctx.companionVisitElder(q, DAY + 1), 'expired');
  assert.strictEqual(q.companions.starterOffer, null);
  assert(b.logs.some((m) => m.includes('다른 모험가가 골라 갔')), '사라짐 대사');
  assert.strictEqual(b.ctx.companionVisitElder(q, DAY + 2), 'none');
}

// legacy_save_once: 튜토리얼을 마친 기존 세이브에 「첫 동료」가 한 번만 생김, 난수 호출 없음
{
  const { ctx } = env();
  let calls = 0; ctx.Math.random = () => { calls++; return 0.5; };
  const p = { inventory: {}, quests: { tut_05: { state: 'done', count: 0 } } };
  ctx.companionNormalize(p); ctx.companionNormalize(p);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.quests.tut_06)), { state: 'available', count: 0 });
  assert.strictEqual(calls, 0);
  const fresh = { inventory: {}, quests: { tut_01: { state: 'available', count: 0 } } };
  ctx.companionNormalize(fresh);
  assert(!fresh.quests.tut_06, '튜토리얼 중인 캐릭터에는 미리 생기지 않음');
}

// begin_rolls_once: 시작하면 굴림을 저장하고, 다시 열어도 같은 알 셋
{
  const { ctx } = env();
  const p = player(ctx);
  ctx.companionBeginStarter(p, mulberry32(1));
  const first = p.companions.starterRoll.slice();
  assert.strictEqual(p.quests.tut_06.state, 'active');
  ctx.companionBeginStarter(p, mulberry32(999));
  assert.deepStrictEqual(p.companions.starterRoll, first);
}

// 배선: 수락 경로와 직업 이동 직후, 노인 행동
{
  const accept = extractFunction(html, 'function acceptQuest(questId) {');
  assert(accept.includes('companionBeginStarter('), '「첫 동료」 수락 시 알 고르기 시작');
  const job = extractFunction(html, 'function completeJobChoiceQuest(job, dest) {');
  assert(job.includes('companionBeginStarter('), '직업 마을 이동 직후 바로 고르기');
  const actor = fs.readFileSync(path.join(__dirname, '..', 'source', 'actor-interaction.js'), 'utf8');
  assert(actor.includes('companionElderActions('), '노인 대화에 알 고르기·바꾸기 행동');
}

console.log('companion-starter-smoke: OK');
