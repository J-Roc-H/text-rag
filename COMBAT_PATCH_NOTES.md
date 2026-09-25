# 전투 개편 패치 노트

- 작업 브랜치: `codex/combat-audit-v1.1`
- 기준: 저장소 커밋 `5451ab1`
- 계획: `docs/TextRAG 전투 시스템 개편 통합 기획안 v1.13.md`
- 조사: `MONSTER_AI_AUDIT.md`

## 변경 파일

- `source/template.html`: shared encounter record, event writer, item/skill manual override, mobile hotbar gestures, verification gates.
- `source/data/db-monster-ai-profiles.json`: 전투 수치와 분리한 원작 행동 profile 첫 5건(포링·드롭프스·콘도르·포포링·페코페코 알).
- `build.py`: AI profile data를 단일 HTML bundle에 포함.
- `index.html`: build output.
- `룬미드가츠_v9.19.html`: build output.
- `MONSTER_AI_AUDIT.md`: behavior crosswalk and implementation audit.
- `docs/TextRAG 전투 시스템 개편 통합 기획안 v1.13.md`: source/implementation audit-based plan and execution status.

## 구현 범위

- 동일한 `processTurn` 및 Headless runner 경로에서 전투 기록을 생성한다.
- 기록 객체는 `id`, map, tick 범위, `rawEvents`, `incidents`, `summary`, 종료 이유를 갖는다. 최근 30개 encounter, encounter당 최근 원시 이벤트 240개, 사건 80개로 제한한다.
- 시작/플레이어 결정/스킬·아이템/피해/처치/보상/전리품/합류/종료를 구조화해 기록한다. 요약에는 처치, 피해 입힘/받음, EXP/JEXP, 제니, 아이템, 수동 개입 횟수를 집계한다.
- 세이브에는 `combatRecords`와 단조 증가 `combatRecordSeq`를 정규화해 추가한다. 레거시 세이브 필드가 없어도 기본값을 둔다.
- autoHunt 전투 중 스킬/아이템 입력은 다음 플레이어 행동 슬롯 하나를 소비한다. 수동 스킬은 자동 스킬이나 평타로 중복 실행되지 않는다. 수동 아이템 행동에는 자동 포션을 겹쳐 쓰지 않으며, 그 턴의 몬스터 반응은 기존 공용 턴 계산에서 처리한다.
- 핫바 pointer tap은 슬롯을 사용하고, 550ms long press는 편집 모달을 연다. 빈 슬롯 탭은 편집으로 연결한다. 키보드 핫키는 기존 `executeHotbar` 경로를 유지한다.
- 기존 Headless seeded 반복 gate가 전투 기록과 `combatWorld` JSON도 비교하도록 확장했다. override item이 한 자동 공격 행동을 대체하는 개발자 콘솔 통합 gate를 추가했다.
- `combatWorld`는 encounter 안의 monster entity, source ID, state, `groundDrops`를 공용으로 가진다. 현재 드롭은 기존 계산을 보존하기 위해 `legacy_auto` 상태로 즉시 수집되지만, 후속 looter가 읽을 entity/event 입력을 남긴다.
- 모든 일반 스폰·MVP·slave·무작위 합류에 `sourceId`/entity 식별자를 붙이고, AI profile evaluator가 `enabled` 행동만 전투 계산에 반영한다.
- 검증된 첫 행동 배선은 TextRAG 480 페코페코 알의 무반격·고정형이다. `cannotCounterattack`/`immobile` profile은 몬스터 턴을 skip하고 `monster_action_skipped` 사건을 남긴다. idle 변태, looter, Assist, target change, monster skill은 아직 배선하지 않았다.

## 보류 범위

- Aggressive/passive, Assist, Target Change, Cast Sensor, Detector, Idle 변태, 원작 Monster Skill 원복.
- 지도상 영속 주변 몬스터 상태와 실제 `groundDrops`/looter. 현재 `combatWorld`는 encounter 범위이고 drop은 즉시 수집 상태다.
- 행동 미대조 21종(5 ID-only, 16 canonical ID 미연결)의 canonical source ID 및 공식 과거 KRO/Aegis 충돌 조사.
- 적응형 사냥터 이동. 충분한 실제 전투 표본이 쌓인 뒤 별도 설계한다.
- 기존 속성/HP/종족 기반 가상 몬스터 기술은 이번 패치에서 제거하지 않았다. `mSkills` dead branch를 고치는 대신 원작 스킬 데이터와 최소 상태를 먼저 확보한다.

## 검사

- `python3 build.py` — 통과.
- 9개 JavaScript inline block에 `node --check` — 통과.
- Node VM 단위 검사 — 기록 집계, override queue, 이벤트/기록 상한, 세이브된 sequence 단조성 통과.
- Node VM 통합 검사 — AI profile JSON 5건 파싱, `combatWorld` entity/source ID 연결, 페코페코 알의 이동·반격 억제와 skip 사건 기록 통과.
- 브라우저 실행은 미검증: Playwright 패키지는 있으나 Chromium 실행 파일이 없어 `runValidationGate()`의 Headless 반복 재현 및 item override 통합 시나리오를 실제 플레이 환경에서 실행하지 못했다. 두 시나리오의 gate 코드는 저장소에 추가되어 있다.

## 알려진 한계

- 원작 행동 감사는 490행을 열거했다. fixed pre-re 또는 행별 보조 근거까지 행동 대조한 행은 469행, 행동 미대조는 21행이다. 현재 집계는 ID-only 5행(행동·시대 대조 미완료), 후보군·배제 사유까지 조사한 ID 미연결 16행이다. 미대조 행을 비선공/행동 없음으로 처리하지 않았으며, 전수 복원은 완료가 아니다.
- rAthena pre-re pinned 자료는 기계 판독 기준이며 공식 kRO/Aegis 원본이 아니다. 개별 490종 전체를 독립된 한국 과거판 자료와 교차하지 못했다.
- ID 교차 후보의 과거 배치 메모는 `MONSTER_AI_AUDIT.md`에 남겼다. 현재 집계는 행동 대조 469, ID-only 5, ID 미연결 16이다. 190행은 TextRAG HP·공격범위·공격지연이 fixed R1과 모두 일치했고, 92행은 수치 충돌을 각 행에 기록한 신뢰도 C 기계 대조다. 표제어·공식 한국 DB·R1 드롭 대조로 47행을 추가 연결했다. fixed revision 재대조에서 `DARK_FRAME=1260`/`MUTANT_DRAGON=1262`, `DEATHWORD=1698`, `ZOMBIE_MASTER=1298`을 확정했다. `미아비→1516`, `노버스(적)→1719`, `스콜피온 킹→1168`, `흑사왕→1272`, `가이아스→1140`은 보조 교차가 고정 원본과 달라 후보를 폐기했다.

- 피해 요약은 공용 전투 기본 공격/스킬과 몬스터 기본/스킬 공격의 측정값이다. 부가 카드 오토스펠, 일부 반사/상태 효과의 이차 피해가 전체에 포함되지 않을 수 있다.
- record는 종료 시 플레이어 세이브에 추가된다. 현재 encounter 중 페이지를 닫으면 진행 중인 record 복구는 보장하지 않는다.
- tap/long press 처리기는 핫바 포인터 입력 전반에 적용된다. 실제 모바일 브라우저의 click synthesis와 VoiceOver/키보드 보조기기 확인은 브라우저 테스트가 필요하다.
- 실패한 수동 skill/item 지정도 다음 행동 슬롯을 소비하고 자동 평타를 대신한다. 실패 이유는 로그로 표시한다.
- AI profile은 5종만 입력됐고, 실제로 계산에 켠 행동은 페코페코 알 한 건이다. 나머지 4 profile은 근거 보존용 `hold`라서 passive/looter/Assist를 아직 바꾸지 않는다.
- `combatWorld.groundDrops`는 looter 구현이 아니라 기존 즉시 인벤 지급의 사건/상태 흔적이다. 전투 종료 시 저장하지 않고 버린다.

## 다음 시작점

1. `runValidationGate()`를 Chromium에서 실행하고 gates ④–⑦의 online/headless, 수동 override, AI profile/world 동작을 확인한다.
2. 중단된 encounter의 저장/재로드 lifecycle을 정해 기록 유실/중복을 방지한다.
3. `combatWorld`를 지도 entity lifecycle로 확장하고 실제 `groundDrops` pickup을 도입한 뒤 looter/Assist/idle을 순서대로 연결한다.
4. 공통 data-driven AI evaluator와 mob-skill 조건 실행기를 연결한 후 원작 행동 회귀표를 확장한다.
6. encounter 표본으로 구역별 처치/피해/EXP·제니/소모품 계측을 모으고, 충분한 표본 기준이 정해지기 전 적응형 이동은 보류한다.

- 후속 crosswalk에서 기그→1387, 산들바람→Breeze 1692, 죽은자의주인→Lord of the Dead 1373 후보를 추가했다. 출처는 보조 DB이며 AI/skill/epoch 검증은 미완료다. 현재 490행 중 행동검증 469, 행동미대조 21, ID-only 5, ID 미연결 16. 후속 crosswalk에서 Drainliar 1111, Cruiser 1248, Solider 1316, Freezer 1319, Permeter 1314, Lude 1509, Disguise 1506, Bloody Murderer 1507도 후보로 기록했다. 변형/시대 구분은 미확정이며 행동 미대조다. 후속 Magnolia 1138, Dark Illusion 1302, Stormy Knight 1251 추가는 이름/ID 후보에 한정한다.
