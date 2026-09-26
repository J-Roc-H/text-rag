# -*- coding: utf-8 -*-
"""
룬미드가츠 빌드 스크립트 (P4-03 + 동적 세계지도 v1 + 서비스 시스템 v1).

source/template.html + source/data/*.json 을 합쳐 배포용 단일 HTML을 만든다.
db-items/db-monsters/db-maps/db-npcs 를 외부 JSON으로 관리하면서도,
"파일 열면 바로 실행"(file:// 배포)을 유지하기 위해 최종 산출물은 반드시
데이터가 인라인된 단일 HTML이어야 한다 — 외부 JSON은 file://에서 fetch()가
CORS로 막힌다(DEVREF-E 보류-01).

동적 세계지도는 source/world-map.js, 서비스 보강 계층은 source/services.js,
소규모 UX 핫픽스는 source/ui-hotfix.js, 퀘스트 안내 보강은 source/quest-guide.js,
장소/NPC 상호작용은 source/actor-interaction.js, 아이템/카드 효과 집계(P0-B)는
source/item-effects.js로 분리 관리하되 빌드 시 </body> 직전에 모두 인라인한다.
최종 index.html / 룬미드가츠_v9.19.html 은 계속 단일 HTML이다.

item-effects.js는 template.html 본문의 <script id="block-engine"> 안 calcStats()가
정의된 훨씬 이전 위치보다 늦게(다른 주입 스크립트와 함께 </body> 직전에) 실행되지만,
calcStats()는 window.onload=doLoading 이후에만 호출되므로(스크립트 파싱 시점에 즉시
호출되는 곳 없음) 주입 순서가 런타임 오류를 만들지 않는다. 이 전제가 깨지면(예: 어떤
스크립트가 파싱 중 즉시 calcStats를 호출하게 되면) item-effects.js를 그 이전으로
옮겨야 한다.

사용법: python build.py
"""
import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(BASE, "source", "template.html")
DATA_DIR = os.path.join(BASE, "source", "data")
WORLD_MAP_SCRIPT_PATH = os.path.join(BASE, "source", "world-map.js")
SERVICE_SCRIPT_PATH = os.path.join(BASE, "source", "services.js")
UI_HOTFIX_SCRIPT_PATH = os.path.join(BASE, "source", "ui-hotfix.js")
QUEST_GUIDE_SCRIPT_PATH = os.path.join(BASE, "source", "quest-guide.js")
ACTOR_INTERACTION_SCRIPT_PATH = os.path.join(BASE, "source", "actor-interaction.js")
REFINE_REVEAL_SCRIPT_PATH = os.path.join(BASE, "source", "refine-reveal.js")
ITEM_EFFECTS_SCRIPT_PATH = os.path.join(BASE, "source", "item-effects.js")
# P2-A: 콤보 정본 데이터(tools/canonicalize_combos.py 산출물) -- BLOCKS에는 넣지 않는다.
# 이번 단계는 데이터 생성/감사만 한다(HTML runtime에 아직 inject하지 않음, §7/§40).
COMBOS_JSON_PATH = os.path.join(DATA_DIR, "db-combos.json")
OUTPUT_PATH = os.path.join(BASE, "룬미드가츠_v9.19.html")
# GitHub Pages는 루트의 index.html을 서빙한다 — 버전 올려도 폰 북마크 URL이
# 안 바뀌게 매 빌드마다 같은 내용을 index.html에도 복사한다 (2026-09-20)
INDEX_PATH = os.path.join(BASE, "index.html")

# 블록ID -> 데이터 파일명
BLOCKS = {
    "DB_MONSTERS": "db-monsters.json",
    "DB_MONSTER_AI_PROFILES": "db-monster-ai-profiles.json",
    "DB_MAPS": "db-maps.json",
    "DB_NPCS": "db-npcs.json",
    "DB_ITEMS": "db-items.json",
}

NPC_SERVICES = {
    "", "kafra", "shop", "refine", "job_change", "dungeon_access",
    "exchange", "exchange_gem", "exchange_smile", "ymir_donate", "ymir_book",
}


def audit_maps(maps):
    """지도 그래프 구조 감사.

    fatal: 존재하지 않는 맵 참조.
    warning: dirs와 connected 불일치, 편도 connected.
    편도 연결은 게임 설계상 의도일 수 있어 빌드를 막지 않는다.
    """
    names = set(maps)
    errors = []
    warnings = []

    for name, mp in maps.items():
        connected = mp.get("connected") or []
        if not isinstance(connected, list):
            errors.append(f'{name}: connected가 배열이 아님')
            connected = []

        for dest in connected:
            if dest not in names:
                errors.append(f'{name}: connected 대상 없음 -> {dest}')
                continue
            back = maps[dest].get("connected") or []
            if name not in back:
                warnings.append(f'{name} -> {dest}: 역방향 connected 없음')

        dirs = mp.get("dirs") or {}
        if not isinstance(dirs, dict):
            errors.append(f'{name}: dirs가 객체가 아님')
            continue
        for direction, dest in dirs.items():
            if dest not in names:
                errors.append(f'{name}: dirs.{direction} 대상 없음 -> {dest}')
            elif dest not in connected:
                warnings.append(f'{name}: dirs.{direction}={dest}, connected에는 없음')

    return errors, sorted(set(warnings))


def audit_npcs(npcs, maps, items):
    """NPC/상호작용 데이터의 최소 배선 감사.

    퀘스트 정의는 아직 template.html 내부 JS이므로 여기서는 데이터 파일만 검증한다.
    """
    errors = []
    warnings = []
    map_names = set(maps)
    item_names = set(items)

    for name, npc in npcs.items():
        map_name = npc.get("map")
        if map_name not in map_names:
            errors.append(f'{name}: 존재하지 않는 map -> {map_name}')

        service = npc.get("service", "")
        if service not in NPC_SERVICES:
            errors.append(f'{name}: 지원하지 않는 service -> {service}')

        actor_type = npc.get("actorType", "npc")
        if actor_type not in ("npc", "object"):
            errors.append(f'{name}: actorType은 npc/object만 허용 -> {actor_type}')

        if service == "shop":
            sells = npc.get("sells")
            if not isinstance(sells, list) or not sells:
                errors.append(f'{name}: shop인데 sells가 비어 있음')
            else:
                missing = [item for item in sells if item not in item_names]
                if missing:
                    warnings.append(f'{name}: 상점 아이템 DB 미등록 -> {", ".join(missing)}')

        if service == "dungeon_access":
            target = npc.get("targetMap")
            if not target or target not in map_names:
                errors.append(f'{name}: dungeon_access targetMap 없음/오류 -> {target}')
            try:
                if float(npc.get("cost", 0)) < 0:
                    errors.append(f'{name}: dungeon_access cost가 음수')
            except (TypeError, ValueError):
                errors.append(f'{name}: dungeon_access cost가 숫자가 아님')

    return errors, sorted(set(warnings))



EFFECT_AUDIT_BASELINE_PATH = os.path.join(DATA_DIR, "effect-audit-baseline.json")

# calcStats()가 실제로 분기하는 effect.type 값 (source/template.html 카드 보너스 블록 기준).
# 여기 없는 type은 DB에 값이 있어도 엔진이 읽지 않는다 -- FAIL 또는(baseline 등재 시) WARN.
KNOWN_EFFECT_TYPES = {"stat", "mixed", "special", "raceBonus", "seProc", "lifesteal"}
# 구조화 효과 전용 키워드 -- 최상위 문자열 effect 값으로 나타나면 안 된다(P0-A에서 정리한 레거시 표기).
RESERVED_EFFECT_WORDS = {"stat", "raceBonus", "mixed", "special", "seProc", "lifesteal",
                          "derived", "increaseDropRate", "increaseExpRate"}
# 현재 raceBonus 카드가 실제로 쓰는 종족 키(2026-09-26 P0-A 감사 기준). 새 값은 원작 확인 후 등록.
KNOWN_RACE_VALUES = {"악마", "어류", "식물", "곤충", "골렘", "조류", "고블린", "화염",
                      "인간형", "얼음", "동물형", "천사", "물질", "드래곤", "미라"}
# 확정적으로 잘못된 표기 -- baseline으로도 구제하지 않는다(사용자 확인된 오표기).
BANNED_RACE_ALIASES = {"인간": "인간형"}
RATHENA_SCRIPT_MARKERS = ["bonus ", "bonus2 ", "bonus3 ", "bonus4 ", "autobonus", "bAutoSpell"]
DESC_EFFECT_KEYWORDS = ["확률", "면역", "저항", "무시", "부여", "흡수", "시전", "캐스팅",
                        "자동 발동", "자동발동", "속성 피해", "내성", "넉백",
                        "추가 대미지", "추가 데미지", "받는 데미지", "오토스펠", "더블어택",
                        "디버프", "혼란", "스턴", "사망 시", "처치 시", "스킬 데미지"]
STRUCTURED_MARKER_KEYS = {"effect", "effects", "raceAtk", "elemAtk", "sizeAtk",
                          "raceDmgReduce", "elemReduce", "immune", "spCostMul", "healBoost",
                          "castReduction", "skillDmg", "grantSkill", "dropBonus", "doubleAtk",
                          "defIgnore", "hpDrainSelf", "magicRaceAtk", "bossAtk",
                          "rangedDmgReduce", "armorElement", "magicImmune"}
# effect.bonus 키 중 최상위 필드와 이름이 다른 별칭(calcStats 카드 보너스 블록 기준).
EFFECT_BONUS_ALIASES = {"pd": "perfectFlee"}
# baseline으로 WARN까지만 격하할 수 있는 FAIL 후보 코드. 나머지 FAIL 코드는 무조건 즉시 실패
# (2026-09-26 P0-A 감사에서 전량 정리해 현재 baseline 0건 -- 재발은 회귀로 간주).
BASELINE_ELIGIBLE_CODES = {"unknown-effect-type", "unknown-race"}


def load_effect_audit_baseline():
    if not os.path.exists(EFFECT_AUDIT_BASELINE_PATH):
        return set()
    with open(EFFECT_AUDIT_BASELINE_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return {(row["item"], row["code"]) for row in data.get("grandfathered", [])}


def audit_item_effects_collector_sync(item_effects_js_path):
    """P0-B: source/item-effects.js의 KNOWN_ITEM_EFFECT_TYPES가 build.py의
    KNOWN_EFFECT_TYPES와 어긋나지 않는지만 확인한다(과대 확장 금지 -- 이 한 가지만).

    두 파일이 각자 "엔진이 아는 effect.type 목록"을 따로 들고 있어서, 한쪽만 고치면
    audit_item_effects()의 unknown-effect-type 판정과 collector의 실제 동작이 어긋난다.
    """
    src = open(item_effects_js_path, encoding="utf-8").read()
    m = re.search(r"KNOWN_ITEM_EFFECT_TYPES\s*=\s*\[([^\]]*)\]", src)
    if not m:
        raise ValueError("item-effects.js: KNOWN_ITEM_EFFECT_TYPES 배열을 찾지 못함")
    js_types = {t.strip().strip("'\"") for t in m.group(1).split(",") if t.strip()}
    if js_types != KNOWN_EFFECT_TYPES:
        only_js = js_types - KNOWN_EFFECT_TYPES
        only_py = KNOWN_EFFECT_TYPES - js_types
        raise ValueError(
            "item-effects.js의 KNOWN_ITEM_EFFECT_TYPES가 build.py의 KNOWN_EFFECT_TYPES와 다름 -- "
            f"JS에만 있음: {sorted(only_js)}, Python에만 있음: {sorted(only_py)}"
        )
    print("OK - item-effects.js collector 지원 타입 동기화")


def audit_item_effects_deferred_sync(item_effects_js_path):
    """P0 종료감사: item-effects.js 안에서 "값은 집계하지만 소비처가 없다"고 스스로 표시하는
    필드 이름이, 실제로 그 값을 집계하는 키 목록(_ITEM_EFF_SIMPLE_COMBAT_KEYS /
    _ITEM_EFF_COUNTER_KEYS) 안에 정확히 존재하는지만 확인한다.

    이 검사가 잡는 버그: 누군가 필드 이름을 바꾸거나 오타를 내면, unsupported[] 마킹이
    조용히 아무 키에도 안 걸려서 "active로 집계되는데 unsupported 표시는 없는" 상태가
    재발한다 -- 정확히 P0 종료감사에서 발견해 고친 버그의 재발 방지용 최소 게이트다.
    template.html 쪽 실제 소비 여부까지는 정적으로 확인하지 않는다(그건 이 함수의 책임이
    아니다 -- 과대 파서를 만들지 않는다).
    """
    src = open(item_effects_js_path, encoding="utf-8").read()

    def extract_list(var_name):
        m = re.search(var_name + r"\s*=\s*\[([^\]]*)\]", src)
        if not m:
            raise ValueError(f"item-effects.js: {var_name} 배열을 찾지 못함")
        return {t.strip().strip("'\"") for t in m.group(1).split(",") if t.strip()}

    simple_combat_keys = extract_list(r"_ITEM_EFF_SIMPLE_COMBAT_KEYS")
    counter_keys = extract_list(r"_ITEM_EFF_COUNTER_KEYS")

    m = re.search(r"_DEFERRED_SIMPLE_COMBAT_REASONS\s*=\s*\{([^}]*)\}", src, re.S)
    if not m:
        raise ValueError("item-effects.js: _DEFERRED_SIMPLE_COMBAT_REASONS 객체를 찾지 못함")
    deferred_keys = set(re.findall(r"(\w+)\s*:", m.group(1)))
    unknown = deferred_keys - simple_combat_keys
    if unknown:
        raise ValueError(
            "item-effects.js: _DEFERRED_SIMPLE_COMBAT_REASONS에 "
            f"_ITEM_EFF_SIMPLE_COMBAT_KEYS에 없는 키가 있음(오타/이름불일치 의심): {sorted(unknown)}"
        )

    if "magicRaceAtk" not in counter_keys:
        raise ValueError(
            "item-effects.js: magicRaceAtk가 _ITEM_EFF_COUNTER_KEYS에서 빠짐 -- "
            "unsupported[] 마킹 코드가 더 이상 걸리지 않을 수 있음"
        )
    print("OK - item-effects.js deferred 필드 표시 동기화")


def audit_item_effects(items):
    """db-items.json 효과 표현 감사 (P0-A, 2026-09-26 / 교정 패스 2026-09-26).

    FAIL: 구조적으로 잘못됐거나(중복/누락/미지원 타입) 엔진 소비 경로가 없는 신규 표기.
    WARN: desc-only/raw script/baseline에 등재된 기존 문제 -- 빌드를 막지 않는다.
    baseline은 사람이 확인해 추가한 (item, code) 쌍만 WARN으로 격하한다(자동 증가 금지).

    `_pendingVerification: true`(effect 객체 또는 아이템 최상위)는 "원작 근거를 찾지 못해
    죽어 있던 표기 그대로 되돌려 둔" 항목 표식이다(교정 패스에서 73건 도입). 이 표식이 있으면
    legacy-effect-key/reserved-string-effect는 FAIL이 아니라 WARN으로만 보고한다 -- 표식이
    없는 새 항목이 같은 패턴을 쓰면 여전히 FAIL이다. 표식을 지우고 값을 활성화하려면 먼저
    실제 원작 근거(rAthena 소스 또는 이 프로젝트의 몬스터 DB)를 확인할 것.
    """
    baseline = load_effect_audit_baseline()
    fails = []
    warns = []

    def report(name, code, message):
        if code in BASELINE_ELIGIBLE_CODES and (name, code) in baseline:
            warns.append(f'{name}: {message} [baseline]')
        else:
            fails.append(f'{name}: {message}')

    for name, it in items.items():
        if not isinstance(it, dict):
            continue

        eff = it.get("effect")
        item_pending = it.get("_pendingVerification") is True
        if isinstance(eff, str) and eff in RESERVED_EFFECT_WORDS:
            msg = f'effect="{eff}" 는 구조화 효과 전용 키워드 -- effect:{{"type":"{eff}", ...}} 형식으로 표현할 것'
            if item_pending:
                warns.append(f'{name}: {msg} [원작검증필요 -- 활성화 보류, _pendingVerification]')
            else:
                report(name, "reserved-string-effect", msg)

        if isinstance(eff, dict):
            eff_pending = item_pending or eff.get("_pendingVerification") is True
            if "effect" in eff and "type" not in eff:
                msg = f'effect.effect="{eff.get("effect")}" -- effect.type 표기로 정규화할 것 (엔진은 .type만 읽음)'
                if eff_pending:
                    warns.append(f'{name}: {msg} [원작검증필요 -- 활성화 보류, _pendingVerification]')
                else:
                    report(name, "legacy-effect-key", msg)

            t = eff.get("type")
            if t is not None and t not in KNOWN_EFFECT_TYPES:
                report(name, "unknown-effect-type", f'effect.type="{t}" 는 엔진 미지원 타입')

            if t == "raceBonus":
                race = eff.get("race")
                if not race or "dmgMult" not in eff:
                    report(name, "missing-args", "raceBonus 는 race/dmgMult 필수")
                elif race in BANNED_RACE_ALIASES:
                    report(name, "race-alias",
                           f'race="{race}" 는 금지된 표기 -- "{BANNED_RACE_ALIASES[race]}" 사용')
                elif race not in KNOWN_RACE_VALUES:
                    report(name, "unknown-race",
                           f'race="{race}" 는 알려지지 않은 종족 키 -- 원작 확인 후 KNOWN_RACE_VALUES에 등록')

            if t in ("seProc", "mixed") and "seProc" in eff:
                se = eff["seProc"]
                if not all(k in se for k in ("se", "chance", "turns")):
                    report(name, "missing-args", "seProc 는 se/chance/turns 필수")

            if t == "lifesteal" and ("chance" not in eff or "spRate" not in eff):
                report(name, "missing-args", "lifesteal 은 chance/spRate 필수")

            for sk, sv in (eff.get("stats") or {}).items():
                if it.get(sk) == sv:
                    report(name, "duplicate-stat", f'top-level {sk}={sv} 와 effect.stats.{sk} 중복')
            for bk, bv in (eff.get("bonus") or {}).items():
                top_key = EFFECT_BONUS_ALIASES.get(bk, bk)
                if it.get(top_key) == bv:
                    report(name, "duplicate-stat", f'top-level {top_key}={bv} 와 effect.bonus.{bk} 중복')

        if isinstance(it.get("effects"), list) and it["effects"]:
            warns.append(f'{name}: effects[] 는 아직 엔진이 소비하지 않음(P0-B 이후 대상)')

        desc = it.get("desc") or ""
        if any(m in desc for m in RATHENA_SCRIPT_MARKERS):
            warns.append(f'{name}: desc에 rAthena 원시 스크립트가 그대로 남아 있음(원작 확인 후 변환 대상)')
        elif it.get("type") != "소모품":
            if any(k in desc for k in DESC_EFFECT_KEYWORDS) and not (STRUCTURED_MARKER_KEYS & set(it.keys())):
                warns.append(f'{name}: desc에 효과 설명이 있으나 구조화 데이터 없음(원작 확인 후 변환 대상)')

    return fails, sorted(set(warns))


def audit_quest_item_sources(template, parsed):
    """Fail the build when a gather quest has no real acquisition route."""
    targets = set(re.findall(r"type\s*:\s*['\"]gather['\"][\s\S]{0,220}?target\s*:\s*['\"]([^'\"]+)['\"]", template))
    for block in re.finditer(r"type\s*:\s*['\"]gather_multi['\"][\s\S]{0,900}?targets\s*:\s*\[([\s\S]{0,800}?)\]", template):
        targets.update(re.findall(r"item\s*:\s*['\"]([^'\"]+)['\"]", block.group(1)))
    quest_only = set()
    for m in re.finditer(r"item\s*:\s*['\"]([^'\"]+)['\"][\s\S]{0,180}?questSource\s*:\s*\{", template):
        quest_only.add(m.group(1))
    drops = {name for mon in parsed['DB_MONSTERS'].values() for name in (mon.get('drops') or {})}
    sells = {name for npc in parsed['DB_NPCS'].values() for name in (npc.get('sells') or [])}
    missing = sorted(targets - drops - sells - quest_only)
    if missing:
        raise ValueError('획득처 없는 퀘스트 아이템: ' + ', '.join(missing))
    print(f"OK - quest item source audit ({len(targets)} gather target(s))")


# P2-A: canonical effect (type,key) 허용 목록 -- tools/canonicalize_combos.py의
# VERIFIED_* 표와 정확히 같은 집합이어야 한다. 둘이 갈라지면(예: 생성 스크립트에
# 새 vocabulary를 추가했는데 여기를 안 고치면) "unknown canonical effect key"로 즉시
# FAIL한다 -- P0-close가 발견한 "조용히 새는 표시 누락" 패턴을 combo 쪽에서도 재발
# 방지하는 최소 게이트다(과대 파서 아님, 정적 집합 대조만).
COMBO_KNOWN_EFFECT_KEYS = {
    ("stat", "str"), ("stat", "agi"), ("stat", "vit"),
    ("stat", "int"), ("stat", "dex"), ("stat", "luk"),
    ("combat", "maxHp"), ("combat", "maxSp"),
    ("combat", "maxHpPct"), ("combat", "maxSpPct"),
    ("combat", "def"), ("combat", "mdef"), ("combat", "hit"), ("combat", "flee"),
    ("combat", "crit"), ("combat", "pd"), ("combat", "atk"),
    ("combat", "hpRegenPct"), ("combat", "spRegenPct"),
    ("combat", "raceDmgReduce"), ("combat", "raceAtk"), ("combat", "elemReduce"),
    ("event", "soulgain"),
}


def audit_item_combos(combos_data):
    """P2-A: source/data/db-combos.json 구조 감사. 기존 469 WARN(아이템/카드 효과 P0
    backlog)과 절대 같은 숫자에 섞지 않는다 -- 완전히 별도로 "COMBO WARN"/실패로만
    보고한다(과제 지시 §27). 이번 단계는 데이터 정합성만 본다 -- collectItemEffects/
    calcStats 등 실제 게임 로직과는 연결되지 않은 상태를 그대로 감사한다(§25).

    FAIL: 구조적 결함(생성 파이프라인 버그로 봐야 하는 것들) -- 중복 id, rawScript
    누락, 알려지지 않은 canonical effect 키, reason 없는 unsupported/runtime-blocked.
    WARN: 정상적으로 예상되는 상태(unresolved 아이템, source-needed 등) -- 빌드를
    막지 않는다.
    """
    fails, warns = [], []
    seen_ids = set()
    for combo in combos_data.get("combos", []):
        cid = combo.get("id")
        if not cid:
            fails.append("id 없는 combo 항목")
            continue
        if cid in seen_ids:
            fails.append(f"{cid}: 중복 combo id")
        seen_ids.add(cid)

        if not combo.get("requiredItems"):
            fails.append(f"{cid}: requiredItems 비어 있음")
        else:
            aegis_list = [r.get("aegisName") for r in combo["requiredItems"]]
            if len(aegis_list) != len(set(aegis_list)):
                warns.append(f"{cid}: requiredItems에 동일 아이템 중복(원본 보존 — §32, 의도적일 수 있음)")
            for r in combo["requiredItems"]:
                if not r.get("resolved") and not r.get("ambiguousTextragKeys"):
                    warns.append(f"{cid}: 미해결 아이템 {r.get('aegisName')}(TextRAG에 매칭되는 _aegis 없음)")
                if r.get("ambiguousTextragKeys"):
                    warns.append(f"{cid}: 아이템 {r.get('aegisName')}이 TextRAG에서 2개 이상의 키와 충돌")

        if not combo.get("rawScript"):
            fails.append(f"{cid}: rawScript 누락(원문 보존 실패)")

        for eff in combo.get("effects", []):
            key_pair = (eff.get("type"), eff.get("key"))
            if key_pair not in COMBO_KNOWN_EFFECT_KEYS:
                fails.append(f"{cid}: 알려지지 않은 canonical effect 키 {key_pair} -- 생성 스크립트와 audit 허용목록 불일치")

        for eff in combo.get("unsupportedEffects", []):
            if not eff.get("reason"):
                fails.append(f"{cid}: unsupportedEffects 항목에 reason 없음")

        status = combo.get("status")
        if status not in ("verified", "source-needed", "unsupported", "runtime-blocked"):
            fails.append(f"{cid}: 알려지지 않은 status 값 '{status}'")
        if status == "runtime-blocked" and not combo.get("statusReasons"):
            fails.append(f"{cid}: runtime-blocked인데 statusReasons 없음")
        if status == "source-needed" and not combo.get("statusReasons"):
            warns.append(f"{cid}: source-needed인데 statusReasons 없음(정보용)")

    return fails, warns


def load_data_files():
    raw = {}
    parsed = {}
    for marker_key, filename in BLOCKS.items():
        data_path = os.path.join(DATA_DIR, filename)
        content = open(data_path, encoding="utf-8", newline=None).read()
        parsed[marker_key] = json.loads(content)  # 깨진 JSON이면 즉시 중단
        raw[marker_key] = content
    return raw, parsed


def main():
    template = open(TEMPLATE_PATH, encoding="utf-8-sig", newline=None).read()
    raw, parsed = load_data_files()
    audit_quest_item_sources(template, parsed)

    map_errors, map_warnings = audit_maps(parsed["DB_MAPS"])
    if map_errors:
        joined = "\n  - ".join(map_errors)
        raise ValueError(f"지도 데이터 오류:\n  - {joined}")
    if map_warnings:
        print(f"WARN - map audit: {len(map_warnings)} issue(s)")
        for warning in map_warnings:
            print(f"  - {warning}")
    else:
        print("OK - map audit")

    npc_errors, npc_warnings = audit_npcs(
        parsed["DB_NPCS"], parsed["DB_MAPS"], parsed["DB_ITEMS"]
    )
    if npc_errors:
        joined = "\n  - ".join(npc_errors)
        raise ValueError(f"NPC 데이터 오류:\n  - {joined}")
    if npc_warnings:
        print(f"WARN - npc audit: {len(npc_warnings)} issue(s)")
        for warning in npc_warnings:
            print(f"  - {warning}")
    else:
        print("OK - npc audit")

    audit_item_effects_collector_sync(ITEM_EFFECTS_SCRIPT_PATH)
    audit_item_effects_deferred_sync(ITEM_EFFECTS_SCRIPT_PATH)

    item_effect_fails, item_effect_warnings = audit_item_effects(parsed["DB_ITEMS"])
    if item_effect_fails:
        joined = "\n  - ".join(item_effect_fails)
        raise ValueError(f"아이템 효과 감사 오류:\n  - {joined}")
    if item_effect_warnings:
        print(f"WARN - item effect audit: {len(item_effect_warnings)} issue(s)")
        for warning in item_effect_warnings:
            print(f"  - {warning}")
    else:
        print("OK - item effect audit")

    # P2-A: 콤보 정본 데이터 감사 -- 위 "item effect audit"(469 WARN, P0 backlog)과
    # 절대 같은 숫자에 합치지 않는다(과제 지시 §27). db-combos.json이 아직 없으면
    # (P2-A를 실행하지 않은 체크아웃) 조용히 건너뛴다 -- 이번 단계 산출물이 선택적임을
    # 반영한다.
    if os.path.exists(COMBOS_JSON_PATH):
        with open(COMBOS_JSON_PATH, encoding="utf-8") as f:
            combos_data = json.load(f)
        combo_fails, combo_warnings = audit_item_combos(combos_data)
        if combo_fails:
            joined = "\n  - ".join(combo_fails)
            raise ValueError(f"콤보 데이터 감사 오류:\n  - {joined}")
        if combo_warnings:
            print(f"COMBO WARN - item combo audit: {len(combo_warnings)} issue(s)")
        else:
            print("OK - item combo audit")

    for marker_key, filename in BLOCKS.items():
        marker = "{{__DATA_" + marker_key + "__}}"
        count = template.count(marker)
        assert count == 1, f"marker {marker} matched {count} times (expected 1)"
        template = template.replace(marker, raw[marker_key].rstrip("\n"), 1)

    # 레거시 UI 함수는 template.html에 남아 있어도 뒤에 로드되는 각 계층이 재정의한다.
    # actor-interaction은 기존 서비스/퀘스트 함수에 위임하므로 가장 마지막에 로드한다.
    item_effects_script = open(ITEM_EFFECTS_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    world_map_script = open(WORLD_MAP_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    service_script = open(SERVICE_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    ui_hotfix_script = open(UI_HOTFIX_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    quest_guide_script = open(QUEST_GUIDE_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    actor_interaction_script = open(ACTOR_INTERACTION_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    refine_reveal_script = open(REFINE_REVEAL_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    body_close = "</body>"
    count = template.count(body_close)
    assert count == 1, f"{body_close} matched {count} times (expected 1)"
    injected = (
        # item-effects는 calcStats()(block-engine, </body>보다 훨씬 앞)가 참조하는 전역
        # 함수를 정의한다. 스크립트 태그는 문서 순서대로 실행되지만 calcStats 호출은
        # window.onload=doLoading 이후에만 일어나므로(파싱 중 즉시 호출 없음) 다른 주입
        # 스크립트와 함께 여기(</body> 직전)에서 정의해도 안전하다 — 다만 가장 먼저 둔다.
        f'\n<script id="item-effects-v1">\n{item_effects_script}\n</script>\n'
        f'<script id="world-map-v1">\n{world_map_script}\n</script>\n'
        f'<script id="block-service-systems">\n{service_script}\n</script>\n'
        f'<script id="ux-hotfix">\n{ui_hotfix_script}\n</script>\n'
        f'<script id="quest-guide-v1">\n{quest_guide_script}\n</script>\n'
        f'<script id="actor-interaction-v1">\n{actor_interaction_script}\n</script>\n'
        f'<script id="refine-reveal-v1">\n{refine_reveal_script}\n</script>\n'
        f'{body_close}'
    )
    template = template.replace(body_close, injected, 1)

    tmp_path = OUTPUT_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(template)
    os.replace(tmp_path, OUTPUT_PATH)

    tmp_index = INDEX_PATH + ".tmp"
    with open(tmp_index, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(template)
    os.replace(tmp_index, INDEX_PATH)

    print(f"OK - built {OUTPUT_PATH} ({len(template)} chars)")
    print(f"OK - built {INDEX_PATH} (GitHub Pages entry point)")
    print("OK - item effects collector (P0-B) injected")
    print("OK - dynamic SVG world map injected")
    print("OK - phase 1-2 service systems injected")
    print("OK - UX hotfix injected")
    print("OK - quest guidance v1 injected")
    print("OK - actor interaction v1 injected")
    print("OK - refine reveal v1 injected")


if __name__ == "__main__":
    main()
