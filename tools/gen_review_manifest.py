"""P2-A.2 one-off script: generates source/data/combo-item-identity-reviewed.json
from the Case D review performed manually this session (see COMBO_ITEM_IDENTITY_REVIEW.md).

This is NOT an auto-promotion script -- every aegisName/textragKey/decision pair
below was individually reviewed (rAthena record vs TextRAG record vs name
correspondence, sometimes vs actual Script content) before being hardcoded here.
Re-running this script only regenerates the JSON serialization of that fixed,
human-reviewed list -- it does not re-decide anything.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STRUCTURAL = json.load(open(ROOT / "source/reference/rathena-pre-re/item_db_structural_278.json", encoding="utf-8"))
TEXTRAG = json.load(open(ROOT / "source/data/db-items.json", encoding="utf-8"))
OUT = ROOT / "source/data/combo-item-identity-reviewed.json"

# aegisName -> (textragKey, name-evidence sentence)
WEAPON_VERIFIED = {
    "Ancient_Magic": ("고대의마법", "rAthena Name 'Ancient Magic' == TextRAG desc 첫 어절 '고대의마법'(직역)"),
    "Battle_Hook": ("배틀훅", "rAthena Name 'Battle Hook' -> 음역 '배틀훅'"),
    "Bone_Wand": ("이블 본 완드", "rAthena Name 'Evil Bone Wand' -> 음역 '이블 본 완드'"),
    "Cursed_Lyre": ("커즈드라이어", "rAthena Name 'Cursed Lyre' -> 음역 '커즈드라이어'"),
    "Divine_Cross": ("디바인크로스", "rAthena Name 'Divine Cross' -> 음역 '디바인크로스'"),
    "Dragon_Killer": ("드래곤킬러", "rAthena Name 'Dragon Killer' -> 음역 '드래곤킬러', TextRAG desc가 동일 스크립트(bIgnoreDefRace RC_Dragon) 보유"),
    "Dragon_Slayer": ("드래곤슬레이어", "rAthena Name 'Dragon Slayer' -> 음역 '드래곤슬레이어'"),
    "Earth_Bow": ("대지의활", "rAthena Name 'Earth Bow' == TextRAG desc '대지의활'(직역)"),
    "Frozen_Bow": ("냉각의활", "rAthena Name 'Frozen Bow'; TextRAG desc의 실제 스크립트(bAddEff,Eff_Freeze,1000)가 '냉각/동결' 테마와 정확히 일치 -- 이름+효과 이중 확인"),
    "Hunting_Spear": ("헌팅스피어", "rAthena Name 'Hunting Spear' -> 음역 '헌팅스피어'"),
    "Long_Horn": ("롱혼", "rAthena Name 'Long Horn' -> 음역 '롱혼'. rAthena Id 1420과 1428(Long_Horn_M)이 전 필드 완전히 동일한 duplicate record(ITEM_EQUIPMENT_PATCH_NOTES.md의 slots-merge 관행과 같은 성격) -- 둘 다 같은 TextRAG 키에 연결하는 것이 정당함"),
    "Long_Horn_M": ("롱혼", "Long_Horn과 동일 근거(전 필드 동일한 duplicate rAthena record, Id 1428)"),
    "Luna_Bow": ("루나보우", "rAthena Name 'Luna Bow' -> 음역 '루나보우'"),
    "Orc_Archer_Bow": ("오크아쳐의활", "rAthena Name 'Orc Archer Bow' == TextRAG desc 계열 '오크아쳐의활'(직역)"),
    "Principles_Of_Magic": ("마법의정석", "rAthena Name 'Principles of Magic' == TextRAG desc '마법의정석'(직역, '정석'='essentials/principles')"),
    "Survival_Rod_": ("서바이버로드", "rAthena Name \"Survivor's Rod\" -> 음역 '서바이버로드'. rAthena Id 1618과 1620(Survival_Rod2_)이 전 필드 완전히 동일한 duplicate record -- Long_Horn과 같은 근거"),
    "Survival_Rod2_": ("서바이버로드", "Survival_Rod_과 동일 근거(전 필드 동일한 duplicate rAthena record, Id 1620)"),
}

ARMOR_VERIFIED = {
    "Angel's_Arrival": ("천사의재래", "rAthena Name \"Angel's Reincarnation\"; TextRAG desc '노비스를 위한 천사의 신발'이 천사 세트(Angel Set) 테마와 정확히 일치"),
    "Angel's_Safeguard": ("천사의보호", "rAthena Name 'Angelic Guard'; TextRAG desc '노비스를 지키는 천사의 방패'가 천사 세트 테마와 정확히 일치"),
    "Angel's_Warmth": ("천사의온기", "AegisName 'Angel's_Warmth'와 TextRAG desc '노비스를 감싸는 천사의 온기'가 직역 일치(rAthena 공식 Name은 'Angelic Cardigan'으로 갱신됐지만 AegisName은 레거시 그대로 유지 -- 같은 천사 세트 부재)"),
    "Black_Leather_Boots": ("생명나무줄기슈즈", "rAthena Name 'Black Leather Boots'와 직접적 이름 일치는 약하지만, 이 AegisName은 World Tree(생명의 나무) 세트 신발의 레거시 코드명이며 TextRAG desc '생명 나무 줄기로 엮은 신발'이 그 세트 테마와 정확히 일치 + 구조 신호 4개 전부 일치"),
    "Black_Leather_Boots_": ("검은가죽부츠", "rAthena Name 'Black Leather Boots' == TextRAG desc '검은 가죽으로 만든 부츠'(직역)"),
    "Cuffs": ("족쇠", "rAthena Name 'Shackles' == TextRAG desc '무거운 쇠사슬 족쇄'(직역, '족쇠'='shackles')"),
    "Darkness_Helm_J": ("다크네스헬름_J", "rAthena Name 'Darkness Helm' -> 음역 '다크네스헬름', AegisName의 '_J' 접미사까지 TextRAG 키에 보존"),
    "Diabolus_Boots": ("마왕의부츠", "rAthena Name 'Diabolus Boots'; TextRAG desc '마왕의 힘이 깃든 부츠'('마왕'='Diabolus/demon king')가 정확히 일치"),
    "Diabolus_Manteau": ("마왕의망토", "Diabolus_Boots와 동일 세트, desc '마왕의 힘이 깃든 망토' 정확히 일치"),
    "Dragon_Breath": ("드래곤의숨결", "rAthena Name 'Dragon Breath' == TextRAG desc '용의 숨결이 깃든 망토'(직역)"),
    "Dragon_Manteau": ("드래곤의망토", "rAthena Name 'Dragon Manteau' == TextRAG desc '용의 힘이 깃든 망토'(직역)"),
    "Dress_Of_Angel": ("천사의예복", "rAthena Name \"Angel's Dress\" == TextRAG desc '천사의 예복'(직역, '예복'=formal dress)"),
    "Falcon_Robe": ("매의날개옷", "rAthena Name 'Falcon Muffler'; TextRAG desc '매의 깃털로 지은 날개옷'('매'=falcon)이 테마와 일치"),
    "Fricca_Circlet": ("프리카서클릿", "rAthena Name \"Fricca's Circlet\"; TextRAG desc '여신 프리카의 서클릿'이 북유럽 신화 이름(Fricca/Frigg) 그대로 일치"),
    "Fricco_Shoes": ("프리코슈즈", "rAthena Name \"Fricco's Shoes\"; TextRAG desc '풍요의 신 프리코의 신발'이 정확히 일치"),
    "G_Strings_": ("삼각팬티", "rAthena Name 'Pantie' -> TextRAG desc '의외로 방어력이 있는 삼각팬티'(속옷류 아이템으로 동일 테마, 직역은 아니고 의역)"),
    "Goibne's_Armor": ("게브네이의갑옷", "rAthena Name \"Goibne's Armor\"; TextRAG desc '명장 게브네이가 벼려낸 갑옷'이 켈트 신화 대장장이 신 Goibniu(게브네이) 이름과 세트 테마 그대로 일치"),
    "Goibne's_Combat_Boots": ("게브네이의군화", "rAthena Name \"Goibne's Greaves\"; TextRAG desc '명장 게브네이의 군화' 일치, 같은 Goibne 세트"),
    "Goibne's_Helmet": ("게브네이투구", "rAthena Name \"Goibne's Helm\"; TextRAG desc '명장 게브네이의 투구' 일치"),
    "Goibne's_Shoulder_Arms": ("게브네이어깨장식", "rAthena Name \"Goibne's Spaulders\"; TextRAG desc '명장 게브네이의 어깨 장식' 일치"),
    "Hahoe_Mask": ("하회탈", "rAthena Name 'Hahoe Mask' == TextRAG desc '안동 하회탈'(한국 고유명사 직역, 매우 명확)"),
    "Hyper_Changer": ("하이퍼체인저", "rAthena Name 'Armor Charm'과 직접 일치는 약하지만 AegisName 'Hyper_Changer' -> 음역 '하이퍼체인저'가 정확 일치, desc '갑옷에 부착하는 보조 장치'도 Armor Charm 컨셉과 부합"),
    "Improved_Tights": ("개량형타이즈", "rAthena Name 'Improved Tights' == TextRAG desc '개량을 거친 타이즈'(직역, '개량형'='improved')"),
    "Kiss_Of_Angel": ("천사의입맞춤", "rAthena Name \"Angel's Kiss\" == TextRAG desc '천사의 입맞춤'(직역)"),
    "Linen_Glove": ("리넨글러브", "rAthena Name 'Linen Glove' -> 음역 '리넨글러브', desc '리넨으로 짠 장갑' 일치"),
    "Mage_Coat_": ("매직코트", "rAthena Name 'Mage Coat'; TextRAG desc '마력이 깃든 코트'('마력'=magic)가 테마 일치"),
    "Magni_Cap": ("메긴캡", "rAthena Name \"Magni's Cap\"; TextRAG desc '마그니의 모자'가 북유럽 신화 이름(Magni) 그대로 일치(TextRAG 키의 '메긴'은 音 변형이나 desc가 '마그니'로 명확히 확인)"),
    "Mr_Smile": ("스마일", "rAthena Name 'Mr. Smile' -> 'Mr.' 생략 음역 '스마일', desc '웃는 얼굴 가면'이 테마 일치"),
    "Ninja_Suit_": ("닌자슈츠", "rAthena Name 'Ninja Suit' -> 음역 '닌자슈츠'"),
    "Odin's_Blessing": ("오딘의축복", "rAthena Name \"Odin's Blessing\" == TextRAG desc '오딘의 축복이 깃든 갑옷'(직역, 정확 일치)"),
    "Padded_Armor_": ("아머", "rAthena Name 'Padded Armor'; TextRAG desc '가죽 안에 철판을 덧댄 갑옷'(padding 컨셉)이 부합 -- 이름 자체는 일반적('아머'='Armor')이라 구조 신호(4개) 비중이 더 크다"),
    "Shinobi's_Sash": ("시노비의허리띠", "rAthena Name 'Shinobi Sash' == TextRAG desc '시노비의 허리띠'(직역)"),
    "Skull_Cap": ("스컬캡", "rAthena Name 'Skull Cap' -> 음역 '스컬캡', desc '해골 문양 모자'(skull 문양) 부합"),
    "Stone_Buckler": ("스톤버클러", "rAthena Name 'Stone Buckler' -> 음역 '스톤버클러', desc '돌을 깎아 만든 버클러'(stone) 일치"),
    "Tidal_Shoes": ("타이달슈즈", "rAthena Name 'Tidal Shoes' -> 음역 '타이달슈즈', desc '파도의 힘이 깃든 신발'(tidal=파도) 일치"),
    "Ulle_Cap": ("울캡", "rAthena Name \"Ulle's Cap\"; TextRAG desc '사냥의 신 울의 모자'가 북유럽 신화 사냥의 신 Ullr(울) 그대로 일치"),
    "Undershirt_": ("런닝셔츠", "rAthena Name 'Undershirt'; TextRAG desc '어깨에 걸치는 런닝셔츠'가 속옷/이너웨어 테마로 일치"),
    "Vali's_Manteau": ("발리의망토", "rAthena Name \"Vali's Manteau\"; TextRAG desc '복수의 신 발리의 망토'가 북유럽 신화 복수의 신 Vali(발리) 그대로 일치"),
    "Vidar's_Boots": ("비다르의부츠", "rAthena Name \"Vidar's Boots\"; TextRAG desc '침묵의 신 비다르의 부츠'가 북유럽 신화 침묵의 신 Vidar(비다르) 그대로 일치"),
    "Wit_Pumpkin_Hat": ("마녀의호박모자", "rAthena Name \"Witch's Pumpkin Hat\" == TextRAG desc '마녀의 호박 모자'(직역)"),
}


def structural_evidence(aegis, key):
    """실제로 값이 일치하는 필드만 evidence에 남긴다 -- 일치하지 않는 필드를
    나열하면(예: TextRAG 쪽 값이 stub/placeholder라 다른 경우) 거짓 증거가 된다."""
    rec = STRUCTURAL[aegis]
    item = TEXTRAG[key]
    ev = [f"rAthena Id {rec['Id']} ({rec['Name']}), type {rec['Type']}"]

    r_weight10 = (rec.get("Weight") or 0) / 10.0
    t_weight = item.get("weight")
    if rec.get("Weight") is not None and t_weight is not None and abs(t_weight - r_weight10) < 1e-6:
        ev.append(f"weight {rec['Weight']}/10={r_weight10} == TextRAG {t_weight}")
    elif rec.get("Weight") is not None and item.get("weightSrc") == "stub":
        ev.append(f"weight 불일치(rAthena {rec['Weight']}/10={r_weight10} vs TextRAG {t_weight}, weightSrc=stub -- TextRAG 값 자체가 placeholder라 비교 제외, 다른 신호로 판정)")

    if rec.get("Buy") is not None and item.get("buy") == rec["Buy"]:
        ev.append(f"buy {rec['Buy']} == TextRAG {item.get('buy')}")
    if rec.get("Attack") is not None and item.get("atk") == rec["Attack"]:
        ev.append(f"atk {rec['Attack']} == TextRAG {item.get('atk')}")
    if rec.get("Defense") is not None and item.get("def") == rec["Defense"]:
        ev.append(f"def {rec['Defense']} == TextRAG {item.get('def')}")
    if item.get("slots", 0) == (rec.get("Slots") or 0):
        ev.append(f"slots {rec.get('Slots', 0)} == TextRAG {item.get('slots', 0)}")
    if rec.get("WeaponLevel") is not None and item.get("weaponLv") == rec["WeaponLevel"]:
        ev.append(f"weaponLv {rec['WeaponLevel']} == TextRAG {item.get('weaponLv')}")
    return ev


def build_entry(aegis, key, name_note):
    return {
        "aegisName": aegis,
        "textragKey": key,
        "decision": "verified",
        "evidenceCase": "D",
        "reviewed": True,
        "evidence": structural_evidence(aegis, key) + [name_note],
    }


manifest = []
for aegis, (key, note) in {**WEAPON_VERIFIED, **ARMOR_VERIFIED}.items():
    manifest.append(build_entry(aegis, key, note))

# ambiguous restore -- B_Harword_Card: 두 후보(MVP/일반) 모두 존재, 원작 몬스터 ID(1648)의
# TextRAG 대응이 어느 쪽인지 확정 불가. 오히려 실제 rAthena Script(bBreakWeaponRate,1000
# -- 무기파괴 10%만) 대비 "화이트스미스 하워드 카드"의 desc(무기파괴10%+방어구파괴7%)가
# 불일치해 이 후보를 verified로 밀 근거가 오히려 약해졌다는 점까지 기록.
manifest.append({
    "aegisName": "B_Harword_Card",
    "textragKey": None,
    "decision": "ambiguous",
    "evidenceCase": None,
    "reviewed": True,
    "evidence": [
        "rAthena mob_db.yml Id 1648 AegisName=B_HARWORD Name='Whitesmith Howard' -- 이 이름 자체는 "
        "TextRAG 몬스터 '화이트스미스 하워드'(id 241)/'화이트스미스 하워드(일반)'(id 333) 둘 다와 "
        "부합해 어느 쪽 TextRAG 몬스터가 rAthena Id 1648인지 확정할 근거가 없음(MONSTER_AI_AUDIT.md "
        "감사표에 1648 원작 ID 행 자체가 없음).",
        "추가로 실제 rAthena Script(`bonus bBreakWeaponRate,1000;` -- 무기파괴 10%만)를 "
        "'화이트스미스 하워드 카드'의 TextRAG desc('무기파괴10%+방어구파괴7%')와 대조하면 효과 "
        "내용이 정확히 일치하지 않음 -- 이 카드가 진짜 대응인지도 불확실해져 verified 승격 근거가 "
        "약하다고 판단, ambiguous로 유지.",
    ],
    "candidates": ["화이트스미스 하워드 카드", "화이트스미스 하워드(일반) 카드"],
})

# Live_Peach_Tree_Card / Novus__Card: P2-A.1이 candidate로만 남겼던 수작업 후보를 이번에
# 실제 rAthena Script와 대조해 재검증 -- 둘 다 효과 내용이 맞지 않아 verified로 승격하지
# 않고, candidate 자체가 틀렸다는 발견을 evidence로 남긴다(여전히 missing).
manifest.append({
    "aegisName": "Live_Peach_Tree_Card",
    "textragKey": None,
    "decision": "missing",
    "evidenceCase": None,
    "reviewed": True,
    "evidence": [
        "P2-A.1이 이름 의역 후보로 남긴 '피치 트리 카드'를 실제 rAthena Script와 대조: "
        "rAthena Live_Peach_Tree_Card(Id 4217)의 실제 효과는 "
        "`bonus3 bAutoSpell,\"AL_HEAL\",1+9*(getskilllv(\"AL_HEAL\")==10),20;`(힐 오토스펠)인데, "
        "'피치 트리 카드'의 TextRAG effect는 raceBonus(식물형 +20% 피해)로 전혀 다른 효과 -- "
        "이름만 비슷한 다른 카드로 판단, candidate 기각.",
    ],
})
manifest.append({
    "aegisName": "Novus__Card",
    "textragKey": None,
    "decision": "missing",
    "evidenceCase": None,
    "reviewed": True,
    "evidence": [
        "P2-A.1이 이름 의역 후보로 남긴 '황색 노버스 카드'를 실제 rAthena Script와 대조: "
        "rAthena Novus__Card(Id 4382)의 실제 효과는 `bonus bMaxHPrate,10;`(MaxHP % 증가)인데, "
        "'황색 노버스 카드'의 TextRAG desc는 'HP+500(고정치)/HP회복력+10%'로 단위·성격이 전혀 "
        "다름 -- candidate 기각.",
    ],
})

OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"reviewedBy": "P2-A.2 manual case-D review", "items": manifest}, f, ensure_ascii=False, indent=1)
    f.write("\n")

print(f"OK - wrote {OUT} ({len(manifest)} reviewed rows)")
from collections import Counter
print(Counter(m["decision"] for m in manifest))
