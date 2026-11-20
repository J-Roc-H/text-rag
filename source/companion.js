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
  // 튜토리얼을 이미 마친 세이브: 「첫 동료」를 받을 수 있게 연다 (알 굴림은 수락할 때)
  if (p.quests && p.quests.tut_05 && p.quests.tut_05.state === 'done' && !p.quests.tut_06 && !c.pet
      && typeof TUTORIAL_QUESTS !== 'undefined' && TUTORIAL_QUESTS.tut_06) {
    p.quests.tut_06 = { state: 'available', count: 0 };
  }
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

// ── 「첫 동료」: 첫 알 3개 (설계 §6-1, 사용자 확정 2026-11-20) ─────────────────────────────
var COMPANION_TIER_WEIGHTS = [['low', 0.40], ['mid', 0.30], ['high', 0.20], ['rare', 0.10]];
var COMPANION_TIER_LABELS = { low: '저레벨', mid: '중레벨', high: '고레벨', rare: '초희귀 ✨' };
var COMPANION_SWAP_MS = 24 * 3600 * 1000;   // 고르지 않은 알을 노인이 맡아 두는 기간 (실제 시간, 방치 포함)
var COMPANION_ELDER = '친절한 노인';

function companionElderSay(text) { if (typeof log === 'function') log(`🧓 ${COMPANION_ELDER}: "${text}"`, 'npc'); }

// 알마다 레벨대를 독립으로 굴리고, 그 레벨대에서 아직 안 뽑힌 펫 중 하나 (3개 사이 중복 없음)
function companionRollStarter(rng) {
  rng = rng || Math.random;
  const pool = {};
  Object.keys((DB.pets && DB.pets.pets) || {}).forEach((k) => {
    const t = DB.pets.pets[k].tier;
    if (t) (pool[t] = pool[t] || []).push(k);
  });
  const picked = [];
  for (let i = 0; i < 3; i++) {
    let r = rng(), tier = COMPANION_TIER_WEIGHTS[COMPANION_TIER_WEIGHTS.length - 1][0];
    for (const [t, w] of COMPANION_TIER_WEIGHTS) { if (r < w) { tier = t; break; } r -= w; }
    let cand = (pool[tier] || []).filter((k) => !picked.includes(k));
    if (!cand.length) cand = Object.values(pool).flat().filter((k) => !picked.includes(k));
    picked.push(cand[Math.floor(rng() * cand.length)]);
  }
  return picked;
}

// 「첫 동료」 시작: 퀘스트를 진행 중으로 두고 굴림을 저장(다시 열어도 같은 알 셋), 화면이 있으면 고르기 창
function companionBeginStarter(p, rng) {
  if (!p) return;
  companionNormalize(p);
  if (p.companions.pet) return;
  if (!p.quests) p.quests = {};
  if (!p.quests.tut_06 || p.quests.tut_06.state !== 'done') p.quests.tut_06 = { state: 'active', count: 0 };
  if (!Array.isArray(p.companions.starterRoll) || p.companions.starterRoll.length !== 3) {
    p.companions.starterRoll = companionRollStarter(rng);
  }
  if (typeof window !== 'undefined') companionWhenModalFree(() => companionOpenStarterModal(p));
}

function companionChooseStarter(p, key, nowMs) {
  const c = p && p.companions;
  if (!c || c.pet || !Array.isArray(c.starterRoll) || !c.starterRoll.includes(key)) return false;
  c.pet = companionCreatePet(key, nowMs);
  c.starterOffer = { eggs: c.starterRoll.filter((k) => k !== key), expiresAt: nowMs + COMPANION_SWAP_MS, swapped: false };
  delete c.starterRoll;
  if (p.quests && p.quests.tut_06) p.quests.tut_06.state = 'done';
  const d = companionPetData(key) || {};
  if (typeof log === 'function') log(`🥚 알이 흔들리더니… <b>${d.name || key}</b>이(가) 껍데기를 깨고 나왔다!`, 'level-up');
  companionElderSay('고르지 않은 알 둘은 내가 맡아 두지. 다음에 빨리 다시 오면 바꿔 주겠네. 다만 언제 누가 가져갈지는 모르겠군.');
  if (typeof notify === 'function') notify(`첫 동료: ${d.name || key}`, 'gold');
  return true;
}

// 노인을 찾아갔을 때: 'offer'(바꿀 수 있음) · 'expired'(다른 모험가가 골라 감, 맡긴 알 지움) · 'none'
function companionVisitElder(p, nowMs) {
  const c = p && p.companions, o = c && c.starterOffer;
  if (!o) return 'none';
  if (nowMs > o.expiresAt) {
    c.starterOffer = null;
    if (o.swapped) return 'none';
    companionElderSay('미안하네. 맡아 둔 알은 다른 모험가가 골라 갔다네. 지금 그 녀석과 잘 지내 보게.');
    return 'expired';
  }
  return o.swapped ? 'none' : 'offer';
}

function companionSwapStarter(p, key, nowMs) {
  const c = p && p.companions, o = c && c.starterOffer;
  if (!o || o.swapped || nowMs > o.expiresAt || !o.eggs.includes(key) || !c.pet) return false;
  o.eggs = o.eggs.filter((k) => k !== key).concat(c.pet.key);
  c.pet = companionCreatePet(key, nowMs);
  o.swapped = true;
  const d = companionPetData(key) || {};
  companionElderSay(`그래, ${d.name || key} 쪽이 마음에 들었나 보군. 바꿔 주겠네. 이번이 마지막일세.`);
  if (typeof log === 'function') log(`🥚 <b>${d.name || key}</b>이(가) 새 동료가 되었다!`, 'level-up');
  return true;
}

// ── 화면 (브라우저 전용) ────────────────────────────────────────────────────────────────
function companionWhenModalFree(fn) {
  let tries = 0;
  const go = () => {
    const ov = document.getElementById('modal-overlay');
    if (ov && ov.classList.contains('open') && tries++ < 240) { setTimeout(go, 500); return; }
    fn();
  };
  setTimeout(go, 300);
}
function companionEggCard(key) {
  const d = companionPetData(key) || {};
  const talk = (typeof DB !== 'undefined' && DB.petTalk && DB.petTalk.pets && DB.petTalk.pets[key]) || {};
  return `<div style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin:6px 0">
    <b>🥚 ${d.name || key}</b> <span style="font-size:10px;color:var(--text-dim)">${COMPANION_TIER_LABELS[d.tier] || ''} · Lv ${d.lv || '?'}</span>
    <div style="font-size:11px;margin-top:3px">${talk.persona || ''}</div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:2px">먹이: ${d.food || '—'}</div></div>`;
}
function companionOpenStarterModal(p) {
  const roll = p && p.companions && p.companions.starterRoll;
  if (!roll || p.companions.pet || typeof openModal !== 'function') return;
  const body = `<div style="font-size:12px;line-height:1.6">「혼자 다니는 모험은 쓸쓸한 법이지. 알 셋 중 하나를 데려가게.」<br>
    <span style="font-size:10px;color:var(--text-dim)">고르지 않은 알은 ${COMPANION_ELDER}이 맡아 둡니다. 24시간 안에 노인을 찾아가면 한 번 바꿀 수 있습니다.</span></div>`
    + roll.map(companionEggCard).join('');
  openModal('🥚 첫 동료', body, roll.map((k) => ({
    label: `🥚 ${(companionPetData(k) || {}).name || k}`,
    action: () => { companionChooseStarter(p, k, Date.now()); if (typeof saveLocal === 'function') saveLocal(); if (typeof updateUI === 'function') updateUI(); },
  })));
}
function companionOpenSwapModal(p) {
  const o = p && p.companions && p.companions.starterOffer;
  if (!o || typeof openModal !== 'function') return;
  const left = Math.max(0, Math.ceil((o.expiresAt - Date.now()) / 3600000));
  openModal('🥚 맡겨 둔 알', `<div style="font-size:12px">「어느 쪽으로 바꾸겠나? 한 번뿐일세.」 <span style="font-size:10px;color:var(--text-dim)">(남은 시간 약 ${left}시간)</span></div>`
    + o.eggs.map(companionEggCard).join(''),
    o.eggs.map((k) => ({ label: `🥚 ${(companionPetData(k) || {}).name || k}`, action: () => {
      companionSwapStarter(p, k, Date.now()); if (typeof saveLocal === 'function') saveLocal(); if (typeof updateUI === 'function') updateUI();
    } })).concat([{ label: '지금 펫과 지낼게요', action: () => {} }]));
}
// 노인 대화(actor-interaction.js aiRenderActor)에 붙는 행동
function companionElderActions(name, p, addAction) {
  if (!p || !name || name.indexOf(COMPANION_ELDER) !== 0) return;
  companionNormalize(p);
  const c = p.companions;
  if (!c.pet && Array.isArray(c.starterRoll) && p.quests && p.quests.tut_06 && p.quests.tut_06.state === 'active') {
    addAction('🥚 데워 둔 알 셋 중 하나를 고른다', 'primary', () => companionOpenStarterModal(p));
  }
  if (companionVisitElder(p, Date.now()) === 'offer') {
    const left = Math.max(0, Math.ceil((c.starterOffer.expiresAt - Date.now()) / 3600000));
    addAction(`🥚 맡겨 둔 알로 바꾼다 (약 ${left}시간 남음)`, 'service', () => companionOpenSwapModal(p));
  }
}

// 사냥 밖(마을 등)에서도 펫 시간이 흐르도록 60초마다 진행. 헤드리스·테스트(vm)에는 타이머가 없다.
if (typeof setInterval === 'function' && typeof window !== 'undefined') {
  setInterval(function () {
    if (typeof G !== 'undefined' && G.player) companionAdvance(G.player, Date.now());
  }, 60000);
}
