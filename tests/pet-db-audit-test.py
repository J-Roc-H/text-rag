"""build.py audit_pets 회귀 검사 (P3-10 펫 1단계 Task 2).

실제 db-pets.json·db-pet-talk.json은 통과하고, 일부러 망가뜨린 사본은 각 오류를 낸다.
"""
import copy
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
import build  # noqa: E402


def load(name):
    with open(os.path.join(BASE, "source", "data", name), encoding="utf-8-sig") as f:
        return json.load(f)


pets, talk = load("db-pets.json"), load("db-pet-talk.json")
monsters, items = load("db-monsters.json"), load("db-items.json")

assert build.audit_pets(pets, monsters, items, talk) == [], build.audit_pets(pets, monsters, items, talk)


def broken(mutate):
    p, t = copy.deepcopy(pets), copy.deepcopy(talk)
    mutate(p, t)
    return " | ".join(build.audit_pets(p, monsters, items, t))


assert "tier" in broken(lambda p, t: p["pets"]["PORING"].update(tier="x"))
assert "몬스터" in broken(lambda p, t: p["pets"]["PORING"].update(name="없는몬스터"))
assert "먹이" in broken(lambda p, t: p["pets"]["PORING"].update(food="없는먹이"))
assert "먹이" in broken(lambda p, t: p["pets"]["PORING"].update(food=None))  # 첫 알 후보는 먹이 필수
assert "3마리" in broken(lambda p, t: [p["pets"][k].update(tier=None) for k in ("DEVIRUCHI",)])
assert "대사" in broken(lambda p, t: t["pets"].pop("PORING"))

# 2026-11-21 먹이 업데이트: 첫 알 후보의 먹이는 빈 아이템(_stub)이면 안 되고, 펫 사료는 상점에서 판다
stub_items = copy.deepcopy(items)
stub_items["펫 사료"] = {"type": "잡템", "_stub": True}
assert "빈 아이템" in " | ".join(build.audit_pets(pets, monsters, stub_items, talk))
npcs = load("db-npcs.json")
groomers = [k for k, n in npcs.items() if "펫 사료" in (n.get("sells") or [])]
assert len(groomers) >= 7, groomers   # 원작 Pet Groomer 7곳 (npc/pre-re/merchants/shops.txt)
for f in ("펫 사료", "사과 주스", "바나나 주스", "슛"):
    it = items[f]
    assert not it.get("_stub") and it.get("_aegis") and it.get("weightSrc") == "official", (f, it)
assert "빈 칸" in broken(lambda p, t: t["pets"]["PORING"]["lines"]["feed"].update(hungry=[]))

print("pet-db-audit-test: OK")
