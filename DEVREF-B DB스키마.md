# DEVREF-B — DB 스키마

> 로드 조건: **몬스터·맵·NPC·스킬 DB** 추가/수정 작업 시. **아이템은 [[DEVREF-H 아이템DB]]**
> 최종 검증: 2026-09-12 | 대상 코드: 룬미드가츠_v9.16.html

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

### 임시(placeholder) 몬스터 코호트 판별 (2026-08-12)

수기로 급조된 몬스터는 드롭이 `{잡템,카드}` 2줄뿐이고 스탯 블록이 축약됨. 판별: **`atkDelay`·`race`·
`elementLv`·`mdef` 네 필드 유무** (정식 임포트는 다 있음). v9.12 기준 490중 179가 임시. CSV 원작 조인 시
**변종 행 주의** — 같은 몬스터가 레벨/MVP별 여러 행(예: Beelzebub MVP행=풀드롭 vs non-MVP행=공백). `drops>0`+레벨근접으로 행 선택.

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

> **[2-9] 구역 시스템**: `zones`는 선택 필드. 현재 전 맵이 자동 생성 방식(`getZones()` + `_zoneCache`)을 사용하며, 특정 맵에 수동 구역을 지정하고 싶을 때만 `zones`를 명시하면 우선 적용됨. 상세 로직은 DEVREF-G.

> **`monsters` 배열에 고HP(MVP급) 몬스터ID가 섞여 들어간 오염 발견 (2026-09-12, P0-03 조사 중)**: 예)
> `토르 화산`의 `monsters`에 Bio Lab 3층 원작 보스 6종(로드나이트 세이렌·에레메스·마가레타·세실·
> 카트린느·하워드, hp 28만~40만)이, `얼음 동굴`의 `monsters`에 네크로맨서·타락한 대신관 히밤·
> 베르제브브(hp 9.8만~666만)가 일반 스폰 몬스터로 섞여 있다. `hasMvp`만 검증한 P0-03로는 못
> 잡는다 — **일반 스폰 풀도 hp 임계로 이상치 검사 필요** (P1-08 게이트 ② 의미검사 확장 후보).
> 이번 세션 스코프 밖이라 미수정.

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

## 아이템 DB → `DEVREF-H 아이템DB.md`로 이관 (2026-08-25)

`db-items` 엔트리·`weight`/`weightSrc`·무게 패널티 구간·rAthena 조인·드롭명↔아이템명·`dropSlots`·
방어구/악세·화살·화살통·카드 target·slots 기준은 전부 **[[DEVREF-H 아이템DB]]** 가 소유한다.
이 파일(B)이 300줄 예산을 넘겨 분리했다 — 여기엔 다시 쓰지 않는다.

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