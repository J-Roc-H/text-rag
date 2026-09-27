"""tools/canonicalize_combos.py + build.audit_item_combos() 회귀 테스트 (P2-A, 2026-09-26).

실제 canonicalize()/split_statements()/parse_statement()/resolve_item()/
build_textrag_aegis_index()/audit_item_combos()를 그대로 실행한다(재구현 아님) --
YAML 대신 PyYAML이 실제로 만들어 줄 것과 동일한 순수 dict/list 픽스처를 쓴다(이것도
"실제 함수 실행", split_statements가 원본 YAML 문자열이 아니라 딱 Script 필드 문자열만
받으므로 YAML 파싱 자체는 이 테스트의 관심사가 아니다).

실행: python tests/item-combo-audit-test.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build  # noqa: E402
import canonicalize_combos as cc  # noqa: E402


def check(label, condition):
    if not condition:
        raise SystemExit(f'FAIL - {label}')
    print(f'OK - {label}')


def main():
    textrag_items = {
        '드래곤슬레이어': {'type': '무기', '_aegis': 'Dragon_Slayer'},
        '드래곤브레스': {'type': '무기', '_aegis': 'Dragon_Breath'},
        # 의도적 충돌: 두 TextRAG 키가 같은 _aegis를 공유 -- ambiguous로 남아야 한다.
        '충돌아이템A': {'type': '갑옷', '_aegis': 'Ambig_Item'},
        '충돌아이템B': {'type': '갑옷', '_aegis': 'Ambig_Item'},
    }
    unique_index, ambiguous_index = cc.build_textrag_aegis_index(textrag_items)
    rathena_lookup = {
        'Dragon_Slayer': {'id': 1166, 'name': 'Dragon Slayer', 'type': 'Weapon'},
        'Dragon_Breath': {'id': 2527, 'name': 'Dragon Breath', 'type': 'Weapon'},
        'Gae_Bolg': {'id': 1474, 'name': 'Gae Bolg', 'type': 'Weapon'},
        'Unknown_Item': {'id': 9999, 'name': 'Unknown Item', 'type': 'Weapon'},
        'Ambig_Item': {'id': 8888, 'name': 'Ambig Item', 'type': 'Armor'},
        'Steel_Arrow': {'id': 1750, 'name': 'Steel Arrow', 'type': 'Ammo'},
        'Bow_Of_Rudra': {'id': 1727, 'name': 'Bow of Rudra', 'type': 'Weapon'},
    }

    # ══════════════════════════════════════════════
    # A — source entry with one Combo -> 정확히 1개 variant
    # ══════════════════════════════════════════════
    body = [{'Combos': [{'Combo': ['Dragon_Slayer', 'Dragon_Breath']}], 'Script': 'bonus bStr,2;'}]
    combos = cc.canonicalize(body, unique_index, ambiguous_index, rathena_lookup)
    check('A: 단일 Combo entry -> variant 1개', len(combos) == 1)
    check('A: id 형식', combos[0]['id'] == 'rathena-pre-0001-01')

    # ══════════════════════════════════════════════
    # B — 복수 Combo alternatives, 같은 Script -> variant마다 다른 requiredItems, 같은 effects
    # ══════════════════════════════════════════════
    body = [{
        'Combos': [
            {'Combo': ['Dragon_Slayer', 'Dragon_Breath']},
            {'Combo': ['Gae_Bolg', 'Dragon_Breath']},
        ],
        'Script': 'bonus bStr,3;',
    }]
    combos = cc.canonicalize(body, unique_index, ambiguous_index, rathena_lookup)
    check('B: 복수 Combo -> variant 2개', len(combos) == 2)
    check('B: variant 1/2 id', {c['id'] for c in combos} == {'rathena-pre-0001-01', 'rathena-pre-0001-02'})
    check('B: 서로 다른 requiredItems', combos[0]['requiredItems'] != combos[1]['requiredItems'])
    check('B: 같은 rawScript 공유', combos[0]['rawScript'] == combos[1]['rawScript'] == 'bonus bStr,3;')
    check('B: 같은 effects 공유', combos[0]['effects'] == combos[1]['effects'])

    # ══════════════════════════════════════════════
    # C — 모든 item mapping 성공 -> resolved
    # ══════════════════════════════════════════════
    body = [{'Combos': [{'Combo': ['Dragon_Slayer', 'Dragon_Breath']}], 'Script': 'bonus bStr,1;'}]
    combos = cc.canonicalize(body, unique_index, ambiguous_index, rathena_lookup)
    check('C: 전부 resolved', all(r['resolved'] for r in combos[0]['requiredItems']))
    check('C: textragKey 채워짐', combos[0]['requiredItems'][0]['textragKey'] == '드래곤슬레이어')

    # ══════════════════════════════════════════════
    # D — 하나 mapping 실패 -> source-needed
    # ══════════════════════════════════════════════
    body = [{'Combos': [{'Combo': ['Dragon_Slayer', 'Unknown_Item']}], 'Script': 'bonus bStr,1;'}]
    combos = cc.canonicalize(body, unique_index, ambiguous_index, rathena_lookup)
    check('D: status=source-needed', combos[0]['status'] == 'source-needed')
    check('D: 실패쪽만 resolved=False', combos[0]['requiredItems'][1]['resolved'] is False)
    check('D: 성공쪽은 resolved=True', combos[0]['requiredItems'][0]['resolved'] is True)

    # ══════════════════════════════════════════════
    # E — 단순 supported script -> canonical effect 생성 + rawScript 유지
    # ══════════════════════════════════════════════
    body = [{'Combos': [{'Combo': ['Dragon_Slayer', 'Dragon_Breath']}], 'Script': 'bonus bStr,2;\nbonus bMaxHP,300;'}]
    combos = cc.canonicalize(body, unique_index, ambiguous_index, rathena_lookup)
    c = combos[0]
    check('E: status=verified', c['status'] == 'verified')
    check('E: effects 2개', len(c['effects']) == 2)
    check('E: rawScript 원문 그대로', c['rawScript'] == 'bonus bStr,2;\nbonus bMaxHP,300;')
    check('E: unsupportedEffects 없음', c['unsupportedEffects'] == [])

    # ══════════════════════════════════════════════
    # F — unsupported script -> rawScript 유지 + reason 보존
    # ══════════════════════════════════════════════
    body = [{'Combos': [{'Combo': ['Dragon_Slayer', 'Dragon_Breath']}], 'Script': 'bonus bAspdRate,10;'}]
    combos = cc.canonicalize(body, unique_index, ambiguous_index, rathena_lookup)
    c = combos[0]
    check('F: effects 없음', c['effects'] == [])
    check('F: unsupportedEffects 1개', len(c['unsupportedEffects']) == 1)
    check('F: reason 보존', 'bAspdRate' in c['unsupportedEffects'][0]['reason'] or c['unsupportedEffects'][0]['constant'] == 'bAspdRate')
    check('F: rawScript 그대로', c['rawScript'] == 'bonus bAspdRate,10;')
    check('F: status=unsupported', c['status'] == 'unsupported')

    # ══════════════════════════════════════════════
    # G — mixed script: supported + unsupported 동시 보존
    # ══════════════════════════════════════════════
    body = [{'Combos': [{'Combo': ['Dragon_Slayer', 'Dragon_Breath']}],
             'Script': 'bonus bStr,2;\nbonus bAspdRate,10;'}]
    combos = cc.canonicalize(body, unique_index, ambiguous_index, rathena_lookup)
    c = combos[0]
    check('G: effects 1개(bStr)', len(c['effects']) == 1 and c['effects'][0]['key'] == 'str')
    check('G: unsupportedEffects 1개(bAspdRate)', len(c['unsupportedEffects']) == 1)
    check('G: 둘 다 보존 -> status=unsupported(partial, verified로 뭉개지 않음)', c['status'] == 'unsupported')

    # ══════════════════════════════════════════════
    # H — duplicate ID gate: build.audit_item_combos()가 FAIL 내야 한다
    # ══════════════════════════════════════════════
    fake_data = {'combos': [
        {'id': 'dup-1', 'requiredItems': [{'aegisName': 'A', 'resolved': True}], 'rawScript': 'x;',
         'effects': [], 'unsupportedEffects': [], 'status': 'verified', 'statusReasons': []},
        {'id': 'dup-1', 'requiredItems': [{'aegisName': 'B', 'resolved': True}], 'rawScript': 'y;',
         'effects': [], 'unsupportedEffects': [], 'status': 'verified', 'statusReasons': []},
    ]}
    fails, _ = build.audit_item_combos(fake_data)
    check('H: 중복 id는 FAIL', any('중복' in f for f in fails))

    # 부가: 구조 결함들도 각각 FAIL로 잡히는지(생성 파이프라인 안전망)
    fails, _ = build.audit_item_combos({'combos': [
        {'id': 'x-1', 'requiredItems': [], 'rawScript': 'x;', 'effects': [], 'unsupportedEffects': [],
         'status': 'verified', 'statusReasons': []},
    ]})
    check('H: requiredItems 비어있으면 FAIL', any('requiredItems' in f for f in fails))

    fails, _ = build.audit_item_combos({'combos': [
        {'id': 'x-2', 'requiredItems': [{'aegisName': 'A', 'resolved': True}], 'rawScript': '',
         'effects': [], 'unsupportedEffects': [], 'status': 'verified', 'statusReasons': []},
    ]})
    check('H: rawScript 누락이면 FAIL', any('rawScript' in f for f in fails))

    fails, _ = build.audit_item_combos({'combos': [
        {'id': 'x-3', 'requiredItems': [{'aegisName': 'A', 'resolved': True}], 'rawScript': 'x;',
         'effects': [{'type': 'combat', 'key': 'totallyUnknownKey', 'value': 1}],
         'unsupportedEffects': [], 'status': 'verified', 'statusReasons': []},
    ]})
    check('H: 알려지지 않은 effect 키는 FAIL', any('알려지지 않은 canonical effect' in f for f in fails))

    fails, _ = build.audit_item_combos({'combos': [
        {'id': 'x-4', 'requiredItems': [{'aegisName': 'A', 'resolved': True}], 'rawScript': 'x;',
         'effects': [], 'unsupportedEffects': [{'rawStatement': 'x', 'constant': 'x'}],
         'status': 'unsupported', 'statusReasons': []},
    ]})
    check('H: reason 없는 unsupportedEffects는 FAIL', any('reason' in f for f in fails))

    # 정상 데이터는 FAIL 0
    fails, warns = build.audit_item_combos({'combos': [
        {'id': 'x-5', 'requiredItems': [{'aegisName': 'A', 'resolved': False}], 'rawScript': 'x;',
         'effects': [], 'unsupportedEffects': [{'rawStatement': 'x', 'constant': 'x', 'reason': '테스트'}],
         'status': 'unsupported', 'statusReasons': ['테스트']},
    ]})
    check('H: 정상 구조는 FAIL 0', fails == [])

    # ══════════════════════════════════════════════
    # I — ammo combo -> runtime-blocked (그 외 전부 verified 조건을 만족시켜야 승격됨)
    # ══════════════════════════════════════════════
    ammo_index_items = {
        '보우오브루드라': {'type': '무기', '_aegis': 'Bow_Of_Rudra'},
        '강철화살': {'type': '재료', '_aegis': 'Steel_Arrow'},
    }
    ammo_unique, ammo_ambiguous = cc.build_textrag_aegis_index(ammo_index_items)
    body = [{'Combos': [{'Combo': ['Bow_Of_Rudra', 'Steel_Arrow']}], 'Script': 'bonus bStr,1;'}]
    combos = cc.canonicalize(body, ammo_unique, ammo_ambiguous, rathena_lookup)
    check('I: ammo 포함 -> runtime-blocked', combos[0]['status'] == 'runtime-blocked')
    check('I: isAmmo 플래그', any(r['isAmmo'] for r in combos[0]['requiredItems']))
    check('I: statusReasons 존재', len(combos[0]['statusReasons']) > 0)

    # ══════════════════════════════════════════════
    # 부가: split_statements가 조건문을 안전하게 분리하는지(§20/§16 핵심 안전장치)
    # ══════════════════════════════════════════════
    script = 'bonus bMaxHP,300;\nif (getequiprefinerycnt(EQI_GARMENT) > 10) {\n bonus2 bSubEle,Ele_Neutral,30;\n}\nelse {\n bonus2 bSubEle,Ele_Neutral,1;\n}'
    unconditional, conditional = cc.split_statements(script)
    check('부가: 무조건 문장 1개만 분리', len(unconditional) == 1 and 'bMaxHP' in unconditional[0])
    check('부가: if/else 전체가 conditionalRaw 1개로 보존', len(conditional) == 1 and 'if' in conditional[0] and 'else' in conditional[0])

    # 실제 현재 db-combos.json이 있으면 그 데이터로도 build.audit_item_combos가 FAIL 0인지 확인
    combos_path = os.path.join(ROOT, 'source', 'data', 'db-combos.json')
    if os.path.exists(combos_path):
        import json
        real_data = json.load(open(combos_path, encoding='utf-8'))
        fails, warns = build.audit_item_combos(real_data)
        check(f'현재 db-combos.json은 audit_item_combos FAIL 0건 (WARN {len(warns)}건)', fails == [])

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
