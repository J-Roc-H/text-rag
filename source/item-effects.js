// ══════════════════════════════════════════════
// P0-B — 아이템/카드 효과 집계 단일화
//
// collectItemEffects(p, DB, parseItem)는 장착 상태를 읽어 "현재 활성 아이템/카드 효과"를
// 한 번 집계하는 정본 진입점이다. calcStats()는 이 결과를 받아 자기 bonus 객체에 합산만
// 한다 — calcStats가 카드 DB 표현 방법(effect.type/effect.effect/최상위 필드 등)을 몰라도
// 되게 만드는 것이 목적이다.
//
// 물리 기본 성능(무기 ATK/방어구 DEF/제련/무기타입·속성/슬롯/화살 ATK·속성/무게/장착 가능
// 여부)은 여기서 다루지 않는다 — calcStats()에 그대로 남아 있다. "장비의 물리적 기본 성능"과
// "아이템 효과"는 다른 개념이다(P0-B 지시 §4).
//
// P0-A 교정(18eeeab)에서 밝혀진 실제 소비 경로:
//   - raceBonus/seProc/lifesteal: processTurn()이 매 히트마다 장착 카드를 직접 재파싱해
//     card.effect.type을 즉시 읽어 적용한다(source/template.html ~6307행). calcStats()
//     자신의 bonus.cardRaceBonus/cardSeProc/cardLifesteal 계산은 반환 객체에 포함된 적이
//     없는 죽은 계산이었다(P0-B에서 제거).
//   - hpDrain/spDrain/inflict/autoSpell: 같은 processTurn()의 더 오래된 직접 경로
//     (~6270행)가 카드 최상위 필드를 직접 읽는다. 현재 DB에 이 필드를 쓰는 아이템은 0건.
// 이번 P0-B는 이 두 경로의 실행을 옮기지 않는다(§6) — collectItemEffects()는 이 이벤트를
// events.onHit에 "정규화된 데이터"로만 모아 둔다. 실제 실행은 여전히 processTurn 이
// DB.items를 직접 재파싱해서 한다. P0-C에서 이 실행을 events 소비로 이관한다.
//
// _pendingVerification:true (P0-A 교정에서 원작 근거를 찾지 못해 되돌린 73건에 표시)는
// 절대 active 취급하지 않는다 — stat/combat/skill/events 어디에도 들어가지 않고 pending[]에만
// 출처만 남는다.
// ══════════════════════════════════════════════

var KNOWN_ITEM_EFFECT_TYPES = ['stat', 'mixed', 'special', 'raceBonus', 'seProc', 'lifesteal'];

function makeEmptyItemEffects() {
  return {
    stat: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 },
    combat: {
      atk: 0, def: 0, mdef: 0, hit: 0, flee: 0, crit: 0, aspd: 0, pd: 0,
      maxHp: 0, maxSp: 0, maxHpPct: 0, maxSpPct: 0, hpRegenPct: 0, spRegenPct: 0, atkPct: 0,
      raceAtk: null, elemAtk: null, sizeAtk: null, magicRaceAtk: null, bossAtk: 0,
      raceDmgReduce: null, elemReduce: null, dmgReduceAll: 0, rangedDmgReduce: 0,
      armorElement: null, immune: null, magicImmune: false,
      spCostMul: 1, healBoost: 0, castReduction: 0, doubleAtkCard: 0,
      defIgnore: false, hpDrainSelf: 0, dropBonus: null,
    },
    status: {},
    skill: { skillDmg: null, grantSkill: null },
    events: { onHit: [], onDamaged: [], onKill: [], onTick: [] },
    ledger: [],
    unsupported: [],
    pending: [],
  };
}

function _itemEffIsPending(it) {
  if (!it) return false;
  if (it._pendingVerification === true) return true;
  if (it.effect && typeof it.effect === 'object' && it.effect._pendingVerification === true) return true;
  return false;
}

// 최상위 "단순 무조건 수치" 필드 -- 정본 그대로 합산한다. atk/def는 카드에서만 받는다
// (장비 자신의 기본 ATK/DEF는 물리 기본 성능이라 calcStats가 이미 처리했다).
var _ITEM_EFF_SIMPLE_STAT_KEYS = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
var _ITEM_EFF_SIMPLE_COMBAT_KEYS = [
  'mdef', 'maxHp', 'maxSp', 'hit', 'flee', 'crit', 'aspd',
  'maxHpPct', 'maxSpPct', 'hpRegenPct', 'spRegenPct', 'atkPct',
  'bossAtk', 'dmgReduceAll', 'rangedDmgReduce', 'healBoost', 'castReduction', 'hpDrainSelf',
];
var _ITEM_EFF_COUNTER_KEYS = ['raceAtk', 'elemAtk', 'sizeAtk', 'magicRaceAtk', 'raceDmgReduce', 'elemReduce'];

function collectItemEffects(p, DB, parseItem) {
  var fx = makeEmptyItemEffects();
  if (!p || !p.equip || typeof parseItem !== 'function' || !DB || !DB.items) return fx;

  function ledger(entry) { fx.ledger.push(entry); }

  function collectSimpleFields(it, source, sourceType) {
    _ITEM_EFF_SIMPLE_STAT_KEYS.forEach(function (key) {
      var v = it[key];
      if (!v) return;
      var n = Number(v);
      fx.stat[key] += n;
      ledger({ source: source, sourceType: sourceType, type: 'stat', key: key, value: n, active: true });
    });
    _ITEM_EFF_SIMPLE_COMBAT_KEYS.forEach(function (key) {
      var v = it[key];
      if (!v) return;
      var n = Number(v);
      fx.combat[key] = (fx.combat[key] || 0) + n;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: key, value: n, active: true });
    });
    if (sourceType === 'card' && it.atk) {
      var atkN = Number(it.atk);
      fx.combat.atk += atkN;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'atk', value: atkN, active: true });
    }
    if (sourceType === 'card' && it.def) {
      var defN = Number(it.def);
      fx.combat.def += defN;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'def', value: defN, active: true });
    }
    if (it.doubleAtk) {
      var daN = Number(it.doubleAtk);
      fx.combat.doubleAtkCard += daN;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'doubleAtkCard', value: daN, active: true });
    }
    if (it.perfectFlee) {
      var pdN = Number(it.perfectFlee);
      fx.combat.pd += pdN;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'pd', value: pdN, active: true });
    }
    if (it.defIgnore) {
      fx.combat.defIgnore = true;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'defIgnore', value: true, active: true });
    }
    if (it.magicImmune) {
      fx.combat.magicImmune = true;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'magicImmune', value: true, active: true });
    }
    if (it.spCostMul) {
      var mulN = Number(it.spCostMul);
      fx.combat.spCostMul *= mulN;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'spCostMul', value: mulN, active: true });
    }
    if (it.armorElement) {
      fx.combat.armorElement = it.armorElement;
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'armorElement', value: it.armorElement, active: true });
    }
    if (it.immune) {
      if (!fx.combat.immune) fx.combat.immune = [];
      it.immune.forEach(function (im) { if (fx.combat.immune.indexOf(im) === -1) fx.combat.immune.push(im); });
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'immune', value: it.immune, active: true });
    }
    _ITEM_EFF_COUNTER_KEYS.forEach(function (key) {
      if (!it[key]) return;
      if (!fx.combat[key]) fx.combat[key] = {};
      Object.entries(it[key]).forEach(function (pair) {
        fx.combat[key][pair[0]] = (fx.combat[key][pair[0]] || 0) + Number(pair[1]);
      });
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: key, value: it[key], active: true });
    });
    if (it.skillDmg) {
      if (!fx.skill.skillDmg) fx.skill.skillDmg = {};
      Object.entries(it.skillDmg).forEach(function (pair) {
        fx.skill.skillDmg[pair[0]] = (fx.skill.skillDmg[pair[0]] || 0) + Number(pair[1]);
      });
      ledger({ source: source, sourceType: sourceType, type: 'skill', key: 'skillDmg', value: it.skillDmg, active: true });
    }
    if (it.grantSkill) {
      if (!fx.skill.grantSkill) fx.skill.grantSkill = {};
      Object.entries(it.grantSkill).forEach(function (pair) {
        fx.skill.grantSkill[pair[0]] = Math.max(fx.skill.grantSkill[pair[0]] || 0, pair[1]);
      });
      ledger({ source: source, sourceType: sourceType, type: 'skill', key: 'grantSkill', value: it.grantSkill, active: true });
    }
    if (it.dropBonus) {
      if (!fx.combat.dropBonus) fx.combat.dropBonus = [];
      fx.combat.dropBonus.push(it.dropBonus);
      ledger({ source: source, sourceType: sourceType, type: 'combat', key: 'dropBonus', value: it.dropBonus, active: true });
    }
  }

  // processTurn()의 실제 실행 코드는 두 개의 별도 루프다: 레거시 경로
  // (hpDrain/spDrain/inflict/autoSpell)가 장비/카드 전체를 한 바퀴 먼저 돌고, 그 다음에야
  // proc 경로(raceBonus/seProc/lifesteal)가 장비/카드를 다시 한 바퀴 돈다. 이 순서를 그대로
  //지키지 않으면 카드가 여러 장 있을 때 Math.random() 호출 순서가 원본과 달라져 같은 시드로도
  // 결과가 달라진다(P0-C1 지시 §7). 그래서 onHitEvent는 kind에 따라 두 버퍼 중 하나에 쌓아
  // 두고, collectItemEffects가 끝날 때 "레거시 전체 → proc 전체" 순서로 한 번만 합친다.
  var ONHIT_LEGACY_KINDS = { hpDrain: true, spDrain: true, inflict: true, autoSpell: true };
  var onHitLegacyBuffer = [];
  var onHitProcBuffer = [];

  function onHitEvent(source, sourceType, kind, payload) {
    var evt = Object.assign({ source: source, sourceType: sourceType, kind: kind }, payload);
    (ONHIT_LEGACY_KINDS[kind] ? onHitLegacyBuffer : onHitProcBuffer).push(evt);
    ledger({ source: source, sourceType: sourceType, type: 'event', key: kind, value: payload, active: true });
  }

  // hpDrain/spDrain/inflict/autoSpell -- 레거시 직접 경로용 최상위 필드. 현재 DB 0건이지만
  // 데이터가 생기면 바로 정규화되도록 미리 배선해 둔다(실행은 여전히 processTurn 담당).
  function collectLegacyDirectFields(card, source) {
    if (card.hpDrain) onHitEvent(source, 'card', 'hpDrain', card.hpDrain);
    if (card.spDrain) onHitEvent(source, 'card', 'spDrain', card.spDrain);
    if (card.inflict) onHitEvent(source, 'card', 'inflict', card.inflict);
    if (card.autoSpell) onHitEvent(source, 'card', 'autoSpell', card.autoSpell);
  }

  function collectCardEffectObject(card, source) {
    var eff = card.effect;
    if (eff == null) return;
    if (typeof eff === 'string') {
      // P0-A 교정 이후 형제필드 문자열 effect는 항상 미검증/레거시 상태다 -- 활성화하지 않는다.
      fx.unsupported.push({ source: source, sourceType: 'card', label: 'string effect: ' + eff });
      ledger({ source: source, sourceType: 'card', type: 'unsupported', label: 'string effect: ' + eff, active: false });
      return;
    }
    if (typeof eff !== 'object') return;
    var type = eff.type;
    if ((type === 'stat' || type === 'mixed') && eff.stats) {
      Object.entries(eff.stats).forEach(function (pair) {
        var sk = pair[0], sv = pair[1];
        if (!(sk in fx.stat)) return;
        fx.stat[sk] += sv;
        ledger({ source: source, sourceType: 'card', type: 'stat', key: sk, value: sv, active: true });
      });
    }
    if (type === 'special' && eff.weaponUnbreakable) {
      // 카드 원작 근거는 있으나(P0-A 교정에서 카드DB로 확인) 엔진에 무기파괴 메커닉 자체가
      // 없어 소비처가 전혀 없다 -- 엔진미지원.
      fx.unsupported.push({ source: source, sourceType: 'card', label: '무기 파괴 방지' });
      ledger({ source: source, sourceType: 'card', type: 'unsupported', label: '무기 파괴 방지', active: false });
    }
    if (type === 'raceBonus' && eff.race && eff.dmgMult) {
      onHitEvent(source, 'card', 'raceBonus', { race: eff.race, dmgMult: eff.dmgMult });
    }
    if ((type === 'seProc' || type === 'mixed') && eff.seProc) {
      onHitEvent(source, 'card', 'seProc', { se: eff.seProc.se, chance: eff.seProc.chance, turns: eff.seProc.turns });
    }
    if (type === 'lifesteal' && eff.chance && eff.spRate) {
      onHitEvent(source, 'card', 'lifesteal', { chance: eff.chance, spRate: eff.spRate });
    }
    if (eff.bonus) {
      Object.entries(eff.bonus).forEach(function (pair) {
        var bk = pair[0], bv = pair[1];
        if (bk === 'atk') fx.combat.atk += bv;
        else if (bk === 'hit') fx.combat.hit += bv;
        else if (bk === 'crit') fx.combat.crit += bv;
        else if (bk === 'pd' || bk === 'perfectFlee') fx.combat.pd += bv;
        else if (bk === 'maxHp') fx.combat.maxHp += bv;
        else if (bk === 'maxSp') fx.combat.maxSp += bv;
        else return;
        ledger({ source: source, sourceType: 'card', type: 'combat', key: bk, value: bv, active: true });
      });
    }
    if (type != null && KNOWN_ITEM_EFFECT_TYPES.indexOf(type) === -1) {
      fx.unsupported.push({ source: source, sourceType: 'card', label: 'unknown effect.type: ' + type });
      ledger({ source: source, sourceType: 'card', type: 'unsupported', label: 'unknown effect.type: ' + type, active: false });
    }
  }

  Object.keys(p.equip).forEach(function (eqKey) {
    var itemName = p.equip[eqKey];
    if (!itemName) return;
    var parsed = parseItem(itemName);
    if (!parsed || !parsed.base) return;
    var base = parsed.base;

    if (_itemEffIsPending(base)) {
      fx.pending.push({ source: itemName, reason: '_pendingVerification' });
      ledger({ source: itemName, sourceType: 'equipment', type: 'pending', reason: '_pendingVerification', active: false });
    } else {
      collectSimpleFields(base, itemName, 'equipment');
    }

    if (Array.isArray(parsed.cards)) {
      parsed.cards.forEach(function (cn) {
        var cardKey = cn + ' 카드';
        var card = DB.items[cardKey];
        if (!card) return;
        if (_itemEffIsPending(card)) {
          fx.pending.push({ source: cardKey, reason: '_pendingVerification' });
          ledger({ source: cardKey, sourceType: 'card', type: 'pending', reason: '_pendingVerification', active: false });
          // effect는 억제하지만, pending과 무관한 순수 최상위 필드가 있다면(현재 데이터엔 없음)
          // 그건 이미 정본으로 확정된 값이라 그대로 집계한다.
          collectSimpleFields(card, cardKey, 'card');
          return;
        }
        collectSimpleFields(card, cardKey, 'card');
        collectCardEffectObject(card, cardKey);
        collectLegacyDirectFields(card, cardKey);
      });
    }
  });

  // 레거시 경로 전체 → proc 경로 전체 순서로 합친다(원본 processTurn의 두 별도 루프 순서와
  // 동일 -- 위 onHitEvent 주석 참조). 각 버퍼 내부는 이미 장비→카드 순서 그대로다.
  fx.events.onHit = onHitLegacyBuffer.concat(onHitProcBuffer);

  return fx;
}

// calcStats()의 bonus 누산기에 fx를 합산한다. calcStats는 이 함수 호출 후에도
// bonus.atk/bonus.def/... 를 그대로 계속 쓸 수 있다(탑승·상태이상·스킬 패시브 등 다른
// 소스가 같은 누산기를 계속 채우기 때문 -- item-effects.js는 아이템/카드 소스만 안다).
function mergeItemEffectsIntoBonus(fx, bonus) {
  if (!fx || !bonus) return;
  _ITEM_EFF_SIMPLE_STAT_KEYS.forEach(function (key) { bonus[key] = (bonus[key] || 0) + fx.stat[key]; });

  bonus.atk = (bonus.atk || 0) + (fx.combat.atk || 0); // wAtk에는 기존 라인(탑승 보너스와 동일 경로)이 합산
  bonus.def = (bonus.def || 0) + (fx.combat.def || 0);
  _ITEM_EFF_SIMPLE_COMBAT_KEYS.forEach(function (key) { bonus[key] = (bonus[key] || 0) + (fx.combat[key] || 0); });

  bonus.pd = (bonus.pd || 0) + (fx.combat.pd || 0);
  if (fx.combat.doubleAtkCard) bonus.doubleAtkCard = (bonus.doubleAtkCard || 0) + fx.combat.doubleAtkCard;
  if (fx.combat.defIgnore) bonus.defIgnore = true;
  if (fx.combat.magicImmune) bonus.magicImmune = true;
  if (fx.combat.spCostMul !== 1) bonus.spCostMul = (bonus.spCostMul == null ? 1 : bonus.spCostMul) * fx.combat.spCostMul;
  // (spCostMul은 승수이므로 기본값 1일 때는 굳이 곱하지 않는다 -- 부동소수 누적 오차 방지)
  if (fx.combat.armorElement) bonus.armorElement = fx.combat.armorElement;
  if (fx.combat.immune) {
    fx.combat.immune.forEach(function (im) {
      if (!bonus.immune) bonus.immune = [];
      if (bonus.immune.indexOf(im) === -1) bonus.immune.push(im);
    });
  }
  _ITEM_EFF_COUNTER_KEYS.forEach(function (key) {
    if (!fx.combat[key]) return;
    if (!bonus[key]) bonus[key] = {};
    Object.entries(fx.combat[key]).forEach(function (pair) {
      bonus[key][pair[0]] = (bonus[key][pair[0]] || 0) + pair[1];
    });
  });
  if (fx.skill.skillDmg) {
    if (!bonus.skillDmg) bonus.skillDmg = {};
    Object.entries(fx.skill.skillDmg).forEach(function (pair) {
      bonus.skillDmg[pair[0]] = (bonus.skillDmg[pair[0]] || 0) + pair[1];
    });
  }
  if (fx.skill.grantSkill) {
    if (!bonus.grantSkill) bonus.grantSkill = {};
    Object.entries(fx.skill.grantSkill).forEach(function (pair) {
      bonus.grantSkill[pair[0]] = Math.max(bonus.grantSkill[pair[0]] || 0, pair[1]);
    });
  }
  if (fx.combat.dropBonus) {
    fx.combat.dropBonus.forEach(function (d) {
      if (!bonus.dropBonus) bonus.dropBonus = [];
      bonus.dropBonus.push(d);
    });
  }
}

// ══════════════════════════════════════════════
// P0-C1 — 전투 중 카드 사건 효과 실행 경로 단일화
//
// triggerItemEffects(eventName, context, events)는 collectItemEffects()가 이미 정규화해
// 둔 fx.events.onHit(등)을 그대로 실행한다. processTurn()은 더 이상 장착 카드를
// parseItem()/DB.items로 다시 파싱하지 않는다 — 한 턴의 calcStats() 결과(s.itemEffects)만
// 쓴다.
//
// 원본 processTurn()에는 이 실행이 "레거시 경로"(hpDrain/spDrain/inflict/autoSpell, 항상
// 실행)와 "proc 경로"(raceBonus/seProc/lifesteal, target.currentHp>0일 때만 실행)라는
// 서로 다른 가드 조건의 두 별도 루프로 있었다. 이 차이는 실수가 아니라 원본 그대로 보존해야
// 하는 동작이라, triggerItemEffects 자체는 가드를 걸지 않고(어떤 이벤트든 넘어오면 실행),
// 호출부(processTurn)가 이벤트 목록을 kind로 갈라 두 번 호출하면서 각자의 가드 조건을
// 유지한다. collectItemEffects()는 이미 onHit 배열을 "레거시 전체 → proc 전체" 순서로
// 만들어 두므로(§ onHitEvent 주석), kind로 필터링해도 각 부분 집합 내부 순서는
// 원본과 동일한 장비→카드 순서가 유지된다.
//
// Math.random() 호출 횟수와 순서를 원본과 정확히 맞추는 것이 최우선이다 — 새로운 판정을
// 추가하거나 "더 올바른 방식"으로 고치지 않는다(P0-C1 지시 §6·§7).
var ITEM_EFFECT_STATUS_EMOJI = {
  stun: '💫', poison: '☠️', sleep: '💤', freeze: '🧊',
  blind: '🌑', silence: '🤐', curse: '👻', bleed: '🩸',
};

function triggerItemEffects(eventName, context, events) {
  if (!events || !events.length) return;
  var log = context.log || function () {};
  var random = context.random || Math.random;
  events.forEach(function (evt) {
    if (eventName === 'onHit') _triggerOnHitEvent(context, evt, log, random);
    // onDamaged/onKill/onTick: 현재 실행 데이터/소비처가 없다 -- P0-C 후속 단계.
  });
}

function _triggerOnHitEvent(context, evt, log, random) {
  var p = context.player, t = context.target;
  switch (evt.kind) {
    case 'raceBonus':
      // 원본: cardEff.type==='raceBonus' && cardEff.race===t.race && cardEff.dmgMult 일 때만.
      // random() 호출 없음 -- 결정적 배율 적용.
      if (evt.race === t.race && evt.dmgMult) {
        var bonusDmg = Math.floor(context.damage * (evt.dmgMult - 1));
        t.currentHp -= bonusDmg;
        context.damage += bonusDmg;
        log('🃏 <b>[' + evt.source + ']</b> ' + t.race + ' 추가 데미지 <span class="hl-dmg">+' + bonusDmg + '</span>', 'combat');
      }
      break;
    case 'seProc':
      // 원본: 이벤트가 존재하면(=원래 cardEff.seProc가 있었으면) 항상 random() 1회 호출.
      if (random() < evt.chance) {
        if (!t.statusEffects) t.statusEffects = {};
        t.statusEffects[evt.se] = evt.turns;
        var emoji = ITEM_EFFECT_STATUS_EMOJI[evt.se] || '⚡';
        log('🃏 <b>[' + evt.source + ']</b> ' + emoji + ' ' + evt.se + ' 부여! (' + evt.turns + '턴)', 'system');
      }
      break;
    case 'lifesteal':
      // 원본 가드(chance&&spRate)는 이미 collectCardEffectObject가 이벤트를 만들 때
      // 확인했으므로, 이벤트가 존재하면 항상 random() 1회 호출.
      if (random() < evt.chance) {
        var spGain = Math.floor(context.damage * evt.spRate);
        p.sp = Math.min(p.maxSp, p.sp + spGain);
        log('🃏 <b>[' + evt.source + ']</b> SP 흡수 <span class="hl-dmg">+' + spGain + '</span>', 'system');
      }
      break;
    case 'hpDrain':
      // 원본: c.hpDrain이 존재하면(=이벤트 존재) 항상 random() 1회 호출.
      if (random() < evt.rate) {
        var h = Math.floor(context.damage * evt.pct);
        p.hp = Math.min(p.maxHp, p.hp + h);
        if (h > 0) log('🩸 <b>[흡혈]</b> HP <span style="color:#27ae60">+' + h + '</span>', 'heal');
      }
      break;
    case 'spDrain':
      if (random() < evt.rate) {
        var sp2 = Math.floor(context.damage * evt.pct);
        p.sp = Math.min(p.maxSp, p.sp + sp2);
        if (sp2 > 0) log('💜 <b>[SP흡수]</b> SP <span style="color:#3498db">+' + sp2 + '</span>', 'system');
      }
      break;
    case 'inflict':
      // 원본은 stun/confusion/random_debuff 각각 자기 하위 필드가 있을 때만 random()을
      // 부른다(세 필드가 모두 있으면 최대 3~4회 호출) -- 하위 필드 존재 여부로 개별 가드.
      if (evt.stun && random() < evt.stun) {
        if (!t.statusEffects) t.statusEffects = {};
        t.statusEffects.stun = 3;
        log('⚡ <b>[스턴]</b> ' + t.name + ' 스턴!', 'system');
      }
      if (evt.confusion && random() < evt.confusion) {
        if (!t.statusEffects) t.statusEffects = {};
        t.statusEffects.confusion = 5;
        log('😵 <b>[혼란]</b> ' + t.name + ' 혼란!', 'system');
      }
      if (evt.random_debuff && random() < evt.random_debuff) {
        var dbs = ['stun', 'silence', 'sleep', 'blind', 'confusion'];
        var d = dbs[Math.floor(random() * dbs.length)];
        if (!t.statusEffects) t.statusEffects = {};
        t.statusEffects[d] = 3;
        log('💀 <b>[로드오브데스]</b> ' + t.name + ' [' + d + ']!', 'system');
      }
      break;
    case 'autoSpell':
      // 원본: c.autoSpell이 존재하면 항상 random() 1회 호출(rate는 ||0 폴백).
      if (random() < (evt.rate || 0)) {
        var sk = context.DB && context.DB.skills && context.DB.skills[evt.skill];
        if (sk && sk.effect) {
          var r = sk.effect(p, context.stats, t, evt.lv);
          if (r) log('✨ <b>[오토스펠]</b> ' + r.msg, 'crit');
        }
      }
      break;
    default:
      break;
  }
}
