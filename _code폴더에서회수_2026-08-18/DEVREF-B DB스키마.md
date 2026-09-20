# DEVREF-B — DB 스키마

> 로드 조건: **데이터 추가/수정** 작업 시 (몬스터·맵·아이템·NPC·스킬 DB 작업)

-----

## db-monsters 엔트리

```json
"ID": {
  "name": "몬스터명", "emoji": "이모지",
  "lv": 레벨, "hp": HP, "atk": ATK,
  "def": 경감방어, "mdef": 마법방어, "softDef": 소프트방어,
  "hit": 명중, "flee": 회피,
  "str": STR, "agi": AGI, "vit": VIT, "int": INT, "dex": DEX, "luk": LUK,
  "range": 사거리, "atkDelay": 공격딜레이(ms),
  "exp": 기본EXP, "jexp": 잡EXP,
  "size": "소형|중형|대형",
  "race": "종족명",
  "element": "속성명", "elementLv": 속성레벨,
  "zeny": [최소, 최대],
  "drops": { "아이템명": 확률(%) },
  "slaves": [[몬스터ID, 마리수], ...]  // 선택, MVP 전용
}
```

> 마지막 몬스터 ID = **490** (아크 엔젤링, 2026-06-11 기준)
>
> - ID 1~479: 기존 몬스터. 이 중 300종은 2026-06-11 외부 CSV 기반으로 확장 스키마(mdef/str~luk/range/atkDelay/race/elementLv)가 적용됨.
>   나머지 179종은 CSV에 원본 데이터가 없어 기존 구 스키마(def/softDef/hit/flee/exp/jexp/size/element/zeny/drops만 존재) 그대로 유지됨.
>   목록: `monster_convert/report_unmatched.txt` 참고.
> - ID 480~490: 2026-06-11 신규 추가 몬스터 11종 (전부 확장 스키마). 목록: `monster_convert/report_new_monsters.txt` 참고.
> - 신규 필드가 없는 구 스키마 엔트리를 참조하는 코드는 `mon.mdef ?? 0`, `mon.race ?? "무형"` 등 안전한 기본값 처리 필요.

### `slaves` 필드 (MVP 전용)

- MVP 스폰 시 즉시 함께 소환. 관련 함수: `spawnMvpSlaves(mvpMon, initDist)` (spawnMonsters 바로 위)
- MVP 생존 중 매 processTurn 틱 15% 확률로 슬레이브 수 부족분 1마리 보충
- 배틀 상한 없음 — 보스 전투는 예외로 전부 소환

| MVP | ID | slaves |
|---|---|---|
| 오크 로드 | 136 | 오크 워리어(31) ×3 |
| 바포메트 | 137 | 바포메트 주니어(100) ×3 |
| 다크 로드 | 178 | 다크 프리스트(177) ×3 |
| 마야 | 197 | 피에르(63) ×2, 앙드레(64) ×2 |
| 월야화 | 199 | 무낙(48) ×2, 본건(49) ×1 |

### 미등록 MVP 목록 (slaves 데이터 추가 대기)

원작 Pre-Renewal 기준 슬레이브가 없거나 불분명한 MVP들. 추후 원작 검토 후 `slaves` 추가 여부 결정.

| MVP ID | 이름 | 위치 | 원작 slaves 여부 |
|---|---|---|---|
| 149 | (타임홀더 계열?) | 알데바란 시계탑 심층 | 미확인 |
| 157 | (루티에 보스?) | 루티에 장난감 공장 | 미확인 |
| 164 | (거북섬 보스?) | 거북섬 | 미확인 |
| 173 | (니플헤임 보스?) | 니플헤임 필드 | 미확인 |
| 195 | 도플갱어 | 게펜 지하 던전 최하층 | 없음 |
| 196 | 에드가 | 페이욘 숲 | 없음 |
| 198 | 프리오니 | 모로크 사막 | 없음 |
| 209, 219, 229, 241, 247, 257, 268, 273, 278, 285 | 고레벨 MVP 다수 | 각지 | 미확인 |
| 293, 299, 306, 316, 320, 329, 359, 376, 383, 385, 395, 399, 434, 479 | 기타 | 각지 | 미확인 |

-----

## db-maps 엔트리

```json
"맵명": {
  "level": "권장 레벨 범위",
  "type": "마을|필드|던전",
  "emoji": "이모지", "desc": "설명",
  "connected": ["연결 맵명 배열"],
  "monsters": [몬스터ID 배열],
  "safe": true|false,
  "hasMvp": 몬스터ID,  // 선택
  "zones": [{"spawnRange":[minLv,maxLv], "monsters":[ID...]}]  // 선택 [2-9]. 미기재 시 getZones()가 monsters를 레벨순 4분할해 자동 생성
}
```

> **[2-9] 구역 시스템**: `zones`는 선택 필드. 현재 전 맵이 자동 생성 방식(`getZones()` + `_zoneCache`)을 사용하며, 특정 맵에 수동 구역을 지정하고 싶을 때만 `zones`를 명시하면 우선 적용됨. 상세 로직은 DEVREF-D.

-----

## db-npcs 엔트리

```json
"NPC명": {
  "map": "위치 맵명", "emoji": "이모지",
  "dialog": "기본 대화 텍스트",
  "race": "우탄족",  // 선택, 언어 장벽 시스템
  "service": "서비스 타입",
  // service별 추가 필드:
  // shop: "sells": ["아이템명 배열"]
  // job_change: "targetClass": "직업명"
  // dungeon_access: "cost": 제니, "targetMap": "맵명"
  // kafra: 추가 필드 없음 (서비스 목록은 KAFRA_WARP 상수로 관리)
  // refine / exchange_gem / exchange_smile / rebirth: 추가 필드 없음
}
```

-----

## KAFRA_WARP 상수 (카프라 워프 서비스)

> 위치: `block-engine-logic` 내 카프라 서비스 함수 섹션 바로 위

```javascript
const KAFRA_WARP = {
  '마을명': [{dest:'목적지명', cost:요금z}, ...],
  ...
};
```

- 17개 마을 등록 (프론테라·이즈루드·게펜·페이욘·알베르타·모로크·알데바란·코모도·움발라·니플헤임·유노·아인브로크·리히타르젠·휘겔·베인스·라헬·루티에)
- 카프라 NPC가 있어도 해당 마을이 KAFRA_WARP에 없으면 워프 버튼 disabled
- 요금은 원작 Pre-Renewal RO 거리 비례 기준 (800z ~ 2,500z)
- 관련 함수: `kafraWarpMenu()` (목적지 목록 모달), `kafraWarpTo(dest, cost)` (이동 실행)
- `kafraWarpTo`는 `tryMove` 우회 방식 (connected 체크 없음) — `questWarp` 동일 패턴
- `savedMap` 변경 없음 (단순 유료 이동 서비스)

-----

## db-items 엔트리

```json
"아이템명": {
  "type": "소모품|무기|갑옷|방패|걸칠것|신발|투구_상단|투구_중단|투구_하단|Accessory|잡템|재료|카드|퀘스트아이템",
  "emoji": "이모지", "desc": "설명",
  "buy": 구매가, "sell": 판매가,
  // 소모품: heal, spHeal, effect
  // 무기: atk, wType, weaponLv, slots
  // 방어구류: def, mdef, slots, reqLv(원작 착용레벨, 엔진 미사용)
  // 스탯 아이템: str, agi, vit, int, dex, luk, hit, flee, crit, maxHp, maxSp, aspd
  // 카드: target(장착부위), prefix, suffix
  // 화살류: atk, element, ammo:true  ← 활 전용 소모품 마커
}
```

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

-----

## DB_SKILLS 엔트리 스키마

```javascript
"스킬명": {
  rank:     0|1|2|3,    // 0=노비스, 1=1차, 2=2차, 3=전승 전용
  job:      "JOB_XXX",
  type:     "액티브"|"패시브"|"버프",
  maxLv:    N,
  spCost:   N 또는 (l)=>...,
  cooldown: ms,
  req:      { "선행스킬명": 요구레벨 },
  emoji:    "이모지", desc: "설명",
  effect:   function(p,s,t,slv){...} 또는 null
}
```

> **세이지 계열 주의**: 네이팜발칸·소울드레인·매직크래셔·마법력증폭 → `JOB_SGE`  
> 간반테인·그라비테이션 필드 → `JOB_PRF` (rank:3)  
> (구버전에 JOB_HWZ 오등록 → 2026-06-08 교정 완료)

-----

## db-job-init 구조

```json
"JOB_XXX": ["SK_XXXX", "SK_XXXX", ...]
```

- 전직 시 이 목록의 스킬이 `p.skills`에 **0레벨**로 등록됨
- 2차 직업은 1차 스킬 미포함 (전직 전 이미 보유)
- 전승 직업은 1차+2차 스킬 전부 명시

-----

## 무기 종류 (wType 전체)

`단검` / `한손검` / `양손검` / `창` / `도끼` / `둔기` / `너클` / `지팡이` / `책` / `활` / `카타르` / `악기` / `채찍` / `맨손`(노비스 전용)

## 직업별 무기 허용 (`JOB_WEAPON_ALLOW`)

```javascript
JOB_NOV/HNOV: ['단검','맨손']
JOB_SWD/KNT:  ['한손검','양손검','창','도끼','둔기']
JOB_CRU:      ['한손검','창','도끼','둔기']
JOB_MG/WIZ:   ['지팡이']
JOB_SGE/PRF:  ['지팡이','책']
JOB_ARC/HNT/SNP: ['활']
JOB_BRD/MIN:  ['악기','활']
JOB_DNC/GYP:  ['채찍','활']
JOB_ACO/PRI/HPR: ['둔기','지팡이']
JOB_MNK/CHP: ['너클','둔기']
JOB_THF:      ['단검','한손검']
JOB_ASN/SIN:  ['카타르','단검']
JOB_ROG/STK:  ['단검','한손검','활']
JOB_MER/BSM/WHS/ALC/CRT: ['도끼','둔기']
```