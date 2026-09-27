"""P2-A.5 콤보 canonicalizer 레벨 회귀 테스트 (엔진 확장: bMatkRate/bUseSPrate).

시나리오 K/L/O(§22) + 실데이터 검증. 엔진 레벨(calcStats/getSkillSpCost 실코드)
회귀는 tests/combo-engine-extension-p2a5-smoke.js(A-J, M, N) 참조 -- 이 파일은
canonicalize_combos.py/build.py 쪽만 다룬다. 실제 함수(parse_statement,
canonicalize, audit_combo_consumer_backed)와 실제 산출물(db-combos.json,
combo-effect-support-matrix.json)을 그대로 쓴다 -- 재구현 금지.

실행: python tests/combo-engine-extension-p2a5-test.py
"""
import os
import sys
import json

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
    real_combos = json.load(open(os.path.join(ROOT, 'source/data/db-combos.json'), encoding='utf-8'))
    by_id = {c['id']: c for c in real_combos['combos']}
    matrix = json.load(open(os.path.join(ROOT, 'source/data/combo-effect-support-matrix.json'), encoding='utf-8'))
    matrix_by_const = {e['constant']: e for e in matrix['entries']}

    def unsupported_of(cid):
        return {u['constant']: u for u in by_id[cid]['unsupportedEffects']}

    def effects_of(cid):
        return [(e['type'], e['key'], e.get('subKey'), e['value']) for e in by_id[cid]['effects']]

    # ══════════════════════════════════════════════
    # bMatkRate 리터럴 -- 실데이터 rathena-pre-0013-01("bonus bMatkRate,5")은
    # matkPct=5로 안전 변환된다.
    # ══════════════════════════════════════════════
    check('bMatkRate,5 -> parse_statement 직접 호출',
          cc.parse_statement("bonus bMatkRate,5") == (
              "effect",
              {"type": "combat", "key": "matkPct", "subKey": None, "value": 5,
               "reason": cc.VERIFIED_SIMPLE_BONUS["bMatkRate"][3]},
          ))
    check('실데이터 rathena-pre-0013-01 effects에 matkPct=5 반영',
          ("combat", "matkPct", None, 5) in effects_of("rathena-pre-0013-01"))
    check('rathena-pre-0013-01 status가 verified', by_id['rathena-pre-0013-01']['status'] == 'verified')

    # ══════════════════════════════════════════════
    # bUseSPrate 리터럴 -- 실데이터 rathena-pre-0035-01("bonus bUseSPrate,-20")은
    # spCostRatePct=-20으로 안전 변환된다.
    # ══════════════════════════════════════════════
    check('bUseSPrate,-20 -> parse_statement 직접 호출',
          cc.parse_statement("bonus bUseSPrate,-20")[1]["key"] == "spCostRatePct"
          and cc.parse_statement("bonus bUseSPrate,-20")[1]["value"] == -20)
    check('실데이터 rathena-pre-0035-01 effects에 spCostRatePct=-20 반영',
          ("combat", "spCostRatePct", None, -20) in effects_of("rathena-pre-0035-01"))
    check('rathena-pre-0035-01 status가 verified', by_id['rathena-pre-0035-01']['status'] == 'verified')

    # ══════════════════════════════════════════════
    # K -- dynamic bMatkRate는 계속 unsupported: 실데이터 rathena-pre-0012-01
    # ("bonus bMatkRate,min(5, getequiprefinerycnt(EQI_HAND_R)-5)")은 값을 평가하지
    # 않고 unsupported로 남되, constant는 정확히 "bMatkRate"로 추출된다.
    # ══════════════════════════════════════════════
    c12 = unsupported_of('rathena-pre-0012-01')
    check('K: 동적 표현식 bMatkRate는 unsupported', 'bMatkRate' in c12)
    check('K: rawStatement가 min(...)/getequiprefinerycnt(...)를 그대로 보존',
          'min(' in c12['bMatkRate']['rawStatement'] and 'getequiprefinerycnt' in c12['bMatkRate']['rawStatement'])
    check('K: 값 자체는 절대 평가되지 않음(effects에 matkPct가 이 콤보에서 나타나지 않음)',
          not any(k == 'matkPct' for _, k, _, _ in effects_of('rathena-pre-0012-01')))

    # ══════════════════════════════════════════════
    # L -- dynamic bUseSPrate도 같은 원칙으로 unsupported(합성 fixture -- 실데이터에
    # 동적 표현식 bUseSPrate 인스턴스가 없어 parse_statement 직접 호출로 확인).
    # ══════════════════════════════════════════════
    kind_l, payload_l = cc.parse_statement("bonus bUseSPrate,-getequiprefinerycnt(EQI_HAND_R)")
    check('L: 동적 표현식 bUseSPrate는 unsupported', kind_l == "unsupported")
    check('L: constant가 정확히 "bUseSPrate"로 추출됨("bonus"가 아님)', payload_l['constant'] == 'bUseSPrate')
    check('L: rawStatement가 getequiprefinerycnt를 그대로 보존', 'getequiprefinerycnt' in payload_l['rawStatement'])

    # ══════════════════════════════════════════════
    # O -- COMBO_RUNTIME_SAFE_KEYS는 실제 consumer가 확인된 key만 허용한다: 신규
    # matkPct/spCostRatePct가 정확히 등재됐고, 여전히 미해결인 bAddClass/bSubRace의
    # 취소된 키(atkPct/bossAtk/dmgReduceAll)는 여전히 빠져 있어야 한다.
    # ══════════════════════════════════════════════
    check('O: ("combat","matkPct")가 COMBO_RUNTIME_SAFE_KEYS에 있음',
          ("combat", "matkPct") in build.COMBO_RUNTIME_SAFE_KEYS)
    check('O: ("combat","spCostRatePct")가 COMBO_RUNTIME_SAFE_KEYS에 있음',
          ("combat", "spCostRatePct") in build.COMBO_RUNTIME_SAFE_KEYS)
    check('O: 취소된 키(atkPct/bossAtk/dmgReduceAll)는 여전히 없음',
          ("combat", "atkPct") not in build.COMBO_RUNTIME_SAFE_KEYS
          and ("combat", "bossAtk") not in build.COMBO_RUNTIME_SAFE_KEYS
          and ("combat", "dmgReduceAll") not in build.COMBO_RUNTIME_SAFE_KEYS)
    check('O: COMBO_KNOWN_EFFECT_KEYS == COMBO_RUNTIME_SAFE_KEYS(엔진 확장 후에도 항상 동일해야 함)',
          build.COMBO_KNOWN_EFFECT_KEYS == build.COMBO_RUNTIME_SAFE_KEYS)
    real_fails = build.audit_combo_consumer_backed(real_combos)
    check('O: 실제 db-combos.json consumer-backed(3축) audit FAIL 0건(신규 키 포함)', real_fails == [])
    # 합성 fixture: 진짜 존재하지 않는 canonical key는 여전히 FAIL로 잡혀야 한다.
    fake_combos = {"combos": [{"id": "fake-p2a5", "effects": [{"type": "combat", "key": "notARealKey", "subKey": None, "value": 1}]}]}
    check('O: 진짜 존재하지 않는 key는 여전히 FAIL로 잡힘',
          any('notARealKey' in f for f in build.audit_combo_consumer_backed(fake_combos)))

    # ══════════════════════════════════════════════
    # matrix 3축 확인: bMatkRate/bUseSPrate 모두 consumer+scope+stacking 전부 true.
    # ══════════════════════════════════════════════
    for const in ('bMatkRate', 'bUseSPrate', 'bUseSPRate'):
        entry = matrix_by_const[const]
        check(f'matrix: {const}는 verdict가 safe-existing-consumer', entry['verdict'] == 'safe-existing-consumer')
        check(f'matrix: {const}는 consumer+scope+stacking 3축 전부 true',
              entry['consumerPresent'] is True and entry['scopeParity'] is True and entry['stackingParity'] is True)

    # ══════════════════════════════════════════════
    # 전체 정합성: verified 수는 P2-A.4-정정 종료 시점(40) 이상으로 늘었다(하드코딩
    # 없이 generator 결과 그대로 재확인 -- §20: 예상치를 하드코딩하지 않는다).
    # ══════════════════════════════════════════════
    verified_count = sum(1 for c in real_combos['combos'] if c['status'] == 'verified')
    check('verified 수가 P2-A.4-정정 시점(40) 이상 유지(엔진 확장으로 더 늘어남)', verified_count >= 40)
    gained_ids = ['rathena-pre-0013-01', 'rathena-pre-0013-02', 'rathena-pre-0023-01',
                  'rathena-pre-0023-02', 'rathena-pre-0033-02', 'rathena-pre-0035-01', 'rathena-pre-0035-02']
    check('P2-A.5로 새로 verified된 실데이터 7건이 전부 verified 상태',
          all(by_id[i]['status'] == 'verified' for i in gained_ids))

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
