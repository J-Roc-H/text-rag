"""
P2-A.1 — 콤보 참조 아이템(278개) identity 회수.

목적: item_combos.yml이 참조하는 278개 rAthena AegisName을 TextRAG의 실제
아이템 정본과 "증거 기반"으로 연결한다. 이 스크립트는 sidecar identity map
(source/data/combo-item-identity.json)만 생성한다 — db-items.json이나
db-combos.json은 건드리지 않는다(§3, §24).

자동 verified를 허용하는 경우는 세 가지뿐이다(§8):
  Case A - 기존 _aegis exact unique match (canonicalize_combos.py와 동일 로직)
  Case B - 이미 검증된 프로젝트 정본 자료 + rAthena 자신의 authoritative 데이터로
           확정 가능한 경우. 이번 단계에서 실제로 성립한 것은 카드뿐이다:
           rAthena mob_db.yml의 Drops/MvpDrops 목록이 "이 몬스터가 이 카드를
           드롭한다"를 AegisName으로 명시(추측이 아니라 원작 자체 데이터) +
           MONSTER_AI_AUDIT.md(이 프로젝트가 이미 commit e985006 기준으로
           검증한 원작 몬스터 ID ↔ TextRAG 한글명 표) + TextRAG에 그 이름의
           카드가 정확히 존재. 세 조건이 모두 성립할 때만 verified.
  Case C - 영문 _krPending 스텁의 _aegis identity가 별도 한글 정본 record와
           동일 아이템임을 다중 필드(가격/무게/계열 패턴)로 확정한 경우.
           이번 단계에서는 Arrow_Of_Wind/Steel_Arrow 2건을 수작업으로 조사해
           하드코딩했다(각각 evidence 문자열에 근거 전체를 남긴다) — 일반화된
           자동 규칙이 아니다.
  Case D - (P2-A.2 신설) rAthena item record ↔ TextRAG record 다중 필드 일치
           + 이름 대응(직역/음역)까지 사람이 직접 검토해 확정한 경우.
           source/data/combo-item-identity-reviewed.json(review manifest,
           tools/gen_review_manifest.py로 생성)에 사람이 승인한 mapping만
           기록돼 있고, 이 빌더는 그 결과를 그대로 읽어 반영할 뿐 자체적으로
           score 기준 자동 승격을 하지 않는다(§15 금지 사항).

그 외 전부는 candidate만 만들고 자동 확정하지 않는다(§6, §9).
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF_DIR = ROOT / "source" / "reference" / "rathena-pre-re"
COMBOS_JSON = ROOT / "source" / "data" / "db-combos.json"
STRUCTURAL_JSON = REF_DIR / "item_db_structural_278.json"
CARD_DROPMAP_JSON = REF_DIR / "card_monster_dropmap.json"
MONSTER_AUDIT_MD = ROOT / "MONSTER_AI_AUDIT.md"
TEXTRAG_ITEMS_JSON = ROOT / "source" / "data" / "db-items.json"
TEXTRAG_MONSTERS_JSON = ROOT / "source" / "data" / "db-monsters.json"
REVIEW_MANIFEST_JSON = ROOT / "source" / "data" / "combo-item-identity-reviewed.json"
OUT_JSON = ROOT / "source" / "data" / "combo-item-identity.json"

SOURCE_COMMIT = "e985006171d2eb320ee512a653f4c83aea3d81b6"

# rAthena Type=Armor의 Locations -> TextRAG type 후보 집합.
# 근거: 이미 확정된 9개 Case A 매핑을 조사한 결과, "_krPending 스텁"으로만
# 존재하는 레코드는 실제 슬롯과 무관하게 전부 "갑옷"이라는 placeholder
# type을 갖고 있었다(§4 조사에서 발견). 이는 스텁 생성 관행일 뿐, 실제
# 완성된(비-스텁) 한글 정본 아이템의 type은 슬롯별로 정확히 나뉜다
# (투구_상단/중단/하단/갑옷/걸칠것/신발/방패/Accessory, 총 8종 confirmed
# via db-items.json type census). 그러므로 candidate 검색은 스텁 관행이
# 아니라 "완성된 정본 아이템"의 실제 슬롯 분류를 기준으로 삼는다.
LOCATION_TO_TEXTRAG_TYPES = {
    "Head_Top": ["투구_상단"],
    "Head_Mid": ["투구_중단"],
    "Head_Low": ["투구_하단"],
    "Armor": ["갑옷"],
    "Garment": ["걸칠것"],
    "Shoes": ["신발"],
    "Right_Accessory": ["Accessory"],
    "Left_Accessory": ["Accessory"],
    "Both_Accessory": ["Accessory"],
}
SHIELD_TEXTRAG_TYPE = "방패"  # Locations: Left_Hand AND no Jobs 무기 제한 -> 방패류


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def combo_referenced_aegis():
    combos = load_json(COMBOS_JSON)
    aegis = set()
    for c in combos["combos"]:
        for ri in c["requiredItems"]:
            aegis.add(ri["aegisName"])
    return aegis


def build_textrag_aegis_index(textrag_items):
    unique, ambiguous_multi = {}, {}
    for key, rec in textrag_items.items():
        if not isinstance(rec, dict):
            continue
        aeg = rec.get("_aegis")
        if not aeg:
            continue
        ambiguous_multi.setdefault(aeg, []).append(key)
    for aeg, keys in ambiguous_multi.items():
        if len(keys) == 1:
            unique[aeg] = keys[0]
    ambiguous = {aeg: keys for aeg, keys in ambiguous_multi.items() if len(keys) > 1}
    return unique, ambiguous


# ══════════════════════════════════════════════
# Case B: 카드 - rAthena mob_db.yml Drops/MvpDrops의 명시적 AegisName 참조를
# 근거로 "이 카드는 이 몬스터의 카드다"를 확정한다(이름 유사도 추측이 아니라
# rAthena 자신의 데이터 모델). 이어서 이 프로젝트가 이미 검증한
# MONSTER_AI_AUDIT.md(commit e985006 기준)의 원작 ID -> 한글명으로
# "<한글명> 카드"를 구성해 TextRAG에 정확히 그 키가 존재하는지 확인한다.
# ══════════════════════════════════════════════
def parse_monster_audit(path):
    """원작 ID(문자열) -> {"textragId":..., "name":..., "note":...}. 원작 ID가
    "미확인"이거나 숫자가 아닌 행은 제외한다(신뢰할 수 없는 원작 ID는 근거로
    쓰지 않는다)."""
    rows = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if not line.startswith("|"):
                continue
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cols) < 3:
                continue
            tid, oid, name = cols[0], cols[1], cols[2]
            if not tid.isdigit() or not oid.isdigit():
                continue
            rows[oid] = {
                "textragId": tid,
                "name": name,
                "note": cols[-1] if len(cols) > 3 else "",
            }
    return rows


# Case B가 정확한 "<한글명> 카드" 문자열 구성에는 실패했지만, 수작업으로
# db-items.json을 직접 훑어 같은 몬스터 카드로 보이는 레코드를 찾은 경우
# (예: 원작 이름의 수식어가 TextRAG 번역에서 생략됨). 자동 확정이 아니라
# candidate로만 남긴다 — evidence에 왜 정확 매치가 아닌지도 함께 기록한다.
MANUAL_CARD_CANDIDATES = {
    "Live_Peach_Tree_Card": {
        "textragKey": "피치 트리 카드",
        "note": "원작 몬스터 이름 'Enchanted Peach Tree'(감사 검증 원작 ID 1410, "
        "한글명 '인챈트 피치 트리')의 수식어 '인챈트'가 빠진 축약 번역으로 "
        "보이는 카드가 db-items.json에 존재. desc('식물형 몬스터 20% 추가 "
        "피해류')가 나무 몬스터 카드로서 개연성은 있으나, 정확한 "
        "'인챈트 피치 트리 카드' 문자열이 아니므로 candidate로만 기록.",
    },
    "Novus__Card": {
        "textragKey": "황색 노버스 카드",
        "note": "원작 몬스터 이름 'Yellow Novus'(감사 검증 원작 ID 1718, 한글명 "
        "'노버스(황)')의 '황' -> '황색' 표기 차이로 정확 문자열 매치에는 "
        "실패했지만 동일 카드로 보이는 레코드가 존재. candidate로만 기록.",
    },
}


def resolve_cards_case_b(card_aegis_records, card_dropmap, audit_rows, textrag_items):
    """반환: {aegisName: entry} — verified/ambiguous/no-evidence 각각의 근거를 채운다."""
    kr_card_keys = {
        k for k, v in textrag_items.items() if isinstance(v, dict) and v.get("type") == "카드"
    }
    results = {}
    for aegis, rec in card_aegis_records.items():
        mob_ids = card_dropmap.get(aegis, [])
        names = set()
        used_oids = []
        for mid in mob_ids:
            row = audit_rows.get(str(mid))
            if row:
                names.add(row["name"])
                used_oids.append(str(mid))
        if not mob_ids:
            results[aegis] = {
                "outcome": "no-drop-source",
                "detail": "rAthena mob_db.yml Drops/MvpDrops 어디에도 이 카드가 없음(원작 데이터상 이례적, 수동 확인 필요)",
            }
        elif not names:
            results[aegis] = {
                "outcome": "no-audit-row",
                "detail": f"드롭 원작 몬스터 ID {mob_ids} 전부 MONSTER_AI_AUDIT.md에 확정된 원작 ID로 등재돼 있지 않음(몬스터 identity 감사가 이 ID들까지 아직 안 갔음 — 이번 아이템 identity 작업의 범위 밖)",
                "mobIds": mob_ids,
            }
        elif len(names) > 1:
            results[aegis] = {
                "outcome": "ambiguous-monster-name",
                "detail": f"드롭 원작 몬스터 ID {mob_ids}가 서로 다른 TextRAG 한글명으로 감사됨: {sorted(names)} (팔레트 변형/동명이종 가능성 — 자동 선택 금지)",
                "mobIds": mob_ids,
                "candidateNames": sorted(names),
            }
        else:
            name = next(iter(names))
            key = f"{name} 카드"
            if key in kr_card_keys:
                results[aegis] = {
                    "outcome": "verified",
                    "textragKey": key,
                    "mobIds": mob_ids,
                    "usedAuditIds": used_oids,
                    "krName": name,
                }
            else:
                results[aegis] = {
                    "outcome": "no-matching-card-item",
                    "detail": f"원작 몬스터 ID {mob_ids} -> 감사된 한글명 '{name}'로 '{key}' 키를 찾았으나 db-items.json에 없음(축약/의역 번역일 가능성 — candidate로만 기록)",
                    "mobIds": mob_ids,
                    "krNameTried": name,
                }
    return results


# ══════════════════════════════════════════════
# Case C: 영문 스텁 ↔ 한글 정본 — 수작업 확정 2건(§10). 일반화된 알고리즘이
# 아니라 실제로 모든 필드를 대조해 사람이 내린 판단이며, evidence 문자열에
# 그 대조 내용 전부를 남긴다.
# ══════════════════════════════════════════════
CASE_C_MANUAL_RESOLUTIONS = {
    "Arrow_Of_Wind": {
        "textragKey": "바람의 화살",
        "evidence": [
            "영문 스텁 'Arrow of Wind'(_krPending=true)는 desc가 '원작 데이터... "
            "한글명 미정' placeholder이고 atk/element 필드가 전혀 없어 게임에서 "
            "실제로 아무 효과도 내지 않는다.",
            "'바람의 화살'은 이미 완성된 한글 정본으로 element=풍속성(Wind와 의미 "
            "일치), buy=3/sell=1/weight=0.2 전부 rAthena Arrow_Of_Wind(Buy 3, "
            "Weight 2 -> /10 = 0.2)와 정확히 일치.",
            "atk: rAthena Attack=30이지만 TextRAG는 25 — 단, 같은 원소 화살 "
            "계열인 Fire_Arrow/Stone_Arrow/Crystal_Arrow(전부 rAthena "
            "Attack=30)도 이미 Case A로 확정된 TextRAG 대응 아이템(불화살/암석 "
            "화살/수정 화살)이 전부 atk=25로 동일하게 낮춰져 있음을 확인 "
            "(project 차원의 의도적 원소 화살 밸런스 조정, 이 항목만의 우연이 "
            "아님) — 이 30->25 패턴이 가족 전체에 일관되므로 반례가 아니라 "
            "확증으로 판단.",
            "db-monsters.json의 오크 아처(ID 130) 드롭 목록이 영문 스텁 키 "
            "'Arrow of Wind'를 직접 참조하고 있음을 확인 — 즉 현재 드롭 "
            "테이블은 (효과 없는) 영문 스텁을 주고 있고, 실제로 완성된 아이템은 "
            "별도의 '바람의 화살'이다. 드롭 테이블 자체는 이번 단계에서 "
            "수정하지 않는다(§24) — identity만 기록.",
        ],
    },
    "Steel_Arrow": {
        "textragKey": "강철의 화살",
        "evidence": [
            "영문 스텁 'Steel Arrow'(_krPending=true)도 동일하게 atk/element "
            "필드가 없는 placeholder.",
            "'강철의 화살'은 buy=4/sell=2/weight=0.2 전부 rAthena "
            "Steel_Arrow(Buy 4, Weight 2 -> 0.2)와 정확히 일치, atk=40도 "
            "rAthena Attack=40과 정확히 일치(이 화살은 원소가 없는 범용 "
            "화살이라 Arrow_Of_Wind류의 원소 화살 밸런스 조정 대상이 아님 — "
            "element=무속성으로 일관됨).",
            "db-monsters.json 오크 아처(ID 130) 드롭 목록이 영문 스텁 키 "
            "'Steel Arrow'를 직접 참조 — Arrow_Of_Wind와 동일한 상황.",
        ],
    },
}


def generate_structural_candidates(rec, textrag_items):
    """구조 신호 기반 candidate만 생성한다(자동 확정 아님, §7/§9).

    카드는 제외한다: TextRAG의 카드 레코드는 buy/weight가 official 소스값이
    아니라 type별 상수(buy=0, weight=10 고정, `weightSrc:"type"`)라서 이
    두 신호가 사실상 모든 카드에서 우연히 일치한다 — 구조 신호가 아니라
    잡음이 되므로 카드는 구조 candidate 생성에서 제외하고(§9의 "구조 일치는
    candidate 근거이지 canonical proof가 아니다"를 지키기 위해 애초에 의미
    없는 신호는 만들지 않는다), Case B(mob drop) 또는 수작업 조사로만 candidate를
    남긴다."""
    rtype = rec.get("Type")
    candidates = []

    if rtype == "Card":
        return []
    if rtype == "Weapon":
        pool_types = ["무기"]
    elif rtype == "Ammo":
        pool_types = ["소모품"]
    elif rtype == "Armor":
        locs = rec.get("Locations") or {}
        pool_types = []
        for loc, types in LOCATION_TO_TEXTRAG_TYPES.items():
            if locs.get(loc):
                pool_types.extend(types)
        if locs.get("Left_Hand") and not (rec.get("Jobs") or {}):
            pool_types.append(SHIELD_TEXTRAG_TYPE)
        if not pool_types:
            pool_types = ["갑옷", "Accessory", "투구_상단", "투구_중단", "투구_하단", "걸칠것", "신발", "방패"]
    else:
        pool_types = []

    r_buy = rec.get("Buy")
    r_weight10 = (rec.get("Weight") or 0) / 10.0
    r_atk = rec.get("Attack")
    r_def = rec.get("Defense")
    r_slots = rec.get("Slots", 0)
    r_wlv = rec.get("WeaponLevel")

    for key, item in textrag_items.items():
        if not isinstance(item, dict) or item.get("type") not in pool_types:
            continue
        if item.get("_aegis"):
            continue  # 이미 다른 rAthena 항목으로 정체가 확정된 레코드는 후보에서 제외
        signals = []
        if r_buy is not None and item.get("buy") == r_buy:
            signals.append("buy")
        if abs(item.get("weight", -1) - r_weight10) < 1e-6:
            signals.append("weight")
        if rtype == "Ammo" and item.get("ammo") and r_atk is not None and item.get("atk") == r_atk:
            signals.append("atk-exact")
        if rtype == "Weapon" and r_atk is not None and item.get("atk") == r_atk:
            signals.append("atk-exact")
        if rtype == "Armor" and r_def is not None and item.get("def") == r_def:
            signals.append("def-exact")
        if item.get("slots", 0) == (r_slots or 0):
            signals.append("slots")
        if rtype == "Weapon" and r_wlv is not None and item.get("weaponLv") == r_wlv:
            signals.append("weaponLv")
        if len(signals) >= 3:  # 최소 3개 신호(가격+무게+주스탯류)가 겹쳐야 후보로 채택
            candidates.append({"textragKey": key, "signals": signals})

    candidates.sort(key=lambda c: -len(c["signals"]))
    return candidates[:5]


def load_review_manifest():
    """P2-A.2 review manifest(source/data/combo-item-identity-reviewed.json)를 읽는다.
    파일이 없으면(P2-A.2를 실행하지 않은 체크아웃) 조용히 빈 dict를 반환한다 — P2-A.1
    단계까지의 동작을 그대로 보존한다."""
    if not REVIEW_MANIFEST_JSON.exists():
        return {}
    data = load_json(REVIEW_MANIFEST_JSON)
    return {item["aegisName"]: item for item in data.get("items", []) if item.get("reviewed")}


def build_identity_map():
    aegis_set = combo_referenced_aegis()
    structural = load_json(STRUCTURAL_JSON)
    card_dropmap = load_json(CARD_DROPMAP_JSON)
    audit_rows = parse_monster_audit(MONSTER_AUDIT_MD)
    textrag_items = load_json(TEXTRAG_ITEMS_JSON)
    unique_index, ambiguous_index = build_textrag_aegis_index(textrag_items)

    card_records = {a: structural[a] for a in aegis_set if structural.get(a, {}).get("Type") == "Card"}
    case_b_results = resolve_cards_case_b(card_records, card_dropmap, audit_rows, textrag_items)
    review_manifest = load_review_manifest()

    items = []
    for aegis in sorted(aegis_set):
        rec = structural.get(aegis, {})
        entry = {
            "aegisName": aegis,
            "rathenaItemId": rec.get("Id"),
            "rathenaName": rec.get("Name"),
            "rathenaType": rec.get("Type"),
            "textragKey": None,
            "status": "missing",
            "evidenceCase": None,
            "evidence": [],
            "candidates": [],
        }

        if aegis in unique_index:
            entry["textragKey"] = unique_index[aegis]
            entry["status"] = "verified"
            entry["evidenceCase"] = "A"
            entry["evidence"] = [
                f"TextRAG '{unique_index[aegis]}'._aegis == '{aegis}' (exact, unique)"
            ]
        elif aegis in CASE_C_MANUAL_RESOLUTIONS:
            res = CASE_C_MANUAL_RESOLUTIONS[aegis]
            entry["textragKey"] = res["textragKey"]
            entry["status"] = "verified"
            entry["evidenceCase"] = "C"
            entry["evidence"] = res["evidence"]
        elif aegis in ambiguous_index:
            entry["status"] = "ambiguous"
            entry["evidenceCase"] = None
            entry["evidence"] = [
                f"_aegis == '{aegis}'를 공유하는 TextRAG 레코드가 {len(ambiguous_index[aegis])}개 "
                f"존재: {ambiguous_index[aegis]} — 자동 선택 금지"
            ]
            entry["candidates"] = [{"textragKey": k, "signals": ["_aegis-shared"]} for k in ambiguous_index[aegis]]
        elif aegis in case_b_results:
            cb = case_b_results[aegis]
            if cb["outcome"] == "verified":
                entry["textragKey"] = cb["textragKey"]
                entry["status"] = "verified"
                entry["evidenceCase"] = "B-card"
                entry["evidence"] = [
                    f"rAthena mob_db.yml Drops/MvpDrops: 원작 몬스터 ID {cb['mobIds']}가 "
                    f"'{aegis}'를 직접 드롭 목록에 명시(AegisName exact, 이름 유사도 추측 아님)",
                    f"MONSTER_AI_AUDIT.md(pre-re@{SOURCE_COMMIT[:7]})가 이미 검증한 원작 ID "
                    f"{cb['usedAuditIds']} -> TextRAG 한글명 '{cb['krName']}'",
                    f"TextRAG db-items.json에 '{cb['textragKey']}'(type=카드)가 정확히 존재",
                ]
            elif cb["outcome"] == "ambiguous-monster-name":
                entry["status"] = "ambiguous"
                entry["evidence"] = [cb["detail"]]
                entry["candidates"] = [
                    {"textragKey": f"{n} 카드", "signals": ["mob-drop-source", "monster-audit-verified"]}
                    for n in cb["candidateNames"]
                ]
            elif cb["outcome"] == "no-matching-card-item":
                manual = MANUAL_CARD_CANDIDATES.get(aegis)
                entry["evidence"] = [cb["detail"]]
                if manual:
                    entry["status"] = "unresolved-existing"
                    entry["evidence"].append(manual["note"])
                    entry["candidates"] = [{"textragKey": manual["textragKey"], "signals": ["manual-paraphrase-review"]}]
                else:
                    entry["status"] = "missing"
            else:  # no-audit-row / no-drop-source
                manual = MANUAL_CARD_CANDIDATES.get(aegis)
                entry["evidence"] = [cb["detail"]]
                if manual:
                    entry["status"] = "unresolved-existing"
                    entry["evidence"].append(manual["note"])
                    entry["candidates"] = [{"textragKey": manual["textragKey"], "signals": ["manual-paraphrase-review"]}]
                else:
                    entry["status"] = "missing"
        else:
            structural_candidates = generate_structural_candidates(rec, textrag_items)
            entry["candidates"] = structural_candidates
            entry["status"] = "unresolved-existing" if structural_candidates else "missing"
            entry["evidence"] = [
                "_aegis exact match 없음, rAthena 자체 데이터(mob_db 드롭 등) 기반 확정 "
                "경로 없음 — 구조적 신호만으로 candidate 생성됨(자동 확정 아님)"
                if structural_candidates
                else "_aegis exact match 없음, 확정 경로 없음, 구조적 신호로도 candidate "
                "0건(TextRAG에 대응 레코드가 아직 없을 가능성)"
            ]

        # Case D(리뷰 manifest)는 Case A 다음으로 우선한다 — Case A는 절대 덮어쓰지 않는다
        # (§15: 자동 승격 아님, 사람이 검토한 manifest만 반영. entry["evidenceCase"]=="A"인
        # 행은 review manifest에 실수로 같은 aegisName이 들어와도 무시한다).
        review = review_manifest.get(aegis)
        if review and entry.get("evidenceCase") != "A":
            entry["status"] = review["decision"]
            entry["evidenceCase"] = review.get("evidenceCase")
            entry["evidence"] = review["evidence"]
            entry["textragKey"] = review.get("textragKey")
            if review["decision"] == "ambiguous" and review.get("candidates"):
                entry["candidates"] = [{"textragKey": k, "signals": ["case-d-review-ambiguous"]} for k in review["candidates"]]
            elif review["decision"] in ("missing", "unresolved-existing"):
                entry["candidates"] = []

        items.append(entry)

    status_counts = {}
    for it in items:
        status_counts[it["status"]] = status_counts.get(it["status"], 0) + 1

    return {
        "sourceCommit": SOURCE_COMMIT,
        "totalItems": len(items),
        "statusCounts": status_counts,
        "items": items,
    }


def main():
    out = build_identity_map()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"OK - wrote {OUT_JSON} ({out['totalItems']} items)")
    print("status counts:", out["statusCounts"])


if __name__ == "__main__":
    main()
