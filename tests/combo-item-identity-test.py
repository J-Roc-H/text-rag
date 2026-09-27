"""tools/build_combo_item_identity.py + build.audit_combo_item_identity() 회귀
테스트 (P2-A.1, 2026-09-26).

기존 tests/item-combo-audit-test.py와 같은 원칙: 실제 함수(resolve_cards_case_b,
generate_structural_candidates, build_textrag_aegis_index, canonicalize,
audit_combo_item_identity, build_identity_map)를 그대로 호출한다 -- 재구현 금지.

실행: python tests/combo-item-identity-test.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build  # noqa: E402
import canonicalize_combos as cc  # noqa: E402
import build_combo_item_identity as bci  # noqa: E402


def check(label, condition):
    if not condition:
        raise SystemExit(f'FAIL - {label}')
    print(f'OK - {label}')


def main():
    # ══════════════════════════════════════════════
    # A -- 기존 _aegis exact unique -> verified 경로(build_textrag_aegis_index 재사용).
    # ══════════════════════════════════════════════
    textrag_items = {
        '드래곤슬레이어': {'type': '무기', '_aegis': 'Dragon_Slayer'},
        '충돌카드A': {'type': '카드', '_aegis': 'Ambig_Card'},
        '충돌카드B': {'type': '카드', '_aegis': 'Ambig_Card'},
        '포링 카드': {'type': '카드'},
        '루나틱 카드': {'type': '카드'},
        '무기고대': {'type': '무기', 'buy': 20, 'weight': 70.0, 'atk': 30, 'slots': 2, 'weaponLv': 3},
        '무기다른것': {'type': '무기', 'buy': 999, 'weight': 1.0, 'atk': 1, 'slots': 0, 'weaponLv': 1},
    }
    unique_index, ambiguous_index = bci.build_textrag_aegis_index(textrag_items)
    check('A: exact _aegis unique -> unique_index에 존재', unique_index.get('Dragon_Slayer') == '드래곤슬레이어')
    check('A: 공유 _aegis -> ambiguous_index로 분리(자동 선택 없음)', set(ambiguous_index.get('Ambig_Card', [])) == {'충돌카드A', '충돌카드B'})

    # ══════════════════════════════════════════════
    # B -- Case B(카드): mob_db Drops 역참조 + 이미 검증된 monster audit -> "<이름> 카드"
    # 구성이 TextRAG에 정확히 존재하면 verified.
    # ══════════════════════════════════════════════
    card_records = {'Poring_Card': {}, 'Lunatic_Card': {}}
    card_dropmap = {'Poring_Card': [1002], 'Lunatic_Card': [1063]}
    audit_rows = {'1002': {'textragId': '1', 'name': '포링', 'note': ''}, '1063': {'textragId': '2', 'name': '루나틱', 'note': ''}}
    result_b = bci.resolve_cards_case_b(card_records, card_dropmap, audit_rows, textrag_items)
    check('B: 원작 드롭 근거 + 검증된 몬스터 감사 -> verified', result_b['Poring_Card']['outcome'] == 'verified')
    check('B: textragKey가 정확히 구성됨', result_b['Poring_Card']['textragKey'] == '포링 카드')
    check('B: 두 번째 카드도 동일 경로로 verified', result_b['Lunatic_Card']['outcome'] == 'verified' and result_b['Lunatic_Card']['textragKey'] == '루나틱 카드')

    # ══════════════════════════════════════════════
    # C -- 같은 카드가 서로 다른 원작 몬스터 ID에서 드롭되고, 그 몬스터들의 감사된
    # 한글명이 서로 다르면 ambiguous -> 자동 선택 0.
    # ══════════════════════════════════════════════
    card_records_c = {'Weird_Card': {}}
    card_dropmap_c = {'Weird_Card': [1002, 1063]}  # 포링과 루나틱 둘 다 드롭한다고 가정(합성)
    result_c = bci.resolve_cards_case_b(card_records_c, card_dropmap_c, audit_rows, textrag_items)
    check('C: 서로 다른 한글명으로 감사된 원작 ID들 -> ambiguous-monster-name', result_c['Weird_Card']['outcome'] == 'ambiguous-monster-name')
    check('C: candidateNames에 둘 다 보존(자동 선택 없음)', set(result_c['Weird_Card']['candidateNames']) == {'포링', '루나틱'})

    # ══════════════════════════════════════════════
    # D -- 구조 신호 candidate: 최소 3개 신호가 겹치는 무기만 candidate로 채택되고,
    # textragKey를 자동 확정하지 않는다(반환값 자체가 candidates 리스트일 뿐).
    # ══════════════════════════════════════════════
    weapon_rec = {'Type': 'Weapon', 'Buy': 20, 'Weight': 700.0, 'Attack': 30, 'Slots': 2, 'WeaponLevel': 3}
    candidates_d = bci.generate_structural_candidates(weapon_rec, textrag_items)
    check('D: 4개 신호(buy/weight/atk/slots/weaponLv 중 다수) 일치 후보가 채택됨', any(c['textragKey'] == '무기고대' for c in candidates_d))
    check('D: candidate는 textragKey 확정이 아니라 signals 목록으로만 존재', all('signals' in c and isinstance(c['signals'], list) for c in candidates_d))
    check('D: 약한 매칭(무기다른것)은 후보에서 제외됨', all(c['textragKey'] != '무기다른것' for c in candidates_d))

    # ══════════════════════════════════════════════
    # E -- 구조 신호가 전혀 안 겹치면 candidate 0건.
    # ══════════════════════════════════════════════
    weapon_rec_no_match = {'Type': 'Weapon', 'Buy': 77777, 'Weight': 99999.0, 'Attack': 12345, 'Slots': 9, 'WeaponLevel': 9}
    candidates_e = bci.generate_structural_candidates(weapon_rec_no_match, textrag_items)
    check('E: 신호가 전혀 안 겹치면 candidate 0건', candidates_e == [])

    # 카드는 구조 신호(buy/weight)가 TextRAG에서 type별 상수라 candidate를 만들지 않는다.
    card_rec = {'Type': 'Card', 'Buy': 20, 'Weight': 10.0}
    check('E: 카드는 구조 candidate를 아예 생성하지 않음(잡음 방지)', bci.generate_structural_candidates(card_rec, textrag_items) == [])

    # ══════════════════════════════════════════════
    # F -- identity map에 같은 rAthena item id가 서로 다른 verified TextRAG key로
    # 연결되면 FAIL.
    # ══════════════════════════════════════════════
    identity_dup_id = {
        'items': [
            {'aegisName': 'Foo_A', 'rathenaItemId': 100, 'textragKey': '아이템A', 'status': 'verified', 'evidence': ['x']},
            {'aegisName': 'Foo_B', 'rathenaItemId': 100, 'textragKey': '아이템B', 'status': 'verified', 'evidence': ['y']},
        ]
    }
    combos_ref = {'combos': [{'requiredItems': [{'aegisName': 'Foo_A'}, {'aegisName': 'Foo_B'}]}]}
    fails_f, _ = build.audit_combo_item_identity(identity_dup_id, combos_ref)
    check('F: 같은 rAthena id -> 서로 다른 verified key는 FAIL', any('서로 다른 verified' in f for f in fails_f))

    # ══════════════════════════════════════════════
    # G -- identity map 안에 같은 aegisName이 중복 행으로 존재하면 FAIL.
    # ══════════════════════════════════════════════
    identity_dup_aegis = {
        'items': [
            {'aegisName': 'Dup_Item', 'rathenaItemId': 200, 'textragKey': '아이템C', 'status': 'verified', 'evidence': ['x']},
            {'aegisName': 'Dup_Item', 'rathenaItemId': 200, 'textragKey': '아이템C', 'status': 'verified', 'evidence': ['x']},
        ]
    }
    combos_ref_g = {'combos': [{'requiredItems': [{'aegisName': 'Dup_Item'}]}]}
    fails_g, _ = build.audit_combo_item_identity(identity_dup_aegis, combos_ref_g)
    check('G: identity map 내 중복 aegisName 행은 FAIL', any('중복 행' in f for f in fails_g))

    # 정상 identity map -> FAIL 0, ambiguous/unresolved-existing/missing은 WARN만.
    identity_ok = {
        'items': [
            {'aegisName': 'Ok_Item', 'rathenaItemId': 300, 'textragKey': '아이템D', 'status': 'verified', 'evidence': ['x']},
            {'aegisName': 'Amb_Item', 'status': 'ambiguous', 'evidence': ['x']},
            {'aegisName': 'Unresolved_Item', 'status': 'unresolved-existing', 'evidence': ['x']},
            {'aegisName': 'Missing_Item', 'status': 'missing', 'evidence': ['x']},
        ]
    }
    combos_ref_ok = {'combos': [{'requiredItems': [
        {'aegisName': 'Ok_Item'}, {'aegisName': 'Amb_Item'}, {'aegisName': 'Unresolved_Item'}, {'aegisName': 'Missing_Item'},
    ]}]}
    fails_ok, warns_ok = build.audit_combo_item_identity(identity_ok, combos_ref_ok)
    check('G: 정상 identity map은 FAIL 0', fails_ok == [])
    check('G: ambiguous/unresolved-existing/missing은 WARN 3건', len(warns_ok) == 3)

    # ══════════════════════════════════════════════
    # H -- identity map을 canonicalize()에 연결하면 이전에는 못 풀던 아이템이
    # resolved=True로 바뀐다(경로 우선순위: identity map 1순위, 기존 _aegis 2순위).
    # ══════════════════════════════════════════════
    rathena_lookup_h = {'New_Weapon': {'id': 5001, 'name': 'New Weapon', 'type': 'Weapon'}}
    body_h = [{'Combos': [{'Combo': ['New_Weapon']}], 'Script': 'bonus bStr,2;'}]

    combos_without_identity = cc.canonicalize(body_h, {}, {}, rathena_lookup_h)
    check('H: identity map 없이는 New_Weapon 미해결', combos_without_identity[0]['requiredItems'][0]['resolved'] is False)
    check('H: identity map 없이는 combo status가 source-needed', combos_without_identity[0]['status'] == 'source-needed')

    identity_verified_h = {'New_Weapon': '새무기'}
    combos_with_identity = cc.canonicalize(body_h, {}, {}, rathena_lookup_h, identity_verified_h)
    check('H: identity map 연결 후 New_Weapon resolved=True', combos_with_identity[0]['requiredItems'][0]['resolved'] is True)
    check('H: textragKey가 identity map 값으로 채워짐', combos_with_identity[0]['requiredItems'][0]['textragKey'] == '새무기')
    check('H: 콤보 status도 verified로 승격(효과가 전부 지원되므로)', combos_with_identity[0]['status'] == 'verified')

    # ══════════════════════════════════════════════
    # I -- identity map으로 해결된 ammo 아이템은 item 자체는 resolved=True/isAmmo=True지만
    # 콤보 status는 runtime-blocked로 남는다(activeAmmo 미구현, identity != runtime 활성화).
    # ══════════════════════════════════════════════
    rathena_lookup_i = {'New_Arrow': {'id': 5002, 'name': 'New Arrow', 'type': 'Ammo'}}
    body_i = [{'Combos': [{'Combo': ['New_Arrow']}], 'Script': 'bonus bStr,2;'}]
    identity_verified_i = {'New_Arrow': '새화살'}
    combos_i = cc.canonicalize(body_i, {}, {}, rathena_lookup_i, identity_verified_i)
    check('I: ammo 아이템도 identity map으로 resolved=True', combos_i[0]['requiredItems'][0]['resolved'] is True)
    check('I: isAmmo 플래그 유지', combos_i[0]['requiredItems'][0]['isAmmo'] is True)
    check('I: 콤보 status는 runtime-blocked(효과 지원 + identity 해결 되어도 activeAmmo 미구현)', combos_i[0]['status'] == 'runtime-blocked')

    # ══════════════════════════════════════════════
    # J -- fuzzy/수작업 candidate(MANUAL_CARD_CANDIDATES)는 candidate로만 남고
    # 절대 자동으로 status=verified가 되지 않는다. MANUAL_CARD_CANDIDATES 자체는
    # P2-A.1 시점 그대로 남아 있고(코드 삭제 안 함), 어떤 aegisName에도 decision을
    # 직접 대입하지 않는다는 구조를 확인한다(P2-A.2 review manifest가 이 두 건을
    # 실제 rAthena Script 대조로 재검증해 반박했다는 것은 별개의, 더 강한 사실이고
    # -- combo-item-identity-review-test.py 쪽에서 검증한다).
    # ══════════════════════════════════════════════
    check('J: MANUAL_CARD_CANDIDATES 상수 자체가 여전히 존재(삭제 안 함)', len(bci.MANUAL_CARD_CANDIDATES) == 2)
    for aegis, manual in bci.MANUAL_CARD_CANDIDATES.items():
        check(f'J: {aegis}의 manual candidate 항목에 textragKey/note만 있고 status/decision 필드가 없음(자동 확정 아님)',
              set(manual.keys()) == {'textragKey', 'note'})

    # ══════════════════════════════════════════════
    # 최종 -- 실제 source/data/combo-item-identity.json에 대해 audit_combo_item_identity를
    # 그대로 실행해 FAIL 0건인지 확인(합성 fixture가 아닌 실데이터 최종 검증).
    # ══════════════════════════════════════════════
    import json
    with open(os.path.join(ROOT, 'source', 'data', 'combo-item-identity.json'), encoding='utf-8') as f:
        real_identity_file = json.load(f)
    with open(os.path.join(ROOT, 'source', 'data', 'db-combos.json'), encoding='utf-8') as f:
        real_combos_file = json.load(f)
    real_fails, real_warns = build.audit_combo_item_identity(real_identity_file, real_combos_file)
    check(f'최종: 현재 combo-item-identity.json은 audit FAIL 0건 (WARN {len(real_warns)}건)', real_fails == [])
    check('최종: identity map 278개 행 전부 존재', real_identity_file['totalItems'] == 278)

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
