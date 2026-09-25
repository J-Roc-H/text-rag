# 소모품 무게 전수 대조

- 기준: rAthena `master/db/pre-re/item_db_{usable,etc,equip}.yml`
- 변환: rAthena `Weight / 10 = TextRAG 표시 무게` (기존 프로젝트 규칙)
- TextRAG 소모품 총계: **90**
- `_aegis` 원본 직접 대조 가능: **20**
- 일치: **18**
- 불일치: **2**
- 원본 직접 연결 불가: **70**

## 확정 불일치

| TextRAG 키 | Aegis | 현재 | 원작 환산 | rAthena ID | 원작명 | weightSrc |
|---|---|---:|---:|---:|---|---|
| Arrow of Wind | `Arrow_Of_Wind` | 0 | **0.2** | 1755 | Arrow of Wind | official |
| Steel Arrow | `Steel_Arrow` | 0 | **0.2** | 1753 | Steel Arrow | official |

## 원본 직접 연결 불가

| TextRAG 키 | `_aegis` | 현재 무게 | weightSrc | stub |
|---|---|---:|---|---|
| 각성의 포션 | - | 7 | type | False |
| 강철의 화살 | - | 7 | type | False |
| 강철의 화살통 | - | 7 | type | False |
| 고기 | - | 15 | official | False |
| 고목나무 가지 | - | 7 | type | False |
| 그림자의 화살 | - | 7 | type | False |
| 그림자화살통 | - | 7 | type | False |
| 꿀 | - | 10 | official | False |
| 나비의 날개 | - | 7 | type | False |
| 날카로운 화살 | - | 7 | type | False |
| 낡은 카드첩 | - | 7 | type | False |
| 노란포션 | - | 7 | type | False |
| 녹슨 화살 | - | 7 | type | False |
| 녹슨 화살통 | - | 7 | type | False |
| 독화살 | - | 7 | type | False |
| 딸기 | - | 2 | official | False |
| 마스텔라의 열매 | - | 3 | official | False |
| 몬스터 사료 | - | 15 | official | False |
| 무형의 화살 | - | 7 | type | False |
| 무형의 화살통 | - | 7 | type | False |
| 바람 화살통 | - | 7 | type | False |
| 바람의 화살 | - | 7 | type | False |
| 보물상자 | - | 7 | type | False |
| 불화살 | - | 7 | type | False |
| 불화살통 | - | 7 | type | False |
| 빨간 허브 | - | 3 | official | False |
| 빨간포션 | - | 7 | type | False |
| 사과 | - | 7 | type | False |
| 사일런스 애로우 | - | 7 | type | False |
| 사탕 | - | 3 | official | False |
| 선물상자 | - | 7 | type | False |
| 성수 | - | 7 | type | False |
| 성스러운 화살 | - | 7 | type | False |
| 성스러운 화살통 | - | 7 | type | False |
| 수정 화살 | - | 7 | type | False |
| 수정 화살통 | - | 7 | type | False |
| 스턴 애로우 | - | 7 | type | False |
| 슬립 애로우 | - | 7 | type | False |
| 암석 화살 | - | 7 | type | False |
| 암석 화살통 | - | 7 | type | False |
| 옐로 허브 | - | 5 | official | False |
| 오래된보라상자 | - | 7 | type | False |
| 오래된빨간상자 | - | 7 | type | False |
| 오래된파란상자 | - | 7 | type | False |
| 오렌지 | - | 7 | type | False |
| 오리데오콘 화살 | - | 7 | type | False |
| 오리데오콘 화살통 | - | 7 | type | False |
| 웰스쿠키 | - | 7 | type | False |
| 은화살 | - | 7 | type | False |
| 은화살통 | - | 7 | type | False |
| 조각케이크 | - | 7 | type | False |
| 조합 키트 | - | 7 | type | False |
| 주홍포션 | - | 7 | type | False |
| 철 화살 | - | 7 | type | False |
| 철 화살통 | - | 7 | type | False |
| 초록포션 | - | 7 | type | False |
| 초록허브 | - | 7 | type | False |
| 캔디 스트라이퍼 | - | 4 | official | False |
| 커스 애로우 | - | 7 | type | False |
| 파란포션 | - | 7 | type | False |
| 파란허브 | - | 7 | type | False |
| 파리의 날개 | - | 7 | type | False |
| 파마의 화살 | - | 7 | type | False |
| 프리징 애로우 | - | 7 | type | False |
| 플래쉬 애로우 | - | 7 | type | False |
| 하얀포션 | - | 7 | type | False |
| 하얀허브 | - | 7 | type | False |
| 화살 | - | 7 | type | False |
| 화살통 | - | 7 | type | False |
| 황금포션 | - | 7 | type | False |

## 직접 대조 일치 항목

<details><summary>펼치기</summary>

| TextRAG 키 | Aegis | 무게 |
|---|---|---:|
| Bread | `Bread` | 2 |
| Dragon Breath Cocktail | `Int_Dish10` | 100 |
| Immaterial Arrow Quiver | `Imma_Arrow_Container` | 25 |
| Immortal Stew | `Vit_Dish10` | 100 |
| Level 3 Cold Bolt | `Cold_Scroll_1_3` | 1 |
| Level 5 Frost Diver | `Cold_Scroll_2_5` | 1 |
| Oridecon Arrow Quiver | `Ori_Arrow_Container` | 25 |
| Professional Cooking Kit | `High_end_Cooking_Kits` | 5 |
| Red Prickly Fruit | `Prickly_Fruit_` | 6 |
| Steel Arrow Quiver | `Steel_Arrow_Container` | 25 |
| Stone of Sage | `Stone_Of_Intelligence_` | 30 |
| Tropical Banana | `Tropical_Banana` | 5 |
| Worn Out Scroll | `Worn_Out_Scroll` | 2 |
| Yggdrasil Berry | `Yggdrasilberry` | 30 |
| 우유 | `Milk` | 3 |
| 이그드라실의 씨앗 | `Seed_Of_Yggdrasil` | 30 |
| 이그드라실의 열매 | `Yggdrasilberry` | 30 |
| 파나케아 | `Panacea` | 10 |

</details>
