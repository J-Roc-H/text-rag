# -*- coding: utf-8 -*-
"""원작 맵 시범에 필요한데 게임에 없던 원작 몬스터를 db-monsters.json에 추가한다 (2026-11-21).

대상과 한국어 이름의 근거: 게임 db-items에 이미 있는 카드 이름("코코 카드" 등).
수치: 볼트 「몬스터 정보.csv」(rAthena pre-re) 그대로, 게임 필드로 옮기는 규칙은 기존 몬스터에서 확인한 것:
  atk = (ATK최소+최대)//2 · softDef = VIT · hit = 레벨+DEX · flee = 레벨+AGI
드롭: 볼트 「몬스터 드롭 아이템.csv」. 영문 아이템 키 -> 게임 한국어 이름은 이미 게임에 있는 몬스터들의
  원작 드롭 줄과 게임 드롭을 같은 확률끼리 짝지어 얻은 대응표(+ 아이템의 _aegis)로만 옮긴다. 못 옮긴 드롭은 뺀다.
제니: 원작 자료에 없다 -> 같은 레벨 게임 몬스터 제니 범위의 중앙값(없으면 가장 가까운 레벨).
같은 이름이 이미 있으면 건드리지 않는다(멱등). 사용: python tools/add_pilot_monsters.py
"""
import csv, json, os, statistics

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "source", "data")
VDB = os.environ.get("TEXTRAG_VAULT_DB", r"D:\Vault_JROC\02_Dev\App\Text_Rag\데이터베이스")

# 원작 ID -> (게임 이름, 이모지). 이름 근거 = 게임 카드 아이템 이름
NEW = {
    "1104": ("코코", "🐿️"),          # 코코 카드
    "1128": ("호른", "🪲"),          # 호른 카드
    "1037": ("사이드 와인더", "🐍"),  # 사이드 와인더 카드
    "1048": ("도둑벌레 알", "🥚"),    # 도둑벌레 알 카드
}
ELEMENT = {"무": "무속성", "무속성": "무속성", "물": "수속성", "불": "화속성", "땅": "지속성", "바람": "풍속성",
           "독": "독속성", "성": "성속성", "어둠": "암속성", "염": "염속성", "불사": "불사속성", "고스트": "유령속성"}


def rows(name, key):
    with open(os.path.join(VDB, name), encoding="utf-8-sig") as f:
        return {r[key]: r for r in csv.DictReader(f)}


def drop_list(r):
    out = []
    for i in range(1, 9):
        k, p = r.get(f"드롭{i}"), r.get(f"확률{i}")
        if k and p:
            out.append((k, float(p.rstrip("%"))))
    return out


def main():
    mpath = os.path.join(DATA, "db-monsters.json")
    raw = open(mpath, "rb").read()
    mons = json.loads(raw.decode("utf-8-sig"))
    items = json.load(open(os.path.join(DATA, "db-items.json"), encoding="utf-8-sig"))
    info = rows("몬스터 정보.csv", "ID")
    drops = rows("몬스터 드롭 아이템.csv", "몬스터ID")

    # 영문 아이템 키 -> 한국어: ① 아이템의 _aegis ② 지문이 맞는 기존 몬스터의 드롭을 확률로 짝짓기
    en2kr = {v["_aegis"]: k for k, v in items.items() if isinstance(v, dict) and v.get("_aegis")}
    fp = {}
    for mid, m in mons.items():
        fp.setdefault((m.get("lv"), m.get("hp"), m.get("exp"), m.get("jexp")), []).append(m)
    votes = {}
    for cid, r in info.items():
        hit = fp.get((int(r["레벨"]), int(r["HP"]), int(r["BaseEXP"]), int(r["JobEXP"])))
        if not hit or len(hit) != 1 or cid not in drops:
            continue
        g = hit[0].get("drops") or {}
        for en, p in drop_list(drops[cid]):
            same = [kr for kr, gp in g.items() if abs(gp - p) < 1e-9]
            if len(same) == 1:
                votes.setdefault(en, []).append(same[0])
    # 짝짓기는 모든 관측이 같은 이름을 가리킬 때만 채택(게임이 드롭을 바꾼 몬스터 때문에 엉뚱하게 짝지어지는 것 방지)
    for en, ks in votes.items():
        top, cnt = max(((k, ks.count(k)) for k in set(ks)), key=lambda x: x[1])
        if en not in en2kr and cnt >= 2 and cnt / len(ks) >= 0.8:  # 두 번 이상, 8할 이상 같은 이름일 때만
            en2kr[en] = top
    # 관측이 없어 짝짓지 못한 것 중 게임 아이템 이름이 원작 이름을 그대로 옮긴 것이 분명한 경우만 손으로 둔다
    for en, kr in {"Acorn": "도토리", "Tsurugi_": "츠루기", "Hood_": "후드", "Guisarme_": "귀삼", "Chrysalis": "번데기"}.items():
        if kr in items:
            en2kr.setdefault(en, kr)

    names = {m["name"] for m in mons.values()}
    next_id = max(int(k) for k in mons) + 1
    added = []
    for cid, (name, emoji) in NEW.items():
        if name in names:
            continue
        r = info[cid]
        lv = int(r["레벨"])
        n = lambda k: int(r[k])
        dl, missing = {}, []
        for en, p in drop_list(drops.get(cid, {})):
            kr = en2kr.get(en)
            if not kr and en.endswith("_Card"):
                cand = name + " 카드"
                kr = cand if cand in items else None
            if kr and kr in items:
                dl[kr] = p  # 원작 표에 같은 아이템이 두 번이면 뒤의 값(기존 몬스터들과 같은 방식)
            else:
                missing.append(en)
        near = min(abs(m["lv"] - lv) for m in mons.values() if m.get("zeny"))
        zs = [m["zeny"] for m in mons.values() if m.get("zeny") and abs(m["lv"] - lv) == near]
        zeny = [int(statistics.median(z[0] for z in zs)), int(statistics.median(z[1] for z in zs))]
        mons[str(next_id)] = {
            "name": name, "emoji": emoji, "lv": lv, "hp": n("HP"),
            "atk": (n("ATK(min)") + n("ATK(max)")) // 2, "def": n("DEF"), "mdef": n("MDEF"),
            "softDef": n("VIT"), "hit": lv + n("DEX"), "flee": lv + n("AGI"),
            "str": n("STR"), "agi": n("AGI"), "vit": n("VIT"), "int": n("INT"), "dex": n("DEX"), "luk": n("LUK"),
            "range": n("사거리"), "atkDelay": n("공격딜레이"), "exp": n("BaseEXP"), "jexp": n("JobEXP"),
            "size": r["크기"], "race": r["종족"], "element": ELEMENT[r["속성"]], "elementLv": n("속성레벨"),
            "zeny": zeny, "drops": dl,
        }
        added.append((next_id, name, len(dl), len(drop_list(drops.get(cid, {}))), missing))
        next_id += 1

    if added:
        # 파일을 통째로 다시 쓰지 않는다(중복 키·CRLF 보존): 마지막 "}" 앞에 같은 한 줄 형식으로 덧붙인다
        nl = b"\r\n" if b"\r\n" in raw else b"\n"
        body = raw.rstrip()
        assert body.endswith(b"}")
        lines = b"".join(b"," + nl + b"  " + json.dumps(str(a[0])).encode() + b": "
                         + json.dumps(mons[str(a[0])], ensure_ascii=False, separators=(",", ":")).encode()
                         for a in added)
        out = body[:-1].rstrip() + lines + nl + b"}" + nl
        tmp = mpath + ".tmp"
        open(tmp, "wb").write(out)
        os.replace(tmp, mpath)
    for a in added:
        print(f"add {a[0]} {a[1]} drops {a[2]}/{a[3]} missing={a[4]}")
    if not added:
        print("nothing to add")


if __name__ == "__main__":
    main()
