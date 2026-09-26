"""P2-A.4 콤보 effect-support 정밀화 회귀 테스트 (2026-09-26).

시나리오 A-L. 실제 함수(parse_statement, canonicalize, audit_combo_consumer_backed)와
실제 산출물(db-combos.json, combo-effect-support-matrix.json)을 그대로 쓴다 --
재구현 금지. "parser가 읽을 수 있음 != 게임에서 실제 지원됨"이 이번 단계의 핵심이므로,
안전하다고 판단한 인스턴스가 실제로 db-combos.json effects[]에 반영됐는지, 그리고
그렇지 않은 인스턴스(스킬 지정/동적 표현식/미등재 enum)는 여전히 unsupportedEffects[]에
정확한 constant 이름으로 남아 있는지를 함께 확인한다.

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

    def unsupported_of(cid):
        return {u['constant']: u for u in by_id[cid]['unsupportedEffects']}

    def effects_of(cid):
        return [(e['type'], e['key'], e.get('subKey'), e['value']) for e in by_id[cid]['effects']]

    # ══════════════════════════════════════════════
    # A -- bCastrate 리터럴 음수(실데이터 rathena-pre-0028-01: "bonus bCastrate,-10")는
    # castReduction=+0.10으로 안전 변환된다(부호 반전).
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
    # castReduction=-0.25(캐스팅 증가 방향)로 변환된다 -- 부호를 추측이 아니라 실코드
    # (calcStats castReduction 공식에 하한 clamp 없음)로 확인했으므로 양수도 그대로 반영.
    # ══════════════════════════════════════════════
    check('B: bCastrate,25 -> castReduction=-0.25',
          cc.parse_statement("bonus bCastrate,25")[1]["value"] == -0.25)
    check('B: 실데이터 rathena-pre-0060-01 effects에 반영',
          ("combat", "castReduction", None, -0.25) in effects_of("rathena-pre-0060-01"))

    # ══════════════════════════════════════════════
    # C -- 스킬 지정 2-인자 bCastrate(실데이터 rathena-pre-0049-01: bonus2
    # bCastrate,"AL_HOLYLIGHT",-50)는 리터럴 1-인자 형태가 SAFE가 됐어도 여전히
    # unsupported로 남는다(스킬별 캐스팅 소비처 없음, per-instance 판정).
    # ══════════════════════════════════════════════
    c49 = unsupported_of('rathena-pre-0049-01')
    check('C: 스킬 지정 bCastrate는 여전히 unsupported', 'bCastrate' in c49)
    check('C: reason이 스킬 지정 형태임을 명시', 'SKILL' in c49['bCastrate']['reason'] or '스킬' in c49['bCastrate']['reason'])

    # ══════════════════════════════════════════════
    # D -- 동적 표현식 bCastrate(실데이터 rathena-pre-0004-01:
    # "bonus bCastrate,-getequiprefinerycnt(EQI_HEAD_TOP)")는 값을 평가하지 않고
    # unsupported로 남되, constant는 정확히 "bCastrate"로 추출된다("bonus"가 아님 --
    # §124 fallback 정밀화 확인).
    # ══════════════════════════════════════════════
    c4 = unsupported_of('rathena-pre-0004-01')
    check('D: 동적 표현식 bCastrate는 unsupported', 'bCastrate' in c4)
    check('D: rawStatement가 getequiprefinerycnt를 그대로 보존', 'getequiprefinerycnt' in c4['bCastrate']['rawStatement'])

    # ══════════════════════════════════════════════
    # E -- bUseSPrate 리터럴(실데이터 rathena-pre-0033-01/02: "bonus bUseSPrate,-3")은
    # spCostMul=0.97(1+(-3)/100)로 안전 변환된다(getSkillSpCost 곱연산 배율과 일치).
    # ══════════════════════════════════════════════
    check('E: bUseSPrate,-3 -> spCostMul=0.97',
          abs(cc.parse_statement("bonus bUseSPrate,-3")[1]["value"] - 0.97) < 1e-9)
    check('E: 실데이터 rathena-pre-0033-02 effects에 반영(0.97 부동소수 오차 허용)',
          any(t == 'combat' and k == 'spCostMul' and abs(v - 0.97) < 1e-9 for t, k, _, v in effects_of('rathena-pre-0033-02')))

    # ══════════════════════════════════════════════
    # F -- bAddClass,Class_All(실데이터 rathena-pre-0003-01: "bonus2
    # bAddClass,Class_All,4")은 atkPct=4로 안전 변환된다(대상 필터 없는 cardAtkPct와
    # 트리거 일치).
    # ══════════════════════════════════════════════
    check('F: bAddClass,Class_All,4 -> atkPct=4',
          cc.parse_statement('bonus2 bAddClass,Class_All,4')[1] ==
          {"type": "combat", "key": "atkPct", "subKey": None, "value": 4,
           "reason": cc.parse_statement('bonus2 bAddClass,Class_All,4')[1]["reason"]})
    check('F: 실데이터 rathena-pre-0003-01 effects에 반영',
          ("combat", "atkPct", None, 4) in effects_of("rathena-pre-0003-01"))

    # ══════════════════════════════════════════════
    # G -- bAddClass,Class_Boss(실 콤보 데이터엔 0건이나 향후 대비 등재)는 bossAtk로
    # 안전 변환된다(applyOutgoingRaceElemSizeBossAtk의 target.isMvp 트리거와 일치).
    # ══════════════════════════════════════════════
    kind_g, payload_g = cc.parse_statement('bonus2 bAddClass,Class_Boss,7')
    check('G: bAddClass,Class_Boss,7 -> bossAtk=7', kind_g == "effect" and payload_g["key"] == "bossAtk" and payload_g["value"] == 7)

    # ══════════════════════════════════════════════
    # H -- bAddClass의 다른 enum(Class_Normal 등 실데이터에 없는 값)은 여전히
    # unsupported -- Class_All/Class_Boss만 안전하다는 per-enum 판정 확인.
    # ══════════════════════════════════════════════
    kind_h, payload_h = cc.parse_statement('bonus2 bAddClass,Class_Normal,5')
    check('H: bAddClass,Class_Normal은 unsupported', kind_h == "unsupported")
    check('H: reason에 Class_Normal 언급', 'Class_Normal' in payload_h['reason'])

    # ══════════════════════════════════════════════
    # I -- bSubRace,RC_All(실데이터 rathena-pre-0045-01)은 dmgReduceAll로 안전
    # 변환되지만, 같은 콤보의 bSubRace,RC_Player_Human은 여전히 unsupported로 남는다
    # (같은 constant라도 enum별로 다른 판정 -- per-instance 원칙 재확인). 이 콤보의
    # status는 여전히 unsupported다(RC_Player_Human이 막고 있으므로 solo-fix 아님).
    # ══════════════════════════════════════════════
    check('I: 실데이터 rathena-pre-0045-01 effects에 dmgReduceAll(-300) 반영',
          ("combat", "dmgReduceAll", None, -300) in effects_of("rathena-pre-0045-01"))
    c45 = unsupported_of('rathena-pre-0045-01')
    check('I: 같은 콤보의 RC_Player_Human은 여전히 unsupported', 'bSubRace' in c45 and 'RC_Player_Human' in c45['bSubRace']['rawStatement'])
    check('I: 그 결과 콤보 status는 여전히 unsupported(RC_Player_Human이 막음)', by_id['rathena-pre-0045-01']['status'] == 'unsupported')

    # ══════════════════════════════════════════════
    # J -- fallback 정밀화(§124): 동적 표현식 bDef/bMdef(실데이터 rathena-pre-0026-01)의
    # constant가 "bonus"가 아니라 정확히 "bDef"/"bMdef"로 추출된다.
    # ══════════════════════════════════════════════
    c26 = unsupported_of('rathena-pre-0026-01')
    check('J: bDef가 "bonus"로 뭉뚱그려지지 않고 정확히 추출됨', 'bDef' in c26 and 'bonus' not in c26)
    check('J: bMdef도 정확히 추출됨', 'bMdef' in c26)

    # ══════════════════════════════════════════════
    # K -- consumer-backed audit gate: COMBO_CONSUMER_BACKED_KEYS에 없는 canonical
    # key가 verified effects에 섞여 있으면 build.audit_combo_consumer_backed가 FAIL로
    # 잡는다(합성 fixture, §22-23).
    # ══════════════════════════════════════════════
    fake_combos = {"combos": [{
        "id": "fake-0001-01",
        "effects": [{"type": "combat", "key": "nonexistentField", "subKey": None, "value": 1}],
    }]}
    fake_fails = build.audit_combo_consumer_backed(fake_combos)
    check('K: consumer 확인 안 된 key는 FAIL로 잡힘', any('nonexistentField' in f for f in fake_fails))

    # ══════════════════════════════════════════════
    # L -- 전체 정합성: COMBO_KNOWN_EFFECT_KEYS == COMBO_CONSUMER_BACKED_KEYS(import
    # 시점에 이미 assert됨, 여기서도 재확인) + 실제 db-combos.json은 FAIL 0 +
    # verified 수는 P2-A.3 종료 시점(38)보다 줄지 않고 늘었다(§31: 줄어도 되지만
    # 이번 재검증에서는 전부 통과해 8건 순증).
    # ══════════════════════════════════════════════
    check('L: COMBO_KNOWN_EFFECT_KEYS == COMBO_CONSUMER_BACKED_KEYS', build.COMBO_KNOWN_EFFECT_KEYS == build.COMBO_CONSUMER_BACKED_KEYS)
    real_fails = build.audit_combo_consumer_backed(real_combos)
    check('L: 실제 db-combos.json consumer-backed audit FAIL 0건', real_fails == [])
    verified_count = sum(1 for c in real_combos['combos'] if c['status'] == 'verified')
    check('L: verified 수가 P2-A.3 종료 시점(38) 이상으로 유지/증가', verified_count >= 38)
    check('L: verified 수가 실제로 8건 순증(46)했음을 재확인', verified_count == 46)

    print('ALL TESTS PASS')


if __name__ == '__main__':
    main()
