"""audit_monster_drops() 회귀 테스트 (2026-09-27 드롭 키 81건 사고).

아이템 키 정본화(ITEM_KEY_ALIASES) 때 db-monsters.json 드롭표를 같이 안 고쳐
rollDrops()가 조용히 실패하던 결함의 재발 방지.

실행: python tests/monster-drop-key-audit-test.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import build  # noqa: E402


def check(label, condition):
    if not condition:
        raise SystemExit(f'FAIL - {label}')
    print(f'OK - {label}')


def load(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8-sig') as f:
        return f.read()


def main():
    # 1. 없는 드롭 키는 몬스터·키를 담아 보고한다.
    errors = build.audit_monster_drops(
        {'1': {'name': '포링', 'drops': {'젤로피': 70.0, '줄기': 1.0}}},
        {'젤로피': {}},
    )
    check('미등록 드롭 키 보고', errors == ['포링(1) -> 줄기'])
    check('drops 없는 몬스터 허용', build.audit_monster_drops({'2': {'name': 'x'}}, {}) == [])

    # 2. 현재 정본 데이터는 0건.
    monsters = json.loads(load('source/data/db-monsters.json'))
    items = json.loads(load('source/data/db-items.json'))
    check('현재 db-monsters 드롭 키 전부 실존', build.audit_monster_drops(monsters, items) == [])

    # 3. 세이브 전용 별칭의 옛 키(DB에서 제거된 이름)가 드롭표에 남아 있지 않다.
    tpl = load('source/template.html')
    block = tpl[tpl.index('const ITEM_KEY_ALIASES'):tpl.index('function canonicalItemName')]
    aliases = dict(re.findall(r'^\s*"([^"]+)":\s*"([^"]+)"', block, re.M))
    retired = {k for k in aliases if k not in items}
    stale = sorted({k for m in monsters.values() for k in (m.get('drops') or {}) if k in retired})
    check('드롭표에 은퇴한 별칭 키 없음', stale == [])


if __name__ == '__main__':
    main()
