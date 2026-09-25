# TextRAG 전투 시스템 개편 통합 기획안 v1.10

- 기준 저장소: `J-Roc-H/text-rag`, `main` 기준 커밋 `5451ab1`
- 갱신일: 2026-09-25
- 변경 요약: v1.9 대비 표제어·공식 한국 DB 교차로 37행을 fixed pre-re 행동 표에 추가 연결했다. 행동 대조 422→459, ID 후보만 남은 행 2→3, ID 미연결 66→28이다. 흑사왕 1418은 ID만 확인했고, 수치/variant 충돌은 C 등급으로 보존했다.
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

- 몬스터 DB 490행 전부 대장에 열거했다. pinned pre-re 자료까지 행동 대조한 행은 459개다. 3개는 canonical ID 후보만 확인했고, 28개는 ID 후보 미확인이다. 행동 자료 미대조는 31개로, 전수 복원 완료로 표시하지 않는다.
- pinned rAthena pre-re `mob_db.yml`, `mob_skill_db.txt`, mode reference는 재현 가능한 기계 판독 기준이다. 공식 한국 Aegis 원본은 아니며, Renewal 값을 정본으로 승격하지 않았다.
- 교차 확인 사례: 포링·포포링·드롭프스의 `Ai 02`와 loot 상태 기술은 비선공/먹자와 맞는다. 오크 워리어 등은 `Ai 04`, 오크 레이디/하이 오크 등은 `Ai 21`, 오크 아처는 `Ai 09`여서 “오크 공통 선공/Assist”로 일반화할 근거가 없다.
- 현 DB에 원작 AI/몬스터 스킬 필드는 없고 `mSkills` 데이터도 0개다. 전투 중인 몬스터는 현재 선공 여부와 관계없이 공격한다.
- `huntStyle=aggressive`의 20%/틱 무작위 추가 몬스터는 원작 Assist가 아니다. MVP slave 15% 재소환도 별도 단순 규칙이다.
- 스킬은 현재 속성/HP/종족 기반 가상 처리이며 원작 `mob_skill_db` 데이터 배선이 아니다. 교체 전 스킬 사용에 필요한 상태/전투 효과를 확인한다.
- 처치 드롭은 즉시 인벤토리에 들어가고 `groundDrops`, 인접 몬스터, 영속 idle 상태는 없다. 이를 넣으면 먹자/Assist/Idle을 공통 규칙으로 연결할 수 있다.
- 온라인/Headless는 공통 전투 경로를 쓴다. 이미 seeded RNG의 Headless 반복 재현 게이트가 있으나, 온라인 실시간 실행과 Headless 비교를 직접 자동화한 게이트는 아니다.
- 핫바 모바일 탭은 편집 모달을 연다. `executeHotbar`는 전투 도중 즉시 아이템/스킬을 실행하므로 자동 행동에 추가 행동을 얹을 수 있다. 요구된 모바일 동작과 override 의미가 모두 미충족이다.

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
| 1 | 전투 기록/사건 기반 | 즉시 구현 | 공통 실행 경로가 확인됐다. 이벤트와 요약이 online/headless에서 동일하게 생성되고 저장 round-trip이 통과해야 한다. |
| 2 | 모바일 수동개입 | 즉시 구현 | 모바일 탭 편집과 즉시 전투 실행이 확인됐다. override는 다음 플레이어 행동 슬롯 하나를 소비하고 평타/자동스킬이 추가 실행되지 않아야 한다. |
| 3 | 공통 몬스터 AI 프레임워크 | 기반 필요 | AI type별 전환, 타깃 변경, 스킬 선택을 공통 evaluator에 둔다. 490개 원작 ID 교차표 완성과 충분한 타깃/상태 모델이 선행돼야 한다. |
| 4 | 최소 세계 상태: 인접 몬스터, `groundDrops`, idle state | 기반 필요 | Assist/looter/idle 동작의 최소 입력이다. encounter 전용 전투 배열과 지도상 개체 생명주기 경계를 설계한다. |
| 5 | 검증된 원작 행동 배선 | 기반 필요 | 459개는 fixed pre-re 기계 판독까지 대조했지만, 수치·variant 충돌 C 행과 공식 과거 KRO/Aegis 교차 미완료 행이 남아 있다. ID와 행동의 출처/신뢰도 gate 뒤 데이터만 연결한다. |
| 6 | 자동 AI 개선 | 기반 필요 | 행동 사건/피해 기록과 상태 입력이 먼저 있어야 균형을 비교할 수 있다. |
| 7 | 적응형 구역 이동 | 보류 | 실제 구역별 전투 표본과 충분한 표본 수/성과 기준이 쌓이기 전 이동 정책을 만들지 않는다. |

이번 패치의 확정 구현 범위는 1·2단계의 공용 전투기록 및 한 행동 override 기반이다. AI 프레임워크, 세계 상태, 원작 행동 플래그 배선은 문서상 선행 상태와 자료가 부족해 구현하지 않는다.

## 구현 판정표

| 행동/기능 | 현재 DB | 엔진/실행 판정 | 부족한 세계 상태 | 비용 | 판정 |
|---|---|---|---|---|---|
| Aggressive / 비선공 | 없음 | 모든 전투 몬스터가 공격; 진입 전 선공 판별 없음 | 지도상 접근 범위, 몬스터 idle/target | 높음 | 기반 필요 |
| Assist | 없음 | 공격/피격자 주변 지원 관계 없음. aggressive spawn은 무작위 합류라 오동작 대체 | 인접 몬스터, 도움 호출 사건, 위협 대상 | 높음 | 기반 필요 |
| Looter | 없음 | 아이템을 즉시 인벤 지급 | `groundDrops`, drop 소유권/수명 | 중간 | 기반 필요 |
| Target Change | 없음 | 단일 플레이어를 상대로만 전투 | 여러 actor/위협 표, target ID | 높음 | 보류 |
| Cast Sensor | 없음 | 플레이어 cast 시작/중단 가시 상태 없음 | cast event/범위, 몬스터 AI state | 중간 | 기반 필요 |
| Detector | 없음 | 숨기/은신 여부와 종족/보스 탐지 상호작용 없음 | 은신 상태 및 탐지 범위 판정 | 중간 | 기반 필요 |
| Idle / 상태별 기술 | 없음 | 월드 idle state가 없음; 전투 로그/UI 문구는 일부 존재 | 월드 개체 state/timer | 중간 | 기반 필요 |
| Monster Skill | `mSkills` 0개 | DB 분기 dead; 현재 가상 속성/HP/종족 스킬 | 원작 skill condition/state 데이터와 시전자 상태 | 높음 | 검증 자료 이후 기반 필요 |
| 주변 개체 | 없음 | `huntStyle=aggressive` 임의 20% 합류, MVP slave 임의 15% 보충 | 인접 actor, 소환 주체/수 제한/수명 | 높음 | 기반 필요 |
| 바닥 전리품 | 없음 | 자동 인벤 지급 | `groundDrops`, 줍기 시간/충돌 처리 | 중간 | 기반 필요 |
| 온라인/Headless | 해당 없음 | `processTurn` 공용; Headless seeded 반복 게이트 있음 | online vs headless 경로 비교 gate 보완 | 중간 | 즉시 기록 패치 범위 |
| 전투 기록/사건 | 없음 | 기존 텍스트 로그/지역 통계는 별도 데이터이며 공용 encounter record 없음 | encounter ID/lifecycle | 낮음 | 즉시 구현 |
| 모바일 탭/길게 누름 | 없음 | 탭이 편집, hotbar 발동은 즉시 행동 | 한 행동 입력 대기열, pointer gesture 구분 | 중간 | 즉시 구현 |
| 적응형 구역 이동 | 없음 | 이동 가능하나 전투 표본 정책 없음 | 표본 수/성과/구역 기록 | 높음 | 보류 |

## 폐기한 대안과 이유

- **전 몬스터를 공격적으로 취급**: 실제 DB에 Ai 01 passive와 Ai 02 passive-looter가 확인됐다. 현행 전원 공격은 유지할 정본이 아니다.
- **Aggressive bit 하나로 `Ai 04`를 선공 처리**: mode reference가 AI type 04를 Angry 상태형으로 분리한다. 선공 시작 규칙을 확정할 자료가 부족하다.
- **오크 종족 단일 행동/Assist 하드코딩**: 확인된 Orc 계열 안에서도 AI 04/09/21로 갈린다.
- **각 몬스터별 JS 분기**: 자료 누락을 코드 예외로 고정하고 검증/유지 비용을 키운다. 정규화된 행동 데이터 + 공통 evaluator로 처리한다.
- **20% 합류 규칙을 원작 Assist로 간주**: 현재 구현은 랜덤 map pool 추가이고 주변 지원 AI가 아니다.
- **전리품을 즉시 자동 획득하면서 Looter만 플래그로 표기**: 기능 없는 플래그가 된다. groundDrops 기반이 갖춰진 뒤 배선한다.
- **전투 종료 표본 없이 적응형 이동**: 편향된 짧은 세션으로 사냥터를 오가게 할 위험이 있다.

## 품질 게이트와 계측

1. 같은 시작 상태/seed로 Headless를 두 번 실행해 record JSON과 요약까지 같은지 검사한다.
2. seeded 조건으로 기존 전투 계산 결과(HP/SP/EXP/처치/드롭)가 기록 기능 추가 전과 같음을 비교한다.
3. override skill/item 각각 자동 행동 1회 대체, 몬스터 응답 순서, 실패 입력 처리, status stun/silence와 자원 부족을 확인한다.
4. 핫바 pointer tap은 사용, long press는 편집 1회, pointer cancel은 중복발동 없음. keyboard 단축키 회귀 확인.
5. 이전 save와 새 save의 `loadPlayerData` 왕복 멱등성, 기록 상한/보존 확인.
6. 한 전투에서 피해 입힘/받음, 처치/보상/드롭, 구역, 사용 입력을 원시 이벤트와 사건/요약에서 대조한다.

이후 적응형 이동에 필요한 계측: 구역별 encounter 수, 틱/생존시간, 처치율, 피해 비율, 물약/스킬 사용, EXP·제니·드롭 산출, 표본 신뢰 한계와 무효 전투 제외 사유.

## 다음 조사/착수 순서

1. 행동 미대조 31종(ID 후보 3, ID 후보 미확인 28): Angra Mantis 2133과 Dark Snake Lord 1418의 해당 pre-re/한국 과거판, Peco Peco Egg 1047의 AI 정의를 먼저 찾는다. 나머지는 한국어 표시명↔legacy `AegisName`/ID 교차자료를 확보하며 Renewal 미러의 `kROName`은 자동 연결에 쓰지 않는다.
2. AI mode mapping을 데이터 schema로 정규화하되 아직 미검증 행은 `unknown` 유지.
3. 인접 몬스터, target actor, cast visibility, idle lifecycle, groundDrops의 최소 월드 모델 설계.
4. 공통 evaluator 및 data-driven monster skill 조건식을 구현하고 동일 경로로 online/headless 회귀.
5. 원작 행동 표본을 넓히고 전투 밸런스 계측 후 zone policy를 설계.

## 후속 조사 갱신

- 고정 revision을 실제 재대조해 35종을 우선 행동 표로 승격한 뒤, 기존 ID 후보 중 TextRAG의 HP·공격범위·공격지연이 R1과 모두 같은 190종을 추가 승격했다. 남은 R1 연결 후보 92종도 HP·범위·공격지연 충돌을 각 행에 기록하고 신뢰도 C로 행동 기계 대조했다. 표제어와 공식 한국 DB를 재대조해 Miyabi Doll, Aliot, Blazzer, Vesper, 생체 3차 직업군, Thanatos 4종, Morocc, Nidhoggr’s Shadow, Leib Olmai, Giearth 등 37종을 더 연결하여 현재 행동 표는 459종이다. Dark Frame은 1260, Mutant Dragonoid는 1262로 분리했고, Deathword는 1698, Zombie Master는 1298로 정정했다. 흑사왕은 공식 한국 DB의 Dark Snake Lord 1418로 ID만 확인했고 R1 행동은 보류했다. Angra Mantis 2133은 R1 부재, Peco Peco Egg 1047은 R1 AI 부재로 보류했다. 현재 ID 후보만 확인된 행은 3, ID 미연결 28, 행동 자료 미대조 31행이다.

## 기존 v1.1 패치 구현 상태

- 완료: 공용 전투 기록 객체와 `processTurn` 행동 이벤트 기록, 처치/피해/보상/전리품, encounter 종료 저장, 최근 기록/이벤트 상한, 저장 레거시 필드 보강.
- 완료: autoHunt 중 skill/item 수동 입력을 다음 플레이어 행동 override로 큐잉; 자동 포션/평타/자동 스킬과 중복되지 않게 처리.
- 완료: 핫바 pointer tap은 실행, 550ms long press는 슬롯 편집. 비어 있는 슬롯 탭은 편집을 연다.
- 검사: `build.py`, 9개 JavaScript inline block syntax check, record helper aggregation/caps/sequence 단위 확인 통과.
- 실행 보류: 개발자 콘솔 `runValidationGate()`의 Headless determinism 및 item override 통합 시나리오는 Chromium 실행 바이너리가 없는 이 환경에서 돌리지 못했다. 다음 착수 때 실제 브라우저에서 6개 게이트를 실행한다.
- 원작 AI evaluator·주변 개체·groundDrops·원작 Monster Skill 배선·적응형 구역 정책은 구현하지 않았다. 행동 미대조 31종 중 3종은 ID 후보만 있고 28종은 ID 미연결이다.
