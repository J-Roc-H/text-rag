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
장소/NPC 상호작용은 source/actor-interaction.js로 분리 관리하되 빌드 시 </body>
직전에 모두 인라인한다. 최종 index.html / 룬미드가츠_v9.19.html 은 계속 단일 HTML이다.

사용법: python build.py
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(BASE, "source", "template.html")
DATA_DIR = os.path.join(BASE, "source", "data")
WORLD_MAP_SCRIPT_PATH = os.path.join(BASE, "source", "world-map.js")
SERVICE_SCRIPT_PATH = os.path.join(BASE, "source", "services.js")
UI_HOTFIX_SCRIPT_PATH = os.path.join(BASE, "source", "ui-hotfix.js")
QUEST_GUIDE_SCRIPT_PATH = os.path.join(BASE, "source", "quest-guide.js")
ACTOR_INTERACTION_SCRIPT_PATH = os.path.join(BASE, "source", "actor-interaction.js")
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

    for marker_key, filename in BLOCKS.items():
        marker = "{{__DATA_" + marker_key + "__}}"
        count = template.count(marker)
        assert count == 1, f"marker {marker} matched {count} times (expected 1)"
        template = template.replace(marker, raw[marker_key].rstrip("\n"), 1)

    # 레거시 UI 함수는 template.html에 남아 있어도 뒤에 로드되는 각 계층이 재정의한다.
    # actor-interaction은 기존 서비스/퀘스트 함수에 위임하므로 가장 마지막에 로드한다.
    world_map_script = open(WORLD_MAP_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    service_script = open(SERVICE_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    ui_hotfix_script = open(UI_HOTFIX_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    quest_guide_script = open(QUEST_GUIDE_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    actor_interaction_script = open(ACTOR_INTERACTION_SCRIPT_PATH, encoding="utf-8", newline=None).read().rstrip()
    body_close = "</body>"
    count = template.count(body_close)
    assert count == 1, f"{body_close} matched {count} times (expected 1)"
    injected = (
        f'\n<script id="world-map-v1">\n{world_map_script}\n</script>\n'
        f'<script id="block-service-systems">\n{service_script}\n</script>\n'
        f'<script id="ux-hotfix">\n{ui_hotfix_script}\n</script>\n'
        f'<script id="quest-guide-v1">\n{quest_guide_script}\n</script>\n'
        f'<script id="actor-interaction-v1">\n{actor_interaction_script}\n</script>\n'
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
    print("OK - dynamic SVG world map injected")
    print("OK - phase 1-2 service systems injected")
    print("OK - UX hotfix injected")
    print("OK - quest guidance v1 injected")
    print("OK - actor interaction v1 injected")


if __name__ == "__main__":
    main()
