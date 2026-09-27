#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2-A.4(-정정, 2026-09-27) -- source/data/combo-effect-support-matrix.json 생성.

핵심 질문: rAthena combo Script의 미지원 효과 중, TextRAG의 기존 P0 canonical
field + 실제 gameplay consumer까지 정확히 연결되는 것만 안전하게 지원할 수 있는가?
"parser가 읽을 수 있음 != 게임에서 실제 지원됨"을 구조적으로 기록한다.

**정정 이력(2026-09-27)**: 최초 P2-A.4는 SAFE 조건을 "canonical field + consumer
존재"로만 판정했다. 독립검증에서 bUseSPrate/bAddClass/bSubRace(RC_All) 3종이 consumer는
있었지만 원작과 stacking/scope가 달라(트리거 조건 일치 != 결과 일치) 잘못 SAFE로
승격됐음이 드러났다. 이후 SAFE는 반드시 아래 3축을 모두 만족해야 한다:
  - consumerPresent: 실제 게임 코드가 그 canonical key를 읽어 적용하는가
  - scopeParity:     원작이 적용되는 공격/스킬/트리거 범위와 TextRAG 소비처의 범위가 같은가
  - stackingParity:  여러 소스가 겹칠 때 원작의 결합 방식(additive/multiplicative/
                     cross-field 합산 등)과 TextRAG의 결합 방식이 같은가
하나라도 false/null(검증 불가)이면 safe-existing-consumer 금지. 상세 내역은
COMBO_EFFECT_SUPPORT_AUDIT.md §11(정정 섹션) 참조.

이 스크립트는 데이터만 만든다(canonicalize_combos.py/calcStats/전투 코드 어디에도
연결하지 않는다). 실행:

    python3 tools/gen_combo_effect_support_matrix.py

verdict 7종(전부 "maybe" 없이 하나로 확정, "정확성이 우선"이므로 다수가
engine-extension-required로 끝나는 것을 정상으로 취급한다):
  - safe-existing-consumer:      consumer+scope+stacking 3축 모두 원작과 일치 확인됨
                                  (canonicalize_combos.py가 이미 지원 중)
  - canonical-but-runtime-deferred: P0가 이미 canonical 필드는 갖고 있으나 그 필드
                                  자체가 게임에 아무 영향을 주지 않음(P0-close "명시보류")
  - trigger-model-missing:       그 트리거 자체를 모으는 코드가 아예 없음(예: onDamaged는
                                  항상 빈 배열 -- 구조적으로 도달 불가)
  - identity-mapping-gap:        트리거/컨슈머는 존재하나 rAthena 식별자(스킬 ID, 종족
                                  pseudo-enum 등)를 TextRAG 식별자로 옮길 근거가 없음
                                  (추측 금지)
  - engine-extension-required:   해당 메커닉 자체를 다루는 소비처 코드가 전혀 없음
                                  (새 계산식/새 필드가 있어야 함 -- 이번 단계는 추가하지 않음)
  - dynamic-expression:          getequiprefinerycnt() 등 값 자체가 동적 표현식이라
                                  평가하지 않음(상수 추출만, §16/§20)
  - stacking-scope-mismatch:     consumer는 실제로 존재하나(consumerPresent=true),
                                  scope 또는 stacking 중 하나 이상이 원작과 달라 결과가
                                  달라질 수 있음 -- "트리거 조건 일치"만으로 SAFE 판정하면
                                  안 된다는 이번 정정의 핵심 교훈을 담는 전용 verdict.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMBOS_JSON = ROOT / "source" / "data" / "db-combos.json"
OUT_JSON = ROOT / "source" / "data" / "combo-effect-support-matrix.json"

VERDICT_ENUM = [
    "safe-existing-consumer",
    "canonical-but-runtime-deferred",
    "trigger-model-missing",
    "identity-mapping-gap",
    "engine-extension-required",
    "dynamic-expression",
    "stacking-scope-mismatch",
]

# consumerPresent/scopeParity/stackingParity 기본값: 검증 불가/해당없음은 None(모른다는
# 뜻을 false와 구분하기 위해 명시적으로 null을 쓴다 -- JSON에서는 null로 직렬화된다).
_VERDICT_DEFAULT_FLAGS = {
    "safe-existing-consumer": (True, True, True),
    "canonical-but-runtime-deferred": (False, None, None),
    "trigger-model-missing": (False, None, None),
    "identity-mapping-gap": (True, None, None),  # 트리거는 있으나 식별자 매핑 불가로 검증 자체가 불가
    "engine-extension-required": (False, None, None),
    "dynamic-expression": (None, None, None),  # 값 자체를 평가하지 않으므로 판단 불가
    "stacking-scope-mismatch": (True, None, None),  # scope/stacking 중 실패한 축만 개별 override
}

# bCastrate(P2-A.4-정정) + bMatkRate/bUseSPrate(P2-A.5 엔진 확장)만 SAFE로 남는다 --
# consumer+scope+stacking 3축 모두 실코드로 확인 완료.
SAFE_CONSTANTS = {
    "bCastrate": {
        "canonicalTarget": {"type": "combat", "key": "castReduction"},
        "instanceScope": "리터럴 1-인자 `bonus bCastrate,n;` 형태만(스킬 지정 bonus2, 동적 표현식은 제외)",
        "evidence": (
            "consumer: index.html calcStats `castReduction=Math.min(1.0, base+(bonus.castReduction||0))`. "
            "scope: bCastrate/castReduction 둘 다 '캐스팅 전체'에 걸리는 단일 전역 값(스킬별 분기 없음) -- 범위 동일. "
            "stacking: rAthena pc.cpp(pre-re) `case SP_CASTRATE: sd->castrate += val;`(additive)이고 "
            "TextRAG도 collector `fx.combat.castReduction=(fx.combat.castReduction||0)+n`(additive) -- "
            "두 소스가 -10%씩 있으면 원작 -20%/TextRAG -0.20 fraction으로 정확히 일치(재확인 P2-A.4-정정 §7)."
        ),
    },
    "bCastRate": {
        "canonicalTarget": {"type": "combat", "key": "castReduction"},
        "instanceScope": "bCastrate의 대소문자 변형, 동일 조건",
        "evidence": "bCastrate와 동일",
    },
    "bMatkRate": {
        "canonicalTarget": {"type": "combat", "key": "matkPct"},
        "instanceScope": "리터럴 1-인자 `bonus bMatkRate,n;` 형태만(동적 표현식 제외)",
        "evidence": (
            "consumer: template.html calcStats MATK 계산부에 신규 연결 -- "
            "`bonusMAtk = Math.floor((baseMAtk+itemFlatMAtk)*matkRateMul) - baseMAtk` "
            "(matkRateMul = Math.max(0,100+bonus.matkPct)/100). "
            "scope: rAthena status.cpp(pre-RE, SCB_MATK) 실코드 확인 -- "
            "`matk_min/max = base + ematk; if(matk_rate!=100) matk *= matk_rate/100;` -- "
            "base+flat 아이템 MATK 전체에 적용되는 단일 배율(스킬별 분기 없음), TextRAG도 동일 범위. "
            "stacking: rAthena `sd->matk_rate += val`(100 기준 additive, 0% 하한 clamp)이고 TextRAG "
            "collector도 matkPct를 `_ITEM_EFF_SIMPLE_COMBAT_KEYS`(additive) 경로로 누적 -- "
            "+6+4=+10%로 정확히 일치(P2-A.5, 테스트 G/H)."
        ),
    },
    "bUseSPrate": {
        "canonicalTarget": {"type": "combat", "key": "spCostRatePct"},
        "instanceScope": "리터럴 1-인자 `bonus bUseSPrate,n;` 형태만(동적 표현식 제외)",
        "evidence": (
            "consumer: item-effects.js getSkillSpCost() 신규 필드 -- "
            "`rateMul=Math.max(0,100+cardSpCostRatePct)/100` 곱연산 경로. "
            "scope: rAthena skill.cpp skill_get_requirement 실코드 확인 -- "
            "`req.sp = req.sp * dsprate / 100;`(스킬 SP 소비 전체에 적용, 스킬별 분기 없음), "
            "TextRAG도 getSkillSpCost() 단일 정본 경로에서 동일 범위로 적용. "
            "stacking: rAthena `sd->dsprate += val`(100 기준 additive, 0% 하한 clamp -- "
            "status.cpp `if(dsprate<0) dsprate=0`)이고 TextRAG collector도 spCostRatePct를 같은 "
            "additive 경로로 누적 -- 신규 필드라 기존 spCostMul(곱연산, db-items.json 실사용 0건)을 "
            "오재사용하지 않는다(P2-A.5, 테스트 A-F)."
        ),
    },
    "bUseSPRate": {
        "canonicalTarget": {"type": "combat", "key": "spCostRatePct"},
        "instanceScope": "bUseSPrate의 대소문자 변형, 동일 조건",
        "evidence": "bUseSPrate와 동일",
    },
}

# 최초 P2-A.4에서 SAFE였다가 이번 정정으로 stacking-scope-mismatch로 재판정된 3종.
# consumer는 실제로 존재(consumerPresent=True)하지만 scope 또는 stacking이 원작과 달라
# false로 표시한다.
REVERTED_MISMATCHES = {
    # bUseSPrate/bUseSPRate는 P2-A.5에서 신규 additive 필드(spCostRatePct)로 SAFE 재확정
    # 됐다 -- 위 SAFE_CONSTANTS 참조. 여기 남은 것은 여전히 취소 상태인 2종뿐이다.
    "bAddClass": {
        "scopeParity": False,
        "stackingParity": True,
        "evidence": (
            "consumer: getOutgoingAtkPctMul/applyOutgoingRaceElemSizeBossAtk(존재). stacking은 양쪽 다 "
            "additive라 일치. scope 불일치: rAthena battle.cpp `battle_calc_cardfix(attack_type,...)`는 "
            "battle_calc_weapon_attack(평타+물리 스킬 공용 함수) 경로와 battle_calc_magic_attack(BF_MAGIC, "
            "magic_addclass 별도) 경로 양쪽에서 광범위하게 호출된다. TextRAG cardAtkPct/cardBossAtk는 "
            "P0-C5가 이미 확정한 대로 processTurn()의 '평타 블록'에만 연결돼 스킬 데미지 경로를 전혀 "
            "커버하지 못함 -- Class_All/Class_Boss 등 모든 enum 값에 적용(재확인 P2-A.4-정정 §4, 테스트 N)."
        ),
    },
    "bSubRace": {
        # bSubRace 자체는 RACE_ENUM_MAP에 있는 특정 종족에 한해 여전히 safe(P0부터 유지, 안 건드림).
        # 이 엔트리는 RC_All 인스턴스 전용 재판정이다.
        "scopeParity": True,
        "stackingParity": False,
        "evidence": (
            "RC_All 인스턴스 한정. consumer: applyIncomingItemReduction(존재). scope: '종족 무관 전체 "
            "감소'라는 트리거 조건은 dmgReduceAll과 일치. stacking(cross-field 합성) 불일치: rAthena "
            "battle.cpp `race_fix = subrace[targetRace] + subrace[RC_ALL];`(먼저 합산한 뒤 단 한 번만 "
            "적용). TextRAG applyIncomingItemReduction은 dmgReduceAll과 raceDmgReduce를 순차 곱연산으로 "
            "따로 적용(`result*=(1-all/100)` 다음 `result*=(1-race/100)`) -- RC_All(-30%)+특정종족(+30%) "
            "예시에서 원작은 0(상쇄)인데 TextRAG는 result*1.30*0.70=result*0.91(9% 감소)로 달라짐"
            "(재확인 P2-A.4-정정 §5, 테스트 O). 특정 종족만 있는 기존 raceDmgReduce 매핑 자체는 "
            "건드리지 않았다(§6)."
        ),
    },
}

# 이미 P0-close/P2-A 단계에서 문서화된, 그대로 유지되는 판정(재확인만).
# bMatkRate는 P2-A.5에서 SAFE_CONSTANTS로 이동했다(위 참조) -- 리터럴 형태만 SAFE고
# 동적 표현식 인스턴스는 여전히 unsupported로 남지만 별도 matrix row는 만들지 않는다
# (bCastrate의 스킬 지정/동적 표현식 인스턴스와 같은 기존 관례 -- constant 이름이
# SAFE_CONSTANTS에 있으면 census에서 스킵, UNSUPPORTED_REASONS 텍스트로만 근거 유지).
VERDICT_TABLE = {
    "bMatk": ("engine-extension-required", "matk는 파생값, 직접 가산 지점 불명확(bonus.matk와 동일 의미인지 미확정)"),
    "bAtk": ("engine-extension-required", "문서 자체가 unofficial 표기, bBaseAtk와 관계 불명확"),
    "bAtkRate": ("engine-extension-required", "%기반 ATK 가산 vocabulary 없음(bBaseAtk는 flat)"),
    "bSkillAtk": ("canonical-but-runtime-deferred", "ITEM_EFFECT_P0_CLOSEOUT.md: skillDmg 소비처 0건, 명시보류로 이미 확정(P2-A.4 §6)"),
    "bAutoSpell": ("identity-mapping-gap", "_triggerOnHitEvent case autoSpell 존재(DB.skills[evt.skill].effect 호출)하나 rAthena 스킬ID가 DB.skills 어떤 키와도 대응하지 않음(전수 grep 0건, P2-A.4 §12)"),
    "bAutoSpellWhenHit": ("trigger-model-missing", "events.onDamaged는 항상 빈 배열(집계 코드 자체 없음, ITEM_EFFECT_P0_CLOSEOUT.md 재확인, P2-A.4 §13)"),
    "bAddEff": ("engine-extension-required", "_triggerOnHitEvent case inflict는 stun/confusion/random_debuff 3종 고정 필드만 지원(turns도 하드코딩); 실 데이터의 Eff_Stone/Eff_Curse/Eff_Blind는 그 3종에 없음(P2-A.4 §14)"),
    "bAddEffWhenHit": ("trigger-model-missing", "bAutoSpellWhenHit과 동일 사유(events.onDamaged 집계 코드 없음, P2-A.4 §15)"),
    "bResEff": ("engine-extension-required", "isStatusImmune은 이진 면역만(cardImmune 배열), 부분 저항 % 자료구조 자체가 없음(P2-A.4 §16)"),
    "bLongAtkRate": ("engine-extension-required", "isRangedWeapon 구조 데이터는 존재하나 이를 조건으로 ATK%를 가산하는 소비처가 없음 -- 저복잡도(공격자 자신의 무기타입만 보면 됨, P2-A.4 §18)"),
    "bLongAtkDef": ("engine-extension-required", "받는 원거리 피해 감소 -- applyIncomingItemReduction 주석이 이미 확인한 대로 몬스터 공격의 원거리/근접 판별 메타데이터가 전혀 없음(m.range/m.distance 모두 무관, P0-C3 재확인) -- bLongAtkRate보다 고복잡도(신규 몬스터 공격 메타데이터 필요)"),
    "bAspdRate": ("engine-extension-required", "P0 flat aspd(*20ms)와 단위/의미가 다른 %기반 공격속도, 대응 소비처 없음"),
    "bDelayRate": ("engine-extension-required", "공격 딜레이 %가산 vocabulary 없음(aspd와 별개 필드)"),
    "bDelayrate": ("engine-extension-required", "bDelayRate의 대소문자 변형, 동일 사유"),
    "bHealPower": ("engine-extension-required", "healBoost 계열 전체가 원작검증필요 상태(P0-close)"),
    "bHealPower2": ("engine-extension-required", "healBoost 계열, 위와 동일"),
    "bHealpower2": ("engine-extension-required", "bHealPower2의 대소문자 변형"),
    "bSkillHeal": ("engine-extension-required", "healBoost 계열, 위와 동일"),
    "bSkillHeal2": ("engine-extension-required", "healBoost 계열, 위와 동일"),
    "bAddItemHealRate": ("engine-extension-required", "healBoost 계열, 위와 동일"),
    "bAddMonsterDropItem": ("engine-extension-required", "P0 dropBonus는 기존 드롭 테이블 가산일 뿐 신규 드롭 추가 메커닉이 없음"),
    "bAddDefMonster": ("engine-extension-required", "몬스터 ID 단위 조건부 방어, P0 vocabulary 없음"),
    "bAddSize": ("engine-extension-required", "사이즈 조건부 공격 vocabulary 없음(sizeAtk는 카드 전용, rAthena Size_* enum 대조 전)"),
    "bAddEle": ("engine-extension-required", "공격 시 속성별 가산 vocabulary 없음(elemAtk와 트리거 다름)"),
    "bComaRace": ("engine-extension-required", "즉사류 메커닉, P0 vocabulary 없음"),
    "bMagicDamageReturn": ("engine-extension-required", "반사 메커닉, P0 vocabulary 없음"),
    "bShortWeaponDamageReturn": ("engine-extension-required", "반사 메커닉, P0 vocabulary 없음"),
    "bBreakWeaponRate": ("engine-extension-required", "파괴 메커닉, P0 vocabulary 없음"),
    "bBreakArmorRate": ("engine-extension-required", "파괴 메커닉, P0 vocabulary 없음"),
    "bExpAddRace": ("engine-extension-required", "종족별 경험치 가산 vocabulary 없음"),
    "bDefEle": ("engine-extension-required", "방어 속성 변경, armorElement와 유사하나 그 필드도 소비처 없음(P0-close)"),
    "bPerfectHitAddRate": ("engine-extension-required", "대응 vocabulary 없음"),
    "bNoCastCancel": ("engine-extension-required", "인자 없는 플래그형 보너스, vocabulary 없음"),
    "bUnbreakableArmor": ("engine-extension-required", "인자 없는 플래그형 보너스, 파괴 메커닉 자체가 없음(weaponUnbreakable과 동급, P0-close 엔진미지원)"),
    "bSpeedRate": ("engine-extension-required", "이동속도, vocabulary 없음"),
    "bHPRegenRate": ("engine-extension-required", "고정 HP를 고정 주기로 회복 -- P0 hpRegenPct(%가산)와 완전히 다른 형태"),
    "bSPDrainValue": ("engine-extension-required", "평타 SP회복 vocabulary 없음"),
    "bSPGainRace": ("identity-mapping-gap", "RC_Player_Human 등 RACE_ENUM_MAP 미등재 enum 인스턴스(soulgain 자체는 SAFE, 이 특정 enum만 gap)"),
    "bDef": ("dynamic-expression", "리터럴 형태는 이미 VERIFIED_SIMPLE_BONUS(SAFE); 이 항목은 동적 표현식 인스턴스만(getequiprefinerycnt)"),
    "bMdef": ("dynamic-expression", "bDef와 동일 -- 동적 표현식 인스턴스만"),
    "bHit": ("dynamic-expression", "리터럴 형태는 이미 SAFE; 동적 표현식 인스턴스만"),
    "bSubEle": ("dynamic-expression", "리터럴 형태는 이미 SAFE(VERIFIED_ELEMENT_BONUS2); 동적 표현식 인스턴스만"),
    "autobonus": ("engine-extension-required", "공격 시 확률적 자기 버프 스크립트 실행 메커닉 자체가 P0에 없음(중첩 스크립트 내부는 파싱하지 않음, §16/§20)"),
    "autobonus2": ("engine-extension-required", "위와 동일(피격 시 버전)"),
    "skill": ("identity-mapping-gap", "bAutoSpell과 동일한 rAthena 스킬 ID -> TextRAG 스킬 키 identity 문제"),
}


def _flags_for(verdict, overrides=None):
    consumer, scope, stacking = _VERDICT_DEFAULT_FLAGS[verdict]
    if overrides:
        consumer = overrides.get("consumerPresent", consumer)
        scope = overrides.get("scopeParity", scope)
        stacking = overrides.get("stackingParity", stacking)
    return {"consumerPresent": consumer, "scopeParity": scope, "stackingParity": stacking}


def main():
    combos = json.load(open(COMBOS_JSON, encoding="utf-8"))["combos"]

    unsupported_instances = Counter()
    unsupported_combos = defaultdict(set)
    for c in combos:
        for u in c.get("unsupportedEffects", []):
            unsupported_instances[u["constant"]] += 1
            unsupported_combos[u["constant"]].add(c["id"])

    entries = []

    for safe_id, info in SAFE_CONSTANTS.items():
        entries.append({
            "constant": safe_id,
            "verdict": "safe-existing-consumer",
            "canonicalTarget": info["canonicalTarget"],
            "instanceScope": info["instanceScope"],
            "evidence": info["evidence"],
            **_flags_for("safe-existing-consumer"),
        })

    for const, info in REVERTED_MISMATCHES.items():
        entries.append({
            "constant": const,
            "verdict": "stacking-scope-mismatch",
            "canonicalTarget": None,
            "instanceCount": unsupported_instances.get(const, 0),
            "comboCount": len(unsupported_combos.get(const, set())),
            "sampleComboIds": sorted(unsupported_combos.get(const, set()))[:5],
            "evidence": info["evidence"],
            **_flags_for("stacking-scope-mismatch", info),
        })

    seen = set(SAFE_CONSTANTS.keys()) | set(REVERTED_MISMATCHES.keys())
    for const in sorted(unsupported_instances.keys()):
        if const in seen:
            continue
        verdict, evidence = VERDICT_TABLE.get(
            const, ("engine-extension-required", "P0 vocabulary에 대응 필드 없음(doc/item_bonus.txt 대조, 상세 재검증은 저빈도라 생략)")
        )
        entries.append({
            "constant": const,
            "verdict": verdict,
            "canonicalTarget": None,
            "instanceCount": unsupported_instances[const],
            "comboCount": len(unsupported_combos[const]),
            "sampleComboIds": sorted(unsupported_combos[const])[:5],
            "evidence": evidence,
            **_flags_for(verdict),
        })

    verdict_counts = Counter(e["verdict"] for e in entries)

    out = {
        "meta": {
            "purpose": "rAthena combo Script 미지원 효과 중 실제 gameplay consumer까지 확인된 것만 구분(parser가 읽을 수 있음 != 게임에서 실제 지원됨)",
            "verdictEnum": VERDICT_ENUM,
            "safeDefinition": "consumerPresent && scopeParity && stackingParity 모두 true여야 safe-existing-consumer(P2-A.4-정정 §2)",
            "generatedFrom": "source/data/db-combos.json (재생성 후 census) + index.html/pc.cpp/battle.cpp(rAthena pinned e985006) 실코드 재확인 + ITEM_EFFECT_P0_CLOSEOUT.md",
            "verdictCounts": dict(verdict_counts),
            "note": "safe-existing-consumer 항목은 이미 tools/canonicalize_combos.py에 반영되어 db-combos.json effects[]에 나타난다. stacking-scope-mismatch는 P2-A.4 최초 판정에서 SAFE였다가 이번 정정으로 취소된 3종 전용이다.",
        },
        "entries": entries,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK - wrote {OUT_JSON} ({len(entries)} constant entries)")
    print("verdict counts:", dict(verdict_counts))


if __name__ == "__main__":
    main()
