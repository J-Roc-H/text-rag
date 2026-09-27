"""P2-A.3 잔여 장비 identity 회수 회귀 테스트 (2026-09-26).

시나리오 A-L(과제 §30). combo-item-identity-review-test.py(P2-A.2)와 역할
분리: 이 파일은 P2-A.3이 새로 추가한 것만 검증한다 -- Case E(세트-context),
equip location/required level/Script mismatch에 의한 candidate 기각,
동점+negative-evidence 해소, identity-complete 집계, effect-support backlog,
runtime-ready 종류 분포.

실행: python tests/combo-item-identity-final-review-test.py
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
    real_review = json.load(open(os.path.join(ROOT, 'source/data/combo-item-identity-reviewed.json'), encoding='utf-8'))
    review_by_aegis = {it['aegisName']: it for it in real_review['items']}
    structural = json.load(open(os.path.join(ROOT, 'source/reference/rathena-pre-re/item_db_structural_278.json'), encoding='utf-8'))

    # ══════════════════════════════════════════════
    # A -- Case E(세트-context corroboration + 개별 구조 증거): Diabolus_Robe는
    # 3자 구조 동점(마왕의로브/오를레앙의제복/디바인클로스, 전부 reqLv55 동일)이었지만
    # 이미 검증된 Diabolus_Boots/Manteau/Armor와 같은 "마왕" 세트 테마라는
    # combo-context 증거 + 그 후보만 실제로 마왕 테마 desc를 가진다는 개별 증거가
    # 결합돼 verified로 승격했다.
    # ══════════════════════════════════════════════
    dr = by_aegis['Diabolus_Robe']
    check('A: Diabolus_Robe verified (Case D, 세트-context corroboration 포함)', dr['status'] == 'verified')
    check('A: textragKey == 마왕의로브', dr['textragKey'] == '마왕의로브')
    rev = review_by_aegis['Diabolus_Robe']
    check('A: review evidence에 세트 테마(마왕) 언급 존재', any('마왕' in e for e in rev['evidence']))

    # ══════════════════════════════════════════════
    # B -- 세트 이름만 같아서는(구조 증거 없이) 승격하지 않는다: Cloak_Of_Survival_C는
    # Clack_Of_Servival과 이름이 비슷해 보이지만 실제로는 buy/reqLv가 전혀 다른
    # 별개 아이템임을 확인(§16 "0/없음"과 "미기록" 구분과 같은 성격의 함정
    # 회피) -- 구조 자체가 다르므로 둘을 같은 record로 보지 않고 각각 별도
    # candidate로 확정했다(강제 병합 없음).
    # ══════════════════════════════════════════════
    clack = structural['Clack_Of_Servival']
    cloak_c = structural['Cloak_Of_Survival_C']
    check('B: Clack_Of_Servival과 Cloak_Of_Survival_C는 구조가 다른 별개 record',
          clack.get('Buy') != cloak_c.get('Buy') and clack.get('EquipLevelMin') != cloak_c.get('EquipLevelMin'))
    check('B: 그럼에도 각각 독립적으로 verified(강제 병합 아님)',
          by_aegis['Clack_Of_Servival']['textragKey'] == '생존의망토' and
          by_aegis['Cloak_Of_Survival_C']['textragKey'] == '생존의망토_C')

    # ══════════════════════════════════════════════
    # C -- equip location(Left_Hand) 처리 버그 수정 확인: P2-A.2까지는
    # "Left_Hand + Jobs 비어있지 않으면 방패 후보 제외" 휴리스틱이 잘못돼
    # Valkyrja's_Shield가 투구(울캡)/갑옷(천상의로브)과 동점이 됐었다. 버그
    # 수정 후 방패류가 정확히 후보 pool에 들어가 울캡이 사라지고 유일한
    # 진짜 방패 후보(발키리아쉴드)만 남았는지 확인.
    # ══════════════════════════════════════════════
    valk_shield_rec = structural["Valkyrja's_Shield"]
    cands = bci.generate_structural_candidates(valk_shield_rec, json.load(open(os.path.join(ROOT, 'source/data/db-items.json'), encoding='utf-8')))
    check("C: Valkyrja's_Shield 후보 목록에 투구류(울캡)가 더 이상 섞이지 않음",
          all(c['textragKey'] != '울캡' for c in cands))
    check("C: 최상위 후보가 실제 방패(발키리아쉴드)", cands[0]['textragKey'] == '발키리아쉴드')

    # ══════════════════════════════════════════════
    # D -- required level(EquipLevelMin/reqLv) mismatch로 candidate 기각:
    # Tournament_Shield는 4자 구조 동점이었으나 reqLv=50이 정확히 일치하는
    # 후보(토너먼트쉴드)만 남고 나머지(reqLv 55/55/70)는 기각됐다.
    # ══════════════════════════════════════════════
    ts = by_aegis['Tournament_Shield']
    check('D: Tournament_Shield verified(reqLv 필터로 동점 해소)', ts['status'] == 'verified')
    check('D: textragKey == 토너먼트쉴드', ts['textragKey'] == '토너먼트쉴드')
    ts_rev = review_by_aegis['Tournament_Shield']
    check('D: review evidence에 reqLv 언급', any('reqLv' in e or '50' in e for e in ts_rev['evidence']))

    # ══════════════════════════════════════════════
    # E -- rAthena Script mismatch로 candidate 기각 유지: Live_Peach_Tree_Card/
    # Novus__Card는 P2-A.2에서 이미 Script 내용 불일치로 기각됐고, 이번
    # 단계에서도 새 증거 없이는 재판정하지 않는다는 원칙대로 missing 유지.
    # ══════════════════════════════════════════════
    check('E: Live_Peach_Tree_Card는 Script mismatch로 여전히 missing', by_aegis['Live_Peach_Tree_Card']['status'] == 'missing')
    check('E: Novus__Card는 Script mismatch로 여전히 missing', by_aegis['Novus__Card']['status'] == 'missing')

    # ══════════════════════════════════════════════
    # F -- 동점 후보 + negative evidence로 하나만 verified: "전장 세트" 3자
    # 동점(Assaulter_Plate/Elite_Engineer_Armor/Assassin_Robe)이 정확히
    # 1:1 이름 대응으로 전부 서로 다른 key에 verified됐는지 확인(충돌 없음).
    # ══════════════════════════════════════════════
    trio = ['Assaulter_Plate', 'Elite_Engineer_Armor', 'Assassin_Robe']
    trio_keys = {a: by_aegis[a]['textragKey'] for a in trio}
    check('F: 3자 동점이 전부 verified', all(by_aegis[a]['status'] == 'verified' for a in trio))
    check('F: 3자 동점이 서로 다른 key로 확정(충돌 없음)', len(set(trio_keys.values())) == 3)

    # ══════════════════════════════════════════════
    # G -- 동점 후보 + 새 증거 없음 -> unresolved 유지: Alarm_Mask(3자 동점,
    # reqLv 등 결정적 증거 없음)는 P2-A.3에서도 재판정하지 않고 그대로 보류.
    # ══════════════════════════════════════════════
    check('G: Alarm_Mask는 새 증거 없어 unresolved-existing 유지', by_aegis['Alarm_Mask']['status'] == 'unresolved-existing')
    check('G: Alarm_Mask는 review manifest에 등재되지 않음(억지 확정 없음)', 'Alarm_Mask' not in review_by_aegis)

    # ══════════════════════════════════════════════
    # H -- true missing 유지: Hollgrehenn_Hammer는 이번 단계에서도 TextRAG에
    # 대응 후보를 전혀 찾지 못해 missing 그대로(candidate 0건).
    # ══════════════════════════════════════════════
    hh = by_aegis['Hollgrehenn_Hammer']
    check('H: Hollgrehenn_Hammer는 true-missing 유지', hh['status'] == 'missing')
    check('H: candidate 0건(진짜 없음, identity-blocked 아님)', len(hh['candidates']) == 0)

    # ══════════════════════════════════════════════
    # I -- identity-complete combo 계산: requiredItems 전부 resolved인 variant
    # 수를 combo status(verified/unsupported/source-needed)와 별도로 집계.
    # ══════════════════════════════════════════════
    identity_complete = [c for c in real_combos['combos'] if all(ri['resolved'] for ri in c['requiredItems'])]
    check('I: identity-complete combo가 실제로 combo status verified 수보다 많음(identity 회수와 effect 지원 분리 확인)',
          len(identity_complete) > sum(1 for c in real_combos['combos'] if c['status'] == 'verified'))
    from collections import Counter
    ic_status = Counter(c['status'] for c in identity_complete)
    check('I: identity-complete 중 unsupported가 존재(identity 완료 != effect 지원)', ic_status['unsupported'] > 0)

    # ══════════════════════════════════════════════
    # J -- effect-support backlog 생성 확인: source/data/combo-effect-support-backlog.json이
    # 실제로 존재하고, occurrence 내림차순 정렬 + soloFixRuntimeReadyPotential 필드를 갖는다.
    # ══════════════════════════════════════════════
    backlog = json.load(open(os.path.join(ROOT, 'source/data/combo-effect-support-backlog.json'), encoding='utf-8'))
    check('J: effect-support backlog가 비어있지 않음', len(backlog['backlog']) > 0)
    occurrences = [row['occurrenceCombos'] for row in backlog['backlog']]
    check('J: occurrence 내림차순 정렬', occurrences == sorted(occurrences, reverse=True))
    check('J: soloFixRuntimeReadyPotential 필드 존재', all('soloFixRuntimeReadyPotential' in row for row in backlog['backlog']))

    # ══════════════════════════════════════════════
    # K -- runtime-ready(=verified) 종류 분포: 카드/방어구/무기 여러 조합이
    # 실제로 존재하는지 확인(카드-only에만 국한되지 않음).
    # ══════════════════════════════════════════════
    by_aegis_type = {it['aegisName']: it['rathenaType'] for it in real_identity['items']}
    verified_combos = [c for c in real_combos['combos'] if c['status'] == 'verified']
    type_mix = Counter()
    for c in verified_combos:
        types = tuple(sorted(set(by_aegis_type[ri['aegisName']] for ri in c['requiredItems'])))
        type_mix[types] += 1
    check('K: runtime-ready에 Card-only 존재', type_mix[('Card',)] > 0)
    check('K: runtime-ready에 Armor-only 존재', type_mix[('Armor',)] > 0)
    check('K: runtime-ready에 카드가 아닌 조합도 존재(카드-only에만 국한 안 됨)',
          sum(v for k, v in type_mix.items() if k != ('Card',)) > 0)

    # ══════════════════════════════════════════════
    # L -- ammo는 identity 5/5 verified여도 여전히 runtime-ready(verified combo)에서 제외.
    # ══════════════════════════════════════════════
    ammo_verified_aegis = {a for a, it in by_aegis.items() if it['rathenaType'] == 'Ammo' and it['status'] == 'verified'}
    check('L: ammo 5개 전부 identity verified(P2-A.3에서도 불변)', len(ammo_verified_aegis) == 5)
    ammo_combo_statuses = {c['status'] for c in real_combos['combos'] if any(r['aegisName'] in ammo_verified_aegis for r in c['requiredItems'])}
    check('L: ammo 포함 콤보 중 verified(runtime-ready) 0건 유지', 'verified' not in ammo_combo_statuses)

    # 최종 -- gameplay parity 관련 파일(db-items.json)이 이번 단계에서 전혀 바뀌지 않았는지는
    # git status로 별도 확인(이 테스트 파일의 책임 밖) -- 여기서는 identity/review/backlog
    # 파일들의 정합성만 최종 재확인한다.
    referenced_aegis = {r['aegisName'] for c in real_combos['combos'] for r in c['requiredItems']}
    id_fails, id_warns = build.audit_combo_item_identity(real_identity, real_combos)
    check(f'최종: identity map audit FAIL 0건 (WARN {len(id_warns)}건)', id_fails == [])
    real_textrag_items = json.load(open(os.path.join(ROOT, 'source/data/db-items.json'), encoding='utf-8'))
    rev_fails, rev_warns = build.audit_review_manifest(real_review, real_textrag_items, referenced_aegis)
    check(f'최종: review manifest audit FAIL 0건 (WARN {len(rev_warns)}건)', rev_fails == [])

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
