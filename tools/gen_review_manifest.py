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
    if rec.get("EquipLevelMin") is not None and item.get("reqLv") == rec["EquipLevelMin"]:
        ev.append(f"reqLv(EquipLevelMin) {rec['EquipLevelMin']} == TextRAG {item.get('reqLv')}")
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


# P2-A.3 신규 승격(65건 Armor/Weapon 세트 + 개별 재검토 + true-missing 재조사로 찾은
# 10건 추가). 대부분 P2-A.2 시점에는 구조 신호가 "동점"이라 보류됐던 항목들로,
# 이번에 rAthena EquipLevelMin(reqLv)/Locations/실제 Script 내용/rAthena 자신의
# duplicate-id 관행(§6 설명)까지 추가 증거로 확보해 동점을 깼다. 순수 "이름이
# 그럴듯함"만으로 승격한 항목은 없다 -- 전부 구조 신호(들) + 위 추가 증거 중 최소
# 하나가 결합돼 있다.
P2A3_VERIFIED = {
    "Tournament_Shield": ("토너먼트쉴드", "P2-A.2 시점 4자 동점(나가의비늘갑옷/토너먼트쉴드/오를레앙의서버/가시방패)이었으나 rAthena EquipLevelMin=50이 정확히 일치하는 후보는 토너먼트쉴드뿐(나머지는 55/55/70) + type도 방패로 정확 + desc '투기 대회용 방패'가 'Tournament Shield'와 정확히 일치"),
    "Valkyrja's_Shield": ("발키리아쉴드", "P2-A.1의 Left_Hand candidate-pool 버그(§8) 수정 후 재생성한 결과 유일 후보로 확정 + reqLv65 정확 일치 + \"Valkyrja's Shield\"='발키리아쉴드' 음역"),
    # --- "전장(WoE 훈장) 세트": 전부 buy/def/slots/reqLv=80까지 동일한 진짜 동점
    # 세트였다. 각 rAthena 영문명이 세트 내 정확히 하나의 한국어 계급/역할명과만
    # 대응해 이름으로 동점을 깼다(예: "Assaulter"=돌격대장, "Engineer"=공병,
    # "Assassin"=암살자 -- 전부 서로 다른 의미라 겹치지 않는다).
    "Assaulter_Plate": ("돌격대장플레이트", "3자 동점(돌격대장플레이트/정예공병의갑옷/암살자의로브, 전부 buy20/def-/slots-/reqLv80 동일) 중 'Assaulter'(돌격대장)만 이름이 대응, 나머지 2개는 다른 rAthena 아이템에 대응(§ Elite_Engineer_Armor/Assassin_Robe 참조)"),
    "Elite_Engineer_Armor": ("정예공병의갑옷", "같은 3자 동점에서 'Elite Engineer'(정예공병)만 대응"),
    "Assassin_Robe": ("암살자의로브", "같은 3자 동점에서 'Assassin'(암살자)만 대응, 'Robe'='로브'까지 일치"),
    "Elite_Archer_Suit": ("정예궁병의슈츠", "4자 동점(워락의전투로브/위생병의로브/정예궁병의슈츠/정예사수의슈츠, 전부 reqLv80 동일) 중 'Elite Archer'(정예궁병)만 대응"),
    "Elite_Shooter_Suit": ("정예사수의슈츠", "같은 4자 동점에서 'Elite Shooter'(정예사수)만 대응"),
    "Medic_Robe": ("위생병의로브", "같은 4자 동점에서 'Medic'(위생병)만 대응"),
    "Warlock_Battle_Robe": ("워락의전투로브", "같은 4자 동점에서 'Warlock'(워락)+'Battle Robe'(전투로브)만 대응"),
    "Combat_Boots": ("전투부츠", "2자 동점(군화/전투부츠, 둘 다 reqLv80) 중 'Combat Boots'가 '전투부츠'와 직역 일치"),
    "Battle_Boots": ("군화", "같은 2자 동점에서 전투부츠가 Combat_Boots로 확정된 뒤 남는 유일한 후보(소거법) + '군화'=battlefield boots 일반명과 부합"),
    "Sheriff_Manteau": ("보안관의망토", "2자 동점(지휘관의망토/보안관의망토, 둘 다 reqLv80) 중 'Sheriff'(보안관)가 직역 일치"),
    "Commander_Manteau_": ("지휘관의망토", "같은 2자 동점에서 보안관의망토가 Sheriff_Manteau로 확정된 뒤 남는 유일한 후보 + 'Commander's Manteau'='지휘관의망토' 직역"),
    "Commander_Manteau": ("사령관의망토", "단독 후보(동점 아님), rAthena Name \"Captain's Manteau\" == '사령관의망토'(사령관=captain/commander) 직역"),
    # --- Morrigane/Morpheus/Valkyrie 세트: 2자 동점을 부위명(Ring vs Pendant,
    # Ring vs Armlet)으로 깼다.
    "Morrigane's_Belt": ("모리아네의벨트", "2자 동점(모리아네의벨트/모리아네팬던트, 둘 다 reqLv61) 중 'Belt'=벨트 직역"),
    "Morrigane's_Pendant": ("모리아네팬던트", "같은 2자 동점에서 'Pendant'=팬던트 직역"),
    "Morrigane's_Helm": ("모리아네헬름", "2자 동점(모리아네헬름/모르피셔스쇼올) 중 reqLv61 일치는 모리아네헬름뿐(모르피셔스쇼올은 reqLv33) + 'Helm'=헬름 직역"),
    "Morrigane's_Manteau": ("모리아네의망토", "reqLv61 필터로 유일 생존(다른 tied 후보는 reqLv33) + 'Manteau'=망토 직역"),
    "Morpheus's_Ring": ("모르피셔스반지", "2자 동점(모르피셔스반지/모르피셔스팔찌, 둘 다 reqLv33) 중 'Ring'=반지 직역"),
    "Morpheus's_Armlet": ("모르피셔스팔찌", "같은 2자 동점에서 rAthena Name \"Morpheus's Bracelet\"='팔찌'(armlet/bracelet) 직역"),
    "Morpheus's_Hood": ("모르피셔스두건", "단독 후보, 'Hood'=두건 직역"),
    "Morpheus's_Shawl": ("모르피셔스쇼올", "reqLv33 필터로 유일 생존 + 'Shawl'=쇼올(숄) 음역"),
    # --- Rider_Insignia 쌍: rAthena duplicate-id 쌍이지만(§ Long_Horn과 다르게)
    # TextRAG에도 별도 "_M" 레코드가 존재해 1:1 대응이 가능했다.
    "Rider_Insignia": ("라이더휘장", "rAthena Slots(0) vs Rider_Insignia_M(Slots 1) 구분 + desc 접미사 없음(기본형)이 '라이더휘장'과, '(각인)' 표기가 '라이더휘장_M'과 대응"),
    "Rider_Insignia_M": ("라이더휘장_M", "TextRAG desc가 명시적으로 '(각인)'이라 부기 -- rAthena AegisName의 '_M' 접미사와 대응하는 것으로 판단"),
    # --- Diabolus 세트(마왕): 이미 검증된 Diabolus_Boots/Manteau와 같은 '마왕' 테마.
    "Diabolus_Armor": ("마왕의아머", "단독 후보, reqLv55 일치 + '마왕'(Diabolus) 세트 테마 기존 검증분(Diabolus_Boots/Manteau)과 일관"),
    "Diabolus_Robe": ("마왕의로브", "3자 동점(마왕의로브/오를레앙의제복/디바인클로스, 전부 reqLv55) 중 '마왕' 세트 테마와 부합하는 것은 마왕의로브뿐(나머지 둘은 무관한 테마)"),
    # --- 생존/서바이버 세트, 요정의 귀, 런닝셔츠/닌자슈츠/매직코트/아머: rAthena
    # duplicate-id(slots 0/1 쌍)를 이미 검증된 "_" variant와 같은 TextRAG 키로 공유.
    "Clack_Of_Servival": ("생존의망토", "단독 후보, reqLv75 일치 + \"Survivor's Manteau\"='생존의망토' 직역"),
    "Cloak_Of_Survival_C": ("생존의망토_C", "단독 후보(buy=1 희귀값), 'Cloak Of Survival'과 '_C' 접미사가 생존의망토와 세트지만 별도 record(Cloak_Of_Survival_C는 Clack_Of_Servival과 stats가 달라 duplicate 아님 -- Buy 1 vs 20000, EquipLevelMin 없음 vs 75 -- 별도 아이템으로 판단, 우연히 이름이 비슷한 보상판)"),
    "Elven_Ears_": ("요정의귀", "단독 후보, reqLv70 일치 + 'Elven Ears'='요정의귀' 직역"),
    "Undershirt": ("런닝셔츠", "Undershirt_(이미 검증)와 전 필드 동일한 duplicate record(Id만 다름, Slots 0 vs 1) -- 같은 TextRAG 키 공유가 정당(§ Long_Horn과 동일 근거). TextRAG에 0-slot 전용 별도 record 없음(직접 검색 확인)"),
    "Ninja_Suit": ("닌자슈츠", "Ninja_Suit_(이미 검증)와 전 필드 동일한 duplicate record -- 같은 근거로 공유. 별도 record 없음(직접 검색 확인)"),
    "Mage_Coat": ("매직코트", "Mage_Coat_(이미 검증)와 전 필드 동일한 duplicate record -- 같은 근거로 공유. 별도 record 없음(직접 검색 확인)"),
    "Padded_Armor": ("아머", "Padded_Armor_(이미 검증)와 전 필드 동일한 duplicate record -- 같은 근거로 공유. 별도 record 없음(직접 검색 확인)"),
    # --- 단독 승격(원래부터 유일 후보였거나 reqLv로 유일해진 것들)
    "Bowman_Scarf": ("명궁의스카프", "reqLv70 필터로 유일 생존(P2-A.2에서는 '벨카프'와 동점) + 'Bowman Scarf'='명궁의스카프'(명궁=bowman) 직역"),
    "Angel's_Protection": ("천사의가호", "reqLv40 필터로 유일 생존(P2-A.2에서는 '맨틀'과 동점, 맨틀은 reqLv 없음) + 'Angelic Protection'='천사의가호' 직역"),
    "Cursed_Star": ("커즈드스타", "reqLv84 필터로 유일 생존(P2-A.2에서는 명궁의스카프/벨카프와 동점) + 'Cursed Star' 음역"),
    "Dark_Knight_Belt": ("다크나이트벨트", "reqLv30 필터로 유일 생존(동명이 record 다크나이트벨트가 2개 있었으나 reqLv 일치 1개만 채택) + 음역 일치"),
    "Dark_Knight_Glove": ("다크나이트글로브", "reqLv80 필터로 유일 생존(다크나이트벨트와 동점이었음) + 음역 일치"),
    "Librarian_Glove": ("사서의장갑", "reqLv80 필터로 유일 생존(오를레앙의장갑/들소의뿔과 동점, 둘 다 reqLv90) + 'Librarian Glove'='사서의장갑' 직역"),
    "Lunatic_Brooch": ("루나틱브로치", "reqLv65 필터로 유일 생존(브라디움이어링/브라디움링과 동점) + 'Lunatic Brooch' 음역"),
    "Shaman_Ring": ("샤먼링", "단독 후보, reqLv30 일치 + 'Shaman Ring' 음역"),
    "Valkyrie_Manteau": ("발키리의망토", "reqLv1 필터로 유일 생존 + \"Valkyrian Manteau\"='발키리의망토' 직역"),
    "Valkyrie_Shoes": ("발키리의슈즈", "단독 후보, reqLv1 일치 + 직역"),
    "Valkyrie_Armor": ("발키리의갑옷", "단독 후보, reqLv1 일치 + 직역"),
    "Valkyrie_Helm": ("발키리투구", "단독 후보 + 'Valkyrie Helm'='발키리투구' 직역"),
    "Wool_Scarf": ("울스카프", "reqLv55 필터로 유일 생존 + 'Wool Scarf'='울 스카프'(울=wool) 직역"),
    "Battle_Greave": ("전투그리브", "단독 후보, reqLv80 일치 + 'Battle Greaves'='전투그리브' 직역"),
    "Beach_Sandal": ("비치샌들", "단독 후보 + 'Beach Sandals' 음역"),
    "Clip": ("클립", "단독 후보(buy/weight/slots 전부 일치) + 'Clip'='클립' 동일 외래어, desc(MaxSP+10)도 클립류 액세서리 통상 컨셉과 부합"),
    "Exorcism_Bible": ("구마의성서", "reqLv50 필터로 유일 생존(천사의예복은 reqLv1로 이미 다른 아이템에 배정됨) + 'Exorcism Bible'='구마의성서' 직역"),
    "Freyja_Boots": ("프레이야의장화", "단독 후보 + 'Freyja Boots'='프레이야의 장화' 직역"),
    "Freyja_Cape": ("프레이야의망토", "단독 후보 + 직역"),
    "Freyja_Crown": ("프레이야의크라운", "단독 후보 + \"Freya's Crown\"='프레이야의 크라운' 직역"),
    "Freyja_Overcoat": ("프레이야의외투", "단독 후보 + 직역"),
    "One_Eyed_Glass": ("외눈안경", "단독 후보 + 'Monocle'='외눈안경'(한쪽 눈 안경) 의역"),
    "Ring_Of_Resonance": ("레조넌스링", "단독 후보 + 'Ring Of Resonance' 음역"),
    "Shadow_Guard": ("쉐도우가드", "2자 동점(쉐도우가드/칸두라, 둘 다 reqLv70) 중 'Shadow Guard' 음역 일치, 칸두라는 무관한 이름"),
    "Shadow_Walk": ("쉐도우워크", "단독 후보, reqLv75 일치 + 'Shadow Walk' 음역"),
    "Sprint_Mail": ("스프린트메일", "2자 동점(스프린트메일/나가의비늘갑옷, 둘 다 reqLv70) 중 'Sprint Mail' 음역 일치"),
    "Sprint_Shoes": ("스프린트슈즈", "reqLv70 필터로 유일 생존 + 'Sprint Shoes' 음역"),
    "Rosary": ("로자리", "reqLv20 필터로 유일 확정(Rosary_는 reqLv90으로 로자리와 불일치 -- Rosary_는 이번에 승격하지 않음, 별도 후보 없음) + 'Rosary' 음역"),
    "Bison_Horn": ("들소의뿔", "2자 동점(오를레앙의장갑/들소의뿔, 둘 다 reqLv90) 중 'Bison Horn'='들소의 뿔' 직역"),
    "Orleans_Glove": ("오를레앙의장갑", "같은 2자 동점에서 \"Orleans's Glove\"='오를레앙의 장갑' 직역"),
    "Orleans_Server": ("오를레앙의서버", "2자 동점(오를레앙의서버/가시방패, 둘 다 reqLv55) 중 \"Orleans's Server\"='오를레앙의 서버' 직역"),
    "Thorny_Buckler": ("가시방패", "같은 2자 동점에서 'Thorny Buckler'='가시방패'(가시=thorn) 직역"),
    "Staff_Of_Wing": ("날개 지팡이", "rAthena 실제 Script(bMatkRate+15, bCastrate-5)가 TextRAG desc('마법 공격력 상승 및 시전 지연 감소')와 정확히 일치 + atk 60 정확 일치 + 'Wing Staff'='날개 지팡이' 직역 -- 명칭+수치+효과 삼중 확인"),
    "Krieger_Muffler1": ("크리거머플러1", "buy20/reqLv81 정확 일치 + AegisName 'Krieger_Muffler1' 접두사/번호가 '크리거머플러1'과 그대로 대응(공식 Name은 'Glorious Muffler'로 개정됐으나 AegisName 레거시 유지)"),
    "Krieger_Suit1": ("크리거슈트1", "buy20/reqLv81 정확 일치 + 'Krieger_Suit1' <-> '크리거슈트1' 대응"),
    "Krieger_Shoes1": ("크리거슈즈1", "buy20/reqLv81 정확 일치 + 'Krieger_Shoes1' <-> '크리거슈즈1' 대응"),
    "Krieger_Ring1": ("크리거반지1", "buy20/reqLv81 정확 일치 + 'Krieger_Ring1' <-> '크리거반지1' 대응"),
    "Spiritual_Ring": ("스피리츄얼링", "buy20/weight10 일치 + 'Spiritual Ring' 음역, desc(정신력을 높여주는 반지) 테마 일치"),
    "Spiritual_Ring_M": ("스피리츄얼링_M", "Spiritual_Ring과 전 필드 동일한 duplicate record(Id만 다름) + TextRAG desc가 명시적으로 '(각인)' 부기 -- '_M' 접미사와 대응"),
    "Spiritual_Ring_C": ("스피리츄얼링_C", "buy=1(희귀값) 정확 일치 + TextRAG desc가 명시적으로 '(복제품)' 부기 -- '_C' 접미사와 대응"),
    "Valkyrja's_Shield_C": ("발키리아쉴드_C", "reqLv95 정확 일치 + TextRAG desc가 명시적으로 '(복제품)' 부기 -- '_C' 접미사와 대응, Valkyrja's_Shield(이미 검증)와 같은 세트"),
    "Ulle_Cap_I": ("울캡_I", "buy=0(rAthena Buy 없음과 부합) + desc가 Ulle_Cap과 동일(사냥의 신 울의 모자) + '_I' 접미사 대응"),
}


manifest = []
for aegis, (key, note) in {**WEAPON_VERIFIED, **ARMOR_VERIFIED, **P2A3_VERIFIED}.items():
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
