#!/usr/bin/env python3
"""파머시 경제 수치의 Pre-Renewal 정본 대조.

실행: python tests/pharmacy-economy-audit-test.py

원본: rAthena/rathena @ e985006171d2eb320ee512a653f4c83aea3d81b6
  db/pre-re/item_db_etc.yml, item_db_usable.yml

TextRag의 중량은 원본 Weight/10, NPC 매입가(sell)는 원본 Buy/2(내림)다.
TextRag의 buy는 상점 노출 여부(db-shops.json)가 결정한다. 따라서 퀘스트 전용
속성 포션 제조 메뉴얼은 원본 Buy 100000을 보존하되 TextRag buy는 0으로 둔다.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ITEMS = json.loads((ROOT / "source/data/db-items.json").read_text(encoding="utf-8"))

# (TextRag key, rAthena Item ID, AegisName, raw Buy, raw Weight,
#  TextRag buy, TextRag sell, TextRag weight)
CASES = [
    ("블루 젬스톤", 717, "Blue_Gemstone", 600, 30, 600, 300, 3),
    ("알로에베라", 606, "Aloebera", 1500, 100, 0, 750, 10),
    ("약사발", 7134, "Medicine_Bowl", 8, 10, 8, 4, 1),
    ("빈 포션병", 1093, "Empty_Potion", 10, 10, 0, 5, 1),
    ("빈 시험관", 1092, "Empty_Cylinder", 3, 10, 0, 1, 1),
    ("일반 포션 제조 메뉴얼", 7144, "Normal_Potion_Book", 100000, 10, 100000, 50000, 1),
    ("슬림 포션 제조 메뉴얼", 7133, "Slim_Potion_Create_Book", 240000, 10, 240000, 120000, 1),
    ("알콜 제조 메뉴얼", 7127, "Alcol_Create_Book", 100000, 10, 100000, 50000, 1),
    ("화염병 제조 메뉴얼", 7128, "FireBottle_Create_Book", 100000, 10, 100000, 50000, 1),
    ("염산병 제조 메뉴얼", 7129, "Acid_Create_Book", 100000, 10, 100000, 50000, 1),
    ("식물병 제조 메뉴얼", 7130, "Plant_Create_Book", 100000, 10, 100000, 50000, 1),
    ("기뢰병 제조 메뉴얼", 7131, "Mine_Create_Book", 100000, 10, 100000, 50000, 1),
    ("코팅약 제조 메뉴얼", 7132, "Coating_Create_Book", 100000, 10, 100000, 50000, 1),
    ("속성 포션 제조 메뉴얼", 7434, "Elemental_Potion_Book", 100000, 10, 0, 50000, 1),
    ("제노크의 이빨", 1044, "Tooth_Of_", 264, 10, 0, 132, 1),
    ("멘트", 708, "Ment", 500, 10, 0, 250, 1),
    ("힘줄", 1050, "Tendon", 220, 10, 0, 110, 1),
    ("뇌관", 1051, "Detonator", 450, 10, 0, 225, 1),
    ("마녀의 별모래", 1061, "Starsand_Of_Witch", 484, 10, 0, 242, 1),
    ("알코올", 970, "Alchol", 400, 30, 0, 200, 3),
    ("화염병", 7135, "Fire_Bottle", 200, 10, 0, 100, 1),
    ("염산병", 7136, "Acid_Bottle", 200, 10, 0, 100, 1),
    ("식인 식물병", 7137, "MenEater_Plant_Bottle", 200, 10, 0, 100, 1),
    ("기뢰병", 7138, "Mini_Bottle", 200, 10, 0, 100, 1),
    ("코팅약", 7139, "Coating_Bottle", 200, 10, 0, 100, 1),
    ("레드 슬림 포션", 545, "Red_Slim_Potion", 150, 10, 0, 75, 1),
    ("옐로우 슬림 포션", 546, "Yellow_Slim_Potion", 600, 20, 0, 300, 2),
    ("화이트 슬림 포션", 547, "White_Slim_Potion", 1650, 20, 0, 825, 2),
    ("레지스트 파이어 포션", 12118, "Resist_Fire", 2, 10, 0, 1, 1),
    ("레지스트 콜드 포션", 12119, "Resist_Water", 2, 10, 0, 1, 1),
    ("레지스트 어스 포션", 12120, "Resist_Earth", 2, 10, 0, 1, 1),
    ("레지스트 썬더 포션", 12121, "Resist_Wind", 2, 10, 0, 1, 1),
    ("안티 페인멘트", 605, "Anodyne", 2000, 100, 0, 1000, 10),
    ("인어의 심장", 950, "Heart_Of_Mermaid", 264, 10, 0, 132, 1),
]


for name, item_id, aegis, raw_buy, raw_weight, buy, sell, weight in CASES:
    item = ITEMS[name]
    assert item["_aegis"] == aegis, (name, item_id, item.get("_aegis"), aegis)
    assert item["weightSrc"] == "official", (name, item["weightSrc"])
    assert item["buy"] == buy, (name, "buy", item["buy"], buy)
    assert item["sell"] == sell == raw_buy // 2, (name, "sell", item["sell"], raw_buy // 2)
    assert item["weight"] == weight == raw_weight // 10, (name, "weight", item["weight"], raw_weight // 10)


assert len(CASES) == 34
print(f"OK: {len(CASES)} pharmacy-economy values match rAthena pre-re e985006")
