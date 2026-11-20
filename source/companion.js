// TextRAG companion v1 — 펫(1단계)·호문쿨루스(4단계)가 함께 쓰는 동반자 틀.
// 설계: 볼트 02_Dev/App/Text_Rag/데이터베이스/설계_펫·호문쿨루스_v0.1 · 계획_펫1단계_v0.1 (DEVREF-E P3-10).
// 데이터: DB.pets(source/data/db-pets.json, rAthena pre-re pet_db) · DB.petTalk(db-pet-talk.json).
// 원칙: 자동사냥을 멈추거나 귀환시키지 않는다 · 먹이가 없으면 친밀도는 멈출 뿐 떨어지지 않는다.
// 전역 함수 선언으로 둔다(var 포함) — template.html 본문과 Node vm 테스트가 같은 이름으로 부른다.

var COMPANION_STAGE_NAMES = ['어색함', '서먹함', '보통', '친함', '절친'];

function companionConstants() {
  return (typeof DB !== 'undefined' && DB.pets && DB.pets.constants) || {};
}
function companionPetData(key) {
  return (typeof DB !== 'undefined' && DB.pets && DB.pets.pets && DB.pets.pets[key]) || null;
}

// 세이브 보강 — 난수·시각 호출 금지 (normalizeSave 규칙)
function companionNormalize(p) {
  if (!p) return;
  let c = p.companions;
  if (!c || typeof c !== 'object' || Array.isArray(c)) c = p.companions = {};
  if (!('pet' in c)) c.pet = null;
  if (!('starterOffer' in c)) c.starterOffer = null;
  if (!c.advice || typeof c.advice !== 'object') c.advice = { on: true, quietUntil: 0, lastSaid: {} };
  if (!c.advice.lastSaid || typeof c.advice.lastSaid !== 'object') c.advice.lastSaid = {};
}

function companionCreatePet(key, nowMs) {
  const d = companionPetData(key) || {};
  const k = companionConstants();
  const start = d.intimacy && d.intimacy.start != null ? d.intimacy.start : 250;
  return { key, intimacy: start, hunger: k.hungerStart != null ? k.hungerStart : 100, lastAt: nowMs };
}

// 친밀도 -> 0(어색함)~4(절친). rAthena pet.hpp e_pet_intimate_level 경계.
function companionStage(intimacy) {
  const s = companionConstants().stages || [1, 100, 250, 750, 910, 1000];
  if (intimacy >= s[4]) return 4;
  if (intimacy >= s[3]) return 3;
  if (intimacy >= s[2]) return 2;
  if (intimacy >= s[1]) return 1;
  return 0;
}

// lastAt부터 nowMs까지 펫 시간을 진행한다. 지난 시각(nowMs <= lastAt)이면 아무것도 하지 않는다 —
// 방치 정산의 헤드리스 표본은 시계를 과거로 돌리므로, 정산 전에 실제 시각으로 한 번만 진행한다.
// 남은 자투리 시간은 lastAt에 남겨 다음 호출로 넘긴다(쪼개 불러도 한 번에 부른 것과 같다).
function companionAdvance(p, nowMs) {
  const out = { fed: 0, stageFrom: 0, stageTo: 0 };
  const pet = p && p.companions && p.companions.pet;
  if (!pet) return out;
  out.stageFrom = out.stageTo = companionStage(pet.intimacy);
  const d = companionPetData(pet.key);
  if (!d || !(d.fullness > 0) || !(d.hungryDelaySec > 0) || !(nowMs > pet.lastAt)) return out;
  const k = companionConstants();
  const tickMs = d.hungryDelaySec * 1000;
  const ticks = Math.floor((nowMs - pet.lastAt) / tickMs);
  if (ticks <= 0) return out;
  const feedAt = k.feedAt != null ? k.feedAt : 25;
  const fullGainMax = k.fullGainMaxHunger != null ? k.fullGainMaxHunger : 75;
  const inc = d.hungerIncrease || 20;
  const fed = (d.intimacy && d.intimacy.fed) || 0;
  const inv = p.inventory || (p.inventory = {});
  for (let i = 0; i < ticks; i++) {
    pet.hunger = Math.max(0, pet.hunger - d.fullness);
    if (pet.hunger <= feedAt && d.food && (inv[d.food] || 0) > 0) {
      inv[d.food] -= 1;
      if (inv[d.food] <= 0) delete inv[d.food];
      // 자동 급식은 늘 75 이하(알맞을 때)에만 먹이므로 원작 전량 상승만 일어난다
      const gain = pet.hunger <= fullGainMax ? fed : Math.max(1, Math.floor(fed / 2));
      pet.intimacy = Math.min(1000, pet.intimacy + gain);
      pet.hunger = Math.min(100, pet.hunger + inc);
      out.fed++;
    }
  }
  pet.lastAt += ticks * tickMs;
  out.stageTo = companionStage(pet.intimacy);
  return out;
}

// 방치 요약 한 줄 (awaySummaryLines가 summary.companion으로 받는다). 펫이 없으면 ''.
function companionAwaySummaryLine(p, res) {
  const pet = p && p.companions && p.companions.pet;
  if (!pet || !res) return '';
  const d = companionPetData(pet.key) || {};
  const food = d.food || '먹이';
  const left = ((p.inventory || {})[food]) || 0;
  let line = `🐾 <b>${d.name || pet.key}</b>: ${food} ${res.fed || 0}개 먹음`;
  if (res.stageTo != null && res.stageFrom != null && res.stageTo !== res.stageFrom) {
    line += ` · ${COMPANION_STAGE_NAMES[res.stageFrom]} → ${COMPANION_STAGE_NAMES[res.stageTo]}`;
  }
  line += ` (${food} ${left}개 남음)`;
  if (!left && pet.hunger <= 0) line += ' · 먹이가 떨어져 친밀도가 멈춰 있음';
  return line;
}

// 사냥 밖(마을 등)에서도 펫 시간이 흐르도록 60초마다 진행. 헤드리스·테스트(vm)에는 타이머가 없다.
if (typeof setInterval === 'function' && typeof window !== 'undefined') {
  setInterval(function () {
    if (typeof G !== 'undefined' && G.player) companionAdvance(G.player, Date.now());
  }, 60000);
}
