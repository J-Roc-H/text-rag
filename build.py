# -*- coding: utf-8 -*-
"""
룬미드가츠 빌드 스크립트 (P4-03).

source/template.html + source/data/*.json 을 합쳐 배포용 단일 HTML을 만든다.
db-items/db-monsters/db-maps/db-npcs 를 외부 JSON으로 관리하면서도,
"파일 열면 바로 실행"(file:// 배포)을 유지하기 위해 최종 산출물은 반드시
데이터가 인라인된 단일 HTML이어야 한다 — 외부 JSON은 file://에서 fetch()가
CORS로 막힌다(DEVREF-E 보류-01).

사용법: python build.py
  source/template.html + source/data/*.json 을 읽어
  룬미드가츠_v9.19.html 을 (임시파일 경유로 안전하게) 덮어쓴다.

번들러·node 툴체인 없이 표준 라이브러리만 사용(DEVREF-E P4-03 범위 제한).
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(BASE, "source", "template.html")
DATA_DIR = os.path.join(BASE, "source", "data")
OUTPUT_PATH = os.path.join(BASE, "룬미드가츠_v9.19.html")
# GitHub Pages는 루트의 index.html을 서빙한다 — 버전 올려도 폰 북마크 URL이
# 안 바뀌게 매 빌드마다 같은 내용을 index.html에도 복사한다 (2026-09-20)
INDEX_PATH = os.path.join(BASE, "index.html")

# 블록ID -> (데이터 파일명, 마커, 재삽입 시 그대로 삽입할지 여부)
# db-items 는 사람이 읽기 편하게 json.dumps(indent=2)로 저장돼 있다 — 파일 내용을
# 그대로 삽입한다. db-monsters/db-maps/db-npcs 는 항목당 1줄 압축 포맷으로 저장돼
# 있다 — 역시 그대로 삽입한다(별도 재포맷 없음, 서식은 각 데이터 파일이 단독 소유).
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
