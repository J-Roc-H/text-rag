# ITEM_COMBO_CANON_PATCH_NOTES.md — P2-A 콤보 정본 데이터 파이프라인

P2-A는 새 기능이 아니라 P0-A와 같은 역할(원본 대조 + 정본 데이터 생성 +
audit)이다. 이번 단계는 콤보 효과를 `calcStats()`나 전투에 **전혀
연결하지 않는다**. 이 문서는 P1 계열 패치노트들의 "구형 함수/호출관계/
정본경로/버그수정/parity/테스트" 틀을 이번 단계의 실제 작업(파이프라인
구축)에 맞게 재구성했다.

## 1. 기존 상태 — 콤보 자체가 미지원이었음

이전(P0-A~SHOP비교)까지 TextRAG에는 세트/콤보 효과를 위한 데이터도
로직도 전혀 없었다. `db-items.json`에는 개별 아이템/카드 효과만
있고, 여러 아이템을 동시 장착했을 때 추가로 발동하는 콤보 보너스는
원본(rAthena) 쪽에만 존재하고 TextRAG 쪽에는 대응하는 어떤 표현도
없었다. 즉 "고칠 구형 함수"가 없다 — 이번 단계가 그 자리에 처음으로
정본 데이터를 만든다.

## 2. 파이프라인 구조(호출관계 대응)

```
source/reference/rathena-pre-re/item_combos.yml   (원본 스냅샷, 불변)
source/reference/rathena-pre-re/item_db_aegis_lookup.json (파생, 278개 항목만)
                    │
                    ▼
tools/canonicalize_combos.py  (생성기, TextRAG 런타임과 완전히 분리)
                    │  - split_statements(): if/else를 원문 그대로 격리
                    │  - parse_statement(): bonus/bonus2 상수를 검증표와 대조
                    │  - resolve_item(): AegisName ↔ TextRAG _aegis 정확일치
                    │  - canonicalize(): entry당 1회 script 분석, variant별
                    │    requiredItems 분리, status 판정
                    ▼
source/data/db-combos.json   (정본 출력, 이번 단계에서 BLOCKS/HTML 미주입)
                    │
                    ▼
build.py: audit_item_combos()  (신규 게이트, 기존 469 WARN과 별도 카운터)
```

`calcStats`/`getActiveLoadout`/장비비교(`getEquipmentComparison`)/상태창
UI/콤보 매처는 이번 단계에서 **한 줄도 수정하지 않았다** — 이 파이프라인은
그 어떤 기존 함수도 호출하지 않고, 반대로 어떤 기존 함수도 이 파이프라인
출력을 아직 읽지 않는다(완전히 단방향, 아직 연결되지 않은 상태).

## 3. 정본 비교 경로 — 대신 "정본 어휘 대조 경로"

P1-C의 "별도 공식 금지, 반드시 calcStats() 두 번 diff" 원칙에 대응하는
이번 단계의 원칙은: **"이름이 비슷하다고 자동 변환하지 않는다"**다.
모든 rAthena bonus 상수는 rAthena 자신의 `doc/item_bonus.txt`(513줄,
공식 문서) 원문과 대조해 개별 승인했다:

- 승인 예: `bStr`~`bLuk,n`(문서: "+n", flat) → TextRAG `stat.{str..luk}`.
  `bAllStats,n`(문서: "STR+n,...,LUK+n") → 6개 stat 필드로 전개(추측이
  아니라 문서에 명시된 전개).
  `bBaseAtk,n`(문서: "Basic attack power + n", flat) → `combat.atk`로
  **승격**(최초엔 조심스럽게 source-needed로 뒀다가, 문서 원문 확인 후
  verified로 변경).
- 거부 예(이름 유사성만으로는 채택하지 않은 것들, 과제 §19가 명시적으로
  예로 든 항목 포함):
  - `bAspdRate`(문서: "+n%") vs TextRAG `aspd`(고정치 스탯) — % 기반과
    flat 기반이 달라 단위 불일치.
  - `bCastrate`(문서: "+n%", 음수 가능) vs TextRAG `castReduction`
    (항상 0~1 fraction, 양수만) — 부호/단위 모두 불일치.
  - `bUseSPrate`(문서: "SP 소비 +n%") vs TextRAG `spCostMul`(배율 기반)
    — 단위 불일치.
  - `bDelayRate`/`bLongAtkDef`/`bNoCastCancel` — TextRAG에 대응 필드
    자체가 없거나 확률/조건 표현이 문서만으로 충분히 검증되지 않음.
  - `bAddEff`/`bAddEffWhenHit`/`bResEff`/`bComaRace`/`bBreakWeaponRate`/
    `bBreakArmorRate`/`bAddMonsterDropItem`/`bAutoSpell`/
    `bAutoSpellWhenHit` — 모두 "n/100(or /10)% 확률" 표기라 변환 공식은
    문서에 있지만, P0-close에서 이미 확립한 "proc/확률 계열은 실값
    대조 전까지 보류" 원칙을 그대로 승계해 source-needed로 유보.
- race enum(`RC_*` → 곤충/동물/드래곤/무형/식물/악마/어류/언데드/인간형/
  천사)과 element enum(`Ele_*` → 화속성/수속성/...)은 TextRAG 자체
  데이터(`db-monsters.json`의 실제 `race` 값, 기존 확인된 `db-element`
  키)에서 그대로 가져왔다 — 새 한글 어휘를 만들지 않았다.

## 4. 항목 식별(악세서리 버그 자리에 대응) — N/A, 대신 AegisName 매칭 이슈

이번 단계에는 장비비교 버그 같은 대상이 없다. 대신 발견한 것은
**TextRAG 자체의 항목 식별 이슈**다: TextRAG 아이템에는 숫자 ID가
없고(2796개 중 163개만 `_aegis` 문자열 필드를 가짐), 6개 AegisName은
서로 다른 TextRAG 키 2개에 동시에 매핑되는 충돌이 있다(예:
`Steel_Arrow` → `['Steel Arrow', '강철의 화살']`). 이 충돌은 자동으로
하나를 고르지 않고 ambiguous로 명시해 보존했다 — 이후 사람이 판단할
문제로 남긴다.

## 5. 상점/후보 표현 대응 — N/A

이번 단계는 UI/구매 경로를 전혀 건드리지 않는다(§25에서 명시적으로
금지). 상점의 장비 후보 표현 문제는 이미 SHOP비교 단계에서 종료됐고,
콤보와는 무관하다.

## 6. gameplay parity

- `source/reference/**`, `tools/canonicalize_combos.py`,
  `source/data/db-combos.json`, `build.py`의 `audit_item_combos()` 추가
  분은 모두 **기존 BLOCKS 주입 대상이 아니다** — `COMBOS_JSON_PATH`는
  상수로만 선언되고 `BLOCKS` dict에는 들어가지 않는다.
- `python3 build.py` 재실행 후 `git status --short -- index.html
  룬미드가츠_v9.19.html` 결과가 빈 diff임을 확인 — 두 빌드 산출물이
  이번 단계 시작 전과 **바이트 단위로 동일**하다.
- 빌드된 HTML 내 JS `<script>` 블록 수/문법(`node --check`)도 이전
  단계(SHOP비교, `74ab0cb`)와 동일하게 유지됨.
- 즉 P2-A 전/후로 `calcStats()`의 실행 결과, 상태창, 장비비교, 상점 UI
  중 **어느 것도 달라지지 않았다** — 이번 단계가 요구하는 "gameplay
  parity"를 만족한다.

## 7. 테스트

- 신규 `tests/item-combo-audit-test.py` — `build.audit_item_combos()`와
  `tools/canonicalize_combos.py`를 직접 import해 실제 함수를 호출하는
  방식(재구현 금지 원칙 준수). 시나리오:
  - A: 단일 Combo → variant 1개, id 형식(`rathena-pre-{entry:04d}-{variant:02d}`) 확인.
  - B: 하나의 Script를 공유하는 다중 Combo 대안 → variant별
    requiredItems는 분리되지만 rawScript/effects는 동일함을 확인
    (entry-vs-variant 병합 금지 요구사항 직접 검증).
  - C: 전체 항목 매핑 성공 → resolved=True, textragKey 채워짐.
  - D: 부분 매핑 실패 → status=source-needed, 실패한 항목만
    resolved=False.
  - E: 순수 지원 스크립트 → verified, effect 개수/rawScript 원문 보존,
    unsupportedEffects 빈 배열.
  - F: 순수 미지원 스크립트(`bAspdRate`) → effects 빈 배열,
    unsupportedEffects 1건(reason 포함), status=unsupported.
  - G: 지원+미지원 혼합(`bStr`+`bAspdRate`) → 1 effect + 1
    unsupportedEffects, status가 verified로 뭉개지지 않고 unsupported
    유지됨을 확인.
  - H: build.py 감사 6개 하위 케이스(중복 id/빈 requiredItems/rawScript
    누락/미지원 canonical 키/reason 누락 unsupportedEffects는 모두
    FAIL, 정상 데이터는 FAIL 0건).
  - I: ammo 포함 + 나머지 전부 verified인 합성 fixture → status가
    runtime-blocked로 승격, isAmmo/statusReasons 세팅 확인.
  - 부가: 실제 entry-14 스타일 if/else 스크립트로 `split_statements`
    직접 테스트(무조건 문장 1개 + if/else 전체가 conditionalRaw 1개로
    보존됨을 확인).
  - 마지막: 실제 `source/data/db-combos.json`에 대해
    `build.audit_item_combos()`를 그대로 실행해 FAIL 0건 확인(합성
    fixture가 아닌 실데이터 최종 검증).
  - 총 34개 체크, 전부 PASS(`ALL TESTS PASS`).
- 기존 회귀 스위트 전체(15개 `tests/*.js` smoke 파일 + 기존
  `tests/item-effect-audit-test.py`)를 이번 단계 완료 후 재실행 —
  전부 PASS, 이번 단계가 기존 어떤 기능도 건드리지 않았음을 재확인.
