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

// ── 말하기 통로 (조언·일상 대사 공용, 호문쿨루스도 이 통로를 쓴다) ─────────────────────────────
var COMPANION_REAL_NOW = Date.now;          // 방치 정산 헤드리스는 Date.now를 바꿔 끼운다 -> 그동안 침묵
var COMPANION_QUIET_MS = 4 * 60 * 1000;     // 급하지 않은 조언 뒤 공용 쉼 (설계자 판단, 파이 수호령 3~5분의 가운데)
var COMPANION_SAME_KEY_MS = 5 * 60 * 1000;  // 같은 조언 최소 간격
var COMPANION_TALK_MS = 10 * 60 * 1000;     // 같은 일상 대사 사건 최소 간격
var COMPANION_HIT_MIN = 80;                 // 내 명중률이 이보다 낮으면 "부족" (설계자 판단)
var COMPANION_MOB_HIT_MAX = 60;             // 몬스터가 나를 맞히는 확률이 이보다 높으면 "부족" (설계자 판단)
var COMPANION_HEAVY_HIT = 0.08;             // …단, 한 대가 최대 체력의 8% 이상일 때만 (포링에게 자주 맞는 건 문제가 아니다)

function companionIsReplay() { return typeof window !== 'undefined' && Date.now !== COMPANION_REAL_NOW; }
function companionPetName(p) {
  const pet = p && p.companions && p.companions.pet;
  return pet ? ((companionPetData(pet.key) || {}).name || pet.key) : '';
}
// 친밀도 단계 -> 조언 정보량: hint(어색함·서먹함) · kind(보통) · direct(친함·절친)
function companionAdviceLevel(p) {
  const st = companionStage(p.companions.pet.intimacy);
  return st >= 3 ? 'direct' : st === 2 ? 'kind' : 'hint';
}

function companionSay(p, key, text, opt) {
  opt = opt || {};
  const c = p && p.companions;
  if (!c || !c.advice || !c.advice.on || companionIsReplay()) return false;
  const now = opt.now != null ? opt.now : Date.now();
  const last = c.advice.lastSaid[key];
  if (last != null && now - last < (opt.everyMs != null ? opt.everyMs : COMPANION_SAME_KEY_MS)) return false;
  if (!opt.urgent && now < (c.advice.quietUntil || 0)) return false;
  c.advice.lastSaid[key] = now;
  if (!opt.urgent) c.advice.quietUntil = now + COMPANION_QUIET_MS;
  c.advice.lastAdviceAt = now;
  if (typeof log === 'function') log(text, 'npc');
  return true;
}

// 일상 대사: 원작 pettalktable처럼 배고픔 구간 × 사건. 조언과 같은 순간이면 조언이 먼저(대사 생략).
function companionHungerBand(h) { return h <= 25 ? 'hungry' : h > 75 ? 'full' : 'normal'; }
function companionPetTalk(p, event, nowMs, opt) {
  opt = opt || {};
  const c = p && p.companions, pet = c && c.pet;
  if (!pet || !c.advice || !c.advice.on || companionIsReplay()) return false;
  const now = nowMs != null ? nowMs : Date.now();
  if (c.advice.lastAdviceAt === now) return false;
  if (!opt.urgent && now < (c.advice.talkQuietUntil || 0)) return false;
  const set = (typeof DB !== 'undefined' && DB.petTalk && DB.petTalk.pets && DB.petTalk.pets[pet.key]) || null;
  const lines = set && set.lines && set.lines[event] && set.lines[event][companionHungerBand(pet.hunger)];
  if (!lines || !lines.length) return false;
  const key = 'talk:' + event, last = c.advice.lastSaid[key];
  if (last != null && now - last < COMPANION_TALK_MS) return false;
  c.advice.lastSaid[key] = now;
  c.advice.talkQuietUntil = now + COMPANION_QUIET_MS;
  if (typeof log === 'function') log(`🐾 ${companionPetName(p)}: "${lines[Math.floor(Math.random() * lines.length)]}"`, 'npc');
  return true;
}

// ── 펫의 조언 (싸우기 전: 장소·위험·준비물). 판정은 원작 명중 공식 그대로 ─────────────────
function companionClampRate(v) { return Math.max(5, Math.min(95, v)); }
function companionJudge(s, m) {
  const hr = companionClampRate(80 + (s.hit || 0) - (m.flee || 0));
  const mhr = companionClampRate(80 + (m.hit || 0) - (s.flee || 0));
  const heavy = (m.atk || 0) >= (s.maxHp || Infinity) * COMPANION_HEAVY_HIT;
  return { m, hr, mhr, hitShort: hr < COMPANION_HIT_MIN, fleeShort: mhr > COMPANION_MOB_HIT_MAX && heavy,
    needHit: Math.max(0, (m.flee || 0) + 15 - (s.hit || 0)), needFlee: Math.max(0, (m.hit || 0) + 20 - (s.flee || 0)) };
}
function companionMapMonsters(name) {
  const md = (typeof DB !== 'undefined' && DB.maps && DB.maps[name]) || null;
  if (!md || md.safe) return [];
  return (md.monsters || []).map((id) => DB.monsters && DB.monsters[id]).filter(Boolean);
}
function companionBestHunt(s) {
  let best = null, next = null;
  Object.keys((typeof DB !== 'undefined' && DB.maps) || {}).forEach((map) => {
    companionMapMonsters(map).forEach((m) => {
      const j = companionJudge(s, m);
      if (!j.hitShort && !j.fleeShort) { if (!best || (m.lv || 0) > (best.m.lv || 0)) best = Object.assign({ map }, j); }
    });
  });
  Object.keys((typeof DB !== 'undefined' && DB.maps) || {}).forEach((map) => {
    companionMapMonsters(map).forEach((m) => {
      const j = companionJudge(s, m);
      if ((j.hitShort || j.fleeShort) && (!best || (m.lv || 0) > (best.m.lv || 0)) && (!next || (m.lv || 0) < (next.m.lv || 0))) next = Object.assign({ map }, j);
    });
  });
  return { best, next };
}
function companionPotionCount(p) {
  const list = (typeof AUTO_HP_POTS !== 'undefined' && AUTO_HP_POTS) || ['이그드라실의 열매', '하얀포션', '주홍포션', '노란포션', '빨간포션'];
  return list.reduce((a, n) => a + ((p.inventory || {})[n] || 0), 0);
}

function companionPetAdvice(p, s, event, opt) {
  opt = opt || {};
  if (!p || !p.companions || !p.companions.pet || !s) return;
  const now = opt.now != null ? opt.now : Date.now();
  const lv = companionAdviceLevel(p), pn = `🐾 ${companionPetName(p)}`;
  const say = (key, text, o) => companionSay(p, key, `${pn}: ${text}`, Object.assign({ now }, o || {}));
  const shortText = (j) => j.hitShort ? `명중이 ${j.needHit} 모자라(지금 ${j.hr}%)` : `회피가 ${j.needFlee} 모자라(맞을 확률 ${j.mhr}%)`;

  if (event === 'enter') {
    const worst = companionMapMonsters(opt.map).map((m) => companionJudge(s, m)).filter((j) => j.hitShort || j.fleeShort)
      .sort((a, b) => (a.hr - a.mhr) - (b.hr - b.mhr))[0];
    if (!worst) return;
    let text;
    if (lv === 'hint') text = '저기… 왠지 싫어.';
    else if (lv === 'kind') text = worst.hitShort ? `저 ${worst.m.name}, 잘 안 맞을 것 같아.` : `저 ${worst.m.name}한테 많이 맞을 것 같아.`;
    else {
      const b = companionBestHunt(s).best;
      text = `${worst.m.name}한테 ${shortText(worst)}.${b ? ` 지금은 ${b.map}(으)로 가.` : ''}`;
    }
    say('enter:' + opt.map, text, { urgent: true });
    return;
  }
  if (event === 'tick') {
    const pct = s.maxWeight ? Math.floor((s.carriedWeight || 0) * 100 / s.maxWeight) : 0;
    if (pct >= 90) {
      say('w90', lv === 'hint' ? '가방이 너무 무거워 보여…' : lv === 'kind' ? '짐 때문에 싸울 수가 없어!' : `무게 ${pct}% — 90%를 넘어서 공격을 못 해. 좀 팔자.`);
      return;
    }
    if (pct >= 50 && say('w50', lv === 'hint' ? '가방이… 묵직해.' : lv === 'kind' ? '짐이 많아서 몸이 안 낫는 것 같아.' : `무게 ${pct}% — 50%를 넘어서 자연 회복이 멈췄어.`)) return;
    const pots = companionPotionCount(p);
    if (pots <= 3 && say('pot', lv === 'hint' ? '주머니가 가벼운 것 같아…' : lv === 'kind' ? '물약이 얼마 없어.' : `물약 ${pots}개 남았어. 보충하자.`)) return;
    const food = (companionPetData(p.companions.pet.key) || {}).food;
    const fl = food ? ((p.inventory || {})[food] || 0) : null;
    if (food && fl <= 3) say('food', lv === 'hint' ? '배고파질 것 같아…' : lv === 'kind' ? `${food}이(가) 얼마 없어.` : `${food} ${fl}개 남았어. 떨어지면 나랑 더 못 친해져.`);
    return;
  }
  if (event === 'ask') {
    const { best, next } = companionBestHunt(s);
    let text;
    // 부족 없는 곳이 없으면(막 시작한 캐릭터 등) 가장 만만한 곳을 권한다 — "어디든 버겁다"는 쓸모없는 말이다
    if (!best && next) text = lv === 'hint' ? '음… 저쪽이 그나마 나을 것 같은데…'
      : lv === 'kind' ? `${next.map} 쪽이 그나마 만만할 것 같아.`
      : `지금은 ${next.map}의 ${next.m.name}(Lv ${next.m.lv})가 제일 만만해. 그래도 ${shortText(next)}.`;
    else if (!best) text = '음… 아직은 마을 근처가 좋겠어.';
    else if (lv === 'hint') text = '음… 저쪽이 좋을 것 같은데…';
    else if (lv === 'kind') text = `${best.map} 쪽이 괜찮을 것 같아.`;
    else text = `${best.map}의 ${best.m.name}(Lv ${best.m.lv})까진 문제없어.${next ? ` 다음은 ${next.map}의 ${next.m.name} — ${shortText(next)}.` : ''}`;
    say('ask', text, { urgent: true, everyMs: 0 });
  }
}

// ── 접속 중 진행 (processTurn·타이머). 방치 정산은 companionAdvance만 쓴다(말 없음) ───────────
function companionTickOnline(p, nowMs, inBattle) {
  if (!p || !p.companions || !p.companions.pet || companionIsReplay()) return;
  const r = companionAdvance(p, nowMs);
  if (r.fed > 0) companionPetTalk(p, 'feed', nowMs);
  if (r.stageTo > r.stageFrom) {
    if (typeof log === 'function') log(`💞 ${companionPetName(p)}와(과)의 친밀도: <b>${COMPANION_STAGE_NAMES[r.stageTo]}</b>`, 'level-up');
    if (typeof notify === 'function') notify(`친밀도 ${COMPANION_STAGE_NAMES[r.stageTo]}`, 'gold');
  }
  if (inBattle) {
    if (p.maxHp && p.hp / p.maxHp < 0.3) companionPetTalk(p, 'danger', nowMs, { urgent: true });
    else if (Math.random() < 0.02) companionPetTalk(p, 'hunt', nowMs);
  }
}

function companionSyncButton() {
  if (typeof document === 'undefined') return;
  const b = document.getElementById('ctx-pet');
  const has = typeof G !== 'undefined' && G.player && G.player.companions && G.player.companions.pet;
  if (b) b.style.display = has ? '' : 'none';
}

function showCompanionModal() {
  const p = typeof G !== 'undefined' && G.player;
  if (!p || !p.companions || !p.companions.pet || typeof openModal !== 'function') return;
  companionTickOnline(p, Date.now(), false);
  const pet = p.companions.pet, d = companionPetData(pet.key) || {};
  const talk = (DB.petTalk && DB.petTalk.pets && DB.petTalk.pets[pet.key]) || {};
  const st = companionStage(pet.intimacy), band = companionHungerBand(pet.hunger);
  const bandText = { hungry: '배고픔', normal: '보통', full: '배부름' }[band];
  const food = d.food || '—', fl = d.food ? ((p.inventory || {})[d.food] || 0) : 0;
  const on = p.companions.advice.on;
  const body = `<div style="font-size:12px;line-height:1.7">
    <b style="font-size:14px">🐾 ${d.name || pet.key}</b> <span style="font-size:10px;color:var(--text-dim)">Lv ${d.lv || '?'}</span>
    <div style="font-size:11px;color:var(--text-dim)">${talk.persona || ''}</div>
    <div>친밀도: <b>${COMPANION_STAGE_NAMES[st]}</b> <span style="font-size:10px;color:var(--text-dim)">(${pet.intimacy}/1000)</span></div>
    <div>배: ${bandText} <span style="font-size:10px;color:var(--text-dim)">(${pet.hunger}/100)</span></div>
    <div>먹이: ${food} <b>${fl}</b>개 <span style="font-size:10px;color:var(--text-dim)">— 알맞게 배고플 때 알아서 먹습니다. 떨어지면 친밀도가 멈춥니다.</span></div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:4px">친해질수록 조언이 또렷해집니다 (어색함·서먹함: 암시 · 보통: 이유 · 친함·절친: 수치와 권유).</div></div>`;
  openModal('🐾 펫', body, [
    { label: '🐾 어디서 사냥할까?', action: () => { if (typeof calcStats === 'function') companionPetAdvice(p, calcStats(), 'ask'); } },
    { label: on ? '🔕 조언 끄기' : '🔔 조언 켜기', action: () => { p.companions.advice.on = !on; if (typeof saveLocal === 'function') saveLocal(); } },
    { label: '닫기', action: () => {} },
  ]);
}

// 사냥 밖(마을 등)에서도 펫 시간이 흐르도록 1분마다 진행 + 준비물 조언 + 가끔 혼잣말.
// 접속 인사는 게임 화면에 처음 들어왔을 때 한 번. 헤드리스·테스트(vm)에는 타이머가 없다.
if (typeof setInterval === 'function' && typeof window !== 'undefined') {
  let lastMinute = 0, greetedFor = null;
  setInterval(function () {
    if (typeof G === 'undefined' || !G.player || companionIsReplay()) { companionSyncButton(); return; }
    const p = G.player, now = Date.now();
    companionSyncButton();
    if (!p.companions || !p.companions.pet) return;
    if (greetedFor !== p) { greetedFor = p; companionPetTalk(p, 'connect', now, { urgent: true }); }
    if (now - lastMinute < 60000) return;
    lastMinute = now;
    companionTickOnline(p, now, false);
    if (typeof calcStats === 'function') companionPetAdvice(p, calcStats(), 'tick');
    if (Math.random() < 0.3) companionPetTalk(p, 'idle', now);
  }, 5000);
}
