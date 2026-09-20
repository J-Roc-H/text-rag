# DEVREF-H — 아이템 DB

> 로드 조건: **아이템 추가/수정** 작업 시 (db-items·무게·드롭명·장비·화살·카드 슬롯)
> 최종 검증: 2026-08-25 | 대상 코드: 룬미드가츠_v9.14.html
> 2026-08-25 `DEVREF-B DB스키마.md`가 318줄로 예산(300)을 넘겨 **아이템 계열 전량을 분리**.
> 내용은 이관 당시 그대로이며 요약하지 않았다. 몬스터·맵·NPC·스킬 스키마는 [[DEVREF-B DB스키마]].

## db-items 엔트리

```json
"아이템명": {
  "type": "소모품|무기|갑옷|방패|걸칠것|신발|투구_상단|투구_중단|투구_하단|Accessory|잡템|재료|카드|퀘스트아이템",
  "emoji": "이모지", "desc": "설명",
  "buy": 구매가, "sell": 판매가,
  // 소모품: heal, spHeal, effect (useItem()에서 분기 — 'full'=HP·SP 100%, 'half'=50%[v9.12 신규],
  //   'cure'=상태이상해제, 'teleport'/'town'=이동, 'aspd', 'treasure', 'cardalbum', 'deadbranch', 'quiver')
  // 무기: atk, wType, weaponLv, slots
  // 방어구류: def, mdef, slots, reqLv(원작 착용레벨, 엔진 미사용)
  // 스탯 아이템: str, agi, vit, int, dex, luk, hit, flee, crit, maxHp, maxSp, aspd
  // 카드: target(장착부위), prefix, suffix
  // 화살류: atk, element, ammo:true  ← 활 전용 소모품 마커
  "weight": 무게,            // v9.11 전량 주입. 원작 ×10 정수 표기 (코튼셔츠 10 = 1.0)
  "weightSrc": "csv|type|official|stub",  // 출처 추적용 — 아래 참조
  "_src": "equipcsv",        // v9.11에 장비CSV에서 정식 추가된 항목 (101종)
  "_stub": true              // 이름만 살려둔 임시 항목. v9.11 528종 → v9.12 376종
}
```

### weight / weightSrc (v9.11 신설, v9.12에 `official` 추가)

`weight`가 없으면 `carriedWeight`가 0이 되어 무게 시스템 전체가 죽는다 (v9.11 이전 상태).
**신규 아이템 추가 시 `weight` 필수.** 값이 없으면 1을 넣고 `weightSrc:"stub"`으로 표시할 것.

| weightSrc | 뜻 | 개수 (v9.12) |
|---|---|---|
| `csv` | `장비DB_*.csv` 무게 컬럼 실측 | 1,055 |
| `type` | 타입별 근사 기본값 (카드 10·소모품 7·잡템 10·재료 10) | 813 |
| `official` | rAthena Pre-Renewal `item_db` 공식 원작 수치(buy/sell/weight) 역참조. v9.12에서 드롭 빈도 상위 143종에 적용 — `csv`(자체 CSV 실측)와는 출처가 다르므로 구분 태그 | 143 |
| `stub` | 출처 없음 → **1로 고정**. 나중에 채울 대상. 이 중 `_stub:true`(이름 자체가 가짜, `type:"잡템", desc:"용도가 알려지지 않은 물건."`)인 것만 진짜 미구현 — 나머지는 이름은 정상인데 무게만 미상(I-3) | 725 (`_stub` 376 + 무게만 미상 349) |

`maxWeight = 2000 + STR*30` 과 같은 스케일이다. 전승 자격은 `carriedWeight` 500 미만.

**무게 패널티 구간 (P2-02, 2026-08-25)** — 임계값은 `calcStats()`가 단독 소유하고 플래그로 노출한다.
소비처는 플래그만 읽을 것 (숫자를 각자 다시 쓰면 구간이 갈라진다).

| 적재율 | 패널티 | 플래그 | 소비처 |
|---|---|---|---|
| 50% 초과 | HP/SP 자연회복 정지 | `s.weightNoRegen` | `procNaturalRegen()` |
| 70% 초과 | **자동** 전투 스킬 사용 불가 (평타만, 수동 `useSkill`은 허용) | `s.weightNoAutoSkill` | `pickPlayerSkill()` |
| 90% 초과 | ASPD 딜레이 ×1.3 (상한 2000ms) | (플래그 없음, calcStats 내부 처리) | `calcStats()` |

원작 Pre-Re는 70%에서 스킬 사용 자체가 막히지만 방치형이라 자동 로테이션만 차단했다.
50% 게이트는 `procNaturalRegen`이 `processTurn`에서만 호출되므로 **전투 중에만 작동**한다 (P1-02 참조).
미완료분은 `weightSrc==='stub'` 으로 검색 (DEVREF-E I-3). 이름 자체가 가짜인 것만 골라내려면 `_stub===true` 로 필터(DEVREF-E I-2).

**스텁 채우기 전 필수 확인**: 새로 채우려는 스텁 이름이 기존 비-스텁 아이템의 "다른 표기"일 수 있다
(공백 유무, 영문 음역 vs 순우리말, 자모 하나 차이). v9.12에서 9건 발견(`엘루니움`→`에르늄`,
`블루 포션`→`파란포션`, `오리데콘`→`오리데오콘` 등, 상세는 DEVREF-E I-2). 확인 없이 새로 채우면
같은 아이템이 이름만 다른 두 벌로 존재하게 된다.

### rAthena 원작 데이터 조인 + `_krPending` (2026-08-12)

외부 원작 데이터로 아이템을 채울 때 **안정적 ID로 조인**한다. 이름/영문 퍼지매칭은 오탐 발생
(실제: `Celestial_Robe`→성천도끼(도끼), `Cursed_Hand`→모로크현신1 — score만으론 재료/장비 안 갈림).
- 소스: rAthena GitHub `db/pre-re/item_db_{equip,usable,etc}.yml` (curl). 각 항목이 **Id + AegisName + Name(영) + Type/SubType + Attack/Defense/Weight/Slots/WeaponLevel/Buy/Sell** 보유.
- 조인: 게임 드롭 AegisName → rAthena `AegisName`→`Id`→스탯. 무게는 rAthena값 **/10** (게임 스케일). SubType→`wType` 매핑(1hSword=한손검·Dagger=단검·2hSpear=양손창… 게임 유효 wType만, `검`같은 더미 금지 §267).
- **`_krPending:true`** = 스탯은 원작이나 **한글명 미정**(임시 영문키). `_aegis` 필드에 원 AegisName 보존 → 나중 조회용. v9.12에 134종(장비43+재료91). 검색: `_krPending===true`.
- **kRO 원작 한글명 벌크소스는 Divine-Pride API(무료 키)뿐** — rAthena/zackdreaver(_true 포함)/ratemyserver 전부 영문, API 401(무키 불가)·페이지 SPA. 키 확보 시 `_aegis`→Id→ko-KR 배치. 적용은 **개명 말고 `krName` 표시필드 오버레이**(세이브 인벤토리 키·드롭참조 안 깨짐).

### 드롭명 ↔ 아이템명 (v9.11 대정리)

드롭표와 아이템DB가 **서로 다른 번역 파이프라인**에서 나와 같은 아이템이 다른 한글명을 갖고 있었다
(드롭표 `면셔츠[1]` ← `Cotton_Shirt_` / 아이템DB `코튼셔츠` ← `Cotton Shirt`).
드롭 엔트리 2,681건 중 1,748건(65%)이 존재하지 않는 이름을 가리켰고, 드롭 코드 5곳 어디에도
존재 검사가 없어 유령 키가 인벤에 쌓이고 렌더가 조용히 걸렀다 — **로그엔 뜨는데 가방엔 없음.**

v9.11에서 별칭 247건 치환 + 신규장비 101종 + 스텁 528종으로 **유령 0건**.
**드롭명을 새로 추가할 때는 반드시 `db-items` 에 존재하는 키를 쓸 것.**
`rollDrops()` 가 미등록 이름을 걸러내므로 오타는 조용히 드롭 실패로 나타난다
(`window.__dropWarn = true` 로 콘솔 경고 활성화).

### 드롭 시 슬롯 표기 (2026-09-20, DEVREF-E P1-03 완료)

별도 `dropSlots` 필드는 만들지 않았다 — `it.slots`(무/유슬롯 쌍을 병합한 기존 필드)가 이미
정답이었다. `rollDrops()`가 `it.slots>0`이면 드롭명에 `[N]`을 붙이도록 수정, `parseItem()`이
이름에 `[N]`이 없을 때 `base.slots`로 추정하던 기존 폴백과 일치시켰다. 대상 558종(2026-09-20 기준,
전량 장비류 — 소모품·카드는 slots 필드 자체가 없음).

**주의(2026-09-20 발견):** 인벤토리 키를 `parseItem()` 없이 `DB.items[key]`로 직접 조회하는 코드는
소켓 표기(`[N]`)가 붙은 이름에서 조용히 `undefined`가 된다 — 상점 판매탭·노점 등록 목록·창고 UI·
무게 계산·쉴드 계열 스킬 2종(`쉴드 부메랑`·`쉴드 차지`)에서 이 패턴이 있었고 이번에 전부
`parseItem(k)` 우선 조회로 교정했다. **새 인벤토리 조회 코드는 항상 `parseItem()`을 먼저
거칠 것** — `equipItem()`·`calcStats()` 장비 루프가 쓰는 패턴이 표준.

### 방어구·악세서리 DB (2026-07-06 전면 교체)

- RO 원작 CSV 1,310행 기반 약 1,040항목. 한글명 키(공백 없음, 예: "코튼셔츠"). 무슬롯/유슬롯 쌍은 `slots` 필드로 병합.
- 이름 뒤 `_`, `_C`(복제품), `_M`(각인), `_J`/`_I` 등은 별도 아이템 (번역 CSV의 동명이인 구분자).
- 복합 부위 장비(고글, 무낙모자 등)는 대표 부위 하나로 등록, desc에 "(상·중단 겸용)" 표기.
- calcStats() 장비 루프가 본체의 mdef/maxHp/maxSp/hit/crit도 합산함 (2026-07-06 패치. 그 전엔 카드만 합산).
- 속성부여·상태이상내성·종족내성·오토스펠 등은 desc에만 기술(엔진 미지원).
- 구 이름→새 이름: 코튼 셔츠→코튼셔츠, 가죽 갑옷→가죽재킷, 체인 메일→메일, 실크 로브→실크로브, 발키리의투구→발키리투구, 디아볼루스 시리즈→마왕의 시리즈, 베스퍼 코어→베스퍼코어01.
- 커스텀 유지 항목: 오크로드의갑옷, 앨리스의앞치마, 비단가운, 붉은머리띠, 오크히어로의투구, 악마의헤어밴드, 성스러운왕관, 왕관, 천사의헤어밴드, 드라큘라의망토.

### 화살(Ammo) 아이템 규격

- `"ammo": true` — 화살류 소모품 마커. `calcStats()` 및 `processTurn()`이 이 필드로 화살을 식별.
- `"atk"` — 화살 기본 공격력. `calcStats()` 에서 `weaponAtk`에 합산.
- `"element"` — 화살 속성. `calcStats()` 에서 `p.weaponElement`를 오버라이드.
- `"hitEffect"` — SE 화살 전용. 명중 시 상태이상 부여 확률. (2026-06-11 추가)

```json
"화살":       { "type":"소모품", "emoji":"🏹", "atk":25, "element":"무속성", "ammo":true, "buy":1, "sell":0 }
"독화살":     { "type":"소모품", "atk":25, "element":"무속성", "ammo":true, "hitEffect":{"se":"poison","chance":0.10,"turns":8} }
```

**hitEffect 구조:**
- `se`: `"poison"|"stun"|"sleep"|"freeze"|"blind"|"silence"|"curse"`
- `chance`: 발동 확률 (0~1)
- `turns`: 지속 턴 수

processTurn() 스킬 명중·평타 명중 양 경로에서 proc. `s.usesArrow && t.currentHp>0` 조건.

### 화살통(Quiver) 아이템 규격 (2026-06-11 추가)

- `"effect": "quiver"` — useItem()에서 처리. `quiverItem` 아이템을 `quiverCount`개 인벤에 추가.
- `"quiverItem"` — 지급할 화살 아이템명.
- `"quiverCount"` — 지급 수량 (기본 500).

```json
"화살통": { "type":"소모품", "emoji":"🎒", "effect":"quiver", "quiverItem":"화살", "quiverCount":500, "buy":500, "sell":250 }
```

### 카드 target 슬롯값

`무기` / `갑옷` / `걸칠것` / `투구_상단` / `방패` / `신발` / `Accessory`

- target 미지정 시 범용 (어느 장비에나 합성 가능)

### DB slots 기준 (Pre-Renewal RO)

- 무기 Lv1: 단검3, 한손검4, 양손검4, 창4, 둔기4, 도끼3, 활3, 지팡이4, 카타르2, 너클3, 책3, 악기2, 채찍3
- 무기 Lv2: 단검3, 한손검3, 양손검2, 창3, 둔기3, 도끼2, 너클2, 책2, 악기2, 채찍2
- 무기 Lv3: 0~1 / 갑옷·방패·걸칠것·신발: 1 / 악세서리: 클립2, 기타1
- 투구 상단: 일반1, 특수/MVP/퀘보상0 / 투구 중단: 1 / 투구 하단: 0
