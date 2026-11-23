"""원작 맵 1:1 프론테라 시범 데이터 생성 (설계: 볼트 데이터베이스/설계_원작맵1대1_프론테라시범_v0.1).

rAthena 리뉴얼 이전 스폰(npc/pre-re/mobs)·워프(npc/**/warps) 파일을 GitHub에서 읽어
사실값(맵 번호·몬스터·마릿수·워프 목적지)만 source/data/db-prt-pilot.json으로 남긴다. 원문 파일은 저장하지 않는다.

몬스터 매칭은 추측하지 않는다: 원작 ID -> 볼트 「몬스터 정보.csv」(레벨·HP·경험치) 지문 -> db-monsters,
보조로 「몬스터_이름매핑.csv」 확정 행. 못 맞추면 unmapped로 남기고 출현에서 뺀다.

사용: python tools/build_prt_pilot.py --vault-db "<볼트>/02_Dev/App/Text_Rag/데이터베이스"
필요: gh CLI 로그인(공개 저장소 읽기)
"""
import argparse
import csv
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "source", "data")
REPO = "rathena/rathena"
# 변환한 권역 (2026-11-21 프론테라 시범 → 이즈루드·페이욘 확대)
SPAWN_FILES = ["npc/pre-re/mobs/fields/prontera.txt", "npc/pre-re/mobs/dungeons/prt_sew.txt", "npc/pre-re/mobs/dungeons/prt_maze.txt",
               "npc/pre-re/mobs/dungeons/iz_dun.txt",
               "npc/pre-re/mobs/fields/payon.txt", "npc/pre-re/mobs/dungeons/pay_dun.txt"]

PILOT = re.compile(r"^(prt_fild\d\d|prt_sewb\d|prt_maze0\d|iz_dun0\d|pay_fild\d\d|pay_dun0\d)$")


def group_of(map_id):
    if map_id.startswith("prt_fild"):
        return "프론테라 필드", f"프론테라 필드 {map_id[-2:]}"
    if map_id.startswith("prt_sewb"):
        return "프론테라 지하수로", f"프론테라 지하수로 {map_id[-1]}층"
    if map_id.startswith("prt_maze"):
        return "미궁 숲", f"미궁 숲 {int(map_id[-2:])}"
    if map_id.startswith("iz_dun"):
        return "바이란 섬 해저동굴", f"해저동굴 {int(map_id[-2:]) + 1}층"
    if map_id.startswith("pay_fild"):
        return "페이욘 필드", f"페이욘 필드 {map_id[-2:]}"
    if map_id.startswith("pay_dun"):
        return "페이욘 동굴", f"페이욘 동굴 {int(map_id[-2:]) + 1}층"
    raise ValueError(map_id)


# 시범 밖 원작 맵 -> 아직 변환 안 된 기존 TextRag 지역 (임시 다리 — 그 권역이 변환되면 지운다).
# 대응이 없는 원작 맵(prt_monk·prt_gld 등 TextRag에 없는 곳)은 다리를 놓지 않는다.
BRIDGE_RULES = [
    (r"^prontera$", "프론테라"),
    (r"^izlude$", "이즈루드"),
    (r"^izlu2dun$", "이즈루드"),      # 바이란 섬(몬스터 없는 통로 섬) — 해저동굴 입구를 이즈루드에 바로 잇는다
    (r"^payon$", "페이욘"),
    (r"^pay_arche$", "페이욘"),       # 궁수 마을(TextRag에 없음) — 페이욘 동굴 입구를 페이욘에 바로 잇는다
    (r"^alberta$", "알베르타"),
    (r"^gef_fild\d\d$", "게펜 필드"),
    (r"^mjolnir_\d\d$", "묘르닐 산맥"),
    (r"^moc_fild\d\d$", "소그라트 사막 동부"),
]

WARP = re.compile(r"^([a-z0-9_]+),\d+,\d+(?:,\d+)?\t(?:warp2?)\t[^\t]+\t\d+,\d+,([a-z0-9_]+),\d+,\d+")
SCRIPT_HEAD = re.compile(r"^([a-z0-9_]+),\d+,\d+,\d+\tscript\t")
WARP_CMD = re.compile(r'warp\s+"([a-z0-9_]+)"')
SPAWN = re.compile(r"^([a-z0-9_]+),\d+,\d+(?:,\d+,\d+)?\t(boss_)?monster\t([^\t]+)\t(\d+),(\d+)")


def gh_text(path):
    out = subprocess.run(["gh", "api", f"repos/{REPO}/contents/{path}", "-H", "Accept: application/vnd.github.raw"],
                         check=True, capture_output=True)
    return out.stdout.decode("utf-8", "replace").splitlines()


def gh_tree():
    out = subprocess.run(["gh", "api", f"repos/{REPO}/git/trees/master?recursive=1", "--jq", ".tree[].path"],
                         check=True, capture_output=True)
    return out.stdout.decode().splitlines()


def gh_head():
    out = subprocess.run(["gh", "api", f"repos/{REPO}/commits/master", "--jq", ".sha"], check=True, capture_output=True)
    return out.stdout.decode().strip()


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return int(float(str(v)))
    except (TypeError, ValueError):
        return None


def monster_index(vault_db):
    monsters = json.load(open(os.path.join(DATA, "db-monsters.json"), encoding="utf-8-sig"))
    by_fp = {}
    for mid, m in monsters.items():
        by_fp.setdefault((m.get("lv"), m.get("hp"), m.get("exp"), m.get("jexp")), set()).add(mid)
    ro_to_tr = {}
    for r in read_csv(os.path.join(vault_db, "몬스터 정보.csv")):
        hit = by_fp.get((num(r["레벨"]), num(r["HP"]), num(r["BaseEXP"]), num(r["JobEXP"])), set())
        if len(hit) == 1:
            ro_to_tr[r["ID"]] = next(iter(hit))
    name_to_id = {}
    for mid, m in monsters.items():
        name_to_id.setdefault(m["name"], set()).add(mid)
    map_path = os.path.join(vault_db, "몬스터_이름매핑.csv")
    if os.path.exists(map_path):
        for r in read_csv(map_path):
            if r.get("상태") == "확정" and r.get("CSV_ID") and r["CSV_ID"] not in ro_to_tr:
                ids = name_to_id.get(r["게임한글명"], set())
                if len(ids) == 1:
                    ro_to_tr[r["CSV_ID"]] = next(iter(ids))
    return ro_to_tr, monsters


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault-db", default=os.environ.get("TEXTRAG_VAULT_DB"))
    a = ap.parse_args()
    if not a.vault_db:
        sys.exit("--vault-db 필요")
    ro_to_tr, monsters = monster_index(a.vault_db)
    mvp = json.load(open(os.path.join(DATA, "db-mvp-respawn.json"), encoding="utf-8-sig"))
    mvp_ro = {str(v.get("originalId")): k for k, v in mvp.items() if isinstance(v, dict) and v.get("originalId")}

    maps, unmapped = {}, []
    for f in SPAWN_FILES:
        for line in gh_text(f):
            m = SPAWN.match(line)
            if not m or not PILOT.match(m.group(1)):
                continue
            map_id, boss, ro_name, ro_id, count = m.group(1), bool(m.group(2)), m.group(3), m.group(4), int(m.group(5))
            g, disp = group_of(map_id)
            e = maps.setdefault(map_id, {"group": g, "displayName": disp, "spawns": {}, "mvp": None, "warps": set()})
            if ro_id in mvp_ro:
                e["mvp"] = mvp_ro[ro_id]
                continue
            tr = ro_to_tr.get(ro_id)
            if not tr:
                unmapped.append(f"{map_id} {ro_name}({ro_id})x{count}")
                continue
            e["spawns"][tr] = e["spawns"].get(tr, 0) + count

    warp_files = [p for p in gh_tree() if re.match(r"^npc/(pre-re/)?warps/.*\.txt$", p)]
    edges = set()
    for f in warp_files:
        src = None  # 스크립트 워프(예: pay_dun03 -> pay_dun04 무작위 착지)는 블록 머리의 맵이 출발지
        for line in gh_text(f):
            m = WARP.match(line)
            pair = (m.group(1), m.group(2)) if m else None
            h = SCRIPT_HEAD.match(line)
            if h:
                src = h.group(1)
            elif line.startswith("}"):
                src = None
            w = WARP_CMD.search(line) if src else None
            if w:
                pair = (src, w.group(1))
            if pair and pair[0] != pair[1] and (PILOT.match(pair[0]) or PILOT.match(pair[1])):
                edges.add(pair)
    bridges = {}
    for a_, b_ in sorted(edges):
        for x in (a_, b_):
            if PILOT.match(x) or x in bridges:
                continue
            for pat, legacy in BRIDGE_RULES:
                if re.match(pat, x):
                    bridges[x] = legacy
                    break
        if a_ in maps:
            maps[a_]["warps"].add(b_)

    head = gh_head()
    out = {
        "src": f"rathena {head[:7]} npc/pre-re/mobs (prontera·prt_sew·prt_maze·iz_dun·payon·pay_dun) + npc/**/warps — 사실값만 추출",
        "maps": {k: {"group": v["group"], "displayName": v["displayName"],
                     "spawns": sorted(([int(t), c] for t, c in v["spawns"].items()), key=lambda x: -x[1]),
                     "mvp": int(v["mvp"]) if v["mvp"] else None,
                     "warps": sorted(v["warps"])} for k, v in sorted(maps.items())},
        "bridges": bridges,
        "unmapped": unmapped,
    }
    p = os.path.join(DATA, "db-prt-pilot.json")
    with open(p + ".tmp", "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(p + ".tmp", p)
    print(f"maps: {len(out['maps'])}, edges: {len(edges)}, bridges: {bridges}, unmapped: {len(unmapped)}")
    for u in unmapped:
        print("  UNMAPPED", u)


if __name__ == "__main__":
    main()
