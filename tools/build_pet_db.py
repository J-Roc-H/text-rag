"""rAthena 리뉴얼 이전 pet_db.yml -> source/data/db-pets.json (설계: 볼트 데이터베이스/설계_펫·호문쿨루스_v0.1).

매핑은 추측하지 않는다.
- 몬스터: 볼트 「몬스터 정보.csv」(원작 ID·AegisName·레벨·HP·경험치)와 db-monsters.json을
  (레벨, HP, BaseEXP, JobEXP) 지문으로 맞춘다. 지문이 겹치거나 없으면 실패 목록.
- 아이템: db-items.json의 `_aegis` 필드 -> 없으면 「몬스터 드롭 아이템.csv」의 (몬스터, 확률)과
  db-monsters.json drops의 (몬스터, 확률)이 하나로만 맞을 때. 아니면 null + 실패 목록.
- 레벨대(tier)는 tools/pet_tiers.json(사용자 확정 명단)이 있을 때만 넣는다. 없으면 null.

사용: python tools/build_pet_db.py --vault-db "<볼트>/02_Dev/App/Text_Rag/데이터베이스" [--proposal 경로]
"""
import argparse
import csv
import json
import os
import sys

import yaml

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YML = os.path.join(BASE, "source", "reference", "rathena-pre-re", "pet_db.yml")
DATA = os.path.join(BASE, "source", "data")
TIERS = os.path.join(BASE, "tools", "pet_tiers.json")
SRC = "rathena-pre-re pet_db.yml@b8c1634"

# pet_db.yml 머리 주석의 기본값 (값이 없는 항목에 적용)
DEFAULTS = {"HungryDelay": 60, "HungerIncrease": 20, "IntimacyStart": 250, "IntimacyFed": 50,
            "IntimacyOverfed": -100, "IntimacyHungry": -5, "IntimacyOwnerDie": -20}

# rAthena src/map/pet.hpp e_pet_intimate_level · e_pet_hungry, pet.cpp pet_food()
CONSTANTS = {
    "stages": [1, 100, 250, 750, 910, 1000],  # 어색함 1~99 · 서먹함 100~249 · 보통 250~749 · 친함 750~909 · 절친 910~1000
    "hungerStart": 100,
    "feedAt": 25,          # PET_HUNGRY_HUNGRY — 이하에서 자동 급식 (75 이하면 친밀도 전량 상승)
    "fullGainMaxHunger": 75,  # PET_HUNGRY_NEUTRAL 초과면 상승량 절반, 90 초과면 과식 감소
    "src": "rathena src/map/pet.hpp e_pet_intimate_level/e_pet_hungry · pet.cpp pet_food()/pet_hungry()",
    # 방치형 속도 배율 (rAthena battle_config pet_hungry_delay_rate와 같은 개념, 100% = 1).
    # 원작 속도로는 12시간 방치 한 번에 모든 펫이 절친이 된다. 사용자 확정 2026-11-21:
    # 초희귀 3종 평균이 대략 한 달(30일)에 절친 -> tests/companion-balance-smoke.js가 범위를 지킨다.
    "hungryDelayRate": 90,
}


def load_json(name):
    with open(os.path.join(DATA, name), encoding="utf-8-sig") as f:
        return json.load(f)


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return int(float(str(v).replace("%", "")))
    except (TypeError, ValueError):
        return None


def build(vault_db):
    pets_yml = yaml.safe_load(open(YML, encoding="utf-8"))["Body"]
    monsters = load_json("db-monsters.json")
    items = load_json("db-items.json")
    mob_rows = read_csv(os.path.join(vault_db, "몬스터 정보.csv"))
    drop_rows = read_csv(os.path.join(vault_db, "몬스터 드롭 아이템.csv"))

    # 몬스터 지문 -> 한국어 이름
    by_fp = {}
    for m in monsters.values():
        fp = (m.get("lv"), m.get("hp"), m.get("exp"), m.get("jexp"))
        by_fp.setdefault(fp, set()).add(m["name"])
    aegis_mob = {}
    mob_id_of = {}
    for r in mob_rows:
        fp = (num(r["레벨"]), num(r["HP"]), num(r["BaseEXP"]), num(r["JobEXP"]))
        names = by_fp.get(fp, set())
        aegis_mob.setdefault(r["AegisName"], set()).update(names)
        mob_id_of[r["AegisName"]] = r["ID"]

    # 보조: 볼트 「몬스터_이름매핑.csv」의 확정 행 (원작 CSV_ID -> 게임 한글명)
    map_path = os.path.join(vault_db, "몬스터_이름매핑.csv")
    if os.path.exists(map_path):
        id_to_aegis = {r["ID"]: r["AegisName"] for r in mob_rows}
        for r in read_csv(map_path):
            if r.get("상태") == "확정" and r.get("CSV_ID") in id_to_aegis:
                aeg = id_to_aegis[r["CSV_ID"]]
                if not aegis_mob.get(aeg):
                    aegis_mob[aeg] = {r["게임한글명"]}

    # 아이템 Aegis -> 한국어 키
    aegis_item = {}
    for k, v in items.items():
        if isinstance(v, dict) and v.get("_aegis"):
            aegis_item.setdefault(v["_aegis"], set()).add(k)
    # 드롭 확률 대조 후보 (몬스터 원작ID -> [(aegis, rate)])
    drops_by_id = {}
    for r in drop_rows:
        lst = drops_by_id.setdefault(r["몬스터ID"], [])
        for i in range(1, 9):
            a, p = r.get(f"드롭{i}"), r.get(f"확률{i}")
            if a and p:
                lst.append((a, round(float(p.replace("%", "")), 4)))
    id_to_kmob = {}
    for aeg, names in aegis_mob.items():
        if len(names) == 1:
            id_to_kmob[mob_id_of[aeg]] = next(iter(names))
    kname_to_mon = {m["name"]: m for m in monsters.values()}

    def item_name(aeg, unmapped):
        if not aeg:
            return None
        hit = aegis_item.get(aeg, set())
        if len(hit) == 1:
            return next(iter(hit))
        cand = set()
        for mid, lst in drops_by_id.items():
            km = id_to_kmob.get(mid)
            if not km:
                continue
            kd = (kname_to_mon.get(km) or {}).get("drops", {})
            for a, p in lst:
                if a != aeg:
                    continue
                same = [n for n, r in kd.items() if round(float(r), 4) == p]
                other_aeg_same_rate = [x for x, q in lst if q == p and x != aeg]
                if len(same) == 1 and not other_aeg_same_rate:
                    cand.add(same[0])
        if len(cand) == 1:
            return next(iter(cand))
        unmapped.append(f"item {aeg} -> {sorted(cand) or '후보 없음'}")
        return None

    tiers = {}
    if os.path.exists(TIERS):
        for tier, names in json.load(open(TIERS, encoding="utf-8")).items():
            if tier.startswith("_"):
                continue
            for n in names:
                tiers[n] = tier

    pets, unmapped = {}, []
    for e in pets_yml:
        names = aegis_mob.get(e["Mob"], set())
        if len(names) != 1:
            unmapped.append(f"mob {e['Mob']} -> {sorted(names) or '지문 없음'}")
            continue
        name = next(iter(names))
        if any(p["name"] == name for p in pets.values()):
            # 같은 능력치의 이벤트 변종(P_CHUNG_E 등) — 먼저 나온 기본 몬스터만 둔다
            unmapped.append(f"mob {e['Mob']} -> {name} 중복(변종), 제외")
            continue
        g = lambda k: e.get(k, DEFAULTS.get(k))
        mon = kname_to_mon[name]
        pets[e["Mob"]] = {
            "mobId": num(mob_id_of.get(e["Mob"])),
            "name": name,
            "lv": mon.get("lv"),
            "tier": tiers.get(name),
            "tameItem": item_name(e.get("TameItem"), unmapped),
            "eggItem": item_name(e.get("EggItem"), unmapped),
            "equipItem": item_name(e.get("EquipItem"), unmapped),
            "food": item_name(e.get("FoodItem"), unmapped),
            "fullness": e.get("Fullness"),
            "hungryDelaySec": g("HungryDelay"),
            "hungerIncrease": g("HungerIncrease"),
            "intimacy": {"start": g("IntimacyStart"), "fed": g("IntimacyFed"), "overfed": g("IntimacyOverfed"),
                         "hungry": g("IntimacyHungry"), "ownerDie": g("IntimacyOwnerDie")},
            "captureRate": e.get("CaptureRate"),
            "aegis": {k: e.get(k) for k in ("TameItem", "EggItem", "EquipItem", "FoodItem")},
            "bonusScript": (e.get("Script") or "").strip() or None,  # 2단계(능력치 보너스)에서 해석
            "src": SRC,
        }
    return {"constants": CONSTANTS, "pets": pets}, unmapped


def proposal(db):
    rows = sorted(db["pets"].values(), key=lambda p: (p["lv"] or 0))
    out = ["| 펫 | Lv | 기본 레벨대 | 먹이 | 포획률 |", "|---|---|---|---|---|"]
    for p in rows:
        lv = p["lv"] or 0
        t = "저" if lv <= 30 else "중" if lv <= 60 else "고"
        out.append(f"| {p['name']} | {lv} | {t} | {p['food'] or '—'} | {(p['captureRate'] or 0) / 100:.1f}% |")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault-db", default=os.environ.get("TEXTRAG_VAULT_DB"))
    ap.add_argument("--proposal")
    a = ap.parse_args()
    if not a.vault_db:
        sys.exit("--vault-db 또는 TEXTRAG_VAULT_DB 필요 (볼트 02_Dev/App/Text_Rag/데이터베이스)")
    db, unmapped = build(a.vault_db)
    tmp = os.path.join(DATA, "db-pets.json.tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(db, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, os.path.join(DATA, "db-pets.json"))
    if a.proposal:
        with open(a.proposal, "w", encoding="utf-8") as f:
            f.write(proposal(db) + "\n")
    tiers = {}
    for p in db["pets"].values():
        tiers[p["tier"]] = tiers.get(p["tier"], 0) + 1
    print(f"pets: {len(db['pets'])}, unmapped: {len(unmapped)}, tiers: {tiers}")
    for u in unmapped:
        print("  UNMAPPED", u)


if __name__ == "__main__":
    main()
