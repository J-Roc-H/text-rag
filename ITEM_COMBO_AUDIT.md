# ITEM_COMBO_AUDIT.md — P2-A 콤보 정본 데이터 감사

이 문서는 P2-A(콤보 정본 데이터 감사·정규화) 단계에서 생성한
`source/data/db-combos.json`의 실제 내용을 근거로 작성한다. 이 단계는
콤보 효과를 `calcStats()`/전투에 연결하지 않는다 — P0-A와 동일한 역할
(원본 대조 + 정본 데이터 생성 + audit)만 수행한다.

## 1. 소스

- repo: `https://github.com/rathena/rathena`, mode `pre-re` (Pre-Renewal).
  **commit `e985006171d2eb320ee512a653f4c83aea3d81b6`**,
  path `db/pre-re/item_combos.yml`,
  **blob SHA `f720ec0de4a0cacaf0131c9fad3938aff7ba280a`**. 저장된 스냅샷
  (`source/reference/rathena-pre-re/item_combos.yml`, 28,860 bytes)이 이
  commit의 파일과 바이트 단위로 동일함을 두 가지로 독립 검증함:
  (1) `git hash-object`로 계산한 로컬 파일의 blob SHA가 위 값과 일치,
  (2) 이 commit SHA를 직접 지정한 raw.githubusercontent.com URL을 재조회해
  같은 크기/blob SHA/내용(`diff` 완전 일치)을 재확인. 상세는
  `source/reference/rathena-pre-re/README.md` 참조.
- 항목 ID/타입 조회용 `item_db_aegis_lookup.json`은 `item_db_equip.yml` +
  `item_db_etc.yml` + `item_db_usable.yml`(합계 약 1.67MB)에서 콤보가
  실제로 참조하는 278개 AegisName에 대해서만 `{Id, Name, Type, srcFile}`을
  추출한 29,125 bytes 파생 파일(불필요한 대용량 복제 방지).

## 2. source entry 수 / variant 수

- **원본 top-level entry(Body): 105개**
- **variant(개별 Combo 리스트) 수: 156개** — 한 entry가 여러 대안
  `Combo` 배열을 가질 수 있으므로(같은 `Script`를 공유하는 서로 다른
  `requiredItems` 조합) entry 수보다 variant 수가 많다.
- 생성기(`tools/canonicalize_combos.py`)는 entry당 `Script`를 1회만
  분석하고, 그 결과(unconditional/conditional 분리, effects/unsupported)를
  같은 entry의 모든 variant가 공유하며, `requiredItems`만 variant별로
  분리해 기록한다.

## 3. TextRAG item mapping 성공/실패 수

- 콤보가 참조하는 **고유 AegisName 278개** 중:
  - **9개**가 TextRAG `db-items.json`의 `_aegis` 필드와 정확히 1:1로
    일치(고유 resolve): `Bloody_Iron_Ball`, `Crystal_Arrow`, `Fire_Arrow`,
    `G_Strings`, `Memorize_Book`, `Rider_Insignia_`, `Ring_Of_Rogue`,
    `Stone_Arrow`, `Wing_Of_Eagle`.
  - **2개**는 `_aegis`가 서로 다른 TextRAG 아이템 키 2개에 동시에 붙어
    있어 ambiguous로 분류(자동 선택 금지): `Arrow_Of_Wind` →
    `['Arrow of Wind', '바람의 화살']`, `Steel_Arrow` →
    `['Steel Arrow', '강철의 화살']`.
  - **267개**는 현재 TextRAG 데이터에 `_aegis` 일치 항목이 전혀 없어
    미해결(unresolved)로 남음.
- 조인 방식은 rAthena AegisName ↔ TextRAG `_aegis` 필드의 **정확 문자열
  일치만** 사용했다(표시명/유사명 매칭 금지, §4-6 참조). TextRAG
  아이템에는 숫자 ID 필드가 존재하지 않아(163개 영문 스텁 아이템만
  `_aegis`를 가짐, 나머지 ~2633개 한글 아이템은 `_aegis` 없음), 과제가
  1순위로 요구한 "숫자 ID 매칭"은 이 프로젝트 스키마에는 원천적으로
  적용할 수 없음 — 이는 추측이 아니라 실제 스키마 조사 결과다.
- 결과적으로 156개 variant 중 **156개 전부가 `source-needed`**다
  (항목 미해결이 상태 판정에서 최우선이므로). 이는 TextRAG가 아직
  한글화 진행 중인 프로젝트 상태를 그대로 반영한 것이며, 파이프라인
  버그가 아니다.

## 4. script pattern 상위 분포

`unsupportedEffects[].constant` 빈도(내림차순, 상위 30개 — 실제
db-combos.json 전수 집계):

| constant | 횟수 |
|---|---|
| bSkillAtk | 34 |
| bMatkRate | 24 |
| bonus(fallback) | 18 |
| bSubRace | 15 |
| bAddClass | 13 |
| bAutoSpell | 10 |
| bonus2(fallback) | 9 |
| bAspdRate | 8 |
| bCastrate | 8 |
| bHealPower | 8 |
| bLongAtkRate | 6 |
| bResEff | 5 |
| bUseSPrate | 5 |
| bSkillHeal2 | 5 |
| bAutoSpellWhenHit | 4 |
| bAddEff | 4 |
| autobonus | 4 |
| autobonus2 | 3 |
| bAddSize | 3 |
| bAddEffWhenHit | 3 |
| bSPDrainValue | 3 |
| bCastRate | 2 |
| bSpeedRate | 2 |
| bLongAtkDef | 2 |
| bDelayRate | 2 |
| bPerfectHitAddRate | 2 |
| bBreakArmorRate | 1 |
| bBreakWeaponRate | 1 |
| bAtk | 1 |
| bShortWeaponDamageReturn | 1 |

**알려진 라벨링 한계(정직하게 공개)**: `bonus`/`bonus2` 18건/9건은 실제
rAthena 상수 이름이 아니라, 해당 `bonus`/`bonus2` 문장이 엄격한
"상수,정수리터럴" 정규식에 매치되지 않은 경우(예: 값이 함수 호출식이거나
`bonus2`의 내부 상수가 인식 테이블 밖인 경우) 생성기가 fallback으로
문장 종류 자체를 `constant`에 넣은 것이다. `bonus3`/`bonus4`/`bonus5`는
별도 정규식으로 실제 상수명(예: `bAutoSpellWhenHit`)을 추출하도록
고쳤지만, `bonus`/`bonus2`의 이 fallback 케이스는 이번 단계에서 고치지
않고 그대로 남겼다 — 콤보 효과를 아직 실행하지 않으므로 정확한 라벨보다
"미지원으로 안전하게 분류됨"이 더 중요했고, 정밀한 상수 추출은 P2-B
이후 실제로 그 상수를 지원할 때 필요해지는 작업이라고 판단했다.

효과가 성공적으로 변환된 `effects[].{type,key}` 분포(내림차순):

| type.key | 횟수 |
|---|---|
| combat.flee | 21 |
| stat.int | 17 |
| combat.maxHpPct | 17 |
| combat.spRegenPct | 16 |
| stat.dex | 14 |
| combat.raceDmgReduce | 14 |
| stat.str | 14 |
| stat.agi | 13 |
| combat.maxHp | 12 |
| combat.def | 11 |
| combat.maxSpPct | 8 |
| stat.vit | 8 |
| combat.mdef | 7 |
| combat.elemReduce | 7 |
| combat.hpRegenPct | 6 |
| stat.luk | 6 |
| combat.maxSp | 5 |
| combat.atk | 4 |
| combat.raceAtk | 3 |
| combat.crit | 2 |
| combat.pd | 2 |
| event.soulgain | 1 |
| combat.hit | 1 |

조건부(`if`/`else`) 블록: 총 18개 블록이 17개 콤보 variant에 걸쳐
`conditionalRaw`로 원문 그대로 보존됨(실행되지 않음).

## 5. canonical 완전변환 수

- **완전변환(fully-clean)**: 43개 variant — `effects`가 1개 이상이고
  `unsupportedEffects`/`conditionalRaw`가 전혀 없음.

## 6. partial 변환 수

- **부분변환(mixed)**: 64개 variant — `effects`가 1개 이상 있으면서
  동시에 `unsupportedEffects` 또는 `conditionalRaw`도 있음. 이런
  variant는 `status`를 절대 `verified`로 뭉개지 않고 `unsupported`
  (또는 항목 미해결이면 `source-needed`)로 남긴다.

## 7. unsupported 수

- **effects가 전혀 없는 variant(zero-effect)**: 49개.
- `with_effects`(43+64=107) + `zero_effect`(49) = 156 = 전체 variant 수
  (누락/중복 없음, 내부 정합성 확인됨).
- `unsupportedEffects`를 1개 이상 가진 variant: 110개.

## 8. ammo/runtime-blocked 수

- `requiredItems` 중 하나라도 `isAmmo: true`인 콤보: **5개**.
- 현재 실제 데이터셋에서는 이 5개 모두 화살(bow ammo) 자체가 아직
  `_aegis` 미해결 상태라 항목 미해결 우선 규칙에 따라 여전히
  `source-needed`로 남아 있다 — `runtime-blocked`로의 승격은 "모든
  항목이 resolve되고 효과가 전부 verified일 때"만 발생하도록
  `canonicalize()`에 구현돼 있으며, 이 분기는 `tests/item-combo-audit-test.py`
  시나리오 I의 합성 fixture로 직접 단위 검증했다(실데이터에서는 아직
  트리거되지 않음 — 이 또한 정직하게 공개).

## 9. build.py combo audit 결과

- `audit_item_combos()` (기존 469 WARN 아이템-이펙트 감사와 완전히
  분리된 별도 게이트, 동일 카운터로 절대 합치지 않음):
  - **FAIL: 0건**
  - **COMBO WARN: 373건** (id/필수항목/rawScript 존재 등 필수 조건은
    전부 충족 — WARN은 대부분 "항목 미해결"/"source-needed에
    statusReasons 없음" 같은 정보성 경고)
- 콘솔 출력은 `COMBO WARN - item combo audit: 373 issue(s)`로,
  기존 `WARN - item effect audit: 469 issue(s)`와 라벨/카운터 모두
  분리되어 있다.

## 10. P2-B 착수 조건

P2-B(매처/엔진 실제 연결)를 시작하기 전에 필요한 것:

1. **TextRAG 아이템 한글화 진행** — 현재 278개 중 269개(267 unresolved
   + 2 ambiguous)가 매핑되지 않아 실질적으로 콤보 전체가 `source-needed`
   상태다. 한글화가 진행되어 `_aegis` 매칭 수가 늘어나야 `verified`
   콤보가 실제로 생긴다.
2. **ambiguous 2건(`Arrow_Of_Wind`, `Steel_Arrow`) 해소** — 어느
   TextRAG 키가 진짜 대응 아이템인지 수작업 확인 필요(추측 금지).
3. **`bonus`/`bonus2` fallback 라벨링 정밀화**(§4의 27건) — 지원 대상으로
   승격하려는 상수가 이 fallback 버킷에 있다면 먼저 실제 상수명을
   추출하도록 정규식을 보강해야 함.
4. **활성 로드아웃 매칭기(`getActiveLoadout` 스타일) 신규 설계** — 이번
   단계는 `requiredItems`만 정의했고 "실제로 장착된 조합과 어떻게
   대조하는가"는 전혀 구현하지 않았음.
5. **ammo 콤보의 runtime 처리 정책 결정** — `runtimeBlockedReason`
   필드는 준비돼 있으나 실제로 무엇을 차단할지(예: 활 장착 슬롯 판정)는
   설계되지 않음.
