# COMBO_ITEM_IDENTITY_FINAL_REVIEW.md — P2-A.3 잔여 장비 identity 회수

identity 트랙의 마지막 대규모 회수 단계. P2-A.2 종료 시점(verified 150/278,
Armor 46/154, Weapon 17/30)에서 남은 Armor/Weapon/Card를 우선순위 기반으로
전수 재검토했다. 이번 단계도 effect parser/combo matcher는 건드리지 않는다.

## 1. P2-A.3 범위

검토 대상: Armor unresolved-existing 잔여(P2-A.2 미검토 85건 + 동점 보류
15건), Weapon unresolved-existing 13건 전수, Card ambiguous 1건 + missing
5건, 그리고 missing 14건 전체(true-missing 재확인). combo-impact
우선순위(§20 방식으로 재계산)로 검토 순서를 정했다 — 특히 "이 아이템 하나만
해결되면 여러 콤보가 identity-complete되는" 36개 solo-unlock 아이템을
먼저 처리했다.

## 2. 미검토 Armor(핵심 발견: candidate generator 버그)

Armor 후보 검토 초반, `Valkyrja's_Shield`/`Tournament_Shield`처럼 진짜
방패류인데 후보 목록에 투구(울캡)·갑옷(천상의로브) 같은 엉뚱한 타입이 섞여
"가짜 동점"을 만들고 있음을 발견했다. 원인: `generate_structural_candidates`가
"Locations.Left_Hand + Jobs 필드가 비어있으면 방패"라는 잘못된 휴리스틱을
쓰고 있었다 — 실제로는 Tournament_Shield/Valkyrja's_Shield처럼 Jobs 제한이
있는 진짜 방패도 흔하다. **수정**: Left_Hand면 무조건 방패+갑옷 둘 다
candidate pool에 넣고 구조 신호로 거르도록 변경(`tools/build_combo_item_identity.py`).
수정 후 Valkyrja's_Shield는 즉시 유일 후보(발키리아쉴드)로 확정됐다 — 이는
"새 증거"라기보다 "잘못된 필터를 고친 결과"라 별도로 명시한다.

이후 **reqLv(EquipLevelMin)를 새로운 결정적 증거**로 전면 활용했다(§8-9
지시대로): 구조 신호가 동점인 항목의 reqLv를 후보들의 TextRAG `reqLv`와
대조해, 정확히 하나만 일치하면 동점을 깬다. 이 방법으로 15건이 즉시
resolved, 6건은 "narrowed"(2개로 줄었지만 여전히 동점)로 남았고 이후
이름 대응(§11 negative evidence)으로 전부 해소했다(Bison_Horn↔Orleans_Glove,
Orleans_Server↔Thorny_Buckler, Rider_Insignia↔Rider_Insignia_M).

**"WoE 훈장 세트" 발견**: rAthena에는 완전히 동일한 스탯(buy/def/slots/
reqLv=80)을 가진 3~4개 아이템이 세트로 존재하는 경우가 많다(전장 시리즈).
구조로는 절대 구분 불가능하지만, 각 rAthena 영문명이 세트 내 정확히 하나의
한국어 계급/역할명과만 대응해(Assaulter=돌격대장, Engineer=공병,
Assassin=암살자 등 서로 겹치지 않는 의미) 이름으로 전부 해소했다(§11).

## 3. 동점 Armor 15건 / Weapon 13건 재검토

- **Armor 15건**: 이 중 상당수가 reqLv 필터 + 이름 대응으로 이번에
  해소됐다(§2). 진짜 새 증거 없이 남은 것은 나머지 unresolved-existing에
  포함.
- **Weapon 13건**: 새로 발견한 evidence 유형 — **weapon subtype(wType)
  검증 누락**. `generate_structural_candidates`가 무기 SubType(활/지팡이/
  창/검 등)을 candidate 필터링에 쓰지 않아서, `Gae_Bolg`(SubType=2hSpear)의
  후보가 전부 검(sword)류였고 `Thorn_Staff`(SubType=Staff)의 후보 중
  wType=지팡이인 것이 하나도 없는 등 **타입 자체가 틀린 후보**가 섞여
  있었다. 이런 경우는 이름도 대체로 무관해(Gae_Bolg의 후보 이름이
  "슈바이체르샤벨"/"카츠발게르" 등 완전히 다른 유럽 무기명) 전부 기각,
  unresolved 유지. 유일한 신규 승격은 `Staff_Of_Wing`→`날개 지팡이`
  (wType=지팡이 일치 + atk 60 정확 일치 + **실제 rAthena Script**
  `bMatkRate+15/bCastrate-5`가 TextRAG desc "마법 공격력 상승 및 시전
  지연 감소"와 정확히 일치 — 이름+수치+효과 삼중 확인). 나머지 12건
  (Burning_Bow/Gae_Bolg/Gust_Bow/Holy_Stick/Sandstorm/Spectral_Spear/
  Spectral_Spear_/Staff_Of_Soul/Thorn_Staff/Twilight_Desert/Walking_Stick/
  Wizardy_Staff)은 진짜 동점이거나(예: Burning_Bow/Gust_Bow — rAthena
  자체에 reqLv/Script가 없어 구분 근거가 아예 없음) 이름이 무관해(Sandstorm→
  '배틀포크', Twilight_Desert→'빨간스퀘어백') 기각 — 전부 unresolved 유지,
  weapon subtype 필터링은 향후 candidate generator 개선 backlog로 남긴다.

## 4. Card 잔여

§14-15 지시대로 새 증거(MONSTER_AI_AUDIT.md 갱신, 새 Script 대조 등) 없이는
재판정하지 않았다:

- `The_Paper_Card`/`Raggler_Card`/`Fur_Seal_Card`: 원작 몬스터 ID 감사가
  여전히 미등재라 missing 유지.
- `B_Harword_Card`: 새 근거 없음, ambiguous 유지(§14).
- `Live_Peach_Tree_Card`/`Novus__Card`: P2-A.2가 이미 Script 내용 불일치로
  기각했고, 이번에도 재확인만 하고 missing 유지.

missing 14건 중 `Rosary`/`Krieger_Muffler1`/`Krieger_Suit1`/`Krieger_Shoes1`/
`Krieger_Ring1`/`Spiritual_Ring_C`/`Valkyrja's_Shield_C`/`Ulle_Cap_I`
8건은 카드가 아니라 **§16 "identity-blocked" 재분류 대상**이었다 — structural
candidate generator가 buy/weight 필드가 없거나(rAthena stub성 레코드) 5개
tied 후보 cap에 걸려 진짜 정답을 놓치고 있었다. 수작업으로 TextRAG를
직접 이름 검색(`Krieger_Muffler1`→`크리거머플러1` 등 접두사+번호 직접
대응, `Spiritual_Ring_C`→`스피리츄얼링_C`처럼 desc에 "(복제품)"/"(각인)"이
명시된 suffix 대응)해 전부 verified로 승격했다. 진짜 true-missing으로 남은
것은 `Hollgrehenn_Hammer`(TextRAG 어디에도 대응 없음, candidate 0건) +
카드 5건뿐이다.

## 5. Case E(세트-context corroboration)

`Diabolus_Robe`가 유일한 순수 Case E 사례다: 3자 구조 동점(마왕의로브/
오를레앙의제복/디바인클로스, 전부 reqLv55)에서 이미 검증된 `Diabolus_Boots`/
`Diabolus_Manteau`/`Diabolus_Armor`(전부 "마왕"='Diabolus' 테마)와 **같은
콤보 세트에 속한다는 맥락**이 마왕의로브만 마왕 테마 desc를 가진다는
**개별 증거**와 결합해 승격을 확정했다 — combo 관계 하나만으로는 확정하지
않는다는 원칙(§6)대로, 반드시 개별 아이템의 실제 desc 내용 증거가 함께 있어야
했다.

## 6. 최종 identity 분포

| | before(P2-A.2) | after(P2-A.3) |
|---|---|---|
| verified | 150 | **225** |
| unresolved-existing | 113 | **46** |
| missing | 14 | **6** |
| ambiguous | 1 | 1(불변) |

종류별: Ammo 5/5(100%, 불변) · Card 82/88(93.2%, 불변) ·
**Armor 120/154(77.9%, P2-A.2 대비 +74)** · **Weapon 18/30(60%, +1)**.

## 7. identity-complete combo

`requiredItems` 전부 resolved(=identity map에서 verified)인 variant 수를
combo status와 분리 집계: **101/156(64.7%)**. 이 중 실제로 `verified`
(=runtime-ready)인 것은 38개뿐이고, **60개는 identity가 완료됐는데도
effect 미지원(`unsupported`) 때문에 막혀 있다** — identity 회수가
combo 활성화를 자동으로 보장하지 않는다는 원칙(§26)이 데이터로 확인됐다.
남은 3개는 identity 완료 + conditionalRaw 존재로 `source-needed`.

## 8. combo status 분포

| | before(P2-A.2) | after(P2-A.3) |
|---|---|---|
| verified | 26 | **38** |
| unsupported | 23 | **60** |
| source-needed | 107 | **58** |

## 9. effect-support backlog

`source/data/combo-effect-support-backlog.json` 신규 생성. identity-complete
+ conditionalRaw 없음 + `unsupported` 상태인 91개 콤보를 대상으로, 각
`unsupportedEffects[].constant`별 (a) 몇 개 콤보에 등장하는지(occurrence),
(b) 그 콤보에서 **유일한** 미지원 constant라 지원 시 즉시 verified가 되는
콤보 수(soloFixRuntimeReadyPotential)를 집계했다. 상위 10개:

| constant | occurrence | solo-fix potential |
|---|---|---|
| bSubRace | 8 | 0 |
| **bSkillAtk** | 7 | **6** |
| bonus(fallback) | 6 | 2 |
| **bMatkRate** | 5 | **4** |
| bAddClass | 4 | 3 |
| bCastrate | 4 | 2 |
| bAutoSpellWhenHit | 3 | 3 |
| bonus2(fallback) | 3 | 2 |
| bLongAtkRate | 3 | 2 |
| bAddEff | 3 | 0 |

빈도만 보면 `bSubRace`가 1위지만 **단독으로 콤보를 완성시키는 경우가
0건**(항상 다른 미지원 효과와 같이 등장) — 반대로 `bSkillAtk`은 빈도
2위지만 solo-fix potential이 6건(occurrence의 86%)으로 **가장 비용 대비
효과가 큰 다음 목표**다. `bMatkRate`도 5개 중 4개가 단독 블로커라 두 번째
우선순위.

## 10. 다음 병목 판정

**identity는 더 이상 주 병목이 아니다.** Armor/Weapon 해결률이
6/154·0/31(P2-A.1)→46/154·17/30(P2-A.2)→**120/154·18/30(P2-A.3)**로
올랐고, identity-complete 비율도 64.7%에 달한다. 반면 combo 활성화의
실제 장벽은 이제 **effect-support**로 뚜렷이 이동했다 — identity-complete
101개 중 60개(59%)가 순전히 `unsupported` 효과 때문에 막혀 있다.

**P2-A.4(effect-support 확장)로 넘어가는 것이 맞다.** 우선순위는 §9의
backlog 순서(`bSkillAtk` → `bMatkRate` → `bAddClass`/`bAutoSpellWhenHit`/
`bUseSPrate`)를 따르는 것을 권장한다. 이 넷만 지원해도 identity-complete
콤보 중 solo-fix 16건(6+4+3+3)이 즉시 runtime-ready로 전환될 잠재력이 있다.

**P2-B(매처) 착수는 여전히 이르다** — runtime-ready 38건(카드 13/방어구
20/방어구+무기 5)은 P2-A.2의 26건보다 훨씬 견고한 표본이지만, effect-support
백로그를 먼저 처리해 runtime-ready 수를 늘리는 편이 매처를 붙이기 전에
훨씬 유리하다.
