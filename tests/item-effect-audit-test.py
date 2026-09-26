"""audit_item_effects() 회귀 테스트 (P0-A, 2026-09-26).

실행: python tests/item-effect-audit-test.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build  # noqa: E402


def check(label, condition):
    if not condition:
        raise SystemExit(f'FAIL - {label}')
    print(f'OK - {label}')


def main():
    # 1. 최상위 필드 + effect.stats/bonus 중복은 항상 FAIL (baseline 구제 없음).
    fails, _ = build.audit_item_effects(
        {'테스트카드': {'type': '카드', 'dex': 1, 'effect': {'type': 'stat', 'stats': {'dex': 1}}}}
    )
    check('duplicate-stat는 FAIL', fails)

    # 2. 금지된 종족 별칭(인간)은 항상 FAIL.
    fails, _ = build.audit_item_effects(
        {'테스트카드2': {'type': '카드', 'effect': {'type': 'raceBonus', 'race': '인간', 'dmgMult': 1.2}}}
    )
    check('race-alias(인간)는 FAIL', fails)

    # 3. 레거시 effect.effect 키(effect.type 아님)는 항상 FAIL -- 엔진이 .type만 읽음.
    fails, _ = build.audit_item_effects(
        {'테스트카드3': {'type': '카드', 'effect': {'effect': 'stat', 'stats': {'str': 1}}}}
    )
    check('legacy effect.effect 키는 FAIL', fails)

    # 4. baseline에 없는 unknown effect.type은 FAIL.
    fails, _ = build.audit_item_effects(
        {'테스트카드4': {'type': '카드', 'effect': {'type': 'totallyNewType'}}}
    )
    check('baseline 미등재 unknown-effect-type은 FAIL', fails)

    # 5. baseline에 등재된 기존 unknown effect.type(increaseDropRate 등)은 WARN으로 격하.
    fails, warns = build.audit_item_effects(
        {'이미르의 잔해 카드': {'type': '카드', 'effect': {'type': 'increaseDropRate'}}}
    )
    check('baseline 등재 unknown-effect-type은 FAIL 아님', not fails)
    check('baseline 등재 unknown-effect-type은 WARN으로 남음', warns)

    # 6. 정상 카드(top-level 필드만)는 FAIL/WARN 없음.
    fails, warns = build.audit_item_effects(
        {'정상카드': {'type': '카드', 'str': 1, 'atk': 3, 'desc': 'STR +1 / ATK +3'}}
    )
    check('정상 top-level 카드는 FAIL/WARN 없음', not fails and not warns)

    # 7. 실제 db-items.json 은 현재 FAIL 0건이어야 한다 (회귀 게이트).
    _, parsed = build.load_data_files()
    fails, _ = build.audit_item_effects(parsed['DB_ITEMS'])
    check('현재 db-items.json은 audit_item_effects FAIL 0건', not fails)

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
