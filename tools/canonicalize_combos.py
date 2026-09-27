#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2-A — rAthena Pre-Renewal item_combos.yml -> source/data/db-combos.json 정본화.

이 스크립트는 데이터만 만든다(P2-A §25 지시: collectItemEffects/calcStats/전투 코드
어디에도 연결하지 않는다). 실행:

    python3 tools/canonicalize_combos.py

입력:
    source/reference/rathena-pre-re/item_combos.yml       (원본, 전문 보존)
    source/reference/rathena-pre-re/item_db_aegis_lookup.json (AegisName->Id, provenance용)
    source/data/db-items.json                              (TextRAG 아이템 identity)
    source/data/combo-item-identity.json                   (P2-A.1 identity map, 있으면 사용)

출력:
    source/data/db-combos.json

핵심 원칙(과제 지시 그대로):
  - display name fuzzy match 금지 — TextRAG 매핑은 1순위로 P2-A.1
    combo-item-identity.json의 verified 항목(증거 기반 확정만), 2순위로
    db-items.json의 `_aegis` 필드 exact-match를 쓴다(§16: identity map 우선,
    기존 _aegis exact를 fallback으로). identity map에 없거나 verified가
    아닌(ambiguous/unresolved-existing/missing) 항목은 전부 unresolved로
    남긴다(추측 금지, identity map의 ambiguous/unresolved를 자동 선택하지
    않는다).
  - rawScript는 100% 보존(§15) — canonical 변환 성공/실패와 무관하게 항상 원문 그대로.
  - 조건문(if/else)은 파싱하지 않고 raw로만 보존한다(§20) — 최상위(조건 밖) 문장만
    개별 파싱한다. 괄호/중첩을 문자 단위로 추적하는 안전한 분리기만 쓴다 — 일반
    rAthena 인터프리터를 만들지 않는다(§16).
  - bonus 상수 -> P0 vocabulary 매핑은 이미 rAthena 공식 문서(doc/item_bonus.txt)로
    의미/단위/부호를 하나씩 검증한 것만 VERIFIED로 자동 변환한다(§18/§19). 나머지는
    rawScript만 보존한 채 status-needed 처리한다.
"""
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML이 필요합니다 (pip install pyyaml)", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
REF_DIR = ROOT / "source" / "reference" / "rathena-pre-re"
COMBOS_YML = REF_DIR / "item_combos.yml"
AEGIS_LOOKUP_JSON = REF_DIR / "item_db_aegis_lookup.json"
TEXTRAG_ITEMS_JSON = ROOT / "source" / "data" / "db-items.json"
IDENTITY_MAP_JSON = ROOT / "source" / "data" / "combo-item-identity.json"
OUT_JSON = ROOT / "source" / "data" / "db-combos.json"

# ══════════════════════════════════════════════
# rAthena RC_*(종족)/Ele_*(속성) enum -> TextRAG 정본 문자열.
# 출처: source/data/db-monsters.json에 실제 쓰이는 종족 10종(전수 확인, §6 근거) +
# template.html의 db-element 인라인 데이터에 실제 존재하는 속성명(§6 근거). 추측/번역
# 없음 — 두 소스 모두 이 프로젝트 안에 이미 존재하는 검증된 데이터에서 그대로 가져왔다.
# 이 표에 없는 RC_*/Ele_* 값(예: RC_Player, RC_Boss, RC_All)은 매핑하지 않고
# source-needed로 남긴다(§6: "AegisName → 한글명 추측"과 같은 성격의 추측을 피한다).
# ══════════════════════════════════════════════
RACE_ENUM_MAP = {
    "RC_Formless": "무형", "RC_Undead": "언데드", "RC_Brute": "동물",
    "RC_Plant": "식물", "RC_Insect": "곤충", "RC_Fish": "어류",
    "RC_Demon": "악마", "RC_DemiHuman": "인간형", "RC_Angel": "천사",
    "RC_Dragon": "드래곤",
}
ELEMENT_ENUM_MAP = {
    "Ele_Neutral": "무속성", "Ele_Water": "수속성", "Ele_Earth": "지속성",
    "Ele_Fire": "화속성", "Ele_Wind": "풍속성", "Ele_Poison": "독속성",
    "Ele_Holy": "성속성", "Ele_Dark": "암속성", "Ele_Ghost": "염속성",
    "Ele_Undead": "불사속성",
}

# ══════════════════════════════════════════════
# bonus 상수 -> P0 canonical effect vocabulary. 각 항목은 rAthena 공식 문서
# (doc/item_bonus.txt, 이번 단계에서 원문 대조 확인)의 정확한 문구를 근거로 한다.
# P0가 이미 확정한 vocabulary(source/item-effects.js)만 재사용한다 — 새 combo 전용
# effect 종류를 만들지 않는다(§17).
#
# 각 엔트리: (canonical type, canonical key, unit transform, doc 근거 한 줄)
# unit transform: None = 그대로, 그 외는 (value) -> value 변환 함수.
# ══════════════════════════════════════════════
VERIFIED_SIMPLE_BONUS = {
    # 원작 문서: "STR/AGI/VIT/INT/DEX/LUK + n" (flat) — P0 stat.* 그대로.
    "bStr": ("stat", "str", None, 'doc: "bonus bStr,n; STR + n"'),
    "bAgi": ("stat", "agi", None, 'doc: "bonus bAgi,n; AGI + n"'),
    "bVit": ("stat", "vit", None, 'doc: "bonus bVit,n; VIT + n"'),
    "bInt": ("stat", "int", None, 'doc: "bonus bInt,n; INT + n"'),
    "bDex": ("stat", "dex", None, 'doc: "bonus bDex,n; DEX + n"'),
    "bLuk": ("stat", "luk", None, 'doc: "bonus bLuk,n; LUK + n"'),
    # "bonus bMaxHP,n; MaxHP + n" (flat) — P0 combat.maxHp/maxSp 그대로.
    "bMaxHP": ("combat", "maxHp", None, 'doc: "bonus bMaxHP,n; MaxHP + n"'),
    "bMaxSP": ("combat", "maxSp", None, 'doc: "bonus bMaxSP,n; MaxSP + n"'),
    # "bonus bMaxHPrate,n; MaxHP + n%" — P0 maxHpPct/maxSpPct는 이미 "10=10%" 관례.
    "bMaxHPrate": ("combat", "maxHpPct", None, 'doc: "bonus bMaxHPrate,n; MaxHP + n%"'),
    "bMaxHPRate": ("combat", "maxHpPct", None, 'doc: "bonus bMaxHPrate,n; MaxHP + n%" (대소문자 변형)'),
    "bMaxSPrate": ("combat", "maxSpPct", None, 'doc: "bonus bMaxSPrate,n; MaxSP + n%"'),
    "bMaxSPRate": ("combat", "maxSpPct", None, 'doc: "bonus bMaxSPrate,n; MaxSP + n%" (대소문자 변형)'),
    # "bonus bDef,n; Equipment DEF + n" — P0 카드 def 필드와 동일 의미(장비 DEF 가산).
    "bDef": ("combat", "def", None, 'doc: "bonus bDef,n; Equipment DEF + n"'),
    "bMdef": ("combat", "mdef", None, 'doc: "bonus bMdef,n; Equipment MDEF + n"'),
    # "bonus bHit,n; Hit + n" / "bonus bFlee,n; Flee + n" — flat, P0 hit/flee 그대로.
    "bHit": ("combat", "hit", None, 'doc: "bonus bHit,n; Hit + n"'),
    "bFlee": ("combat", "flee", None, 'doc: "bonus bFlee,n; Flee + n"'),
    # "bonus bCritical,n; Critical + n" — 문서가 "+n%"가 아니라 "+n"이라고 명시(=flat).
    # bCriticalRate(별도 상수, "+n%")와 혼동하지 않도록 이 표에는 bCritical만 넣는다.
    "bCritical": ("combat", "crit", None, 'doc: "bonus bCritical,n; Critical + n" (flat, %아님)'),
    # "bonus bFlee2,n; Perfect Dodge + n" — flat, P0 pd(perfectFlee) 그대로.
    "bFlee2": ("combat", "pd", None, 'doc: "bonus bFlee2,n; Perfect Dodge + n"'),
    # "bonus bBaseAtk,n; Basic attack power + n" — flat, P0 카드 atk 필드와 동일 의미.
    "bBaseAtk": ("combat", "atk", None, 'doc: "bonus bBaseAtk,n; Basic attack power + n"'),
    # "bonus bHPrecovRate,n; Natural HP recovery ratio + n%" — P0 hpRegenPct와 정확히
    # 같은 의미(자연회복 %가산, calcStats의 hpRegen*(1+pct/100) 공식과 일치).
    "bHPrecovRate": ("combat", "hpRegenPct", None, 'doc: "bonus bHPrecovRate,n; Natural HP recovery ratio + n%"'),
    "bSPrecovRate": ("combat", "spRegenPct", None, 'doc: "bonus bSPrecovRate,n; Natural SP recovery ratio + n%"'),
    # ══ P2-A.4 신규(실코드 재확인, COMBO_EFFECT_SUPPORT_AUDIT.md 참조) ══
    # "bonus bCastrate,n; Increases/decreases variable cast time by n%" — 실코드
    # 재확인(index.html calcStats castReduction 공식: `Math.min(1.0, base +
    # (bonus.castReduction||0))`, 하한 clamp 없음)로 n의 부호를 그대로 뒤집어 fraction에
    # 반영하면(양수 n=캐스팅 증가→fraction 감소, 음수 n=캐스팅 감소→fraction 증가)
    # 기존 DEX 기반 castReduction과 완전히 같은 방식으로 합성된다. 이 매핑은 리터럴
    # 1-인자 `bonus` 형태에만 적용된다 — 스킬 지정 2-인자 `bonus2 bCastrate,"SKILL",n`
    # 형태는 여전히 UNSUPPORTED_REASONS를 거친다(스킬별 캐스팅 소비처 없음, 아래 참조).
    # rAthena pc.cpp(pre-re, non-RENEWAL_CAST) 확인: `case SP_CASTRATE: sd->castrate
    # += val;` -- additive 누적. TextRAG castReduction도 additive(calcStats:
    # `Math.min(1.0, base+(bonus.castReduction||0))`, collector:
    # `fx.combat.castReduction=(fx.combat.castReduction||0)+n`, P2-A.4-정정 재확인)라
    # stacking parity 확인됨 -- SAFE 유지. 리터럴 1-인자 `bonus` 형태에만 적용된다 --
    # 스킬 지정 2-인자 `bonus2 bCastrate,"SKILL",n`은 여전히 UNSUPPORTED_REASONS를 거친다.
    "bCastrate": ("combat", "castReduction", lambda v: -v / 100.0,
                  'doc: "bonus bCastrate,n; Increases/decreases variable cast time by n%" — '
                  'fraction=-n/100, additive stacking parity 확인(pc.cpp SP_CASTRATE, P2-A.4-정정 §7)'),
    "bCastRate": ("combat", "castReduction", lambda v: -v / 100.0,
                  'doc: "bonus bCastrate,n" (대소문자 변형) — 위와 동일'),
    # ══ P2-A.5 신규(엔진 확장, COMBO_ENGINE_EXTENSION_P2A5.md 참조) ══
    # "bonus bMatkRate,n; Magical attack power + n%" — rAthena status.cpp(pre-RE,
    # SCB_MATK 블록) 실코드 확인: matk=(base_matk+ematk)*matk_rate/100(0% 하한
    # clamp), matk_rate는 100 기준 `sd->matk_rate += val`로 additive 누적. 신규
    # canonical 필드 combat.matkPct(additive, "10=10%")를 calcStats가 (base+flat
    # item matk)에 곱연산으로 적용하도록 새로 연결했다(template.html MATK 계산부,
    # P2-A.5). 값은 변환 없이 그대로("10=10%") 저장 -- consumer가 additive 누적을
    # 이미 담당한다.
    "bMatkRate": ("combat", "matkPct", None,
                  'doc: "bonus bMatkRate,n; Magical attack power + n%" — '
                  '(base+flat matk)*rate/100 실코드 재현, additive stacking parity 확인(status.cpp SCB_MATK, P2-A.5)'),
    # "bonus bUseSPrate,n; SP consumption + n%" — rAthena skill.cpp
    # (skill_get_requirement) 실코드 확인: req.sp=req.sp*dsprate/100(정수 나눗셈),
    # dsprate는 100 기준 `sd->dsprate += val`(status.cpp)로 additive 누적, 0% 하한
    # clamp. 신규 canonical 필드 combat.spCostRatePct(additive, "10=10%")를
    # getSkillSpCost()가 기존 spCostMul(곱연산, db-items.json 실사용 0건 재확인)과는
    # 별개로 곱해 최종 배율을 만든다(P2-A.5). 값은 변환 없이 그대로 저장.
    "bUseSPrate": ("combat", "spCostRatePct", None,
                   'doc: "bonus bUseSPrate,n; SP consumption + n%" — '
                   'dsprate additive 누적 실코드 재현, getSkillSpCost 실코드 재확인(skill.cpp skill_get_requirement, P2-A.5)'),
    "bUseSPRate": ("combat", "spCostRatePct", None,
                   'doc: "bonus bUseSPrate,n" (대소문자 변형) — 위와 동일'),
}

# bAllStats,n -> 6개 스탯 전부 +n (문서: "STR+n, AGI+n, VIT+n, INT+n, DEX+n, LUK+n") —
# 정의 자체가 6개로 펴는 것이므로 "확장"이지 "추측"이 아니다.
ALLSTATS_KEY = "bAllStats"

# bonus2(상수, ENUM, 값) 형태 — 종족/속성 조건부. RC_*/Ele_* enum이 위 표에 있을 때만
# VERIFIED, 없으면 그 인스턴스만 source-needed(전체 combo를 버리지 않음, §14/§19).
VERIFIED_RACE_BONUS2 = {
    # "bonus2 bSubRace,r,x; +x% damage reduction against race r"
    "bSubRace": ("combat", "raceDmgReduce", RACE_ENUM_MAP, 'doc: "bonus2 bSubRace,r,x; +x% damage reduction against race r"'),
    # "bonus2 bAddRace,r,x; +x% physical damage against race r" — P0 raceAtk와 동일 의미.
    "bAddRace": ("combat", "raceAtk", RACE_ENUM_MAP, 'doc: "bonus2 bAddRace,r,x; +x% physical damage against race r"'),
}
VERIFIED_ELEMENT_BONUS2 = {
    # "bonus2 bSubEle,e,x; +x% damage reduction against attack element e"
    "bSubEle": ("combat", "elemReduce", ELEMENT_ENUM_MAP, 'doc: "bonus2 bSubEle,e,x; +x% damage reduction against attack element e"'),
}
# "bonus2 bSPGainRace,r,n; Heals +n SP when killing an enemy of race r with melee" —
# P0의 soulgain 이벤트(카드 onKill, {race,sp})와 트리거·의미가 정확히 같다.
SOULGAIN_RACE_BONUS2 = {
    "bSPGainRace": RACE_ENUM_MAP,
}

# ══ P2-A.4-정정(2026-09-27): bSubRace RC_All -> dmgReduceAll 매핑을 철회했다. ══
# 최초 판정(P2-A.4)은 "종족 필터 없음"이라는 트리거 조건 일치만 보고 SAFE로 승격했으나,
# 독립검증에서 stacking parity를 놓쳤음이 드러났다. rAthena battle.cpp 재확인:
#   race_fix = subrace[targetRace] + subrace[RC_ALL];  (하나로 합산 후 단 한 번 적용)
# 즉 RC_All(-30%)과 특정 종족(+30%)이 공존하면 원작은 0(상쇄)이 된다. 그러나 TextRAG
# applyIncomingItemReduction은 dmgReduceAll과 raceDmgReduce를 순차 곱연산으로 따로
# 적용한다(`result*=(1-all/100)` 다음 `result*=(1-race/100)`) -- 위 예시에서
# result*1.30*0.70=result*0.91(9% 감소)가 되어 원작의 0%와 다르다. RC_All 자체의 항상
# 같은 콤보에 동반되는 RC_Player_Human(identity-mapping-gap)이 어차피 그 콤보들을
# unsupported로 묶어두므로 실질적 unlock 손실은 없다(solo-fix potential 0, P2-A.3부터
# 이미 확인된 값). engine-extension 필요 사항: all+specific을 먼저 합산한 뒤 단 한 번만
# 적용하는 구조로 applyIncomingItemReduction을 바꿔야 한다 -- 이번 정정에서는 구현하지
# 않는다(런타임 코드 동결).
#
# bonus2 bAddClass,c,x -- 최초 판정(P2-A.4)은 Class_All/Class_Boss를 cardAtkPct/
# cardBossAtk로 SAFE 승격했으나, 독립검증에서 scope parity를 놓쳤음이 드러났다. rAthena
# battle.cpp 재확인: addclass/addrace는 `battle_calc_cardfix(attack_type, ...)`를 통해
# 평타(BF_WEAPON, battle_calc_weapon_attack 경로 -- 이 함수 자체가 물리 스킬 데미지도
# 계산한다)와 마법(BF_MAGIC, magic_addclass 별도 누적)에 걸쳐 광범위하게 적용된다. 반면
# TextRAG의 cardAtkPct/cardBossAtk 소비처(getOutgoingAtkPctMul/
# applyOutgoingRaceElemSizeBossAtk)는 P0-C5가 이미 확정한 대로 processTurn()의 "평타
# 블록"에만 연결돼 있고 스킬 데미지 경로에는 전혀 연결되지 않는다 -- 적용범위가 원작보다
# 훨씬 좁다(stacking 자체는 양쪽 다 additive라 일치하지만, scope 불일치가 SAFE 조건
# 하나라도 어기면 금지라는 원칙에 걸린다). engine-extension 필요 사항: 평타+물리
# 스킬(+가능하면 마법 스킬 별도 경로)이 공유하는 physicalClassAtk류 공통 소비처가
# 필요하다 -- 이번 정정에서는 구현하지 않는다.

# census에서 실제 관측됐지만 이번 단계에서 canonical 변환하지 않는 상수 + 그 이유.
# (완전한 목록이 아니어도 된다 — 표에 없는 상수는 전부 자동으로 "알려지지 않은 상수"로
# source-needed 처리되므로, 여기는 "왜 안 되는지"를 남기고 싶은 대표 상수만 적는다.)
UNSUPPORTED_REASONS = {
    "bAspdRate": '"bonus bAspdRate,n; Attack speed + n%" — P0의 flat aspd(스탯포인트류, *20ms)와 단위/의미가 다른 %기반 공격속도 보너스. 대응 vocabulary 없음.',
    # P2-A.5(엔진 확장)에서 bMatkRate 리터럴 1-인자 형태가 VERIFIED_SIMPLE_BONUS로
    # 이동했다(matkPct 신규 canonical 필드, consumer+scope+stacking 3축 확인 완료).
    # 아래는 리터럴 정수로 안 잡히는 나머지 형태(동적 표현식: getequiprefinerycnt/
    # min() 등)에 대해서만 쓰인다 -- 값 평가는 여전히 금지(§11).
    "bMatkRate": '"bonus bMatkRate,min(...)/getequiprefinerycnt(...)" (동적 표현식) — 값을 평가하지 않으므로 unsupported 유지. 리터럴 1-인자 `bonus bMatkRate,n` 형태는 VERIFIED_SIMPLE_BONUS(matkPct) 참조(P2-A.5).',
    # bCastrate 리터럴 1-인자 형태만 VERIFIED_SIMPLE_BONUS로 이동했다(stacking parity
    # 확인 완료, 위 표 참조). 아래는 그 표로 안 잡히는 나머지 형태(스킬 지정 bonus2,
    # 동적 표현식)에 대해서만 여기 reason이 쓰인다.
    "bCastrate": '"bonus2 bCastrate,"SKILL",n;" (스킬 지정 2-인자 형태) — P0 castReduction은 스킬 전체에 일괄 적용되는 값이라 스킬별 캐스팅 소비처가 없음(engine-extension-required, P2-A.4 §10). 리터럴 1-인자 `bonus bCastrate,n` 형태는 VERIFIED_SIMPLE_BONUS 참조.',
    # P2-A.5(엔진 확장)에서 bUseSPrate 리터럴 1-인자 형태가 VERIFIED_SIMPLE_BONUS로
    # 이동했다 -- P2-A.4-정정이 지적한 stacking-scope-mismatch(당시 기존 spCostMul
    # 곱연산 필드를 오재사용해 발생)를 신규 additive 필드 spCostRatePct(getSkillSpCost
    # 실코드 재확인, skill.cpp skill_get_requirement)로 해결했다. 기존 spCostMul은
    # 건드리지 않았고(db-items.json 실사용 0건 재확인), 둘은 getSkillSpCost()에서
    # 별개로 곱해진다. 아래는 동적 표현식 형태에만 쓰인다.
    "bUseSPrate": '"bonus bUseSPrate,getequiprefinerycnt(...)" (동적 표현식) — 값을 평가하지 않으므로 unsupported 유지. 리터럴 1-인자 형태는 VERIFIED_SIMPLE_BONUS(spCostRatePct) 참조(P2-A.5).',
    "bUseSPRate": '"bonus bUseSPrate,..." (대소문자 변형) — bUseSPrate와 동일 사유.',
    # P2-A.4-정정(2026-09-27): bAddClass도 SAFE였다가 취소됐다(scope-mismatch).
    # rAthena battle.cpp 재확인: addclass/addrace는 battle_calc_cardfix(attack_type,...)를
    # 통해 평타(BF_WEAPON -- battle_calc_weapon_attack이 물리 스킬 데미지도 계산)와
    # 마법(BF_MAGIC, magic_addclass 별도)에 걸쳐 광범위하게 적용된다. TextRAG의
    # cardAtkPct/cardBossAtk 소비처는 P0-C5가 이미 확정한 대로 processTurn()의 "평타
    # 블록"에만 연결돼 있어 스킬 데미지 경로를 전혀 커버하지 못한다 -- scope가 원작보다
    # 훨씬 좁음. engine-extension 필요 사항: 평타+물리 스킬(+마법 스킬 별도)이 공유하는
    # 공통 physical/magic class 배율 소비처가 필요하다.
    "bAddClass": '"bonus2 bAddClass,c,x;" — scope 불일치로 SAFE 취소(P2-A.4-정정): rAthena battle_calc_cardfix는 평타+물리 스킬(+마법 스킬 별도)에 광범위하게 적용되는데 TextRAG cardAtkPct/cardBossAtk는 평타 블록에만 연결돼 있음(engine-extension-required). Class_All/Class_Boss 포함 모든 enum 값에 적용.',
    "bSkillAtk": '"bonus2 bSkillAtk,sk,n; Increases damage of skill sk by n%" — 실코드 재확인(ITEM_EFFECT_P0_CLOSEOUT.md: skillDmg 소비처 0건, "명시보류") 결과 canonical-but-runtime-deferred로 확정(P2-A.4 §6).',
    "bAutoSpell": '"bonus3/4 bAutoSpell,sk,y,n;" — 실코드 재확인(_triggerOnHitEvent case autoSpell: `DB.skills[evt.skill]`) 결과 onHit 트리거 자체는 존재하나, rAthena 스킬 ID(예: NJ_HUUJIN)가 TextRAG DB.skills의 어떤 키와도 대응하지 않음(전수 grep 0건) — identity-mapping-gap(P2-A.4 §12, 스킬명 추측 금지).',
    "bAutoSpellWhenHit": '"bonus3 bAutoSpellWhenHit,sk,y,n;" — 실코드 재확인(events.onDamaged는 항상 빈 배열, 집계 코드 자체가 없음, ITEM_EFFECT_P0_CLOSEOUT.md 재확인) 결과 trigger-model-missing으로 확정(P2-A.4 §13). bAutoSpell과 별개로, 이쪽은 스킬 식별 문제 이전에 트리거 자체가 없음.',
    "bAddEff": '"bonus2/3 bAddEff,eff,n; n/100% chance..." — 실코드 재확인(_triggerOnHitEvent case inflict: stun/confusion/random_debuff 3종 고정 필드만 존재, turns도 하드코딩) 결과 Eff_Stun/Eff_Confusion 리터럴 2-인자 형태는 이론상 안전할 수 있으나 콤보 데이터에 실제 사례가 0건이고, 실제 관측된 Eff_Stone/Eff_Curse/Eff_Blind 등은 그 3종에 없어 engine-extension-required(P2-A.4 §14). 3-인자 ATF 공격타입 필터 형태는 그 개념 자체가 P0에 없어 항상 미지원.',
    "bAddEffWhenHit": '"bonus2 bAddEffWhenHit,eff,n;" — bAutoSpellWhenHit과 동일 사유(events.onDamaged 집계 코드 없음) — trigger-model-missing(P2-A.4 §15).',
    "bResEff": '"bonus2 bResEff,eff,n; n/100% tolerance..." — 실코드 재확인(isStatusImmune은 이진 면역만, `cardImmune` 배열에 있으면 완전 면역/없으면 0% — 부분 저항 %를 표현할 자료구조 자체가 없음) 결과 engine-extension-required로 확정(P2-A.4 §16).',
    "bAddMonsterDropItem": '"bonus2 bAddMonsterDropItem,iid,n;" — P0 dropBonus는 기존 드롭 테이블 가산일 뿐 "신규 드롭 추가" 메커닉이 P0에 없음.',
    "bAddSize": '"bonus2 bAddSize,s,x;" — P0에 사이즈 조건부 공격 vocabulary 없음(sizeAtk는 이미 카드 사이즈용이나 rAthena Size_* enum 대조 전).',
    "bAddDefMonster": '"bonus2 bAddDefMonster,mid,x;" — 몬스터 ID 단위 조건, P0 vocabulary 없음.',
    "bLongAtkRate": '"bonus bLongAtkRate,n; Increases damage of long ranged attacks by n%" — 실코드 재확인(calcStats: `isRangedWeapon = [\'활\',\'악기\',\'채찍\'].includes(p.weaponType)` 구조 데이터는 존재하나, 이 값을 조건으로 ATK%를 가산하는 기존 소비처가 없음) — engine-extension-required이나 필요 데이터가 이미 있어 저복잡도(P2-A.4 §18, engine-extension-backlog 참조).',
    "bSkillHeal2": '"bonus2 bSkillHeal2,sk,n;" — P0 healBoost 자체가 의미 미확정 상태(원작검증필요).',
    "bHealPower": '"bonus bHealPower,n;" — 위와 동일 사유(healBoost 계열).',
    "bHealPower2": '"bonus bHealPower2,n;" — 위와 동일 사유.',
    "bAddItemHealRate": '"bonus bAddItemHealRate,n;" — 위와 동일 사유(healBoost 계열).',
    "bComaRace": '"bonus2 bComaRace,r,n;" — 즉사류 메커닉, P0 vocabulary 없음.',
    "bMagicDamageReturn": '"bonus bMagicDamageReturn,n;" — 반사 메커닉, P0 vocabulary 없음.',
    "bShortWeaponDamageReturn": '"bonus bShortWeaponDamageReturn,n;" — 반사 메커닉, P0 vocabulary 없음.',
    "bBreakWeaponRate": '"bonus bBreakWeaponRate,n;" — 파괴 메커닉, P0 vocabulary 없음.',
    "bBreakArmorRate": '"bonus bBreakArmorRate,n;" — 파괴 메커닉, P0 vocabulary 없음.',
    "bExpAddRace": '"bonus2 bExpAddRace,r,x;" — P0에 종족별 경험치 가산 vocabulary 없음.',
    "bDefEle": '"bonus bDefEle,e;" — 방어 속성 자체 변경, P0 armorElement와 유사하나 그 필드도 이미 P0-C3에서 소비처 없음으로 보류됨.',
    "bPerfectHitAddRate": '"bonus bPerfectHitAddRate,n;" — P0에 대응 vocabulary 없음.',
    "bNoCastCancel": '"bonus bNoCastCancel;" — 인자 없는 플래그형 보너스, P0 vocabulary 없음.',
    "bSpeedRate": '"bonus bSpeedRate,n;" — 이동속도, P0 vocabulary 없음.',
    "bHPRegenRate": '"bonus2 bHPRegenRate,n,t; Gain n HP every t milliseconds" — P0 hpRegenPct(%가산)와 완전히 다른 형태(고정 HP를 고정 주기로).',
    "bSPDrainValue": '"bonus bSPDrainValue,n; Heals +n SP with a normal attack" — P0에 평타 SP회복 vocabulary 없음.',
    "bAtk": '"bonus bAtk,n; ATK + n (unofficial)" — 문서 자체가 "unofficial" 표기, bBaseAtk와의 관계 불명확.',
    "bMatk": '"bonus bMatk,n; Magical attack power + n" — P0 matk는 파생값이라 직접 가산 지점 불명확(bonusMAtk와 동일 의미인지 미확정).',
    "bAddEle": '"bonus2 bAddEle,e,x; +x% physical damage vs attack element e" — P0에 "공격 시 속성별 가산" vocabulary 없음(elemAtk는 카드 elemAtk와 트리거가 다름, 대조 전).',
    # P2-A.4 신규 — 이 3개는 이전 fallback 버그(bonus3-5만 처리) 때문에 "bonus"/"bonus2"로
    # 잘못 라벨링됐던 게 아니라 원래도 정확히 첫 단어로 잡혔다(§124는 라벨을 더 정밀하게
    # 바꾸지 않는다 — 이미 정확함). autobonus/autobonus2는 내부에 중첩 스크립트 문자열을
    # 담고 있어(예: `autobonus "{ bonus bFlee,20; }",200,10000,...`) 그 안의 실제 상수를
    # 추출하려면 이번 단계 금지 대상인 중첩 스크립트 인터프리터가 필요하다 — 상수 추출은
    # 최상위 단어까지만(§16/§20), 내부는 rawStatement 보존만으로 그친다. 어차피 그
    # 메커닉(공격 시 확률적 자기 버프 스크립트 실행) 자체가 P0에 없어 내부를 풀어도
    # engine-extension-required는 그대로다.
    "autobonus": '"autobonus <script>,rate,ms,flag,<icon-script>;" — 공격 시 확률적 자기 버프 스크립트 실행 메커닉 자체가 P0에 없음(중첩 스크립트 내부는 파싱하지 않음, §16/§20).',
    "autobonus2": '"autobonus2 <script>,rate,ms,flag,<icon-script>;" — 위와 동일 사유(피격 시 버전).',
    "skill": '"skill "SKILL_ID",lv;" — bonus 계열이 아닌 별도 스크립트 명령(직접 스킬 부여). P0 grantSkill과 트리거는 유사하나 rAthena 스킬 ID(예: WZ_FROSTNOVA)가 TextRAG DB.skills 키와 대응하지 않음 — bAutoSpell과 동일한 identity-mapping-gap.',
    "bDelayRate": '"bonus bDelayRate,n; Attack delay + n%" — P0에 공격 딜레이 %가산 vocabulary 없음(aspd와 별개 필드).',
}


def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ══════════════════════════════════════════════
# 안전한 statement 분리기. rAthena 스크립트 전체 인터프리터를 만들지 않는다(§16) —
# 오직 "최상위 무조건 문장" vs "if(...)...else...) 조건부 블록(raw로만 보존)"만
# 구분한다. 중첩 조건/조건 없는 단일 문장 body 모두 문자 단위로 안전하게 처리한다.
# ══════════════════════════════════════════════
def split_statements(script):
    s = re.sub(r"//.*", "", script or "")  # 라인 주석 제거(안전 — 문자열 리터럴 안 // 는 거의 없음)
    n = len(s)
    i = 0

    def skip_ws(i):
        while i < n and s[i] in " \t\r\n":
            i += 1
        return i

    def read_balanced_parens(i):
        depth = 0
        while i < n:
            c = s[i]
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    return i + 1
            elif c in "\"'":
                q = c
                i += 1
                while i < n and s[i] != q:
                    i += 1
            i += 1
        return i

    def read_stmt_or_block(i):
        i = skip_ws(i)
        if i < n and s[i] == "{":
            depth = 0
            start = i
            while i < n:
                c = s[i]
                if c == "{":
                    depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        return s[start:i + 1], i + 1
                elif c in "\"'":
                    q = c
                    i += 1
                    while i < n and s[i] != q:
                        i += 1
                i += 1
            return s[start:], i
        start = i
        while i < n and s[i] != ";":
            if s[i] in "\"'":
                q = s[i]
                i += 1
                while i < n and s[i] != q:
                    i += 1
            i += 1
        if i < n:
            i += 1
        return s[start:i], i

    def is_word_at(i, word):
        if s[i:i + len(word)] != word:
            return False
        j = i + len(word)
        return j >= n or not (s[j].isalnum() or s[j] == "_")

    unconditional, conditional = [], []
    while i < n:
        i = skip_ws(i)
        if i >= n:
            break
        if is_word_at(i, "if"):
            cond_start = i
            i += 2
            i = skip_ws(i)
            if i < n and s[i] == "(":
                i = read_balanced_parens(i)
            _, i = read_stmt_or_block(i)
            i = skip_ws(i)
            if is_word_at(i, "else"):
                i += 4
                _, i = read_stmt_or_block(i)
            conditional.append(s[cond_start:i].strip())
            continue
        start = i
        while i < n and s[i] != ";":
            if s[i] in "\"'":
                q = s[i]
                i += 1
                while i < n and s[i] != q:
                    i += 1
            i += 1
        if i < n:
            i += 1
        stmt = s[start:i].strip()
        if stmt:
            unconditional.append(stmt)
    return unconditional, conditional


_BONUS_RE = re.compile(r"^bonus\s+(\w+)\s*,\s*(-?\d+)\s*;?\s*$")
_BONUS2_RE = re.compile(r'^bonus2\s+(\w+)\s*,\s*"?([A-Za-z_]\w*)"?\s*,\s*(-?\d+)\s*;?\s*$')


def parse_statement(stmt):
    """단일 무조건 statement -> (kind, payload) | None.
    kind: 'effect'(canonical 성공) | 'unsupported'(알거나 모르는 이유로 미지원) | 'skip'(빈 문장 등)"""
    stmt = stmt.strip().rstrip(";").strip()
    if not stmt:
        return None

    m = _BONUS_RE.match(stmt + ";")
    if m:
        const, val = m.group(1), int(m.group(2))
        if const == ALLSTATS_KEY:
            return ("effect_multi", [
                {"type": "stat", "key": k, "subKey": None, "value": val,
                 "reason": 'doc: "bonus bAllStats,n; STR+n,...,LUK+n" (6개 스탯으로 확장)'}
                for k in ("str", "agi", "vit", "int", "dex", "luk")
            ])
        if const in VERIFIED_SIMPLE_BONUS:
            etype, ekey, transform, reason = VERIFIED_SIMPLE_BONUS[const]
            v = transform(val) if transform else val
            return ("effect", {"type": etype, "key": ekey, "subKey": None, "value": v, "reason": reason})
        reason = UNSUPPORTED_REASONS.get(const, f'알려지지 않은 rAthena bonus 상수(rawScript만 보존): {const}')
        return ("unsupported", {"rawStatement": stmt, "constant": const, "reason": reason})

    m = _BONUS2_RE.match(stmt + ";")
    if m:
        const, enum_val, val = m.group(1), m.group(2), int(m.group(3))
        # P2-A.4-정정(2026-09-27): bSubRace,RC_All -> dmgReduceAll 매핑과 bAddClass ->
        # atkPct/bossAtk 매핑을 철회했다. 둘 다 "트리거 조건 일치"만 확인하고 stacking/
        # scope parity를 놓쳐 SAFE로 잘못 승격했던 것 -- 근거는 위 UNSUPPORTED_REASONS
        # 진입부(bSubRace/bAddClass 항목)와 COMBO_EFFECT_SUPPORT_AUDIT.md §11(정정
        # 섹션) 참조. RC_All/Class_All/Class_Boss 모두 이제 아래 VERIFIED_RACE_BONUS2/
        # UNSUPPORTED_REASONS의 일반 경로를 그대로 타 unsupported로 남는다.
        if const == "bSubRace" and enum_val == "RC_All":
            return ("unsupported", {"rawStatement": stmt, "constant": const,
                                     "reason": 'RC_All -- dmgReduceAll과 트리거는 같지만 stacking parity 불일치로 SAFE 취소(P2-A.4-정정): '
                                                'rAthena battle.cpp는 subrace[targetRace]+subrace[RC_ALL]을 합산 후 단 한 번만 적용하지만 '
                                                'TextRAG는 dmgReduceAll/raceDmgReduce를 순차 곱연산으로 따로 적용해 결과가 달라짐(engine-extension-required)'})
        if const in VERIFIED_RACE_BONUS2:
            etype, ekey, enum_map, reason = VERIFIED_RACE_BONUS2[const]
            if enum_val in enum_map:
                return ("effect", {"type": etype, "key": ekey, "subKey": enum_map[enum_val], "value": val, "reason": reason})
            return ("unsupported", {"rawStatement": stmt, "constant": const,
                                     "reason": f'종족 enum "{enum_val}"이 TextRAG 확인된 10종(db-monsters.json)에 없음 — 추측 금지'})
        if const in VERIFIED_ELEMENT_BONUS2:
            etype, ekey, enum_map, reason = VERIFIED_ELEMENT_BONUS2[const]
            if enum_val in enum_map:
                return ("effect", {"type": etype, "key": ekey, "subKey": enum_map[enum_val], "value": val, "reason": reason})
            return ("unsupported", {"rawStatement": stmt, "constant": const,
                                     "reason": f'속성 enum "{enum_val}"이 TextRAG 확인된 속성 목록에 없음 — 추측 금지'})
        if const in SOULGAIN_RACE_BONUS2:
            enum_map = SOULGAIN_RACE_BONUS2[const]
            if enum_val in enum_map:
                return ("effect", {"type": "event", "key": "soulgain", "subKey": enum_map[enum_val], "value": val,
                                    "reason": 'doc: "bonus2 bSPGainRace,r,n; Heals +n SP when killing race r" == P0 soulgain 이벤트와 동일 트리거/의미'})
            return ("unsupported", {"rawStatement": stmt, "constant": const,
                                     "reason": f'종족 enum "{enum_val}"이 TextRAG 확인된 10종에 없음 — 추측 금지'})
        reason = UNSUPPORTED_REASONS.get(const, f'알려지지 않은 rAthena bonus2 상수(rawScript만 보존): {const}')
        return ("unsupported", {"rawStatement": stmt, "constant": const, "reason": reason})

    # bonus/bonus2/bonus3/bonus4/bonus5(동적 표현식·인자 없는 플래그형 등 위 정규식에
    # 안 걸린 나머지 형태), autobonus, 함수 호출식(getequiprefinerycnt 등) 전부 여기로 —
    # 이번 단계에서 파싱하지 않는다(§16/§22). rawStatement만 보존. bonus/bonus2/3/4/5
    # 형태는 두 번째 단어(실제 bonus 상수, 예: bCastrate/bAutoSpellWhenHit)를 constant로
    # 남긴다 — UNSUPPORTED_REASONS 조회와 감사 보고서 가독성 모두 "bonus"/"bonus2"보다
    # 그게 더 유용하다(P2-A.4 §124: 상수명 추출 정밀화, 동적 표현식 자체는 절대 평가하지
    # 않는다 — 이미 VERIFIED_SIMPLE_BONUS에 있는 상수라도 이 분기에 도달했다는 것 자체가
    # 정규식이 리터럴 정수로 못 읽었다는 뜻이므로, 그 인스턴스는 항상 unsupported로 남는다).
    # autobonus/autobonus2/skill처럼 "bonus"로 시작하지 않는 명령은 원래도 아래 generic
    # 분기가 첫 단어를 그대로 잡아 이미 정확했다(변경 없음).
    bonus_word_m = re.match(r"^(bonus[2-5]?)\s+(\w+)", stmt)
    if bonus_word_m:
        const = bonus_word_m.group(2)
    else:
        const_m = re.match(r"^(\w+)", stmt)
        const = const_m.group(1) if const_m else stmt[:20]
    reason = UNSUPPORTED_REASONS.get(const, f'복합 인자 또는 함수형 표현(rawScript만 보존): {stmt[:60]}')
    return ("unsupported", {"rawStatement": stmt, "constant": const, "reason": reason})


def build_textrag_aegis_index(textrag_items):
    """AegisName -> TextRAG item key. 충돌(2개 이상 키가 같은 _aegis)은 별도 집합으로
    분리해 자동 해결하지 않는다(§5 fuzzy/추측 금지 원칙 — 어느 쪽이 정본인지 이 단계에서
    판단하지 않는다)."""
    by_aegis = {}
    for key, it in textrag_items.items():
        if isinstance(it, dict) and "_aegis" in it:
            by_aegis.setdefault(it["_aegis"], []).append(key)
    unique = {a: ks[0] for a, ks in by_aegis.items() if len(ks) == 1}
    ambiguous = {a: ks for a, ks in by_aegis.items() if len(ks) > 1}
    return unique, ambiguous


AMMO_AEGIS_TYPE = "Ammo"

# ══════════════════════════════════════════════
# P2-A.6 — identity collision 감사(동일 textragKey에 복수 rAthena AegisName이 매핑된 경우).
#
# combo-item-identity.json은 각 AegisName을 독립적으로 하나의 textragKey에 매핑한다
# (P2-A.1 §16: fuzzy match 금지, 1:1 exact match만). 그런데 rAthena 자체에 "이름이 같고
# 스탯도 동일하되 슬롯 유무만 다른" 레거시 아이템 쌍이 존재해서(예: Mage_Coat/Mage_Coat_),
# 서로 다른 AegisName 두 개가 TextRAG에서는 같은 표시명 하나로 합쳐진다. 이 경우 콤보
# variant 2개가 "TextRAG identity 기준"으로는 완전히 같은 요구 아이템 집합이 되어, 실제
# 게임에서는 있을 수 없는 "두 alias를 동시에 장착"한 것처럼 콤보 매처가 착각해 원작에 없는
# 이중 적용을 만들 수 있다(P2-B1이 처음 이 문제를 놓쳤다 -- P2-A.6에서 정정).
#
# 아래 표는 combo-item-identity.json 전체를 텍스트 역매핑해 발견한 모든 충돌(6개, 전수)에
# 대해 rAthena db/pre-re/item_db_equip.yml(pin e985006171d2eb320ee512a653f4c83aea3d81b6)
# 실코드를 직접 대조한 결과다 -- 추측이 아니라 각 pair의 Locations/Jobs/Defense·Attack/
# Script가 전부 동일하고 Slots(무/유 1슬롯)만 다름을 확인했다(=같은 장비 슬롯을 두고 소켓
# 유무만 다른 동일 아이템의 두 DB 레코드 -- 원작에서 동시 장착 자체가 불가능한 exclusive
# alias). 이 표에 없는 신규 충돌이 나타나면 audit_identity_collision_coverage()가 즉시
# 실패한다(추측으로 자동 판정하지 않는다 -- 새 충돌은 반드시 같은 방식으로 개별 조사해
# 이 표에 근거와 함께 등재한 뒤에만 처리한다).
IDENTITY_COLLISION_JUDGMENTS = {
    "매직코트": {
        "aegisNames": frozenset({"Mage_Coat", "Mage_Coat_"}),
        "judgment": "exclusive-alias",
        "evidence": "item_db_equip.yml: 둘 다 Type=Armor, Locations.Armor=true, Jobs 동일"
                    "(Mage/Sage/SoulLinker/Wizard), Defense=5, Script(bMdef+5,bInt+1) 동일 --"
                    " 차이는 Mage_Coat_만 Slots:1(소켓 버전). 같은 방어구 슬롯이라 동시 장착 불가.",
    },
    "닌자슈츠": {
        "aegisNames": frozenset({"Ninja_Suit", "Ninja_Suit_"}),
        "judgment": "exclusive-alias",
        "evidence": "item_db_equip.yml: 둘 다 Type=Armor, Locations.Armor=true, Jobs 동일"
                    "(Assassin/Ninja/Rogue/Thief), Defense=7, Script(bAgi+1,bMdef+3) 동일 --"
                    " 차이는 Ninja_Suit_만 Slots:1. 같은 방어구 슬롯이라 동시 장착 불가.",
    },
    "아머": {
        "aegisNames": frozenset({"Padded_Armor", "Padded_Armor_"}),
        "judgment": "exclusive-alias",
        "evidence": "item_db_equip.yml: 둘 다 Type=Armor, Locations.Armor=true, Jobs 동일"
                    "(9개 직업), Defense=7 동일 -- 차이는 Padded_Armor_만 Slots:1."
                    " 같은 방어구 슬롯이라 동시 장착 불가.",
    },
    "서바이버로드": {
        "aegisNames": frozenset({"Survival_Rod_", "Survival_Rod2_"}),
        "judgment": "exclusive-alias",
        "evidence": "item_db_equip.yml: 둘 다 Type=Weapon/SubType=Staff, Locations.Right_Hand=true,"
                    " Jobs 동일(7개 마법계열), Attack=50/Range=1/WeaponLevel=3/EquipLevelMin=24"
                    " 전부 동일, 둘 다 Slots:1(차이 없음 -- 완전한 중복 DB 레코드)."
                    " 같은 무기 슬롯이라 동시 장착 불가.",
    },
    "런닝셔츠": {
        "aegisNames": frozenset({"Undershirt", "Undershirt_"}),
        "judgment": "exclusive-alias",
        "evidence": "item_db_equip.yml: 둘 다 Type=Armor, Locations.Garment=true, Defense=2,"
                    " Script(bMdef+1) 동일 -- 차이는 Undershirt_만 Slots:1."
                    " 같은 걸칠것(망토) 슬롯이라 동시 장착 불가.",
    },
    "롱혼": {
        "aegisNames": frozenset({"Long_Horn", "Long_Horn_M"}),
        "judgment": "exclusive-alias",
        "evidence": "item_db_equip.yml: 둘 다 Type=Weapon/SubType=1hSpear, Locations.Right_Hand=true,"
                    " Jobs 동일(Crusader/Knight/Swordman), Attack=150/Range=3/WeaponLevel=4 동일 --"
                    " Long_Horn_M만 Trade 제한 플래그(결혼 시스템 지급용 non-tradeable 사본으로 추정)."
                    " 같은 무기 슬롯이라 동시 장착 불가. 현재 참조 콤보(entry 2/3)가 모두"
                    " unsupported라 runtime 영향은 없지만, 향후 verified로 바뀔 경우를 대비해 등재.",
    },
}


def compute_identity_collisions(identity_verified):
    """identity_verified(aegisName -> textragKey)를 역매핑해 하나의 textragKey에 복수
    AegisName이 매핑된 경우만 모은다. 이 자체가 "충돌"이며, 이후 detect_identity_collisions가
    실제 콤보 variant 조합에 나타나는지 확인한다."""
    reverse = {}
    for aegis, key in identity_verified.items():
        reverse.setdefault(key, set()).add(aegis)
    return {k: v for k, v in reverse.items() if len(v) > 1}


def audit_identity_collision_coverage(identity_verified):
    """새로 나타난(등재 안 된) identity collision을 즉시 실패시킨다 -- §추측 금지: 새 충돌은
    이 스크립트가 자동으로 병합 판정하지 않고, 반드시 IDENTITY_COLLISION_JUDGMENTS에 근거와
    함께 사람이 먼저 등재해야 한다."""
    collisions = compute_identity_collisions(identity_verified)
    unaudited = []
    for key, aegis_set in collisions.items():
        judgment = IDENTITY_COLLISION_JUDGMENTS.get(key)
        if not judgment or not aegis_set.issubset(judgment["aegisNames"]):
            unaudited.append((key, sorted(aegis_set)))
    if unaudited:
        joined = "; ".join(f"{k} <- {v}" for k, v in unaudited)
        raise ValueError(
            f"새 identity collision이 IDENTITY_COLLISION_JUDGMENTS에 등재되지 않음"
            f"(추측 병합 금지, 개별 조사 후 등재 필요): {joined}"
        )
    return collisions


def detect_identity_collisions(entry_combos):
    """같은 source entry 안에서 만들어진 variant들(entry_combos) 중, requiredItems가
    TextRAG identity(textragKey) 기준으로 완전히 동일해진 그룹을 찾는다. 그 동일성이
    IDENTITY_COLLISION_JUDGMENTS에 'exclusive-alias'로 등재된 aegisName 쌍 때문일 때만
    인정한다(§금지: textragKey가 우연히 같다는 이유만으로 일반 dedup 금지) -- 등재되지
    않은 이유로 우연히 같아진 경우는 건드리지 않는다(발생 시 이미 audit_identity_
    collision_coverage가 별도로 잡아낸다).

    가장 낮은 variant_idx를 canonical로 삼아 verified를 유지하고, 나머지(duplicate)는
    status가 verified였을 때만 runtime-blocked로 낮춘다(승격 목적 조작이 아니라, 원작에서
    나타날 수 없는 이중 적용을 막는 되돌림). 모든 관련 variant에 identityCollision
    메타데이터를 남긴다(canonical/duplicate 관계없이, 회귀 감사용)."""
    groups = {}
    for c in entry_combos:
        keys = tuple(ri["textragKey"] for ri in c["requiredItems"])
        if any(k is None for k in keys):
            continue  # 미해결 identity -- 이미 source-needed, 충돌 판정 대상 아님
        groups.setdefault(keys, []).append(c)

    for keys, members in groups.items():
        if len(members) < 2:
            continue

        n_items = len(keys)
        collision_keys_used = set()
        all_slots_ok = True
        for slot in range(n_items):
            aegis_at_slot = {m["requiredItems"][slot]["aegisName"] for m in members}
            if len(aegis_at_slot) == 1:
                continue  # 이 슬롯은 모든 variant가 같은 aegis -- 충돌 아님
            judgment = IDENTITY_COLLISION_JUDGMENTS.get(keys[slot])
            if not judgment or judgment["judgment"] != "exclusive-alias" or not aegis_at_slot.issubset(judgment["aegisNames"]):
                all_slots_ok = False
                break
            collision_keys_used.add(keys[slot])
        if not all_slots_ok or not collision_keys_used:
            continue

        canonical = members[0]  # entry_combos는 variant_idx 오름차순으로 생성됨
        member_ids = [m["id"] for m in members]
        for m in members:
            role = "canonical" if m is canonical else "duplicate"
            m["identityCollision"] = {
                "collisionTextragKeys": sorted(collision_keys_used),
                "role": role,
                "canonicalId": canonical["id"],
                "memberIds": member_ids,
            }
            if role == "duplicate" and m["status"] == "verified":
                m["status"] = "runtime-blocked"
                m["statusReasons"] = m["statusReasons"] + [
                    f"identity collision: {canonical['id']}와 requiredItems가 TextRAG identity"
                    f" 기준 완전히 동일(원작에서는 같은 장비 슬롯의 exclusive alias --"
                    f" IDENTITY_COLLISION_JUDGMENTS 참조). 원작에 없는 이중 적용을 막기 위해"
                    f" canonical만 verified로 두고 이 variant는 runtime-blocked."
                ]


def load_identity_verified_map(identity_map):
    """P2-A.1 combo-item-identity.json에서 status=="verified" 항목만 뽑는다.
    ambiguous/unresolved-existing/missing은 절대 자동 선택하지 않는다(§16)."""
    if not identity_map:
        return {}
    return {
        it["aegisName"]: it["textragKey"]
        for it in identity_map.get("items", [])
        if it.get("status") == "verified" and it.get("textragKey")
    }


def resolve_item(aegis_name, unique_index, ambiguous_index, rathena_lookup, identity_verified=None):
    entry = {
        "aegisName": aegis_name,
        "rathenaItemId": None,
        "rathenaName": None,
        "textragKey": None,
        "resolved": False,
        "ambiguousTextragKeys": None,
        "isAmmo": False,
    }
    rinfo = rathena_lookup.get(aegis_name)
    if rinfo:
        entry["rathenaItemId"] = rinfo.get("id")
        entry["rathenaName"] = rinfo.get("name")
        entry["isAmmo"] = rinfo.get("type") == AMMO_AEGIS_TYPE
    identity_verified = identity_verified or {}
    if aegis_name in identity_verified:
        # 1순위: P2-A.1에서 증거 기반으로 확정한 identity map
        entry["textragKey"] = identity_verified[aegis_name]
        entry["resolved"] = True
    elif aegis_name in unique_index:
        # 2순위(fallback): 기존 _aegis exact-match
        entry["textragKey"] = unique_index[aegis_name]
        entry["resolved"] = True
    elif aegis_name in ambiguous_index:
        entry["ambiguousTextragKeys"] = ambiguous_index[aegis_name]
    return entry


def make_combo_id(entry_idx, variant_idx):
    return f"rathena-pre-{entry_idx:04d}-{variant_idx:02d}"


def canonicalize(source_body, unique_index, ambiguous_index, rathena_lookup, identity_verified=None):
    combos = []
    for entry_idx, entry in enumerate(source_body, 1):
        combo_list = entry.get("Combos") or []
        script = entry.get("Script") or ""
        unconditional, conditional_raw = split_statements(script)

        effects, unsupported_effects = [], []
        for stmt in unconditional:
            parsed = parse_statement(stmt)
            if parsed is None:
                continue
            kind, payload = parsed
            if kind == "effect":
                effects.append(payload)
            elif kind == "effect_multi":
                effects.extend(payload)
            elif kind == "unsupported":
                unsupported_effects.append(payload)

        entry_combos = []
        for variant_idx, combo in enumerate(combo_list, 1):
            # §32: 동일 아이템 중복 요구 가능성 — Set으로 바꾸지 않고 원본 순서/중복 그대로 보존.
            required_aegis = combo.get("Combo") or []
            required_items = [
                resolve_item(a, unique_index, ambiguous_index, rathena_lookup, identity_verified)
                for a in required_aegis
            ]

            any_unresolved = any(not r["resolved"] for r in required_items)
            any_ambiguous = any(r["ambiguousTextragKeys"] for r in required_items)
            any_ammo = any(r["isAmmo"] for r in required_items)

            if any_unresolved or any_ambiguous:
                status = "source-needed"
                status_reasons = ["필요 아이템 중 TextRAG 매핑이 없거나 모호함(추측 매핑 금지)"]
            elif unsupported_effects and effects:
                status = "unsupported"  # partial: 일부만 지원(§24 — verified로 뭉개지 않음)
                status_reasons = ["일부 효과만 canonical 변환됨 — effects/unsupportedEffects 분리 참조"]
            elif unsupported_effects and not effects:
                status = "unsupported"
                status_reasons = ["모든 효과가 canonical 변환 불가(unsupportedEffects 참조)"]
            elif conditional_raw:
                status = "source-needed"
                status_reasons = ["조건부(if/else) 구간이 있어 canonical 변환에서 제외됨(rawScript/conditionalRaw 참조)"]
            else:
                status = "verified"
                status_reasons = []

            if any_ammo and status == "verified":
                status = "runtime-blocked"
                status_reasons = ["ammo(화살 등) 포함 combo — TextRAG는 activeAmmo를 명시적으로 관리하지 않고 인벤토리 첫 ammo를 쓰는 구조라 아직 활성화 불가"]

            entry_combos.append({
                "id": make_combo_id(entry_idx, variant_idx),
                "source": {"system": "rathena", "mode": "pre-re", "entry": entry_idx, "variant": variant_idx},
                "requiredItems": required_items,
                "rawScript": script,
                "conditionalRaw": conditional_raw,
                "effects": effects,
                "unsupportedEffects": unsupported_effects,
                "status": status,
                "statusReasons": status_reasons,
                "identityCollision": None,
            })

        # P2-A.6: 같은 entry 안의 variant들만 비교 대상이다(source entry 단위 일반 dedup이
        # 아니라, 이 entry가 우연히 만든 identity 충돌만 국소적으로 본다).
        detect_identity_collisions(entry_combos)
        combos.extend(entry_combos)
    return combos


def main():
    if not COMBOS_YML.exists():
        print(f"ERROR: 원본 파일이 없습니다: {COMBOS_YML}", file=sys.stderr)
        sys.exit(1)

    source_data = load_yaml(COMBOS_YML)
    body = source_data.get("Body") or []
    rathena_lookup = load_json(AEGIS_LOOKUP_JSON) if AEGIS_LOOKUP_JSON.exists() else {}
    textrag_items = load_json(TEXTRAG_ITEMS_JSON)
    unique_index, ambiguous_index = build_textrag_aegis_index(textrag_items)
    identity_map = load_json(IDENTITY_MAP_JSON) if IDENTITY_MAP_JSON.exists() else None
    identity_verified = load_identity_verified_map(identity_map)
    # P2-A.6: 새로 나타난(등재 안 된) identity collision은 여기서 즉시 실패한다 --
    # canonicalize()가 조용히 넘기지 않도록 먼저 전수 감사한다.
    identity_collisions = audit_identity_collision_coverage(identity_verified)

    combos = canonicalize(body, unique_index, ambiguous_index, rathena_lookup, identity_verified)

    total_variants = len(combos)
    status_counts = {}
    for c in combos:
        status_counts[c["status"]] = status_counts.get(c["status"], 0) + 1
    identity_collision_groups = sorted({
        c["identityCollision"]["canonicalId"] for c in combos if c["identityCollision"]
    })

    out = {
        "meta": {
            "sourceSystem": "rathena",
            "mode": "pre-re",
            "sourceFile": "source/reference/rathena-pre-re/item_combos.yml",
            "sourceCommit": "e985006171d2eb320ee512a653f4c83aea3d81b6",
            "sourceBlobSha": "f720ec0de4a0cacaf0131c9fad3938aff7ba280a",
            "totalSourceEntries": len(body),
            "totalVariants": total_variants,
            "statusCounts": status_counts,
            "identityMapUsed": IDENTITY_MAP_JSON.exists(),
            "identityVerifiedItemCount": len(identity_verified),
            # P2-A.6: textragKey 충돌(복수 AegisName -> 1개 textragKey) 전수 + 실제 콤보
            # variant에 나타나 canonical/duplicate로 해소된 그룹 수.
            "identityCollisionKeys": sorted(identity_collisions.keys()),
            "identityCollisionGroupCount": len(identity_collision_groups),
        },
        "combos": combos,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"OK - wrote {OUT_JSON} ({len(body)} source entries, {total_variants} variants)")
    print("status counts:", status_counts)
    print(f"identity collision keys audited: {len(identity_collisions)}, groups resolved in combos: {len(identity_collision_groups)}")
    print(f"identity map verified items used: {len(identity_verified)}")


if __name__ == "__main__":
    main()
