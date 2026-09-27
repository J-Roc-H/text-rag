# COMBO_ITEM_IDENTITY_AUDIT.md — P2-A.1 콤보 참조 아이템 identity 회수

P2-A(콤보 정본 데이터 감사)가 만든 `source/data/db-combos.json`은 완료 시점에
156개 variant 전부가 `source-needed`였다 — 278개 필수 아이템 중 9개만
TextRAG `_aegis` exact-match로 풀렸기 때문이다. 이 문서는 그 뒤를 잇는
**P2-A.1(아이템 identity 회수)**의 결과를 기록한다. 이번 단계도 콤보 효과를
`calcStats()`/전투에 연결하지 않는다 — identity(어떤 TextRAG 아이템이 어떤
rAthena 아이템인가)만 다룬다.

## 1. 대상 278개

`source/data/combo-item-identity.json`(신규)이 `item_combos.yml`이 실제로
참조하는 고유 AegisName 278개 전부에 대해 정확히 한 행씩 존재한다(`totalItems:
278`, `build.audit_combo_item_identity()`가 "identity map이 db-combos.json의
참조 AegisName 집합을 다 못 덮으면 FAIL"로 이를 강제한다).

## 2. evidence 정책

자동 `verified`는 세 가지 경우만 허용했다(그 외는 전부 candidate만 기록):

- **Case A(9건)** — 기존 TextRAG `_aegis` 필드와 정확히 1:1 일치(P2-A에서 이미
  확정한 9개, 이번 단계에서 재확인만 함).
- **Case B-card(82건)** — rAthena `mob_db.yml`의 `Drops`/`MvpDrops` 목록이
  "이 몬스터가 이 카드를 드롭한다"를 AegisName으로 **직접 명시**(이름 유사도
  추측이 아니라 원작 자체 데이터) + 이 프로젝트가 이미 검증한
  `MONSTER_AI_AUDIT.md`(commit `e985006` 기준)의 원작 몬스터 ID → TextRAG
  한글명 + TextRAG에 그 이름의 "<한글명> 카드"가 정확히 존재. 세 조건이 모두
  성립할 때만 verified — 하나라도 어긋나면(원작 ID 감사 미완료, 여러 몬스터가
  서로 다른 한글명으로 감사됨, 정확한 카드 키가 없음) `ambiguous`/
  `unresolved-existing`/`missing`으로 남긴다.
- **Case C(2건)** — 영문 `_krPending` 스텁의 `_aegis`가 가리키는 정체와 별도
  한글 정본 record가 동일 아이템임을 다중 필드(가격/무게/원소 화살 계열 전체의
  일관된 밸런스 패턴)로 수작업 확정(Arrow_Of_Wind→바람의 화살,
  Steel_Arrow→강철의 화살, §8 참조). 일반화된 자동 규칙이 아니라 이 2건만의
  개별 조사다.

그 외(구조 신호만 겹치는 경우, 이름이 비슷해 보이는 경우)는 **candidate로만**
기록하고 `status`를 `verified`로 올리지 않는다 — "구조 일치는 candidate
근거이지 canonical proof가 아니다"라는 원칙을 그대로 지켰다(§9).

## 3. 종류별 분포

| rAthena Type | verified | unresolved-existing | missing | 합계 |
|---|---|---|---|---|
| Armor(방어구+악세서리+방패 등) | 6 | 140 | 8 | 154 |
| Card(카드) | 82 | 2 | 4 | 88 |
| Weapon(무기) | 0 | 30 | 1 | 31 |
| Ammo(탄약) | 5 | 0 | 0 | 5 |
| **합계** | **93** | **172** | **13** | **278** |

## 4. verified — 93건

evidence case별: Case A 9건, Case B-card 82건, Case C 2건. 이 93건은
`tools/canonicalize_combos.py`가 1순위로 참조하도록 연결했다(§16, §7 참조).

## 5. ambiguous — 0건(이번 단계 결과)

기존 P2-A의 ambiguous 2건(Arrow_Of_Wind, Steel_Arrow)은 Case C로 확정 이관됐다.
Case B-card 경로에서도 "같은 카드가 서로 다른 몬스터에서 드롭되고 그 몬스터들의
감사된 한글명이 서로 다른" 진짜 ambiguous 케이스는 실데이터에서 0건이었다
(37개 카드가 2개 이상의 원작 몬스터 ID에서 드롭되지만, 전부 동일 종의 팔레트
변형이라 감사된 한글명이 같거나, 아직 감사되지 않은 ID라 애초에 이름이
안 나왔다 — `resolve_cards_case_b`의 `ambiguous-monster-name` 분기는 테스트
시나리오 C로 직접 검증했다).

## 6. unresolved-existing — 172건

TextRAG에 대응 후보가 있을 수 있지만(구조 신호 최소 3개 이상 일치, 카드는
제외 — §9 참조) 증거 기준(Case A/B/C)을 충족하지 못해 자동 확정하지 않은
항목. 평균 3.7개 candidate/행. **주목할 발견**: 이 중 100건(무기 30건 포함
대부분)이 상위 candidate 하나에서 **4개 이상의 구조 신호**(buy/weight/atk 또는
def/slots/weaponLv)가 동시에 일치하며, 대부분 그 candidate의 한글 키가
영문명의 직역/음역과 정확히 일치한다(예: `Ancient_Magic`→"고대의마법"[5/5],
`Burning_Bow`→"불타는활"[5/5], `Clip`→"클립"[3/3], `Angel's_Protection`
(Angelic Protection)→"천사의가호"[4/4]). 이는 TextRAG 한글 아이템 카탈로그의
상당 부분이 이미 이 rAthena 데이터의 직역 포트라는 강한 정황이지만, 이름
유사도 + 구조 일치만으로는 이번 단계 기준(Case A/B/C)을 충족하지 못하므로
**candidate로만 기록**했다 — 사람이 빠르게 한 번 더 검토해 승격할 만한
고신뢰 후보군으로 문서에 남긴다(§10 P2-B 진입 판정 참고).

## 7. missing — 13건

구조 신호로도 candidate가 0건인 항목(무기 1, 방어구 8, 카드 4). 방어구 8건 중
7건(Krieger_* WoE 코스튬 세트, Rosary, Spiritual_Ring_C, Ulle_Cap_I,
Valkyrja's_Shield_C)은 rAthena pre-re yml 자체에 `Weight`/`Defense`가 아예
없는 이벤트/코스튬성 아이템이라 구조 비교 근거가 거의 없다(정직하게 "TextRAG에
아직 대응 레코드가 없을 가능성"으로만 기록, "확실히 없다"라고 과잉 단정하지
않았다). 카드 4건(`The_Paper_Card`, `Raggler_Card`, `Fur_Seal_Card`,
`B_Harword_Card`)은 각각의 원작 드롭 몬스터 ID가 아직 `MONSTER_AI_AUDIT.md`
감사표에 등재되지 않아 Case B 체인이 애초에 시작되지 못한 경우다 — **몬스터
identity 감사가 이 ID들까지 아직 안 갔다는 뜻이며, 이번 아이템 identity
작업의 범위 밖**이다(몬스터 감사가 진행되면 자동으로 Case B가 성립할 후보).

## 8. 영문 `_krPending` ↔ 한글 정본 중복 — 2건 확정, 조사는 계속 필요

Arrow_Of_Wind/Steel_Arrow 2건을 Case C로 확정했다(§2 참조). 추가로 발견한
중요한 사실: `db-monsters.json`의 오크 아처(ID 130) 드롭 테이블이 지금도
**영문 스텁 키**(`"Steel Arrow"`, `"Arrow of Wind"`, 둘 다 효과 데이터가 없는
placeholder)를 직접 참조하고 있다 — 즉 현재 게임에서 오크 아처가 떨어뜨리는
그 아이템은 완성된 "강철의 화살"/"바람의 화살"이 아니라 빈 껍데기다. 이는
실제 게임플레이 버그이지만, **드롭 테이블 수정은 이번 단계 범위 밖**이므로
고치지 않았다(§24) — 별도 backlog로 남긴다.

## 9. combo status 변화

| | 이전(P2-A, identity map 연결 전) | 이후(P2-A.1, identity map 연결 후) |
|---|---|---|
| verified | 0 | 13 |
| unsupported | 0 | 15 |
| source-needed | 156 | 128 |
| runtime-blocked | 0 | 0(실데이터에서는 아직 트리거 안 됨, 테스트 시나리오 I로 별도 검증) |

13개 variant가 실제로 "identity 전부 resolved + 효과 전부 지원 + 조건부 없음"
조건을 만족해 `verified`로 승격했다(예: `rathena-pre-0070-01`
Poring_Card+Mastering_Card → Flee+18, `rathena-pre-0041-02`
Munak_Card+Bon_Gun_Card+Hyegun_Card → 전 스탯 +1). identity가 resolved됐지만
효과 중 일부/전부가 아직 unsupported라 `unsupported`로 남은 것이 15개다 — **identity
회수와 effect 지원 여부를 섞지 않는다**(§18)는 원칙대로, identity가 풀렸다고
효과 지원 상태까지 자동으로 올리지 않았다.

## 10. P2-B 진입 판정

- **엔진 착수는 아직 이르다.** 156개 variant 중 실제로 `verified`(=매처가
  발동시켜도 되는) 상태는 **13개(8.3%)** 뿐이다.
- identity 회수만 봤을 때는 93/278(33.5%)까지 올라갔지만, combo 단위로 보면
  여전히 128개(82%)가 `source-needed`다 — 카드 콤보(§4의 Case B-card 82건
  대부분이 여기 기여)는 크게 개선됐지만, **방어구/무기 콤보는 identity 회수가
  6/154, 0/31로 거의 진전이 없다**(§3 표 참조).
- §6에서 발견한 100건의 고신뢰 candidate(무기 다수 포함)를 사람이 빠르게
  검토해 verified로 승격하면, 방어구/무기 콤보의 identity 회수율이 크게
  오를 잠재력이 있다 — 이것이 **다음으로 가장 비용 대비 효과가 큰 작업**이다.
- P2-B(매처/엔진) 착수 전 남은 선행 조건:
  1. §6의 고신뢰 candidate 사람 검토·승격(가장 큰 레버리지).
  2. 카드 4건(§7)의 원작 몬스터 ID를 `MONSTER_AI_AUDIT.md`에 감사 추가.
  3. `bonus`/`bonus2` fallback 라벨링 27건(P2-A 감사에서 이미 지적, effect
     지원 확대와 관련 — identity와 무관하지만 verified combo 수를 더 올리려면
     같이 필요).
  4. §8의 드롭 테이블 버그(오크 아처 → 영문 스텁 화살)는 identity와
     무관하지만, 콤보 매처가 "실제 인벤토리에 든 아이템"을 볼 때 이 버그가
     혼란을 만들 수 있어 P2-B 전에 별도로 고치는 편이 안전하다.
