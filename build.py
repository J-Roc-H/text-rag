# -*- coding: utf-8 -*-
"""
룬미드가츠 빌드 스크립트 (P4-03).

source/template.html + source/data/*.json + source/services.js 를 합쳐 배포용 단일 HTML을 만든다.
db-items/db-monsters/db-maps/db-npcs 를 외부 JSON으로 관리하고 서비스 로직도 별도 소스로
관리하면서도, "파일 열면 바로 실행"(file:// 배포)을 유지하기 위해 최종 산출물은 반드시
데이터·서비스 코드가 인라인된 단일 HTML이어야 한다 — 외부 fetch/script 로드는 사용하지 않는다.

사용법: python build.py
  source/template.html + source/data/*.json + source/services.js 를 읽어
  룬미드가츠_v9.19.html 을 (임시파일 경유로 안전하게) 덮어쓴다.

번들러·node 툴체인 없이 표준 라이브러리만 사용(DEVREF-E P4-03 범위 제한).
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(BASE, "source", "template.html")
DATA_DIR = os.path.join(BASE, "source", "data")
SERVICE_PATH = os.path.join(BASE, "source", "services.js")
OUTPUT_PATH = os.path.join(BASE, "룬미드가츠_v9.19.html")
# GitHub Pages는 루트의 index.html을 서빙한다 — 버전 올려도 폰 북마크 URL이
# 안 바뀌게 매 빌드마다 같은 내용을 index.html에도 복사한다 (2026-09-20)
INDEX_PATH = os.path.join(BASE, "index.html")

# 블록ID -> 데이터 파일명
# 각 데이터 파일 서식은 파일 자체가 단독 소유한다.
BLOCKS = {
    "DB_MONSTERS": "db-monsters.json",
    "DB_MONSTER_AI_PROFILES": "db-monster-ai-profiles.json",
    "DB_MAPS": "db-maps.json",
    "DB_NPCS": "db-npcs.json",
    "DB_ITEMS": "db-items.json",
}


def main():
    template = open(TEMPLATE_PATH, encoding="utf-8-sig", newline=None).read()

    for marker_key, filename in BLOCKS.items():
        data_path = os.path.join(DATA_DIR, filename)
        content = open(data_path, encoding="utf-8", newline=None).read()
        # 유효한 JSON인지 먼저 확인 — 깨진 데이터 파일을 그대로 구워넣지 않는다
        json.loads(content)
        marker = "{{__DATA_" + marker_key + "__}}"
        count = template.count(marker)
        assert count == 1, f"marker {marker} matched {count} times (expected 1)"
        template = template.replace(marker, content.rstrip("\n"), 1)

    # 서비스 계층은 최종 classic script 뒤, </body> 직전에 인라인한다.
    # 따라서 기존 전역 함수/DB를 재사용하면서도 배포 결과는 단일 HTML을 유지한다.
    service_js = open(SERVICE_PATH, encoding="utf-8", newline=None).read().rstrip("\n")
    body_marker = "</body>"
    count = template.count(body_marker)
    assert count == 1, f"{body_marker} matched {count} times (expected 1)"
    service_block = (
        '<script id="block-service-systems">\n'
        + service_js
        + '\n</script>\n'
        + body_marker
    )
    template = template.replace(body_marker, service_block, 1)

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


if __name__ == "__main__":
    main()
