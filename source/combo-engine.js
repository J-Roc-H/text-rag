// ══════════════════════════════════════════════
// P2-B1 — combo matcher: getActiveLoadout → matchCombos → applyComboEffects
//
// 정본 경로: calcStats()가 collectItemEffects()로 fx를 만든 직후, mergeItemEffectsIntoBonus()
// 이전에 applyComboEffects(p, DB, fx, parseItem)을 호출해 활성 콤보 효과를 같은 fx 객체에
// 추가한다. 새 세트엔진/새 효과 어휘를 만들지 않는다 — db-combos.json의 effects[]는 이미
// item-effects.js의 canonical vocabulary(type/key/subKey/value)와 같은 모양이므로, 그 값을
// fx.stat/fx.combat에 더하고 fx.ledger에 sourceType:'combo' 항목을 남기는 것만으로 충분하다
// (mergeItemEffectsIntoBonus/getItemEffectAtomicRows/getStatBonusBreakdown 등 기존 P0/P1
// 소비처가 그대로 재사용된다).
//
// rAthena 실코드 확인(pin e985006171d2eb320ee512a653f4c83aea3d81b6, itemdb.cpp
// ComboDatabase::parseBodyNode/pc.cpp pc_checkcombo/status.cpp status_calc_pc):
// 하나의 "Combos:" 블록 안 여러 "Combo:" variant는 완전히 독립된 s_item_combo 레코드로
// 등록되고(각자 별도 id, Script도 각자 독립적으로 parse_script), pc_checkcombo가 variant마다
// 독립적으로 만족 여부를 검사해 만족한 것마다 sd->combos에 별도 entry를 push하며,
// status_calc_pc가 sd->combos를 순회하며 entry마다 run_script를 각각 호출한다(동일 id
// 재등록만 막을 뿐 다른 id 간 dedup은 없음). 즉 두 variant가 동시에 만족되면 공유 Script가
// 만족된 개수만큼 반복 적용되어 additive 보너스가 중첩된다 — "공유라서 1회만" 적용되는
// 동작은 원작에 없다. 이 엔진은 db-combos.json의 각 variant(=각 combo record, id로 구분)를
// 완전히 독립적으로 매칭·적용해 이 동작을 그대로 재현한다(변형 간 dedup을 하지 않는다).
// ══════════════════════════════════════════════

// 장착 장비(p.equip 기준) + 그 장비에 실제로 꽂힌 카드만 모은다. 인벤토리 보유만으로는
// 절대 포함되지 않는다(요구사항 §2). collectItemEffects()의 p.equip 순회와 동일한 판정
// (parsed.base 존재 확인, parsed.cards의 각 항목을 DB.items[cn+' 카드']로 재조회)을 그대로
// 따른다 — 다른 판정 기준을 새로 만들지 않는다.
function getActiveLoadout(p, DB, parseItem) {
  var loadout = [];
  if (!p || !p.equip || typeof parseItem !== 'function' || !DB || !DB.items) return loadout;

  Object.keys(p.equip).forEach(function (eqKey) {
    var itemName = p.equip[eqKey];
    if (!itemName) return;
    var parsed = parseItem(itemName);
    if (!parsed || !parsed.base) return;

    // 요구사항 §3: display name(itemName, "+7 " 접두·"[N]"·"<카드>" 표기 포함)이 아니라
    // parseItem()이 분리한 baseName(=P2-A textragKey와 같은 DB.items 키)으로 매칭한다.
    loadout.push({ key: parsed.baseName, kind: 'equipment', source: itemName });

    if (Array.isArray(parsed.cards)) {
      parsed.cards.forEach(function (cn) {
        var cardKey = cn + ' 카드';
        if (!DB.items[cardKey]) return; // 미등록 카드명은 collectItemEffects와 동일하게 무시
        loadout.push({ key: cardKey, kind: 'card', source: cardKey });
      });
    }
  });

  return loadout;
}

function _countByKey(list) {
  var counts = {};
  list.forEach(function (entry) {
    var k = entry.key;
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

// 요구사항 §4: 동일 아이템 2회 이상 요구를 multiplicity로 보존한다 — Set이 아니라 개수
// 비교. 요구사항 §8: status!=='verified'(unsupported/source-needed, ammo 포함)는 절대
// 매칭 후보에 넣지 않는다. rAthena variant 중복 semantics(파일 상단 주석)에 따라 variant
// (=combo record) 간 dedup을 하지 않는다 — 동시에 만족된 variant는 전부 독립적으로 반환한다.
function matchCombos(loadout, comboList) {
  if (!Array.isArray(comboList)) return [];
  var activeCounts = _countByKey(loadout);

  return comboList.filter(function (combo) {
    if (!combo || combo.status !== 'verified') return false;
    if (!Array.isArray(combo.requiredItems) || combo.requiredItems.length < 2) return false;

    var requiredCounts = {};
    for (var i = 0; i < combo.requiredItems.length; i++) {
      var ri = combo.requiredItems[i];
      if (!ri.textragKey) return false; // 미해결 identity는 절대 매칭하지 않는다(추측 금지)
      requiredCounts[ri.textragKey] = (requiredCounts[ri.textragKey] || 0) + 1;
    }

    for (var key in requiredCounts) {
      if ((activeCounts[key] || 0) < requiredCounts[key]) return false;
    }
    return true;
  });
}

// combo.effects[]는 이미 item-effects.js의 canonical 형태(type/key/subKey/value)다 — 새
// 표현을 만들지 않고 그 값을 fx의 같은 자리에 그대로 더한다. subKey가 있으면
// _ITEM_EFF_COUNTER_KEYS(raceAtk/elemAtk/sizeAtk/raceDmgReduce/elemReduce 등)와 같은
// "맵 누적" 방식, 없으면 나머지 키와 같은 "단순 additive" 방식이다 — collectItemEffects의
// 두 기존 패턴과 동일하다.
function _applyComboEffect(fx, comboId, effect) {
  if (!effect || !effect.type || !fx[effect.type]) return;
  var bucket = fx[effect.type];

  if (effect.subKey != null) {
    if (!bucket[effect.key]) bucket[effect.key] = {};
    bucket[effect.key][effect.subKey] = (bucket[effect.key][effect.subKey] || 0) + effect.value;
    fx.ledger.push({
      source: comboId, sourceType: 'combo', type: effect.type, key: effect.key,
      value: (function () { var o = {}; o[effect.subKey] = effect.value; return o; })(),
      active: true,
    });
  } else {
    bucket[effect.key] = (bucket[effect.key] || 0) + effect.value;
    fx.ledger.push({
      source: comboId, sourceType: 'combo', type: effect.type, key: effect.key,
      value: effect.value, active: true,
    });
  }
}

// calcStats()의 정본 진입점 — collectItemEffects() 직후, mergeItemEffectsIntoBonus() 이전에
// 호출된다(요구사항 §6/§12/§13: 별도 세트엔진·별도 UI 계산 없이 같은 fx를 확장만 한다).
// p는 playerOverride(장비비교 candidate clone)일 수 있다 — 항상 인자로 받은 p만 읽고
// 전역 G.player를 참조하지 않는다(요구사항 §9/§11).
function applyComboEffects(p, DB, fx, parseItem) {
  if (!fx) return fx;
  if (!p || !p.equip || !DB || !Array.isArray(DB.combos) || typeof parseItem !== 'function') return fx;

  var loadout = getActiveLoadout(p, DB, parseItem);
  var matched = matchCombos(loadout, DB.combos);

  matched.forEach(function (combo) {
    (combo.effects || []).forEach(function (effect) {
      _applyComboEffect(fx, combo.id, effect);
    });
  });

  return fx;
}
