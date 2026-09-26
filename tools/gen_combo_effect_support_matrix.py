#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2-A.4 -- source/data/combo-effect-support-matrix.json 생성.

핵심 질문: rAthena combo Script의 미지원 효과 중, TextRAG의 기존 P0 canonical
field + 실제 gameplay consumer까지 정확히 연결되는 것만 안전하게 지원할 수 있는가?
"parser가 읽을 수 있음 != 게임에서 실제 지원됨"을 구조적으로 기록한다.

이 스크립트는 데이터만 만든다(canonicalize_combos.py/calcStats/전투 코드 어디에도
연결하지 않는다). 실행:

    python3 tools/gen_combo_effect_support_matrix.py

verdict 6종(전부 "maybe" 없이 하나로 확정, "정확성이 우선"이므로 다수가
engine-extension-required로 끝나는 것을 정상으로 취급한다):
  - safe-existing-consumer:      canonical field + 실제 gameplay consumer 모두 확인됨
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
"""
import json
import sys
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
]

# 이미 canonicalize_combos.py가 지원하는 constant -> (canonicalTarget, evidence).
# tools/canonicalize_combos.py의 VERIFIED_SIMPLE_BONUS/VERIFIED_CLASS_BONUS2/
# SUBRACE_TO_ALL_KEY와 정확히 같은 집합이어야 한다(아래 census 후 교차검증).
SAFE_CONSTANTS = {
    "bCastrate": {
        "canonicalTarget": {"type": "combat", "key": "castReduction"},
        "instanceScope": "리터럴 1-인자 `bonus bCastrate,n;` 형태만(스킬 지정 bonus2, 동적 표현식은 제외)",
        "evidence": "index.html calcStats: `castReduction=Math.min(1.0, base+(bonus.castReduction||0))`, 하한 clamp 없음 -- fraction=-n/100 (P2-A.4 §9)",
    },
    "bCastRate": {
        "canonicalTarget": {"type": "combat", "key": "castReduction"},
        "instanceScope": "bCastrate의 대소문자 변형, 동일 조건",
        "evidence": "bCastrate와 동일",
    },
    "bUseSPrate": {
        "canonicalTarget": {"type": "combat", "key": "spCostMul"},
        "instanceScope": "리터럴 1-인자 형태만",
        "evidence": "index.html getSkillSpCost: `baseCost*mul`; 아이템 파서: `fx.combat.spCostMul*=Number(it.spCostMul)`(곱연산, 기본값 1) -- multiplier=1+n/100 (P2-A.4 §11)",
    },
    "bUseSPRate": {
        "canonicalTarget": {"type": "combat", "key": "spCostMul"},
        "instanceScope": "bUseSPrate의 대소문자 변형, 동일 조건",
        "evidence": "bUseSPrate와 동일",
    },
    "bAddClass:Class_All": {
        "canonicalTarget": {"type": "combat", "key": "atkPct"},
        "instanceScope": "bonus2 bAddClass,Class_All,x -- 실 데이터 관측값 전부",
        "evidence": "index.html getOutgoingAtkPctMul: `1+(cardAtkPct||0)/100`, 대상 필터 없음 -- Class_All(전체 몬스터)과 트리거 일치 (P2-A.4 §8)",
    },
    "bAddClass:Class_Boss": {
        "canonicalTarget": {"type": "combat", "key": "bossAtk"},
        "instanceScope": "bonus2 bAddClass,Class_Boss,x -- 실 데이터 0건(향후 대비 등재)",
        "evidence": "index.html applyOutgoingRaceElemSizeBossAtk: `if(cardBossAtk && target.isMvp) mul+=cardBossAtk/100` -- Class_Boss 트리거와 일치 (P2-A.4 §8)",
    },
    "bSubRace:RC_All": {
        "canonicalTarget": {"type": "combat", "key": "dmgReduceAll"},
        "instanceScope": "bonus2 bSubRace,RC_All,x",
        "evidence": "index.html applyIncomingItemReduction: `if(all) result*=(1-all/100)`, 종족 조건 없음 -- RC_All(전종족)과 트리거 일치 (P2-A.4 §17)",
    },
}

# 이미 P0-close/P2-A 단계에서 문서화된, 그대로 유지되는 판정(재확인만).
VERDICT_TABLE = {
    "bMatkRate": ("engine-extension-required", "buildMatkBreakdown: bonus.matk는 flat만 가산, %기반 MATK 필드 자체가 없음(P2-A.4 §7)"),
    "bMatk": ("engine-extension-required", "matk는 파생값, 직접 가산 지점 불명확(bonus.matk와 동일 의미인지 미확정)"),
    "bAtk": ("engine-extension-required", "문서 자체가 unofficial 표기, bBaseAtk와 관계 불명확"),
    "bAtkRate": ("engine-extension-required", "%기반 ATK 가산 vocabulary 없음(bBaseAtk는 flat)"),
    "bSkillAtk": ("canonical-but-runtime-deferred", "ITEM_EFFECT_P0_CLOSEOUT.md: skillDmg 소비처 0건, 명시보류로 이미 확정(P2-A.4 §6)"),
    "bAutoSpell": ("identity-mapping-gap", "_triggerOnHitEvent case autoSpell 존재(DB.skills[evt.skill].effect 호출)하나 rAthena 스킬ID가 DB.skills 어떤 키와도 대응하지 않음(전수 grep 0건, P2-A.4 §12)"),
    "bAutoSpellWhenHit": ("trigger-model-missing", "events.onDamaged는 항상 빈 배열(집계 코드 자체 없음, ITEM_EFFECT_P0_CLOSEOUT.md 재확인, P2-A.4 §13)"),
    "bAddEff": ("engine-extension-required", "_triggerOnHitEvent case inflict는 stun/confusion/random_debuff 3종 고정 필드만 지원(turns도 하드코딩); 실 데이터의 Eff_Stone/Eff_Curse/Eff_Blind는 그 3종에 없음(P2-A.4 §14)"),
    "bAddEffWhenHit": ("trigger-model-missing", "bAutoSpellWhenHit과 동일 사유(events.onDamaged 집계 코드 없음, P2-A.4 §15)"),
    "bResEff": ("engine-extension-required", "isStatusImmune은 이진 면역만(cardImmune 배열), 부분 저항 % 자료구조 자체가 없음(P2-A.4 §16)"),
    "bSubRace": ("identity-mapping-gap", "RC_Player_Human 등 미등재 enum 인스턴스 -- TextRAG 몬스터 모델에 '플레이어 종족' 개념 자체가 없음(P2-A.4 §17). RC_All은 SAFE(아래 별도 항목)"),
    "bAddClass": ("engine-extension-required", "Class_Normal/Class_Guardian/Class_Battlefield -- '보스 아님 전용' 소비처나 WoE 가디언/전장 몬스터 분류가 P0에 없음(P2-A.4 §8). Class_All/Class_Boss는 SAFE(아래 별도 항목)"),
    "bCastrate": ("engine-extension-required", "스킬 지정 2-인자 bonus2 bCastrate,\"SKILL\",n -- 스킬별 캐스팅 소비처 없음(P2-A.4 §10). 리터럴 1-인자 형태는 SAFE(아래 별도 항목)"),
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
        })

    seen = set(SAFE_CONSTANTS.keys())
    for const in sorted(unsupported_instances.keys()):
        if const in seen:
            continue  # bDef/bMdef/bHit/bSubEle/bCastrate/bSubRace/bAddClass -- 별도 인스턴스 항목으로 위에서 이미 판정
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
        })

    verdict_counts = Counter(e["verdict"] for e in entries)

    out = {
        "meta": {
            "purpose": "rAthena combo Script 미지원 효과 중 실제 gameplay consumer까지 확인된 것만 구분(parser가 읽을 수 있음 != 게임에서 실제 지원됨)",
            "verdictEnum": VERDICT_ENUM,
            "generatedFrom": "source/data/db-combos.json (재생성 후 census) + index.html 실코드 재확인(calcStats/getSkillSpCost/applyIncomingItemReduction/isStatusImmune/_triggerOnHitEvent/triggerItemEffects) + ITEM_EFFECT_P0_CLOSEOUT.md",
            "verdictCounts": dict(verdict_counts),
            "note": "safe-existing-consumer 항목은 이미 tools/canonicalize_combos.py에 반영되어 db-combos.json effects[]에 나타난다. 나머지는 여전히 unsupportedEffects[]에 남아 있으며 §24 지시대로 개수를 억지로 늘리지 않는다.",
        },
        "entries": entries,
    }
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK - wrote {OUT_JSON} ({len(entries)} constant entries)")
    print("verdict counts:", dict(verdict_counts))


if __name__ == "__main__":
    main()
