"""P2-A.6 — identity collision 감사 회귀 테스트.

동일 textragKey에 복수 rAthena AegisName이 매핑된 경우(combo-item-identity.json 역매핑
충돌)를 canonicalize_combos.py가 IDENTITY_COLLISION_JUDGMENTS(rAthena item_db_equip.yml
실코드 대조로 확인한 근거)로만 해소하는지, 그리고 그 결과가 db-combos.json에 정확히
반영됐는지 검증한다. 실제 함수(compute_identity_collisions/audit_identity_collision_
coverage/detect_identity_collisions/canonicalize)와 실제 산출물(db-combos.json)을 그대로
쓴다 -- 재구현 금지.

실행: python tests/combo-identity-collision-audit-test.py
"""
import os
import sys
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))
import canonicalize_combos as cc  # noqa: E402


def check(label, condition):
    if not condition:
        raise SystemExit(f'FAIL - {label}')
    print(f'OK - {label}')


def main():
    real_combos = json.load(open(os.path.join(ROOT, 'source/data/db-combos.json'), encoding='utf-8'))
    by_id = {c['id']: c for c in real_combos['combos']}

    # ══════════════════════════════════════════════
    # A — combo-item-identity.json 전체 역매핑 충돌 전수(6개, 하드코딩 예상치 아니라
    # generator를 그대로 실행해 재확인) 가 전부 IDENTITY_COLLISION_JUDGMENTS에 등재됨.
    # ══════════════════════════════════════════════
    identity_map = cc.load_json(cc.IDENTITY_MAP_JSON)
    identity_verified = cc.load_identity_verified_map(identity_map)
    collisions = cc.compute_identity_collisions(identity_verified)
    check('A: identity collision textragKey 6개 전수 발견', len(collisions) == 6)
    expected_keys = {'롱혼', '매직코트', '닌자슈츠', '아머', '서바이버로드', '런닝셔츠'}
    check('A: 발견된 충돌 키가 정확히 예상 6종과 일치', set(collisions.keys()) == expected_keys)
    for key, aegis_set in collisions.items():
        judgment = cc.IDENTITY_COLLISION_JUDGMENTS.get(key)
        check(f'A: {key} 충돌이 IDENTITY_COLLISION_JUDGMENTS에 등재됨', judgment is not None)
        check(f'A: {key}의 실제 aegis 집합이 등재된 집합의 부분집합', aegis_set.issubset(judgment['aegisNames']))
        check(f'A: {key} judgment는 exclusive-alias', judgment['judgment'] == 'exclusive-alias')

    # ══════════════════════════════════════════════
    # B — audit_identity_collision_coverage()는 등재되지 않은 신규 충돌을 즉시 raise한다
    # (추측 병합 금지 가드 자체를 검증 -- 등재 표에서 하나를 지운 사본으로 재현).
    # ══════════════════════════════════════════════
    tampered = dict(cc.IDENTITY_COLLISION_JUDGMENTS)
    del tampered['매직코트']
    original = cc.IDENTITY_COLLISION_JUDGMENTS
    cc.IDENTITY_COLLISION_JUDGMENTS = tampered
    try:
        raised = False
        try:
            cc.audit_identity_collision_coverage(identity_verified)
        except ValueError:
            raised = True
        check('B: 등재 표에서 하나를 지우면 audit_identity_collision_coverage가 raise', raised)
    finally:
        cc.IDENTITY_COLLISION_JUDGMENTS = original
    # 원상복구 후에는 다시 통과해야 한다(테스트 격리 확인).
    collisions_after_restore = cc.audit_identity_collision_coverage(identity_verified)
    check('B: 표 복구 후에는 다시 정상 통과', len(collisions_after_restore) == 6)

    # ══════════════════════════════════════════════
    # C — 실제 db-combos.json에 반영된 canonical/duplicate 역할과 status가 정확함.
    # entry 9/13/34/35는 단순 pair, entry 36은 내부적으로 두 개의 독립 pair로 분리돼야
    # 한다(G_Strings/G_Strings_는 collision이 아니라 서로 다른 textragKey이므로 4-way
    # 그룹으로 뭉쳐지면 안 됨).
    # ══════════════════════════════════════════════
    pairs = [
        ('rathena-pre-0009-01', 'rathena-pre-0009-02', '매직코트'),
        ('rathena-pre-0013-01', 'rathena-pre-0013-02', '서바이버로드'),
        ('rathena-pre-0034-01', 'rathena-pre-0034-02', '아머'),
        ('rathena-pre-0035-01', 'rathena-pre-0035-02', '닌자슈츠'),
        ('rathena-pre-0036-01', 'rathena-pre-0036-02', '런닝셔츠'),
        ('rathena-pre-0036-03', 'rathena-pre-0036-04', '런닝셔츠'),
    ]
    for canonical_id, duplicate_id, key in pairs:
        canonical, duplicate = by_id[canonical_id], by_id[duplicate_id]
        check(f'C: {canonical_id}(canonical) status=verified', canonical['status'] == 'verified')
        check(f'C: {duplicate_id}(duplicate) status=runtime-blocked', duplicate['status'] == 'runtime-blocked')
        check(f'C: {duplicate_id}.identityCollision.canonicalId == {canonical_id}',
              duplicate['identityCollision']['canonicalId'] == canonical_id)
        check(f'C: {duplicate_id}.identityCollision.role == duplicate', duplicate['identityCollision']['role'] == 'duplicate')
        check(f'C: {canonical_id}.identityCollision.role == canonical', canonical['identityCollision']['role'] == 'canonical')
        check(f'C: {duplicate_id}에 identity collision statusReasons 기록됨',
              any('identity collision' in r for r in duplicate['statusReasons']))
        check(f'C: collisionTextragKeys에 {key} 포함', key in canonical['identityCollision']['collisionTextragKeys'])

    # entry 36이 4-way로 뭉쳐지지 않고 2개의 독립 pair로 남아 있는지(서로 다른 canonicalId).
    check('C: 0036-01/02와 0036-03/04는 서로 다른 canonicalId(4-way 그룹 아님)',
          by_id['rathena-pre-0036-01']['identityCollision']['canonicalId'] !=
          by_id['rathena-pre-0036-03']['identityCollision']['canonicalId'])
    check('C: 0036-01의 memberIds는 [01,02]뿐(03/04 포함 안 됨)',
          set(by_id['rathena-pre-0036-01']['identityCollision']['memberIds']) ==
          {'rathena-pre-0036-01', 'rathena-pre-0036-02'})

    # entry 2(롱혼, unsupported)도 문서화만 되고 status는 그대로(이미 다른 사유로 unsupported).
    c2a, c2b = by_id['rathena-pre-0002-01'], by_id['rathena-pre-0002-02']
    check('C: 0002-01/02(unsupported)도 identityCollision 문서화됨', c2a['identityCollision'] is not None and c2b['identityCollision'] is not None)
    check('C: 0002-01/02는 원래 status(unsupported) 유지(이미 verified가 아니었으므로 강등 대상 아님)',
          c2a['status'] == 'unsupported' and c2b['status'] == 'unsupported')

    # 짝 없는 단독 참조(0003-01)는 identityCollision이 없어야 한다.
    check('C: 0003-01(짝 없는 롱혼 단독 참조)은 identityCollision 없음', by_id['rathena-pre-0003-01']['identityCollision'] is None)
    # identity collision과 무관한 콤보(0001-01)도 identityCollision이 없어야 한다.
    check('C: 0001-01(무관 콤보)은 identityCollision 없음', by_id['rathena-pre-0001-01']['identityCollision'] is None)

    # ══════════════════════════════════════════════
    # D — 재산출된 집계: verified/runtime-blocked/unsupported/source-needed.
    # 하드코딩된 기대치가 아니라 db-combos.json 자체를 세어 재확인한다(§추측 금지와 같은
    # 원칙 -- generator 결과를 그대로 재계산).
    # ══════════════════════════════════════════════
    counts = {}
    for c in real_combos['combos']:
        counts[c['status']] = counts.get(c['status'], 0) + 1
    check('D: 전체 variant 수 156(불변)', sum(counts.values()) == 156)
    check('D: verified 41건(47 - identity collision duplicate 6건)', counts.get('verified') == 41)
    check('D: runtime-blocked 6건(identity collision duplicate 6건, ammo는 현재 0건)', counts.get('runtime-blocked') == 6)
    check('D: unsupported 51건(불변 -- identity collision이 상태를 바꾸지 않음)', counts.get('unsupported') == 51)
    check('D: source-needed 58건(불변)', counts.get('source-needed') == 58)
    check('D: meta.statusCounts가 재계산 값과 일치', real_combos['meta']['statusCounts'] == counts)
    check('D: meta.identityCollisionKeys가 6종 전부 포함', set(real_combos['meta']['identityCollisionKeys']) == expected_keys)
    check('D: meta.identityCollisionGroupCount == 7(verified pair 5 + entry36 분리로 +1 = 6, + entry2 unsupported pair 1 = 7)',
          real_combos['meta']['identityCollisionGroupCount'] == 7)

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
