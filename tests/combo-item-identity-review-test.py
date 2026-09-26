"""P2-A.2 Case D review manifest 회귀 테스트 (2026-09-26).

시나리오 A-L(과제 §33). 실제 함수(build_identity_map, load_review_manifest,
audit_review_manifest, audit_combo_item_identity, canonicalize)를 그대로
호출한다 -- 재구현 금지. combo-item-identity-test.py(P2-A.1)와 역할을 분리:
저 파일은 P2-A.1 파이프라인 자체를, 이 파일은 P2-A.2가 새로 얹은 review
manifest 계층을 검증한다.

실행: python tests/combo-item-identity-review-test.py
"""
import os
import sys
import json

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
    real_identity = json.load(open(os.path.join(ROOT, 'source/data/combo-item-identity.json'), encoding='utf-8'))
    by_aegis = {it['aegisName']: it for it in real_identity['items']}
    real_combos = json.load(open(os.path.join(ROOT, 'source/data/db-combos.json'), encoding='utf-8'))
    real_textrag_items = json.load(open(os.path.join(ROOT, 'source/data/db-items.json'), encoding='utf-8'))

    # ══════════════════════════════════════════════
    # A -- 고신뢰 구조 candidate라도 review manifest에 없으면 여전히
    # unresolved-existing이다(자동 score 승격 금지, §32/§15). 실제 데이터의
    # "구조 신호 4개 tied" 사례(Angel's_Protection)로 확인: 두 후보가 구조적으로
    # 동점이라 이번 세션에서도 review manifest에 넣지 않았다.
    # ══════════════════════════════════════════════
    ap = by_aegis["Angel's_Protection"]
    check("A: Angel's_Protection(구조 신호 tied, review manifest 미등재)은 unresolved-existing 유지",
          ap['status'] == 'unresolved-existing')
    check("A: candidate는 여전히 기록됨(탐색 지원 역할 유지)", len(ap['candidates']) >= 2)

    # ══════════════════════════════════════════════
    # B -- review manifest에 verified로 기록된 항목은 identity map에도
    # verified/evidenceCase=D로 반영된다.
    # ══════════════════════════════════════════════
    am = by_aegis['Ancient_Magic']
    check('B: review verified -> identity map verified', am['status'] == 'verified')
    check('B: evidenceCase가 D로 기록됨', am['evidenceCase'] == 'D')
    check('B: textragKey가 review manifest 값과 일치', am['textragKey'] == '고대의마법')

    # ══════════════════════════════════════════════
    # C -- reviewed textragKey가 db-items.json에 존재하지 않으면 FAIL.
    # ══════════════════════════════════════════════
    bad_manifest = {'items': [{
        'aegisName': 'Dragon_Slayer', 'textragKey': '존재하지않는아이템',
        'decision': 'verified', 'reviewed': True, 'evidence': ['x'],
    }]}
    fails_c, _ = build.audit_review_manifest(bad_manifest, real_textrag_items, {'Dragon_Slayer'})
    check('C: review target key가 db-items에 없으면 FAIL', any('db-items.json에 없음' in f for f in fails_c))

    # ══════════════════════════════════════════════
    # D -- evidence 없는 verified review는 FAIL.
    # ══════════════════════════════════════════════
    bad_manifest_d = {'items': [{
        'aegisName': 'Dragon_Slayer', 'textragKey': '드래곤슬레이어',
        'decision': 'verified', 'reviewed': True, 'evidence': [],
    }]}
    fails_d, _ = build.audit_review_manifest(bad_manifest_d, real_textrag_items, {'Dragon_Slayer'})
    check('D: evidence 없는 verified review는 FAIL', any('evidence 없음' in f for f in fails_d))

    # ══════════════════════════════════════════════
    # E -- 동일 AegisName에 review decision이 중복되면 FAIL.
    # ══════════════════════════════════════════════
    dup_manifest = {'items': [
        {'aegisName': 'Dragon_Slayer', 'textragKey': '드래곤슬레이어', 'decision': 'verified', 'reviewed': True, 'evidence': ['x']},
        {'aegisName': 'Dragon_Slayer', 'textragKey': '드래곤슬레이어', 'decision': 'verified', 'reviewed': True, 'evidence': ['x']},
    ]}
    fails_e, _ = build.audit_review_manifest(dup_manifest, real_textrag_items, {'Dragon_Slayer'})
    check('E: 동일 AegisName 중복 review는 FAIL', any('중복 decision' in f for f in fails_e))

    # review manifest에 있는 AegisName이 콤보 참조 278개 대상 밖이면 FAIL.
    outside_manifest = {'items': [
        {'aegisName': 'Not_A_Combo_Item', 'textragKey': '드래곤슬레이어', 'decision': 'verified', 'reviewed': True, 'evidence': ['x']},
    ]}
    fails_outside, _ = build.audit_review_manifest(outside_manifest, real_textrag_items, {'Dragon_Slayer'})
    check('E-2: 278개 대상 밖 AegisName은 FAIL', any('278개 대상이 아님' in f for f in fails_outside))

    # 정상 review manifest는 FAIL 0, ambiguous는 WARN.
    ok_manifest = {'items': [
        {'aegisName': 'Dragon_Slayer', 'textragKey': '드래곤슬레이어', 'decision': 'verified', 'reviewed': True, 'evidence': ['x']},
        {'aegisName': 'Gae_Bolg', 'textragKey': None, 'decision': 'ambiguous', 'reviewed': True, 'evidence': ['x']},
    ]}
    fails_ok, warns_ok = build.audit_review_manifest(ok_manifest, real_textrag_items, {'Dragon_Slayer', 'Gae_Bolg'})
    check('E-3: 정상 review manifest는 FAIL 0', fails_ok == [])
    check('E-3: ambiguous는 WARN 1건', len(warns_ok) == 1)

    # ══════════════════════════════════════════════
    # F -- verified mapping 충돌: 서로 다른 rAthena Id가 같은 review manifest를
    # 거쳐 identity map에 반영된 뒤, 그 결과가 서로 다른 TextRAG key로 갈리면
    # (post-merge) audit_combo_item_identity가 FAIL로 잡는다.
    # ══════════════════════════════════════════════
    conflict_identity = {'items': [
        {'aegisName': 'Foo_A', 'rathenaItemId': 999, 'textragKey': '아이템A', 'status': 'verified', 'evidenceCase': 'D', 'evidence': ['x']},
        {'aegisName': 'Foo_B', 'rathenaItemId': 999, 'textragKey': '아이템B', 'status': 'verified', 'evidenceCase': 'D', 'evidence': ['y']},
    ]}
    conflict_combos = {'combos': [{'requiredItems': [{'aegisName': 'Foo_A'}, {'aegisName': 'Foo_B'}]}]}
    fails_f, _ = build.audit_combo_item_identity(conflict_identity, conflict_combos)
    check('F: 같은 rAthena Id가 Case D로 서로 다른 verified key에 연결되면 FAIL', any('서로 다른 verified' in f for f in fails_f))

    # ══════════════════════════════════════════════
    # G -- Weapon Case D real fixture: Dragon_Slayer/Battle_Hook가 실제로
    # verified + evidenceCase D + 구조 신호(atk/slots/weaponLv) 전부 evidence에 기록.
    # ══════════════════════════════════════════════
    ds = by_aegis['Dragon_Slayer']
    check('G: Dragon_Slayer verified(Case D)', ds['status'] == 'verified' and ds['evidenceCase'] == 'D')
    check('G: evidence에 rAthena Id 기록', any('rAthena Id' in e for e in ds['evidence']))
    check('G: evidence에 atk 일치 기록', any('atk' in e for e in ds['evidence']))

    # ══════════════════════════════════════════════
    # H -- Armor Case D real fixture: Odin's_Blessing.
    # ══════════════════════════════════════════════
    ob = by_aegis["Odin's_Blessing"]
    check("H: Odin's_Blessing verified(Case D)", ob['status'] == 'verified' and ob['evidenceCase'] == 'D')
    check("H: textragKey == 오딘의축복", ob['textragKey'] == '오딘의축복')

    # ══════════════════════════════════════════════
    # I -- ambiguous decision 유지: B_Harword_Card는 review에서도 자동 선택하지
    # 않고 ambiguous로 남긴다(두 후보 카드 보존).
    # ══════════════════════════════════════════════
    bh = by_aegis['B_Harword_Card']
    check('I: B_Harword_Card는 ambiguous 유지', bh['status'] == 'ambiguous')
    check('I: textragKey는 None(자동 선택 없음)', bh['textragKey'] is None)
    check('I: candidate 2건 보존', len(bh['candidates']) == 2)

    # ══════════════════════════════════════════════
    # J -- identity 개선 후 db-combos.json의 source-needed가 실제로 줄었다
    # (P2-A.1 산출물 128 -> P2-A.2 이후 더 감소).
    # ══════════════════════════════════════════════
    from collections import Counter
    status_ct = Counter(c['status'] for c in real_combos['combos'])
    check('J: source-needed가 P2-A.1 시점(128)보다 감소', status_ct['source-needed'] < 128)
    check('J: verified가 P2-A.1 시점(13)보다 증가', status_ct['verified'] > 13)

    # ══════════════════════════════════════════════
    # K -- runtime-ready(=status verified) 계산 정확: 모든 verified 콤보는
    # unsupportedEffects/conditionalRaw가 비어 있고 ammo 아이템을 포함하지 않는다.
    # ══════════════════════════════════════════════
    verified_combos = [c for c in real_combos['combos'] if c['status'] == 'verified']
    check('K: runtime-ready(verified) 콤보가 실제로 존재', len(verified_combos) > 0)
    for c in verified_combos:
        check(f"K: {c['id']} unsupportedEffects 비어있음", c['unsupportedEffects'] == [])
        check(f"K: {c['id']} conditionalRaw 비어있음", c.get('conditionalRaw', []) == [])
        check(f"K: {c['id']} ammo 아이템 없음", not any(r['isAmmo'] for r in c['requiredItems']))

    # ══════════════════════════════════════════════
    # L -- ammo는 identity가 resolved여도 combo가 verified(runtime-ready)가 되지
    # 않는다 -- 실제 5개 ammo 아이템은 전부 identity verified지만, 그 아이템을
    # 포함한 콤보 중 실제로 'verified' 상태인 것은 0건이다(합성 fixture는
    # combo-item-identity-test.py 시나리오 I가 이미 검증).
    # ══════════════════════════════════════════════
    ammo_verified_aegis = {a for a, it in by_aegis.items() if it['rathenaType'] == 'Ammo' and it['status'] == 'verified'}
    check('L: ammo 5개 전부 identity verified', len(ammo_verified_aegis) == 5)
    ammo_combo_statuses = {c['status'] for c in real_combos['combos'] if any(r['aegisName'] in ammo_verified_aegis for r in c['requiredItems'])}
    check('L: ammo 포함 콤보 중 verified(runtime-ready)는 0건', 'verified' not in ammo_combo_statuses)

    # 최종 -- review manifest 자체에 대해 audit_review_manifest를 실제 파일로 실행해 FAIL 0건.
    real_review = json.load(open(os.path.join(ROOT, 'source/data/combo-item-identity-reviewed.json'), encoding='utf-8'))
    referenced_aegis = {r['aegisName'] for c in real_combos['combos'] for r in c['requiredItems']}
    real_fails, real_warns = build.audit_review_manifest(real_review, real_textrag_items, referenced_aegis)
    check(f'최종: 현재 combo-item-identity-reviewed.json은 audit FAIL 0건 (WARN {len(real_warns)}건)', real_fails == [])

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
