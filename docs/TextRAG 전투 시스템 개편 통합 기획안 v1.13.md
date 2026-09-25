# TextRAG 전투 시스템 개편 통합 기획안 v1.13

- 기준 저장소: `J-Roc-H/text-rag`, `main` 기준 커밋 `5451ab1`
- 갱신일: 2026-09-25
- 변경 요약: 원작 출처 조사를 종결했다. 행동 대조 469종, ID-only 5종, 후보군·배제 사유까지 조사한 ID 미연결 16종으로 490행을 닫았다. 이어 현재 작업 트리를 구현 감사해 전투 기록·수동 override는 구현됨, 원작 AI/세계 상태/스킬 executor는 미구현임을 확정했다. 이그니젬 세니아(검사) 데이터 본체=세이렌 1634 충돌은 명칭 정정 전 배선 대상에서 제외한다.
- 이전 기준: 대화에서 확정된 v1.0 핵심안. v1.0 원문 파일은 저장소에 없어 원문 문장 대조는 불가했다. 이 판은 대화의 확정 원칙을 유지하고, `MONSTER_AI_AUDIT.md`의 확인 사실로 범위와 구현 순서를 구체화한다.

## 목적과 핵심 흐름

원작 몬스터 행동
→ 개별 전투 판세 변화
→ 전투 사건
→ 자동 대응 / 수동 개입
→ 전투 기록
→ 구역 성과 평가
→ 적응형 사냥터 이동

전투는 플레이어가 명령을 계속 내리는 방식이 아니라 자동전투가 기본이다. 수동 입력은 별도의 추가 타격을 발생시키지 않고, 다음 자동 판단 한 번을 대체한다. 전투 계산은 온라인과 Headless가 같은 `processTurn`/사냥 코드 경로를 사용한다.

## 확정 원칙

1. 자동전투가 기본이다.
2. 수동 입력은 추가 공격이 아니라 다음 자동 판단을 덮어쓴다.
3. 모바일 조작은 탭=사용, 길게 누르기=편집이다.
4. 원시 로그 / 사건 로그 / 전투 요약을 분리한다.
5. 전투 기록 객체를 온라인·Headless·성과 평가가 공유하는 데이터로 둔다.
6. 원작 행동 플래그를 DB에 넣는 것만으로 복원 완료라 판정하지 않는다.
7. 죽은 행동을 제거하기 전, 최소 세계 상태 추가가치(행동 연결에 필요한 입력 상태)를 검토한다.
8. 온라인/Headless의 별도 전투 로직을 두지 않는다.
9. 몬스터별 특수 JS 대신 데이터와 공통 AI evaluator로 처리한다.
10. 적응형 구역 이동은 실제 전투 표본이 쌓인 뒤에만 연다.

## 조사로 확인한 현재 상태

- 몬스터 DB 490행 전부 대장에 열거했다. pinned pre-re 자료 또는 행별 보조출처까지 행동 대조한 행은 469개다. 5개는 canonical ID 후보만 확인했고, 16개는 후보군·배제 사유까지 조사했으나 ID를 확정하지 못했다. 행동 자료 미대조 21개를 비선공/행동 없음으로 처리하지 않으며, 전수 복원 완료로 표시하지 않는다.
- pinned rAthena pre-re `mob_db.yml`, `mob_skill_db.txt`, mode reference는 재현 가능한 기계 판독 기준이다. 공식 한국 Aegis 원본은 아니며, Renewal 값을 정본으로 승격하지 않았다.
- 교차 확인 사례: 포링·포포링·드롭프스의 `Ai 02`와 loot 상태 기술은 비선공/먹자와 맞는다. 오크 워리어 등은 `Ai 04`, 오크 레이디/하이 오크 등은 `Ai 21`, 오크 아처는 `Ai 09`여서 “오크 공통 선공/Assist”로 일반화할 근거가 없다.
- 현 DB 490종에 원작 AI/Mode/몬스터 스킬 필드는 없고 `mSkills` 정의도 0개다. 전투 중인 몬스터는 현재 선공 여부와 관계없이 공격한다.
- `huntStyle=aggressive`의 20%/틱 무작위 추가 몬스터는 원작 Assist가 아니다. MVP slave 15% 재소환도 별도 단순 규칙이다.
- 스킬은 현재 속성/HP/종족 기반 가상 처리이며 원작 `mob_skill_db` 데이터 배선이 아니다. 교체 전 스킬 사용에 필요한 상태/전투 효과를 확인한다.
- 처치 드롭은 즉시 인벤토리에 들어가고 `groundDrops`, 인접 몬스터, 영속 idle 상태는 없다. 이를 넣으면 먹자/Assist/Idle을 공통 규칙으로 연결할 수 있다. 새 확인 사례인 페코페코 알의 무반격·고정·idle 변태는 `immobile`·`cannotCounterattack`·변태 전환을 데이터로 표현해야 함을 보여 준다.
- 온라인/Headless는 공통 전투 경로를 쓴다. 현재 seeded RNG의 Headless 반복 재현 게이트는 전투 기록 JSON까지 비교하지만, 온라인 실시간 실행과 Headless 비교를 직접 자동화한 게이트는 아니다.
- 현재 작업 트리는 `combatRecords`/raw event/incidents/summary를 공용 경로에 추가했고, 자동사냥 중 skill/item 입력을 다음 플레이어 행동 한 번으로 대체한다. 핫바는 탭=사용, 550ms 길게 누르기=편집으로 배선했다. 모바일 실제 브라우저·접근성 E2E와 진행 중 encounter 재시작 복구는 미검증이다.

세부 행별 대조, 미결 ID, 출처 충돌과 신뢰도는 `MONSTER_AI_AUDIT.md`가 기준이다.

## 전투 데이터 모델

각 전투 encounter에는 안정적인 식별자, 시작 구역/틱, 원시 이벤트, 분류된 사건, 집계 요약을 둔다.

- **원시 로그**: 시간/틱, actor, target, action, 결과, 수치 등 기계 판독 이벤트. 표시 문구와 분리한다.
- **사건 로그**: 전투 시작/종료, 처치, 사망, 합류, 아이템 획득, 상태 전환, 수동 개입 등 플레이어에게 의미 있는 전환.
- **전투 요약**: 처치, 피해 입힘/받음, EXP/JEXP, 제니, 아이템, 생존 시간/틱, 구역 표본 정보를 원시 이벤트에서 집계한다.

처음에는 최근 기록 개수와 원시 이벤트 개수를 제한한다. 기존 세이브에는 빈 기록 배열을 정규화해 추가하며, 마이그레이션은 멱등이어야 한다. `runHeadlessTicks`와 온라인 `processTurn` 모두 같은 기록 함수에 이벤트를 보낸다.

## 단계별 구현 결정

| 단계 | 작업 | 판정 | 근거 / 완료 조건 |
|---:|---|---|---|
| 1 | 전투 기록/사건 기반 | 구현됨; 검증 보강 | 공용 실행 경로에 event/summary와 세이브 정규화가 들어갔다. 기록 상한·round-trip·Headless 결정성은 코드 gate가 있고, 진행 중 encounter resume 정책과 브라우저 E2E를 보강한다. |
| 2 | 모바일 수동개입 | 구현됨; 검증 보강 | skill/item override는 다음 플레이어 행동 한 번을 소비하고, pointer 탭/길게 누르기가 배선됐다. mobile click synthesis·접근성·실기기 E2E를 남긴다. |
| 3 | 공통 몬스터 AI 프레임워크 | 즉시 착수 | AI Type/Mode와 개별 행동을 **별도 데이터**로 읽고, `unknown`을 보존하는 evaluator shell을 먼저 만든다. 21개 미대조 행과 C 충돌 행을 기본 행동으로 추정하지 않는다. |
| 4 | 최소 세계 상태: 인접 몬스터, `groundDrops`, idle state | 기반 필요 | Assist/looter/idle/소환의 입력이다. encounter 전용 전투 배열과 지도상 entity lifecycle의 경계를 만들며, 기존 즉시 인벤·랜덤 합류 규칙을 원작 행동으로 이름 바꾸지 않는다. |
| 5 | 검증된 원작 행동 배선 | 기반 필요 | 행동 근거 469종 중에도 수치·variant 충돌 C 행, ID-only 5행, 미연결 16행이 있다. 이름과 데이터 본체가 충돌하는 행은 명칭 정정/epoch 확정 전 배선하지 않는다. `Ai` 누락 행은 unknown을 보존하고 확인된 행동만 배선한다. |
| 6 | 자동 AI 개선 | 기반 필요 | 행동 사건/피해 기록과 상태 입력이 먼저 있어야 균형을 비교할 수 있다. |
| 7 | 적응형 구역 이동 | 보류 | 실제 구역별 전투 표본과 충분한 표본 수/성과 기준이 쌓이기 전 이동 정책을 만들지 않는다. |

1·2단계의 공용 전투기록 및 한 행동 override 기반은 현재 작업 트리에 이미 있다. 이번 감사 뒤의 **다음 코드 패치 범위**는 3단계의 데이터 분리·AI evaluator shell과 4단계 최소 세계 상태의 저장/결정론 경계다. Assist/Looter/원작 skill을 그 자체로 켜거나, 21개 미대조 행·충돌 C 행을 임의 배선하지 않는다.

## 구현 판정표

| 행동/기능 | 현재 DB | 엔진/실행 판정 | 부족한 세계 상태 | 비용 | 판정 |
|---|---|---|---|---|---|
| Aggressive / 비선공 | 없음 | 모든 전투 몬스터가 공격; 진입 전 선공 판별 없음 | 지도상 접근 범위, 몬스터 idle/target | 높음 | 기반 필요 |
| Assist | 없음 | 공격/피격자 주변 지원 관계 없음. aggressive spawn은 무작위 합류라 오동작 대체 | 인접 몬스터, 도움 호출 사건, 위협 대상 | 높음 | 기반 필요 |
| Looter | 없음 | 아이템을 즉시 인벤 지급 | `groundDrops`, drop 소유권/수명 | 중간 | 기반 필요 |
| Target Change | 없음 | 단일 플레이어를 상대로만 전투 | 여러 actor/위협 표, target ID | 높음 | 보류 |
| Cast Sensor | 없음 | 플레이어 cast 시작/중단 가시 상태 없음 | cast event/범위, 몬스터 AI state | 중간 | 기반 필요 |
| Detector | 없음 | 숨기/은신 여부와 종족/보스 탐지 상호작용 없음 | 은신 상태 및 탐지 범위 판정 | 중간 | 기반 필요 |
| Idle / 상태별 기술 | 없음 | 월드 idle state가 없음; 전투 로그/UI 문구는 일부 존재. 페코페코 알의 idle 변태도 현행 엔진에서는 죽은 행동 | 월드 개체 state/timer, 변태 전환 | 중간 | 기반 필요 |
| Monster Skill | `mSkills` 0개 | DB 분기 dead; 현재 가상 속성/HP/종족 스킬 | 원작 skill condition/state 데이터와 시전자 상태 | 높음 | 검증 자료 이후 기반 필요 |
| 주변 개체 | 없음 | `huntStyle=aggressive` 임의 20% 합류, MVP slave 임의 15% 보충 | 인접 actor, 소환 주체/수 제한/수명 | 높음 | 기반 필요 |
| 바닥 전리품 | 없음 | 자동 인벤 지급 | `groundDrops`, 줍기 시간/충돌 처리 | 중간 | 기반 필요 |
| 온라인/Headless | 해당 없음 | `processTurn` 공용; Headless seeded 2회 record JSON까지 비교 | online vs headless 실행 비교 gate 보완 | 낮음~중간 | 즉시 검증 보강 |
| 전투 기록/사건 | player save에 `combatRecords` | 공용 encounter record와 raw/incident/summary 구현 | 진행 중 resume, 성과 consumer | 낮음 | 구현됨; 검증 보강 |
| 모바일 탭/길게 누름 | 핫바와 분리 | skill/item override, 탭=사용, 550ms 길게 누름=편집 구현 | 모바일/접근성 E2E | 중간 | 구현됨; 검증 보강 |
| 적응형 구역 이동 | encounter 표본 생성 | 이동 가능하나 표본 소비 policy 없음 | 표본 수/성과/구역 기록 | 높음 | 보류 |

## 폐기한 대안과 이유

- **전 몬스터를 공격적으로 취급**: 실제 DB에 Ai 01 passive와 Ai 02 passive-looter가 확인됐다. 현행 전원 공격은 유지할 정본이 아니다.
- **Aggressive bit 하나로 `Ai 04`를 선공 처리**: mode reference가 AI type 04를 Angry 상태형으로 분리한다. 선공 시작 규칙을 확정할 자료가 부족하다.
- **오크 종족 단일 행동/Assist 하드코딩**: 확인된 Orc 계열 안에서도 AI 04/09/21로 갈린다.
- **각 몬스터별 JS 분기**: 자료 누락을 코드 예외로 고정하고 검증/유지 비용을 키운다. 정규화된 행동 데이터 + 공통 evaluator로 처리한다.
- **20% 합류 규칙을 원작 Assist로 간주**: 현재 구현은 랜덤 map pool 추가이고 주변 지원 AI가 아니다.
- **기존 랜덤 합류·MVP 재소환을 그대로 원작 행동 데이터로 승격**: 둘은 실제로 실행되지만 거리·도움 대상·skill 조건·소환 수명을 잃은 현행 규칙이다. 기록 사건으로 보존해 비교한 뒤 공통 join service로 교체한다.
- **전리품을 즉시 자동 획득하면서 Looter만 플래그로 표기**: 기능 없는 플래그가 된다. groundDrops 기반이 갖춰진 뒤 배선한다.
- **`Ai` 필드가 비어 있는 페코페코 알을 임의 passive AI로 채우기**: R2의 idle 변태와 한국 DB의 무반격·고정형은 확인됐지만 AI Type은 고정 R1에 없다. schema의 `unknown`과 개별 행동 필드를 유지한다.
- **타임홀더·스콜피온 킹의 현행/legacy 보조 스킬을 historical 배선값으로 사용**: ID는 확인됐으나 pinned pre-re 레코드가 없고 수치가 충돌한다. ID-only로 보류한다.
- **표시명 이그니젬 세니아를 근거로 세이렌 1634 행동을 즉시 배선**: TextRAG 데이터 본체는 1634에 완전 일치하지만 원작 이름은 충돌한다. 정체성 오류를 행동 구현으로 굳히지 않는다.
- **`mSkills` 필드만 채워 원작 Monster Skill 복원으로 판정**: 현재 선택 분기는 데이터가 없어 죽어 있으며, 원작 기술에는 상태·조건·시전·대상·소환 효과가 필요하다.
- **전투 종료 표본 없이 적응형 이동**: 편향된 짧은 세션으로 사냥터를 오가게 할 위험이 있다.

## 품질 게이트와 계측

1. 같은 시작 상태/seed로 Headless를 두 번 실행해 record JSON과 요약까지 같은지 검사한다.
2. seeded 조건으로 기존 전투 계산 결과(HP/SP/EXP/처치/드롭)가 기록 기능 추가 전과 같음을 비교한다.
3. override skill/item 각각 자동 행동 1회 대체, 몬스터 응답 순서, 실패 입력 처리, status stun/silence와 자원 부족을 확인한다.
4. 핫바 pointer tap은 사용, long press는 편집 1회, pointer cancel은 중복발동 없음. keyboard 단축키 회귀 확인.
5. 이전 save와 새 save의 `loadPlayerData` 왕복 멱등성, 기록 상한/보존 확인.
6. 한 전투에서 피해 입힘/받음, 처치/보상/드롭, 구역, 사용 입력을 원시 이벤트와 사건/요약에서 대조한다.

이후 적응형 이동에 필요한 계측: 구역별 encounter 수, 틱/생존시간, 처치율, 피해 비율, 물약/스킬 사용, EXP·제니·드롭 산출, 표본 신뢰 한계와 무효 전투 제외 사유.

## 다음 구현 순서

1. 기존 전투 기록/수동 override의 결정론·세이브·Headless gate를 코드로 실행해 현재 작업 트리 기준을 고정한다. browser E2E가 없는 항목은 미검증으로 남긴다.
2. `monsterAiProfiles`처럼 전투 수치와 분리된 schema를 추가한다. 469개 행동 대조 행은 원자료 보존용으로만 import 준비하고, ID-only 5·미연결 16·이름/수치 충돌 C 행은 `unknown`/hold로 둔다.
3. 모든 encounter가 공유하는 `world` 최소 상태(주변 entity, actor/target 식별자, idle timer, `groundDrops`)와 이를 생성·정리하는 단일 lifecycle을 만든다. 온라인/Headless 양쪽에서 같은 객체를 쓴다.
4. 데이터 기반 evaluator를 붙이되 첫 패치는 **행동 결정을 기록하고 기존 전투 계산을 보존**한다. 그 뒤 검증된 passive/aggressive, idle, looter, Assist, 소환 순으로 한 항목씩 배선한다.
5. `mob_skill_db` 조건을 일반화한 skill executor를 만든다. 현재 가상 속성/HP/종족 스킬은 영향 계측 후 제거·대체 시점을 결정한다.
6. online/headless 동일 scenario, 세이브 왕복, 모바일 pointer E2E를 보강한다. 실제 encounter 표본 수·피해·소모·EXP/제니·drop을 쌓기 전 적응형 구역 이동은 열지 않는다.
7. 추가 과거 한국 RO/Aegis 출처를 확보하면 보류 21행과 C 충돌 행을 재판정한다. Renewal `kROName`이나 현행 스킬을 자동 정본으로 승격하지 않는다.

## v1.13 조사·감사 반영

- 고정 revision 재대조와 표제어·공식 DB·드롭 교차로 행동 대조 469행을 기록했다. ID-only는 타임홀더 3074, 흑사왕 1418, 앙그라 만티스 2133, 스콜피온 킹 1168, 절망의 신 모로크 3097의 5행이다. 미연결 16행은 후보군과 배제 사유까지 조사하고 종결했으며, 행동 없음으로 추정하지 않는다.
- 구현 감사는 DB 490행의 AI/Mode/Monster Skill/mSkills 부재, 현행 무작위 합류와 가상 스킬, `groundDrops`·월드 entity 부재를 확인했다. 반대로 encounter 기록·수동 override·pointer gesture·Headless 결정성 gate는 현재 작업 트리에 구현돼 있다.

## v1.13 기획 반영 결정

- 공통 AI schema는 `aiType: unknown`을 허용하고, AI type과 독립된 `immobile`, `cannotCounterattack`, `transformOnIdle` 행동을 기록한다. 누락 필드를 passive로 보정하지 않는다.
- 페코페코 알의 변태는 idle timer와 entity 교체를 요구한다. stage 4의 idle lifecycle에 포함하며 몬스터별 JS 예외로 구현하지 않는다.
- 감시하는 자의 friend-HP heal과 지키는 자/위로하는 자의 상태별 기술은 주변 actor·HP·cast 상태가 있어야 재현된다. 따라서 stage 4의 인접 actor/idle state를 stage 5보다 먼저 유지한다.
- 타임홀더는 현행 Renewal DB에서 확인되는 정보가 있어도 `sourceVersion=current`·`confidence=C`으로 격리한다. 전투 배선 대상에 넣지 않는다.
- 스케골트(청) 1755는 idle/attack `NPC_CALLSLAVE`와 on-spawn `NPC_SUMMONSLAVE`가 확인된 실제 사례다. stage 4의 소환 주체·수명·인접 actor를 생략하면 해당 행동은 플래그만 남는다.
- 데이터 본체가 세이렌 1634와 일치하는 이그니젬 세니아(검사)는 `identityConflict=true`로 격리한다. common evaluator의 입력 후보가 될 수 있으나, 사용자 표제어 기준 배선은 하지 않는다.

## 기존 v1.1 패치 구현 상태

- 완료: 공용 전투 기록 객체와 `processTurn` 행동 이벤트 기록, 처치/피해/보상/전리품, encounter 종료 저장, 최근 기록/이벤트 상한, 저장 레거시 필드 보강.
- 완료: autoHunt 중 skill/item 수동 입력을 다음 플레이어 행동 override로 큐잉; 자동 포션/평타/자동 스킬과 중복되지 않게 처리.
- 완료: 핫바 pointer tap은 실행, 550ms long press는 슬롯 편집. 비어 있는 슬롯 탭은 편집을 연다.
- 검사: `build.py`, 9개 JavaScript inline block syntax check, record helper aggregation/caps/sequence 단위 확인 통과.
- 실행 보류: 개발자 콘솔 `runValidationGate()`의 Headless determinism 및 item override 통합 시나리오는 Chromium 실행 바이너리가 없는 이 환경에서 돌리지 못했다. 다음 착수 때 실제 브라우저에서 6개 게이트를 실행한다.
- 원작 AI evaluator·주변 개체·groundDrops·원작 Monster Skill 배선·적응형 구역 정책은 아직 구현하지 않았다. 행동 미대조 21종 중 5종은 ID-only이고 16종은 후보군 조사 종결 상태다.
