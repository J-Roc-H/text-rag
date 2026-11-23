# -*- coding: utf-8 -*-
"""펫 채집 자료 db-gathering.json을 만든다 (P3-11, 2026-11-23).

원작 필드·던전의 풀 6종·버섯 2종은 몬스터가 아니라 채집 요소다. 펫이 있을 때만 채집된다.
  - 맵별 빈도: db-prt-pilot.json `unmapped`의 원작 풀·버섯 마릿수 ÷ 그 맵의 몬스터 마릿수
    (원작에서 몬스터 한 마리를 잡는 동안 풀·버섯을 만나던 비율)
  - 결과: 볼트 「몬스터 드롭 아이템.csv」(rAthena pre-re)의 풀·버섯 드롭 그대로.
    영문 아이템 키 -> 게임 한국어 이름은 add_pilot_monsters.build_en2kr과 같은 대응표만 쓴다. 못 옮긴 드롭은 뺀다.
풀·버섯 이름: 사용자 확정(2026-11-23) — 빨간·파란·노란·하얀·빛나는 풀, 검은 버섯. 초록 풀·빨간 버섯은 같은 짜임으로 붙인 이름.
빈도는 원작 기준이 아니다(원작은 유저가 캐기 나름) — 그 맵에 풀·버섯이 얼마나 흔했는지를 나타내는 설계자 판단.
게임에 없던 결과 아이템 7종은 ITEMS로 db-items.json 끝에 덧붙인다(멱등). 이름 근거 = 예전 게임 판본(v8~v9.12)에
  있던 이름, 값 = 볼트 「RO_아이템_데이터베이스 2.xlsx」(rAthena). 근거 없는 이름은 _krPending.
사용: python tools/build_gathering.py  (db-prt-pilot.json을 다시 만든 뒤에도 돌린다)
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_pilot_monsters import DATA, rows, drop_list, build_en2kr  # noqa: E402

# 원작 ID -> (분류, 화면 이름). 1078~1083 Red/Blue/Green/Yellow/White/Shining Plant, 1084~1085 Black/Red Mushroom
SOURCES = {"1078": ("풀", "빨간 풀"), "1079": ("풀", "파란 풀"), "1080": ("풀", "초록 풀"), "1081": ("풀", "노란 풀"),
           "1082": ("풀", "하얀 풀"), "1083": ("풀", "빛나는 풀"), "1084": ("버섯", "검은 버섯"), "1085": ("버섯", "빨간 버섯")}
# 채집 결과로 나오는데 게임에 없거나 빈 칸(_stub: ❓ "용도가 알려지지 않은 물건")이던 아이템. 값은 xlsx(구매가는 다른 잡템처럼 0).
# 빈 칸이던 이름은 예전 게임 판본(v8~v9.12) 드롭에서 이어진 이름이다.
ITEMS = {
    "쓴 약초": {"_aegis": "Bitter_Herb", "emoji": "🌱", "desc": "입이 오그라들 만큼 쓴 약초. 포포링이 좋아한다고 한다.",
              "sell": 10, "weight": 5},
    "환상의 꽃": {"_aegis": "Illusion_Flower", "emoji": "🌸", "desc": "보는 각도에 따라 빛깔이 바뀌는 신비한 꽃.",
              "sell": 500, "weight": 1},
    "노래하는 식물": {"_aegis": "Singing_Plant", "emoji": "🎶", "desc": "바람이 스치면 가느다란 소리를 내는 식물.",
              "sell": 250, "weight": 1},
    "히나레": {"_aegis": "Hinalle", "emoji": "🍃", "desc": "약효가 있다고 알려진 풀, 히나레.", "sell": 250, "weight": 1},
    "알로에": {"_aegis": "Aloe", "emoji": "🪴", "desc": "두툼한 잎에 진액이 가득한 알로에.", "sell": 250, "weight": 1},
    "센티멘탈 플라워": {"_aegis": "Centimental_Flower", "emoji": "💐", "desc": "보고 있으면 괜히 마음이 아련해지는 꽃.",
              "sell": 10, "weight": 1, "weightSrc": "stub"},  # xlsx에 행 없음 -> 값은 임시 그대로
    "카르보데일니롤": {"_aegis": "Karvodailnirol", "emoji": "⚗️", "desc": "버섯에서 드물게 얻는 약품 원료. 연금술 재료로 귀하게 쓰인다.",
              "sell": 200, "weight": 3},
    "데트리민덱스타": {"_aegis": "Detrimindexta", "emoji": "⚗️", "desc": "버섯에서 드물게 얻는 약품 원료. 연금술 재료로 귀하게 쓰인다.",
              "sell": 200, "weight": 3},
    "뾰족한 비늘": {"_aegis": "Pointed_Scale", "emoji": "🔺", "desc": "풀줄기에 붙어 있던 끝이 뾰족한 비늘. (한국어 이름 잠정)",
              "sell": 34, "weight": 1, "_krPending": True},  # 이름 근거 없음
}
UNMAPPED = re.compile(r"^(\S+) .+?\((\d+)\)x(\d+)$")


def item_entry(v):
    e = {"type": "잡템", "emoji": v["emoji"], "desc": v["desc"], "_aegis": v["_aegis"], "buy": 0,
         "sell": v["sell"], "weight": v["weight"], "weightSrc": v.get("weightSrc", "official")}
    if v.get("_krPending"):
        e["_krPending"] = True
    return e


def add_items(items):
    """ITEMS를 db-items.json에 반영한다(멱등, 파일을 통째로 다시 쓰지 않는다).
    없는 이름은 끝에 덧붙이고, 빈 칸(_stub)인 항목은 그 블록만 바꾼다. 이미 채워진 항목은 건드리지 않는다."""
    path = os.path.join(DATA, "db-items.json")
    raw = open(path, "rb").read()
    nl = b"\r\n" if b"\r\n" in raw else b"\n"
    block = lambda e: json.dumps(e, ensure_ascii=False, indent=2).replace("\n", "\n  ").encode().replace(b"\n", nl)
    add, filled = [], []
    for name, v in ITEMS.items():
        cur = items.get(name)
        if cur is not None and not cur.get("_stub"):
            continue
        e = item_entry(v)
        items[name] = e
        if cur is None:
            add.append((name, e))
            continue
        head = nl + b"  " + json.dumps(name, ensure_ascii=False).encode() + b": {"
        pos = 0
        while True:  # 같은 키가 여러 번이면 모두(json은 마지막 값을 쓴다)
            i = raw.find(head, pos)
            if i < 0:
                break
            j = raw.index(nl + b"  }", i) + len(nl + b"  }")
            assert b'"_stub": true' in raw[i:j], name
            new = nl + b"  " + json.dumps(name, ensure_ascii=False).encode() + b": " + block(e)
            raw = raw[:i] + new + raw[j:]
            pos = i + len(new)
        filled.append(name)
    if add:
        body = raw.rstrip()
        assert body.endswith(b"}")
        chunk = b"".join(b"," + nl + b"  " + json.dumps(n, ensure_ascii=False).encode() + b": " + block(e) for n, e in add)
        raw = body[:-1].rstrip() + chunk + nl + b"}" + nl
    if add or filled:
        tmp = path + ".tmp"
        open(tmp, "wb").write(raw)
        os.replace(tmp, path)
        print("items added:", [n for n, _ in add], "filled:", filled)


def main():
    pilot = json.load(open(os.path.join(DATA, "db-prt-pilot.json"), encoding="utf-8-sig"))
    mons = json.load(open(os.path.join(DATA, "db-monsters.json"), encoding="utf-8-sig"))
    items = json.load(open(os.path.join(DATA, "db-items.json"), encoding="utf-8-sig"))
    info = rows("몬스터 정보.csv", "ID")
    drops = rows("몬스터 드롭 아이템.csv", "몬스터ID")
    add_items(items)
    en2kr = build_en2kr(mons, items, info, drops)

    sources = {}
    for cid, (kind, label) in SOURCES.items():
        dl, missing = {}, []
        for en, p in drop_list(drops.get(cid, {})):
            kr = en2kr.get(en)
            if kr and kr in items:
                dl[kr] = p  # 같은 아이템이 두 번이면 뒤의 값(rollDrops·기존 몬스터와 같은 방식)
            else:
                missing.append(en)
        sources[cid] = {"kind": kind, "name": label, "drops": dl, "missing": sorted(set(missing))}

    maps = {}
    for u in pilot.get("unmapped", []):
        m = UNMAPPED.match(u)
        if not m or m.group(2) not in SOURCES:
            continue
        mid, cid, n = m.group(1), m.group(2), int(m.group(3))
        if mid not in pilot["maps"]:
            continue
        e = maps.setdefault(mid, {"gather": {}, "monsters": sum(c for _, c in pilot["maps"][mid]["spawns"])})
        e["gather"][cid] = e["gather"].get(cid, 0) + n
    for e in maps.values():
        e["gather"] = sorted(([int(k), v] for k, v in e["gather"].items()), key=lambda x: -x[1])

    out = {"src": "tools/build_gathering.py <- db-prt-pilot.json unmapped + 몬스터 드롭 아이템.csv (rAthena pre-re)",
           "sources": sources, "maps": dict(sorted(maps.items()))}
    path = os.path.join(DATA, "db-gathering.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, path)
    for cid, s in sources.items():
        print(f"{cid} {s['kind']} drops {len(s['drops'])} missing={s['missing']}")
    print(f"maps {len(maps)}")


if __name__ == "__main__":
    main()
