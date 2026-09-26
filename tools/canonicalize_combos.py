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
    "bCastrate": ("combat", "castReduction", lambda v: -v / 100.0,
                  'doc: "bonus bCastrate,n; Increases/decreases variable cast time by n%" — '
                  'fraction=-n/100, calcStats castReduction 실코드 재확인(P2-A.4 §9)'),
    "bCastRate": ("combat", "castReduction", lambda v: -v / 100.0,
                  'doc: "bonus bCastrate,n" (대소문자 변형) — 위와 동일'),
    # "bonus bUseSPrate,n; SP consumption + n%" — 실코드 재확인(getSkillSpCost:
    # `baseCost*mul`, 아이템 파서: `fx.combat.spCostMul*=Number(it.spCostMul)`) 결과
    # cardSpCostMul은 이미 곱연산 배율(기본값 1)이므로 n% -> (100+n)/100 배율 변환이
    # 정확히 대응한다(P2-A.4 §11).
    "bUseSPrate": ("combat", "spCostMul", lambda v: 1 + v / 100.0,
                   'doc: "bonus bUseSPrate,n; SP consumption + n%" — '
                   'multiplier=1+n/100, getSkillSpCost 실코드 재확인(P2-A.4 §11)'),
    "bUseSPRate": ("combat", "spCostMul", lambda v: 1 + v / 100.0,
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

# ══ P2-A.4 신규 ══
# bonus2 bSubRace,RC_All,x — RC_All(전종족)은 RACE_ENUM_MAP(db-monsters.json 10종)에
# 없지만, "종족 필터 없는 전체 피해 감소"라는 의미 자체가 P0 dmgReduceAll
# (applyIncomingItemReduction: `if(all) result*=(1-all/100)`, 종족 조건 없음)과
# 트리거 조건이 정확히 일치한다(실코드 재확인, P2-A.4 §17). RC_Player_Human 등 다른
# 미등재 enum은 여전히 대응 소비처가 없어 UNSUPPORTED_REASONS로 간다(TextRAG 전투
# 대상은 항상 몬스터이며 "플레이어 종족"이라는 개념 자체가 없음).
SUBRACE_TO_ALL_KEY = {"RC_All": ("combat", "dmgReduceAll")}

# bonus2 bAddClass,c,x — 실제 콤보 데이터에 관측된 값은 Class_All뿐이었다(census
# 재확인, P2-A.4 §8). Class_All은 대상 필터가 없는 P0 cardAtkPct(getOutgoingAtkPctMul,
# `1+(cardAtkPct||0)/100`, 종족/보스 구분 없이 전체 적용)와 정확히 같은 의미다.
# Class_Boss는 실 데이터엔 없으나 cardBossAtk(applyOutgoingRaceElemSizeBossAtk,
# target.isMvp일 때만 가산)와 트리거 조건이 정확히 일치해 향후 대비로 함께 등재한다.
# Class_Normal/Class_Guardian/Class_Battlefield는 "보스 아님 전용" 소비처나 WoE
# 가디언/전장 몬스터 분류 자체가 P0에 없어 계속 미지원(engine-extension-required).
VERIFIED_CLASS_BONUS2 = {
    "Class_All": ("combat", "atkPct"),
    "Class_Boss": ("combat", "bossAtk"),
}

# census에서 실제 관측됐지만 이번 단계에서 canonical 변환하지 않는 상수 + 그 이유.
# (완전한 목록이 아니어도 된다 — 표에 없는 상수는 전부 자동으로 "알려지지 않은 상수"로
# source-needed 처리되므로, 여기는 "왜 안 되는지"를 남기고 싶은 대표 상수만 적는다.)
UNSUPPORTED_REASONS = {
    "bAspdRate": '"bonus bAspdRate,n; Attack speed + n%" — P0의 flat aspd(스탯포인트류, *20ms)와 단위/의미가 다른 %기반 공격속도 보너스. 대응 vocabulary 없음.',
    "bMatkRate": '"bonus bMatkRate,n; Magical attack power + n%" — 실코드 재확인(buildMatkBreakdown: `bonus.matk` flat만 가산, %기반 MATK 필드 자체가 없음) 결과 여전히 engine-extension-required(P2-A.4 §7).',
    # bCastrate/bUseSPrate 리터럴 1-인자 형태는 P2-A.4에서 VERIFIED_SIMPLE_BONUS로
    # 이동했다(실코드 재확인 결과 안전, 위 표 참조). 아래는 그 표로 안 잡히는 나머지
    # 형태(스킬 지정 bonus2, 동적 표현식)에 대해서만 여기 reason이 쓰인다.
    "bCastrate": '"bonus2 bCastrate,"SKILL",n;" (스킬 지정 2-인자 형태) — P0 castReduction은 스킬 전체에 일괄 적용되는 값이라 스킬별 캐스팅 소비처가 없음(engine-extension-required, P2-A.4 §10). 리터럴 1-인자 `bonus bCastrate,n` 형태는 VERIFIED_SIMPLE_BONUS 참조.',
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
        # P2-A.4: bSubRace,RC_All -- 종족 필터 없는 dmgReduceAll과 트리거가 정확히
        # 일치(RACE_ENUM_MAP 일반 조회보다 먼저 확인, §17).
        if const == "bSubRace" and enum_val in SUBRACE_TO_ALL_KEY:
            etype, ekey = SUBRACE_TO_ALL_KEY[enum_val]
            return ("effect", {"type": etype, "key": ekey, "subKey": None, "value": val,
                                "reason": 'doc: "bonus2 bSubRace,RC_All,x;" RC_All(전종족)은 종족 필터 없는 P0 dmgReduceAll과 트리거 조건 일치(P2-A.4 §17)'})
        # P2-A.4: bAddClass -- Class_All/Class_Boss만 안전(§8), 나머지는 여전히 미지원.
        if const == "bAddClass":
            if enum_val in VERIFIED_CLASS_BONUS2:
                etype, ekey = VERIFIED_CLASS_BONUS2[enum_val]
                return ("effect", {"type": etype, "key": ekey, "subKey": None, "value": val,
                                    "reason": f'doc: "bonus2 bAddClass,c,x;" {enum_val} -> P0 {ekey} 실코드 재확인(P2-A.4 §8)'})
            return ("unsupported", {"rawStatement": stmt, "constant": const,
                                     "reason": f'Class enum "{enum_val}"에 대응하는 P0 소비처 없음(Class_All/Class_Boss만 안전, P2-A.4 §8, engine-extension-required)'})
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

            combos.append({
                "id": make_combo_id(entry_idx, variant_idx),
                "source": {"system": "rathena", "mode": "pre-re", "entry": entry_idx, "variant": variant_idx},
                "requiredItems": required_items,
                "rawScript": script,
                "conditionalRaw": conditional_raw,
                "effects": effects,
                "unsupportedEffects": unsupported_effects,
                "status": status,
                "statusReasons": status_reasons,
            })
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

    combos = canonicalize(body, unique_index, ambiguous_index, rathena_lookup, identity_verified)

    total_variants = len(combos)
    status_counts = {}
    for c in combos:
        status_counts[c["status"]] = status_counts.get(c["status"], 0) + 1

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
        },
        "combos": combos,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"OK - wrote {OUT_JSON} ({len(body)} source entries, {total_variants} variants)")
    print("status counts:", status_counts)
    print(f"identity map verified items used: {len(identity_verified)}")


if __name__ == "__main__":
    main()
