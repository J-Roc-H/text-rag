"""P3-A parser 테스트: bonus3 bAutoSpell은 증거 기반 2종 + 무조건 3-인자 형태만 canonical event로 변환,
나머지(다른 스킬·bonus4 flag·bAutoSpellWhenHit·범위 밖 LV/RATE)는 계속 unsupported."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "tools"))
import canonicalize_combos as cc

def kind(s):
    r = cc.parse_statement(s)
    return r[0], (r[1] if r else None)

k, e = kind('bonus3 bAutoSpell,"MG_LIGHTNINGBOLT",5,20;')
assert k == "effect" and e["type"] == "event" and e["key"] == "autoSpell" and e["subKey"] is None
assert e["value"] == {"skill": "라이트닝 볼트", "lv": 5, "rate": 0.02}, e
k, e = kind('bonus3 bAutoSpell,"MG_FROSTDIVER",3,250;')
assert k == "effect" and e["value"] == {"skill": "프로스트 다이버", "lv": 3, "rate": 0.25}, e

for s in [
    'bonus3 bAutoSpell,"NJ_HUUJIN",1,100;',              # 매핑표 밖 스킬
    'bonus3 bAutoSpell,"MG_FIREBOLT",5,20;',             # 이름만 비슷한 다른 스킬 -- 추측 금지
    'bonus3 bAutoSpell,"MG_LIGHTNINGBOLT",11,20;',       # maxLv 초과
    'bonus3 bAutoSpell,"MG_LIGHTNINGBOLT",0,20;',        # LV 0
    'bonus3 bAutoSpell,"MG_LIGHTNINGBOLT",5,0;',         # rate 0
    'bonus3 bAutoSpell,"MG_LIGHTNINGBOLT",5,1001;',      # rate 상한 초과
    'bonus4 bAutoSpell,"MG_LIGHTNINGBOLT",5,20,BF_MAGIC;',  # bonus4 flag form
    'bonus3 bAutoSpellWhenHit,"MG_LIGHTNINGBOLT",5,20;', # 피격 trigger
    'bonus3 bAutoSpell,"MG_LIGHTNINGBOLT",5,20+getrefine();',  # 동적 표현식
]:
    k, _ = kind(s)
    assert k == "unsupported", (s, k)

# 조건부 AutoSpell은 split_statements 단계에서 conditional로 분리돼 status가 source-needed로 남는다.
u, c = cc.split_statements('if (getrefine()>=9) { bonus3 bAutoSpell,"MG_LIGHTNINGBOLT",5,20; }')
assert not u and c
print("OK - combo-autospell-p3a parser tests")
