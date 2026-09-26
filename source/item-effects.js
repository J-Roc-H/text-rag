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

  function onHitEvent(source, sourceType, kind, payload) {
    var evt = Object.assign({ source: source, sourceType: sourceType, kind: kind }, payload);
    fx.events.onHit.push(evt);
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
