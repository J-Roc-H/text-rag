# COMBO_ITEM_IDENTITY_REVIEW.md — P2-A.2 고신뢰 candidate 검토·승격

P2-A.1이 만든 `source/data/combo-item-identity.json`은 93/278(33.5%) 수준까지
identity를 회수했지만, Armor는 6/154, Weapon은 0/31로 사실상 정체돼 있었다.
이 문서는 그 병목을 겨냥한 **P2-A.2(고신뢰 candidate 사람 검토·승격)**의 결과를
기록한다. 이번 단계도 콤보 효과를 `calcStats()`/전투에 연결하지 않는다.

## 1. 검토 기준

신설 **Case D**: rAthena item record ↔ TextRAG record의 다중 필드 일치 +
이름 대응(직역/음역)을 사람이 직접 대조해 확정. 자동 승격 스크립트는 없다 —
`tools/gen_review_manifest.py`는 이 세션에서 실제로 검토·승인한
aegisName→textragKey 목록을 그대로 JSON으로 직렬화할 뿐이다. 필수 조건:

1. **후보가 사실상 유일**해야 한다 — 구조 신호 개수가 동점인 후보가 2개 이상
   있으면(예: 흔한 저가/기본 방어구류) 이름이 아무리 그럴듯해도 **승격하지
   않는다**(§13 참조, 20건이 이 이유로 보류됨).
2. **type 일치** — rAthena Type/Locations를 TextRAG type(무기/갑옷/투구_*/
   걸칠것/신발/방패/Accessory)으로 매핑하는 대응표를 먼저 확정(§4의 조사
   결과 그대로 재사용).
3. **핵심 구조 필드 일치**(무기: weight/atk/slots/weaponLv, 방어구: weight/
   def/slots) — 필드가 없는 경우("Defense 필드 없음")와 0인 경우를 구분해
   실제로 값이 일치하는 필드만 evidence에 남긴다(０ vs 없음을 혼동해 점수를
   올리지 않음, §5).
4. **이름 대응**은 최종 confirmation으로만 쓴다 — 직역/음역이 자연스러운지,
   가능하면 TextRAG desc의 실제 스크립트 효과까지 rAthena Script와 대조해
   이중 확인한다(예: Frozen_Bow는 이름뿐 아니라 실제 `bAddEff,Eff_Freeze`
   스크립트까지 일치).
5. 승격 실패 시 반드시 이유를 evidence에 남긴다(name mismatch, effect
   content mismatch 등) — 나중에 같은 항목을 다시 검토할 때 헛수고하지
   않도록.

## 2. 우선순위 산출

전체 172건 unresolved-existing을 처음부터 다시 훑지 않고, combo-impact 기준
우선순위를 계산했다: 각 unresolved-existing 아이템에 대해 "이 아이템이
포함된 콤보에서 나머지 아이템들이 이미 verified거나 강한 candidate(신호 4개
이상)를 갖는 콤보 수"를 셌다. 그 결과 **48개 콤보 variant**가 "구성 아이템
전부가 verified이거나 4+ 신호 candidate"인 클러스터를 이뤘고, 그 클러스터를
푸는 데 필요한 고유 아이템이 **71개**(Armor 55, Weapon 16)였다. 여기에
사용자 지시대로 **Weapon 30건 전수**(클러스터 밖 14건 포함)를 추가해 review
대상으로 확정했다.

## 3. Weapon review

30건 전수 검토. 구조 신호 최댓값이 유일한 후보를 가진 것은 17건, 나머지
13건은 동점 후보(예: Burning_Bow/Gust_Bow가 둘 다 '불타는활'/'질풍의활'에
동점)라 조건 1에서 탈락시켰다. 유일 후보 17건 중 15건은 이름/효과 대응까지
확인해 verified, 2건(`Sandstorm`→'배틀포크', `Twilight_Desert`→'빨간스퀘어백')은
**이름이 완전히 무관해 기각**(구조 신호만으로는 후보가 유일했지만 조건 4에서
탈락 — "구조신호 4개 이상 + 이름이 비슷함 ≠ 자동 verified"를 반대 방향에서도
지켰다: 이름이 전혀 안 비슷하면 구조만으로도 승격 안 함).

**Weapon verified 17건**: Ancient_Magic(고대의마법), Battle_Hook(배틀훅),
Bone_Wand(이블 본 완드), Cursed_Lyre(커즈드라이어), Divine_Cross(디바인크로스),
Dragon_Killer(드래곤킬러), Dragon_Slayer(드래곤슬레이어), Earth_Bow(대지의활),
Frozen_Bow(냉각의활, 실제 Freeze 스크립트까지 일치), Hunting_Spear(헌팅스피어),
Long_Horn/Long_Horn_M(둘 다 롱혼 — 아래 §6 duplicate-id 설명 참조),
Luna_Bow(루나보우), Orc_Archer_Bow(오크아쳐의활), Principles_Of_Magic(마법의정석),
Survival_Rod_/Survival_Rod2_(둘 다 서바이버로드 — Long_Horn과 같은 이유).

**Weapon 최종**: 17/30 verified(56.7%), 13건 unresolved-existing(동점 후보라
보류) + 1건 missing.

## 4. Armor review

Armor 140건 전수는 이번 단계에서 하지 않았다(§21 지시대로 고신뢰군만). §2의
71개 클러스터-영향 아이템 중 Armor 55건을 검토해 구조 신호 유일 후보 40건을
확인했다(15건은 동점이라 보류: Alarm_Mask, Angel's_Protection,
Angeling_Hairpin, Black_Cat, Black_Glasses, Dragon_Vest,
Ear_Of_Angel's_Wing, Ear_Of_Devil's_Wing, Gae_Bolg[무기], Pecopeco_Wing_Ears,
Phantom_Of_Opera, Rider_Insignia_M, Staff_Of_Wing[무기], Thorn_Staff[무기],
Tournament_Shield, Wool_Scarf). 유일 후보 40건은 TextRAG desc 내용이 거의
전부 rAthena Name/세트 테마와 정확히 일치해(예: Goibne 4종 세트가 전부 "명장
게브네이" desc, 북유럽 신화 세트 Fricca/Fricco/Vali/Vidar/Ulle/Magni가 전부
해당 신 이름 그대로 desc에 등장) 이름+구조+lore 삼중 확인으로 verified 확정.

**Armor 최종**: 46/154 verified(29.9%, 기존 6건 Case A + 신규 40건 Case D),
100건 unresolved-existing(남은 85건 미검토 + 15건 동점보류), 8건 missing.

## 5. Card 잔여

기존 6건(The_Paper_Card, Raggler_Card, Fur_Seal_Card, B_Harword_Card,
Live_Peach_Tree_Card, Novus__Card) 전부 개별 조사:

- **The_Paper_Card/Raggler_Card/Fur_Seal_Card**: rAthena mob_db.yml Drops에서
  원작 몬스터 ID(1375/1254/1317)를 확인했으나 `MONSTER_AI_AUDIT.md`에 그
  ID들의 감사 행 자체가 없어 Case B 체인이 시작 못 함 — **몬스터 전체 감사를
  확장하지 않는다는 제약(§22) 안에서는 더 진행 불가**, missing 유지.
- **B_Harword_Card**: 원작 몬스터 ID 1648의 rAthena Name이 "Whitesmith
  Howard"로 확인돼 TextRAG 몬스터 '화이트스미스 하워드'(id 241)/'화이트스미스
  하워드(일반)'(id 333) 둘 다와 부합하지만 **어느 쪽인지 결정할 근거가 없고**,
  실제 rAthena Script(`bBreakWeaponRate,1000` — 무기파괴 10%만)를 카드 후보
  '화이트스미스 하워드 카드'의 TextRAG desc(무기파괴10%+방어구파괴7%)와
  대조하면 **효과 내용도 정확히 일치하지 않음**을 발견 — 승격 근거가 오히려
  약해져 **ambiguous로 복원**(§13, 두 후보 보존).
- **Live_Peach_Tree_Card/Novus__Card**: P2-A.1이 남긴 이름 의역 candidate를
  이번에 실제 rAthena Script와 대조: 둘 다 **효과 내용이 전혀 다름**을
  발견(Live_Peach_Tree_Card는 실제로 오토스펠 힐인데 후보 카드는 식물형
  피해 보너스, Novus__Card는 실제로 MaxHP% 증가인데 후보 카드는 고정치 HP+
  회복력). **candidate 기각, missing으로 재분류** — P2-A.1의 후보가 틀렸다는
  것을 실제로 반박한 유의미한 발견이다.

**Card 최종**: 82/88 verified(93.2%, 불변), 1건 ambiguous(신규), 5건 missing.

## 6. verified 승격 — 57건 (+ 기존 93건 = 150건)

세부는 §3-4 참조. 특기사항: `Long_Horn`/`Long_Horn_M`(rAthena Id 1420/1428)과
`Survival_Rod_`/`Survival_Rod2_`(Id 1618/1620)는 각각 **전 필드가 완전히
동일한 rAthena duplicate record**(rAthena가 같은 아이템을 다른 획득 경로용으로
ID만 복제해 등록하는 흔한 패턴)임을 확인하고, 이미 이 프로젝트가
`ITEM_EQUIPMENT_PATCH_NOTES.md`에서 확립한 "duplicate variant를 하나의
TextRAG record로 병합" 관행과 같은 근거로 둘 다 같은 TextRAG 키에 연결했다 —
이는 "같은 rAthena ID가 다른 verified key로 연결"(금지되는 방향)이 아니라
"다른 rAthena ID가 같은 verified key로 연결"(정당한 duplicate 병합)이라
`build.audit_combo_item_identity()`의 충돌 검사에도 위배되지 않는다.

## 7. ambiguous/보류

- **ambiguous 1건**: B_Harword_Card(§5).
- **구조 신호 동점으로 보류한 20건**(§3-4에 나열) — 일부는 desc 내용까지
  보면 사실상 답이 뻔해 보이는 것도 있었지만(예: Alarm_Mask의 세 후보 중
  '알람가면'만 이름이 정확히 일치), **구조가 동점이면 이름만으로 깨지
  않는다는 원칙을 세션 내내 일관되게 지켰다** — 다음 세션에서 desc 내용
  대조까지 포함한 더 정밀한 재검토 대상으로 backlog 처리.

## 8. combo impact

| | P2-A.1 이후 | P2-A.2 이후 |
|---|---|---|
| verified | 13 | **26** |
| unsupported | 15 | **23** |
| source-needed | 128 | **107** |

identity 회수(93→150, +57)가 combo 단위로는 verified +13/unsupported +8만
반영됐다 — 나머지 identity 개선분은 같은 콤보의 다른 파트너 아이템이 여전히
미해결이거나(세트 콤보 특성상 여러 아이템이 동시에 풀려야 함), 효과가
unsupported라 그대로 남았다. identity 회수와 effect 지원 여부를 계속 분리
유지했다(§26).

## 9. runtime-ready(=verified) 수와 종류 분포

**26개 variant**가 runtime-ready(identity 전부 resolved + 효과 전부 지원 +
조건부 없음 + ammo 아님): 카드-only 13, 방어구-only 10, 방어구+무기 혼합 3.
**카드-only에만 국한되지 않고 장비 콤보(방어구/무기)가 절반 이상**을 차지하게
됐다는 점이 P2-A.1 시점(카드 13개뿐)과의 핵심 차이다.

## 10. P2-B 판정

**아직 이르지만 P2-A.1 시점보다 훨씬 근접했다.** 근거:

- runtime-ready 26건은 "의미 있는 표본군"이라 부를 만하고, 카드뿐 아니라
  방어구/무기 콤보도 절반 포함해 §38의 "여러 종류" 조건을 일부 충족한다.
- 그러나 여전히 전체 156개 중 82.7%(107+23-실제 unsupported도 미완성이므로
  엄밀히는 130/156=83.3%)가 완전한 runtime 활성에 못 미친다.
- 가장 큰 잔여 병목은 **Armor 100건 unresolved-existing**(140건 중 아직
  85건 미검토 + 15건 동점보류) — 다음 세션에서 나머지 Armor를 검토하면
  runtime-ready 수가 더 늘어날 여지가 크다.
- 결론: **P2-B는 여전히 이르다.** 다음 우선순위는 (1) 나머지 Armor 85건
  검토, (2) 20건 동점 보류 건을 desc 내용 대조로 재검토, (3)
  `bonus`/`bonus2` fallback effect 라벨링(P2-A에서 지적된 27건) — identity가
  아니라 effect-support 쪽 병목 해소.

## 부록: 수작업 표본(§34) — Weapon 10 / Armor(몸통·망토·신발) 10 / 투구·방패·악세서리 10

### Weapon 10

| AegisName | TextRAG key | evidence |
|---|---|---|
| Ancient_Magic | 고대의마법 | rAthena Id 1573 (Ancient Magic), type Weapon; weight 700/10=70.0 == TextRAG 70; buy 20 == TextRAG 20; atk 30 == TextRAG 30; slots 2 == TextRAG 2; weaponLv 3 == TextRAG 3; rAthena Name 'Ancient Magic' == TextRAG desc 첫 어절 '고대의마법'(직역) |
| Battle_Hook | 배틀훅 | rAthena Id 1421 (Battle Hook), type Weapon; weight 900/10=90.0 == TextRAG 90; buy 20 == TextRAG 20; atk 140 == TextRAG 140; slots 1 == TextRAG 1; weaponLv 4 == TextRAG 4; rAthena Name 'Battle Hook' -> 음역 '배틀훅' |
| Bone_Wand | 이블 본 완드 | rAthena Id 1615 (Evil Bone Wand), type Weapon; weight 불일치(rAthena 700/10=70.0 vs TextRAG 1, weightSrc=stub -- TextRAG 값 자체가 placeholder라 비교 제외, 다른 신호로 판정); buy 20 == TextRAG 20; atk 40 == TextRAG 40; slots 0 == TextRAG 0; weaponLv 3 == TextRAG 3; rAthena Name 'Evil Bone Wand' -> 음역 '이블 본 완드' |
| Cursed_Lyre | 커즈드라이어 | rAthena Id 1741 (Cursed Lyre), type Weapon; weight 1250/10=125.0 == TextRAG 125; buy 20 == TextRAG 20; atk 125 == TextRAG 125; slots 1 == TextRAG 1; weaponLv 4 == TextRAG 4; rAthena Name 'Cursed Lyre' -> 음역 '커즈드라이어' |
| Divine_Cross | 디바인크로스 | rAthena Id 2001 (Divine Cross), type Weapon; weight 1500/10=150.0 == TextRAG 150; buy 20 == TextRAG 20; atk 120 == TextRAG 120; slots 0 == TextRAG 0; weaponLv 4 == TextRAG 4; rAthena Name 'Divine Cross' -> 음역 '디바인크로스' |
| Dragon_Killer | 드래곤킬러 | rAthena Id 13001 (Dragon Killer), type Weapon; weight 900/10=90.0 == TextRAG 90; buy 20 == TextRAG 20; atk 110 == TextRAG 110; slots 0 == TextRAG 0; weaponLv 4 == TextRAG 4; rAthena Name 'Dragon Killer' -> 음역 '드래곤킬러', TextRAG desc가 동일 스크립트(bIgnoreDefRace RC_Dragon) 보유 |
| Dragon_Slayer | 드래곤슬레이어 | rAthena Id 1166 (Dragon Slayer), type Weapon; weight 1300/10=130.0 == TextRAG 130; buy 20 == TextRAG 20; atk 150 == TextRAG 150; slots 0 == TextRAG 0; weaponLv 4 == TextRAG 4; rAthena Name 'Dragon Slayer' -> 음역 '드래곤슬레이어' |
| Earth_Bow | 대지의활 | rAthena Id 1732 (Earth Bow), type Weapon; weight 1400/10=140.0 == TextRAG 140; buy 20 == TextRAG 20; atk 105 == TextRAG 105; slots 1 == TextRAG 1; weaponLv 3 == TextRAG 3; rAthena Name 'Earth Bow' == TextRAG desc '대지의활'(직역) |
| Frozen_Bow | 냉각의활 | rAthena Id 1731 (Frozen Bow), type Weapon; weight 1400/10=140.0 == TextRAG 140; buy 20 == TextRAG 20; atk 100 == TextRAG 100; slots 1 == TextRAG 1; weaponLv 3 == TextRAG 3; rAthena Name 'Frozen Bow'; TextRAG desc의 실제 스크립트(bAddEff,Eff_Freeze,1000)가 '냉각/동결' 테마와 정확히 일치 -- 이름+효과 이중 확인 |
| Hunting_Spear | 헌팅스피어 | rAthena Id 1422 (Hunting Spear), type Weapon; weight 4200/10=420.0 == TextRAG 420; buy 20 == TextRAG 20; atk 180 == TextRAG 180; slots 1 == TextRAG 1; weaponLv 4 == TextRAG 4; rAthena Name 'Hunting Spear' -> 음역 '헌팅스피어' |

### Armor(몸통/망토/신발) 10

| AegisName | TextRAG key | evidence |
|---|---|---|
| Dress_Of_Angel | 천사의예복 | rAthena Id 2358 (Angel's Dress), type Armor; weight 1000/10=100.0 == TextRAG 100; buy 20 == TextRAG 20; def 5 == TextRAG 5; slots 0 == TextRAG 0; rAthena Name "Angel's Dress" == TextRAG desc '천사의 예복'(직역, '예복'=formal dress) |
| G_Strings_ | 삼각팬티 | rAthena Id 2371 (Pantie), type Armor; weight 100/10=10.0 == TextRAG 10; buy 1000 == TextRAG 1000; def 4 == TextRAG 4; slots 1 == TextRAG 1; rAthena Name 'Pantie' -> TextRAG desc '의외로 방어력이 있는 삼각팬티'(속옷류 아이템으로 동일 테마, 직역은 아니고 의역) |
| Goibne's_Armor | 게브네이의갑옷 | rAthena Id 2354 (Goibne's Armor), type Armor; weight 3500/10=350.0 == TextRAG 350; buy 50000 == TextRAG 50000; def 7 == TextRAG 7; slots 0 == TextRAG 0; rAthena Name "Goibne's Armor"; TextRAG desc '명장 게브네이가 벼려낸 갑옷'이 켈트 신화 대장장이 신 Goibniu(게브네이) 이름과 세트 테마 그대로 일치 |
| Improved_Tights | 개량형타이즈 | rAthena Id 2390 (Improved Tights), type Armor; weight 400/10=40.0 == TextRAG 40; buy 20 == TextRAG 20; def 6 == TextRAG 6; slots 1 == TextRAG 1; rAthena Name 'Improved Tights' == TextRAG desc '개량을 거친 타이즈'(직역, '개량형'='improved') |
| Mage_Coat_ | 매직코트 | rAthena Id 2372 (Mage Coat), type Armor; weight 600/10=60.0 == TextRAG 60; buy 20 == TextRAG 20; def 5 == TextRAG 5; slots 1 == TextRAG 1; rAthena Name 'Mage Coat'; TextRAG desc '마력이 깃든 코트'('마력'=magic)가 테마 일치 |
| Ninja_Suit_ | 닌자슈츠 | rAthena Id 2359 (Ninja Suit), type Armor; weight 1500/10=150.0 == TextRAG 150; buy 20 == TextRAG 20; def 7 == TextRAG 7; slots 1 == TextRAG 1; rAthena Name 'Ninja Suit' -> 음역 '닌자슈츠' |
| Odin's_Blessing | 오딘의축복 | rAthena Id 2353 (Odin's Blessing), type Armor; weight 2500/10=250.0 == TextRAG 250; buy 30000 == TextRAG 30000; def 6 == TextRAG 6; slots 1 == TextRAG 1; rAthena Name "Odin's Blessing" == TextRAG desc '오딘의 축복이 깃든 갑옷'(직역, 정확 일치) |
| Padded_Armor_ | 아머 | rAthena Id 2313 (Padded Armor), type Armor; weight 2800/10=280.0 == TextRAG 280; buy 48000 == TextRAG 48000; def 7 == TextRAG 7; slots 1 == TextRAG 1; rAthena Name 'Padded Armor'; TextRAG desc '가죽 안에 철판을 덧댄 갑옷'(padding 컨셉)이 부합 -- 이름 자체는 일반적('아머'='Armor')이라 구조 신호(4개) 비중이 더 크다 |
| Angel's_Warmth | 천사의온기 | rAthena Id 2521 (Angelic Cardigan), type Armor; weight 400/10=40.0 == TextRAG 40; buy 10000 == TextRAG 10000; def 2 == TextRAG 2; slots 1 == TextRAG 1; AegisName 'Angel's_Warmth'와 TextRAG desc '노비스를 감싸는 천사의 온기'가 직역 일치(rAthena 공식 Name은 'Angelic Cardigan'으로 갱신됐지만 AegisName은 레거시 그대로 유지 -- 같은 천사 세트 부재) |
| Falcon_Robe | 매의날개옷 | rAthena Id 2516 (Falcon Muffler), type Armor; weight 400/10=40.0 == TextRAG 40; buy 30000 == TextRAG 30000; def 3 == TextRAG 3; slots 0 == TextRAG 0; rAthena Name 'Falcon Muffler'; TextRAG desc '매의 깃털로 지은 날개옷'('매'=falcon)이 테마와 일치 |

### 투구/방패/악세서리 10

| AegisName | TextRAG key | evidence |
|---|---|---|
| Darkness_Helm_J | 다크네스헬름_J | rAthena Id 5653 (Darkness Helm), type Armor; weight 500/10=50.0 == TextRAG 50; buy 20 == TextRAG 20; def 3 == TextRAG 3; slots 1 == TextRAG 1; rAthena Name 'Darkness Helm' -> 음역 '다크네스헬름', AegisName의 '_J' 접미사까지 TextRAG 키에 보존 |
| Fricca_Circlet | 프리카서클릿 | rAthena Id 5124 (Fricca's Circlet), type Armor; weight 300/10=30.0 == TextRAG 30; buy 30000 == TextRAG 30000; def 3 == TextRAG 3; slots 0 == TextRAG 0; rAthena Name "Fricca's Circlet"; TextRAG desc '여신 프리카의 서클릿'이 북유럽 신화 이름(Fricca/Frigg) 그대로 일치 |
| Goibne's_Helmet | 게브네이투구 | rAthena Id 5128 (Goibne's Helm), type Armor; weight 500/10=50.0 == TextRAG 50; buy 30000 == TextRAG 30000; def 5 == TextRAG 5; slots 0 == TextRAG 0; rAthena Name "Goibne's Helm"; TextRAG desc '명장 게브네이의 투구' 일치 |
| Magni_Cap | 메긴캡 | rAthena Id 5122 (Magni's Cap), type Armor; weight 1000/10=100.0 == TextRAG 100; buy 30000 == TextRAG 30000; def 5 == TextRAG 5; slots 0 == TextRAG 0; rAthena Name "Magni's Cap"; TextRAG desc '마그니의 모자'가 북유럽 신화 이름(Magni) 그대로 일치(TextRAG 키의 '메긴'은 音 변형이나 desc가 '마그니'로 명확히 확인) |
| Skull_Cap | 스컬캡 | rAthena Id 18539 (Skull Cap), type Armor; weight 200/10=20.0 == TextRAG 20; buy 40 == TextRAG 40; def 5 == TextRAG 5; slots 1 == TextRAG 1; rAthena Name 'Skull Cap' -> 음역 '스컬캡', desc '해골 문양 모자'(skull 문양) 부합 |
| Ulle_Cap | 울캡 | rAthena Id 5123 (Ulle's Cap), type Armor; weight 500/10=50.0 == TextRAG 50; buy 30000 == TextRAG 30000; def 3 == TextRAG 3; slots 1 == TextRAG 1; rAthena Name "Ulle's Cap"; TextRAG desc '사냥의 신 울의 모자'가 북유럽 신화 사냥의 신 Ullr(울) 그대로 일치 |
| Wit_Pumpkin_Hat | 마녀의호박모자 | rAthena Id 18656 (Witch's Pumpkin Hat), type Armor; weight 300/10=30.0 == TextRAG 30; buy 20 == TextRAG 20; def 10 == TextRAG 10; slots 0 == TextRAG 0; rAthena Name "Witch's Pumpkin Hat" == TextRAG desc '마녀의 호박 모자'(직역) |
| Angel's_Safeguard | 천사의보호 | rAthena Id 2116 (Angelic Guard), type Armor; weight 400/10=40.0 == TextRAG 40; buy 10000 == TextRAG 10000; def 3 == TextRAG 3; slots 1 == TextRAG 1; rAthena Name 'Angelic Guard'; TextRAG desc '노비스를 지키는 천사의 방패'가 천사 세트 테마와 정확히 일치 |
| Stone_Buckler | 스톤버클러 | rAthena Id 2114 (Stone Buckler), type Armor; weight 1500/10=150.0 == TextRAG 150; buy 30000 == TextRAG 30000; def 3 == TextRAG 3; slots 1 == TextRAG 1; rAthena Name 'Stone Buckler' -> 음역 '스톤버클러', desc '돌을 깎아 만든 버클러'(stone) 일치 |
| Hyper_Changer | 하이퍼체인저 | rAthena Id 2656 (Armor Charm), type Armor; weight 1000/10=100.0 == TextRAG 100; buy 20000 == TextRAG 20000; def 1 == TextRAG 1; slots 0 == TextRAG 0; rAthena Name 'Armor Charm'과 직접 일치는 약하지만 AegisName 'Hyper_Changer' -> 음역 '하이퍼체인저'가 정확 일치, desc '갑옷에 부착하는 보조 장치'도 Armor Charm 컨셉과 부합 |
