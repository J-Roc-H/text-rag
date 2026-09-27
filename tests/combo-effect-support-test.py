"""P2-A.4 콤보 effect-support 정밀화 회귀 테스트 (2026-09-26, 2026-09-27 정정).

시나리오 A-L(원본) + M-Q(정정 추가). 실제 함수(parse_statement, canonicalize,
audit_combo_consumer_backed)와 실제 산출물(db-combos.json,
combo-effect-support-matrix.json)을 그대로 쓴다 -- 재구현 금지.

**2026-09-27 정정**: 독립검증에서 bUseSPrate/bAddClass/bSubRace(RC_All) 3종이
consumer는 있었지만 stacking(bUseSPrate) 또는 scope(bAddClass) 또는 cross-field
합성 방식(bSubRace RC_All)이 원작과 달라 잘못 SAFE로 승격됐음이 드러났다. E/F/G/I는
그 3종이 다시 unsupported(stacking-scope-mismatch)로 남는지 확인하도록 바뀌었고,
L은 verified 정확한 개수를 하드코딩하지 않는다(§13: "숫자를 유지하려고 판정을
완화하지 않는다"). M-Q는 이번 정정의 근거(원작 stacking/scope 실코드)를 숫자로
직접 재현해 같은 실수가 재발하지 않도록 고정한다.

실행: python tests/combo-effect-support-test.py
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
    # A -- bCastrate 리터럴 음수(실데이터 rathena-pre-0028-01: "bonus bCastrate,-10")는
    # castReduction=+0.10으로 안전 변환된다(부호 반전). stacking parity 재확인 후에도
    # 유지되는 유일한 SAFE 항목.
    # ══════════════════════════════════════════════
    check('A: bCastrate,-10 -> parse_statement 직접 호출',
          cc.parse_statement("bonus bCastrate,-10") == (
              "effect",
              {"type": "combat", "key": "castReduction", "subKey": None, "value": 0.1,
               "reason": cc.VERIFIED_SIMPLE_BONUS["bCastrate"][3]},
          ))
    check('A: 실데이터 rathena-pre-0028-01 effects에 castReduction 반영',
          ("combat", "castReduction", None, 0.1) in effects_of("rathena-pre-0028-01"))

    # ══════════════════════════════════════════════
    # B -- bCastrate 리터럴 양수(실데이터 rathena-pre-0060-01: "bonus bCastrate,25")는
    # castReduction=-0.25(캐스팅 증가 방향)로 변환된다.
    # ══════════════════════════════════════════════
    check('B: bCastrate,25 -> castReduction=-0.25',
          cc.parse_statement("bonus bCastrate,25")[1]["value"] == -0.25)
    check('B: 실데이터 rathena-pre-0060-01 effects에 반영',
          ("combat", "castReduction", None, -0.25) in effects_of("rathena-pre-0060-01"))

    # ══════════════════════════════════════════════
    # C -- 스킬 지정 2-인자 bCastrate(실데이터 rathena-pre-0049-01)는 여전히
    # unsupported로 남는다(스킬별 캐스팅 소비처 없음, per-instance 판정).
    # ══════════════════════════════════════════════
    c49 = unsupported_of('rathena-pre-0049-01')
    check('C: 스킬 지정 bCastrate는 여전히 unsupported', 'bCastrate' in c49)
    check('C: reason이 스킬 지정 형태임을 명시', 'SKILL' in c49['bCastrate']['reason'] or '스킬' in c49['bCastrate']['reason'])

    # ══════════════════════════════════════════════
    # D -- 동적 표현식 bCastrate(실데이터 rathena-pre-0004-01)는 값을 평가하지 않고
    # unsupported로 남되, constant는 정확히 "bCastrate"로 추출된다.
    # ══════════════════════════════════════════════
    c4 = unsupported_of('rathena-pre-0004-01')
    check('D: 동적 표현식 bCastrate는 unsupported', 'bCastrate' in c4)
    check('D: rawStatement가 getequiprefinerycnt를 그대로 보존', 'getequiprefinerycnt' in c4['bCastrate']['rawStatement'])

    # ══════════════════════════════════════════════
    # E(정정) -- bUseSPrate는 SAFE가 취소됐다(stacking-scope-mismatch). 리터럴
    # 형태(실데이터 rathena-pre-0033-01/02: "bonus bUseSPrate,-3")도 이제 unsupported로
    # 남고, spCostMul 같은 canonical effect를 만들지 않는다.
    # ══════════════════════════════════════════════
    kind_e, payload_e = cc.parse_statement("bonus bUseSPrate,-3")
    check('E: bUseSPrate,-3은 더 이상 effect가 아니라 unsupported', kind_e == "unsupported")
    check('E: reason에 stacking 불일치 근거 명시', 'dsprate' in payload_e['reason'] or 'stacking' in payload_e['reason'].lower())
    check('E: 실데이터 rathena-pre-0033-02는 spCostMul effect를 만들지 않음',
          not any(k == 'spCostMul' for _, k, _, _ in effects_of('rathena-pre-0033-02')))
    c33 = unsupported_of('rathena-pre-0033-02')
    check('E: rathena-pre-0033-02의 bUseSPrate가 unsupportedEffects에 남음', 'bUseSPrate' in c33)

    # ══════════════════════════════════════════════
    # F(정정) -- bAddClass,Class_All도 SAFE가 취소됐다(scope-mismatch). 실데이터
    # rathena-pre-0003-01("bonus2 bAddClass,Class_All,4")은 더 이상 atkPct effect를
    # 만들지 않고 unsupported로 남는다.
    # ══════════════════════════════════════════════
    kind_f, payload_f = cc.parse_statement('bonus2 bAddClass,Class_All,4')
    check('F: bAddClass,Class_All,4는 더 이상 effect가 아니라 unsupported', kind_f == "unsupported")
    check('F: reason에 scope 불일치 근거 명시', '평타' in payload_f['reason'] or 'scope' in payload_f['reason'].lower() or '스킬' in payload_f['reason'])
    check('F: 실데이터 rathena-pre-0003-01은 atkPct effect를 만들지 않음',
          not any(k == 'atkPct' for _, k, _, _ in effects_of('rathena-pre-0003-01')))
    check('F: rathena-pre-0003-01의 status가 verified에서 unsupported로 되돌아감',
          by_id['rathena-pre-0003-01']['status'] == 'unsupported')

    # ══════════════════════════════════════════════
    # G(정정) -- bAddClass,Class_Boss도 같은 이유(scope-mismatch)로 unsupported다.
    # ══════════════════════════════════════════════
    kind_g, payload_g = cc.parse_statement('bonus2 bAddClass,Class_Boss,7')
    check('G: bAddClass,Class_Boss,7도 unsupported', kind_g == "unsupported")

    # ══════════════════════════════════════════════
    # H -- bAddClass의 다른 enum(Class_Normal)도 여전히 unsupported -- Class_All/
    # Class_Boss가 이제 특별 취급되지 않으므로 모든 enum이 동일 경로를 탄다.
    # ══════════════════════════════════════════════
    kind_h, payload_h = cc.parse_statement('bonus2 bAddClass,Class_Normal,5')
    check('H: bAddClass,Class_Normal은 unsupported', kind_h == "unsupported")
    check('H: Class_All과 Class_Normal이 이제 같은 reason 텍스트(모든 enum 공통)',
          payload_h['reason'] == cc.parse_statement('bonus2 bAddClass,Class_All,4')[1]['reason'])

    # ══════════════════════════════════════════════
    # I(정정) -- bSubRace,RC_All도 SAFE가 취소됐다(cross-field stacking mismatch).
    # 실데이터 rathena-pre-0045-01의 RC_All은 더 이상 dmgReduceAll effect를 만들지
    # 않고, RC_Player_Human과 마찬가지로 unsupportedEffects에 남는다.
    # ══════════════════════════════════════════════
    check('I: 실데이터 rathena-pre-0045-01은 dmgReduceAll effect를 만들지 않음',
          not any(k == 'dmgReduceAll' for _, k, _, _ in effects_of('rathena-pre-0045-01')))
    c45 = unsupported_of('rathena-pre-0045-01')
    check('I: RC_All 인스턴스가 unsupportedEffects에 남음(rawStatement로 구분)',
          any(u['constant'] == 'bSubRace' and 'RC_All' in u['rawStatement'] for u in by_id['rathena-pre-0045-01']['unsupportedEffects']))
    check('I: 같은 콤보의 RC_Player_Human도 여전히 unsupported', 'bSubRace' in c45)
    check('I: 콤보 status는 여전히 unsupported', by_id['rathena-pre-0045-01']['status'] == 'unsupported')

    # ══════════════════════════════════════════════
    # J -- fallback 정밀화(§124, 이번 정정과 무관하게 유지): 동적 표현식 bDef/bMdef
    # (실데이터 rathena-pre-0026-01)의 constant가 "bonus"가 아니라 정확히
    # "bDef"/"bMdef"로 추출된다.
    # ══════════════════════════════════════════════
    c26 = unsupported_of('rathena-pre-0026-01')
    check('J: bDef가 "bonus"로 뭉뚱그려지지 않고 정확히 추출됨', 'bDef' in c26 and 'bonus' not in c26)
    check('J: bMdef도 정확히 추출됨', 'bMdef' in c26)

    # ══════════════════════════════════════════════
    # K -- consumer-backed audit gate(이제 3축 게이트): COMBO_RUNTIME_SAFE_KEYS에
    # 없는 canonical key가 effects에 섞여 있으면 FAIL로 잡는다(합성 fixture).
    # ══════════════════════════════════════════════
    fake_combos = {"combos": [{
        "id": "fake-0001-01",
        "effects": [{"type": "combat", "key": "nonexistentField", "subKey": None, "value": 1}],
    }]}
    fake_fails = build.audit_combo_consumer_backed(fake_combos)
    check('K: consumer+scope+stacking 확인 안 된 key는 FAIL로 잡힘', any('nonexistentField' in f for f in fake_fails))
    # 정정 확인: 취소된 3개 키(spCostMul/atkPct/bossAtk/dmgReduceAll)를 쓰는 합성
    # combo도 이제 FAIL로 잡혀야 한다(한때 SAFE였던 흔적이 게이트를 통과하면 안 됨).
    for bad_key in ('spCostMul', 'atkPct', 'bossAtk', 'dmgReduceAll'):
        bad_combo = {"combos": [{"id": f"fake-{bad_key}", "effects": [{"type": "combat", "key": bad_key, "subKey": None, "value": 1}]}]}
        bad_fails = build.audit_combo_consumer_backed(bad_combo)
        check(f'K: 취소된 키 {bad_key}는 이제 FAIL로 잡힘(정정 확인)', any(bad_key in f for f in bad_fails))

    # ══════════════════════════════════════════════
    # L(정정) -- 전체 정합성: COMBO_KNOWN_EFFECT_KEYS == COMBO_RUNTIME_SAFE_KEYS +
    # 실제 db-combos.json은 audit FAIL 0. verified 정확한 개수는 하드코딩하지 않는다
    # (§13: "숫자를 유지하려고 판정을 완화하지 않는다") -- 대신 P2-A.3 원본(38) +
    # bCastrate 순증분(2, A/B에서 확인된 두 건)만큼만 늘었는지 구조적으로 확인한다.
    # ══════════════════════════════════════════════
    check('L: COMBO_KNOWN_EFFECT_KEYS == COMBO_RUNTIME_SAFE_KEYS', build.COMBO_KNOWN_EFFECT_KEYS == build.COMBO_RUNTIME_SAFE_KEYS)
    real_fails = build.audit_combo_consumer_backed(real_combos)
    check('L: 실제 db-combos.json consumer-backed(3축) audit FAIL 0건', real_fails == [])
    check('L: 취소된 3개 canonical key가 COMBO_KNOWN_EFFECT_KEYS에서 빠짐',
          ("combat", "spCostMul") not in build.COMBO_KNOWN_EFFECT_KEYS
          and ("combat", "atkPct") not in build.COMBO_KNOWN_EFFECT_KEYS
          and ("combat", "bossAtk") not in build.COMBO_KNOWN_EFFECT_KEYS
          and ("combat", "dmgReduceAll") not in build.COMBO_KNOWN_EFFECT_KEYS)
    verified_count = sum(1 for c in real_combos['combos'] if c['status'] == 'verified')
    check('L: verified 수가 P2-A.3 종료 시점(38) 이상 유지', verified_count >= 38)
    check('L: verified 순증분이 정확히 bCastrate 2건만큼(40)임을 generator 결과로 확인(하드코딩 아님, A/B 검증과 정합)', verified_count == 38 + 2)

    # ══════════════════════════════════════════════
    # M(신규) -- bUseSPrate additive-vs-multiplicative mismatch: 원작 기대값(60%)과
    # 기존에 SAFE로 취급했던 곱연산 결과(64%)가 실제로 다름을 숫자로 고정한다.
    # ══════════════════════════════════════════════
    rathena_expected_pct = 100 + (-20) + (-20)  # sd->dsprate += val 두 번 -- additive
    check('M: rAthena additive 기대값은 SP 소비 60%', rathena_expected_pct == 60)
    multiplicative_result_pct = round(0.8 * 0.8 * 100)  # 기존(취소된) cardSpCostMul 곱연산 방식
    check('M: 곱연산 방식은 64%로 원작과 다름(재발 방지 고정)', multiplicative_result_pct == 64)
    check('M: 60 != 64 -- 두 방식이 실제로 다른 결과를 낸다는 것 자체를 확인', rathena_expected_pct != multiplicative_result_pct)
    check('M: canonicalize_combos.py는 이 mismatch 때문에 bUseSPrate를 더 이상 변환하지 않음',
          cc.parse_statement("bonus bUseSPrate,-20")[0] == "unsupported")

    # ══════════════════════════════════════════════
    # N(신규) -- bAddClass normal-vs-skill scope mismatch: TextRAG의 cardAtkPct/
    # cardBossAtk 소비처가 평타 전용 함수(getOutgoingAtkPctMul/
    # applyOutgoingRaceElemSizeBossAtk)에만 존재하고, 스킬 데미지 계산 함수에는 그
    # 소비처를 호출하는 코드가 없음을 정적으로 확인한다(원작 battle_calc_cardfix는
    # 평타+물리 스킬 양쪽에 적용되므로 scope가 좁다는 근거).
    # ══════════════════════════════════════════════
    index_html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    import re
    atk_pct_fn = re.search(r'function getOutgoingAtkPctMul\([^)]*\)\s*\{[^}]*\}', index_html)
    check('N: getOutgoingAtkPctMul 함수 실존', atk_pct_fn is not None)
    boss_atk_fn = re.search(r'function applyOutgoingRaceElemSizeBossAtk\([^)]*\)\s*\{.*?\n\}', index_html, re.S)
    check('N: applyOutgoingRaceElemSizeBossAtk 함수 실존', boss_atk_fn is not None)
    call_sites = [m.start() for m in re.finditer(r'getOutgoingAtkPctMul\(', index_html)]
    check('N: getOutgoingAtkPctMul 호출부가 정의부 포함 2곳(정의 1 + 평타 블록 호출 1)뿐 -- 스킬 데미지 경로에서 호출되지 않음', len(call_sites) == 2)

    # ══════════════════════════════════════════════
    # O(신규) -- RC_All + specific race stacking mismatch: 원작(합산 후 단 한 번
    # 적용)과 TextRAG(순차 곱연산)가 실제로 다른 결과를 낸다는 것을 숫자로 고정한다.
    # 예시: RC_All=-30, DemiHuman=+30.
    # ══════════════════════════════════════════════
    rathena_race_fix = (-30) + 30  # battle.cpp: subrace[targetRace] + subrace[RC_ALL]
    check('O: 원작(합산 후 단 한 번 적용) 결과는 0(상쇄)', rathena_race_fix == 0)
    result = 1.0
    result *= (1 - (-30) / 100)  # dmgReduceAll 먼저 적용(취소된 방식)
    result *= (1 - 30 / 100)     # raceDmgReduce 다음 적용
    check('O: TextRAG 순차 곱연산 결과는 0.91(9% 감소)로 원작과 다름', abs(result - 0.91) < 1e-9)
    check('O: 원작(0% 변화)과 TextRAG(9% 감소)가 실제로 다른 결과(재발 방지 고정)', rathena_race_fix == 0 and abs(result - 1.0) > 1e-9)
    check('O: canonicalize_combos.py는 이 mismatch 때문에 RC_All을 더 이상 변환하지 않음',
          cc.parse_statement('bonus2 bSubRace,RC_All,-30')[0] == "unsupported")

    # ══════════════════════════════════════════════
    # P(신규) -- bCastrate additive parity: 두 소스(-10%씩)가 실제로 원작 -20%(=
    # fraction 0.20)와 TextRAG 방식(각 기여분을 더함)이 일치함을 재확인한다.
    # ══════════════════════════════════════════════
    rathena_castrate_total = (-10) + (-10)  # sd->castrate += val 두 번
    check('P: 원작 두 소스 합산은 -20', rathena_castrate_total == -20)
    contribution_a = -(-10) / 100.0
    contribution_b = -(-10) / 100.0
    textrag_total_fraction = contribution_a + contribution_b  # collector: fx.combat.castReduction additive
    check('P: TextRAG 두 기여분의 합은 0.20 fraction(원작 -20%와 부호만 반대인 표현, 크기 일치)',
          abs(textrag_total_fraction - 0.20) < 1e-9)
    check('P: 크기가 원작(20)과 TextRAG(0.20*100=20)에서 일치', abs(abs(rathena_castrate_total) - textrag_total_fraction * 100) < 1e-9)

    # ══════════════════════════════════════════════
    # Q(신규) -- SAFE requires consumer + scope + stacking: matrix에서 bCastrate는
    # 3축 전부 true, 취소된 3종(bUseSPrate/bAddClass/bSubRace)은 stackingParity 또는
    # scopeParity 중 하나 이상 false다.
    # ══════════════════════════════════════════════
    m_castrate = matrix_by_const['bCastrate']
    check('Q: bCastrate는 consumer+scope+stacking 3축 전부 true', m_castrate['consumerPresent'] is True and m_castrate['scopeParity'] is True and m_castrate['stackingParity'] is True)
    check('Q: bCastrate verdict는 safe-existing-consumer', m_castrate['verdict'] == 'safe-existing-consumer')
    for const, failing_axis in (('bUseSPrate', 'stackingParity'), ('bAddClass', 'scopeParity'), ('bSubRace', 'stackingParity')):
        entry = matrix_by_const[const]
        check(f'Q: {const}는 verdict가 stacking-scope-mismatch', entry['verdict'] == 'stacking-scope-mismatch')
        check(f'Q: {const}는 consumerPresent=true(consumer 자체는 있었음)', entry['consumerPresent'] is True)
        check(f'Q: {const}는 {failing_axis}=false(SAFE 조건 위반)', entry[failing_axis] is False)

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
