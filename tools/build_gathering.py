# -*- coding: utf-8 -*-
"""펫 채집 자료 db-gathering.json을 만든다 (P3-11, 2026-11-23).

원작 필드·던전의 풀 6종·버섯 2종은 몬스터가 아니라 채집 요소다. 펫이 있을 때만 채집된다.
  - 맵별 빈도: db-prt-pilot.json `unmapped`의 원작 풀·버섯 마릿수 ÷ 그 맵의 몬스터 마릿수
    (원작에서 몬스터 한 마리를 잡는 동안 풀·버섯을 만나던 비율)
  - 결과: 볼트 「몬스터 드롭 아이템.csv」(rAthena pre-re)의 풀·버섯 드롭 그대로.
    영문 아이템 키 -> 게임 한국어 이름은 add_pilot_monsters.build_en2kr과 같은 대응표만 쓴다. 못 옮긴 드롭은 뺀다.
원작 풀·버섯의 한국어 이름은 근거가 없어 쓰지 않는다 — 화면에는 「풀」·「버섯」으로만 나온다.
사용: python tools/build_gathering.py  (db-prt-pilot.json을 다시 만든 뒤에도 돌린다)
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from add_pilot_monsters import DATA, rows, drop_list, build_en2kr  # noqa: E402

# 원작 ID -> 화면 분류. 1078~1083 Red/Blue/Green/Yellow/White/Shining Plant, 1084~1085 Black/Red Mushroom
SOURCES = {"1078": "풀", "1079": "풀", "1080": "풀", "1081": "풀", "1082": "풀", "1083": "풀",
           "1084": "버섯", "1085": "버섯"}
UNMAPPED = re.compile(r"^(\S+) .+?\((\d+)\)x(\d+)$")


def main():
    pilot = json.load(open(os.path.join(DATA, "db-prt-pilot.json"), encoding="utf-8-sig"))
    mons = json.load(open(os.path.join(DATA, "db-monsters.json"), encoding="utf-8-sig"))
    items = json.load(open(os.path.join(DATA, "db-items.json"), encoding="utf-8-sig"))
    info = rows("몬스터 정보.csv", "ID")
    drops = rows("몬스터 드롭 아이템.csv", "몬스터ID")
    en2kr = build_en2kr(mons, items, info, drops)

    sources = {}
    for cid, kind in SOURCES.items():
        dl, missing = {}, []
        for en, p in drop_list(drops.get(cid, {})):
            kr = en2kr.get(en)
            if kr and kr in items:
                dl[kr] = p  # 같은 아이템이 두 번이면 뒤의 값(rollDrops·기존 몬스터와 같은 방식)
            else:
                missing.append(en)
        sources[cid] = {"kind": kind, "drops": dl, "missing": sorted(set(missing))}

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
