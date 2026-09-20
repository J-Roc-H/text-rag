# DEVREF 인덱스 — 어떤 파일을 언제 로드할까

## 파일 목록

|파일                      |내용                                                  |라인 수 |
|------------------------|----------------------------------------------------|-----|
|**DEVREF-A** `구조_코드체계`  |블록 구조, JOB/SK 코드표, 핵심 함수, 플레이어 객체, 작업 원칙            |~110줄|
|**DEVREF-B** `DB스키마`    |monsters/maps/npcs/items/skills DB 스키마, wType, 무기 허용|~110줄|
|**DEVREF-C** `카드_아이템파싱` |parseItem 정규식, HTML 이스케이프, compound 패턴, 카드 현황       |~100줄|
|**DEVREF-D** `퀘스트_스킬_전투`|퀘스트 타입·함수, 던전 잠금, 스킬 초기화, SE 목록, 노점                 |~130줄|
|**DEVREF-E** `미구현목록`    |A~E등급 할일, 스킬 퀘스트 10개, 체인 퀘스트 14개                    |~80줄 |
|**DEVREF-F** `에디터_UI`   |에디터 섹션 ID, DB뷰어 탭, 무기 티어 제한, p.options              |~80줄 |

-----

## 작업 유형별 로드 조합

|작업 유형           |필수       |선택             |
|----------------|---------|---------------|
|퀘스트/스킬/전투 로직 수정 |A + D    |B (데이터 확인 필요 시)|
|몬스터/맵/아이템 데이터 추가|A + B    |—              |
|카드 합성·인벤토리 UI 수정|A + C    |—              |
|에디터·DB뷰어 수정     |A + F    |—              |
|다음 작업 계획 수립     |E        |A              |
|NPC/퀘스트 데이터 추가  |A + B + D|—              |
|새 기능 설계         |A + 관련 파일|E (백로그 확인)     |

-----

## 자주 헷갈리는 것

- **세이지 계열 스킬 소속**: 네이팜발칸·소울드레인·매직크래셔·마법력증폭 → `JOB_SGE` (DEVREF-B)
- **parseItem greedy 버그**: 반드시 lazy `+?` + `$` 앵커 사용 (DEVREF-C)
- **compound 아이템 DB 조회**: `parseItem(n)` → `.base` 패턴 (DEVREF-C)
- **스킬 등록**: `= 0` (DEVREF-A 원칙, DEVREF-D doJob 패턴)
- **카드 중복 키 10쌍**: 정리 필요 목록은 DEVREF-C
- **`$()`로 DOM 존재 체크 금지**: 요소가 없어도 더미 Proxy(truthy) 반환 → `if($('id'))`는 항상 참. 존재 체크는 `document.getElementById()` 사용 (2026-07-03 몰래하기 오버레이 무반응 버그 원인)
- **명중률 공식**: `80 + (HIT - FLEE)`, 5~95% 클램프 (원작 Pre-RE 동일). 플레이어→몬스터는 `t.flee`, 몬스터→플레이어는 `m.hit`(또는 `t.hit`) 직접 사용 — 레벨 근사치로 대체하는 코드가 남아있으면 버그 (2026-07-10 DEVREF-E 1-3에서 실전투+시뮬레이터+오프라인 틱 총 6곳 수정)

-----

## 패치 이력 — v9.03 (2026-07-10) 명중 공식 flee/hit 버그 수정 (DEVREF-E 1-3)

- 플레이어→몬스터 명중식이 `t.flee`를 무시하고 `t.lv` 근사치를 쓰던 버그 수정 (실전투 + 전투 시뮬레이터 3곳)
- 부가 발견: 몬스터→플레이어 명중식도 `m.hit` 대신 레벨 근사치 사용 중 → 같이 수정 (실전투 + 시뮬레이터 + 오프라인 틱 3곳)
- 상세는 DEVREF-E 완료 항목 1-3, 룬미드가츠_개발일지 2026-07-10 참조

## 버전 업데이트 워크플로우 (2026-07-10 도입)

사용자가 명시적으로 요청할 때만 실행("버전 올려줘" 등). 규칙: 소버전 +0.01(v9.03→v9.04, 하루=버전 1개).
셸 가능하면 `cp`로 새 버전 파일 생성 + 구버전은 `versions/`로 이동. 셸 불가하면 새 파일명만 안내하고 사용자가 직접 복사(대용량 html Read+Write 금지 — 토큰 낭비).
이후 개발일지 새 버전 섹션 추가 + DEVREF 갱신 + CLAUDE.md 현재 파일명 갱신. 상세 절차는 CLAUDE.md 참조.

## 설계 문서

- **`설계_월드맵_동서남북_3-13.md`** — 월드맵 방향 이동 + 필드 분할 설계 (구현 대기, DEVREF-E 별도 분류 참조)

-----

## 패치 이력 — v9.03 (2026-07-02) 스타일 정리 4종

- **로그 색 저채도 3계열** 통일(라이트/다크) — 새 로그 색은 DEVREF-F 규칙 따를 것
- **그라데이션/그림자 금지** (UI 크롬) — bar-fill만 예외
- **tabular-nums 전역**, 제니 콤마
- **맵 틴트**: `applyMapTint()` → `#game-log[data-tint]` (신규 맵 이름 키워드 확인)

-----

## 패치 이력 — v9.03 (2026-07-03) 옵션 분화 + 리젠·구역 설정화

- **⚙️ 옵션 버튼 분리**: `showEnvOptionModal`(환경: 업무·다크) + `showCombatOptionModal`(전투: 기존 항목 + 리젠·구역 전환)
- **신규 p.options**: `respawnMin`/`respawnMax`(초, 기본 0~2) · `zoneKillTh`(기본 50, 0=끄기) — 상세는 DEVREF-F
- **`getZoneKillTh()`** 공용 헬퍼 — `ZONE_KILL_THRESHOLD` 상수는 폴백 전용
- 몰래하기 복귀 UX: 리본 클릭 복귀 + 상태표시줄 "매크로 기록: \`" 힌트
- 몰래하기 저장·종료: `stealthSave()`(조용한 저장, **위장 중 saveGame 금지** — 파일 대화상자 발생) + X 로고 위장 메뉴(저장/사냥토글/로비) + Ctrl+S

-----

## 패치 이력 — v9.03 (2026-07-02) 몰래하기 모드 (3-10)

- **엑셀 위장 오버레이**: 백틱(`) 보스키 = `toggleStealth()`. `G.stealthOn` + `p.options.workMode`(저장) 동기화
- **로그 한 줄 교체**: `log()` 훅 → `stealthSetLog` (상태표시줄). 셀 매핑·상세는 DEVREF-F
- **구형 toggleWorkMode(흑백)** → toggleStealth 리다이렉트. `body.work-mode` CSS 데드코드

-----

## 패치 이력 — v9.03 (2026-07-02) UI 개선 6종

- **로그 필터/요약**: `setLogFilter`, `idleTrack`/`flushIdleSummary`(5분 요약), 새 로그 타입 `summary` (DEVREF-F)
- **구역/리젠 HUD**: `#zone-hud` + `updateZoneHud`(500ms) — 킬 게이지·리젠 카운트다운
- **핫바 상태**: `.cd`/`.nosp`/`.used` 클래스 — renderHotbar·executeHotbar
- **장비 비교**: showItemDetail에 equip 임시 스왑 diff (원복 후 calcStats 재호출 필수 패턴)
- **모바일**: `#mobile-tabbar` + `mobileTab`/`syncMobileTab`/`syncMobileHunt`, `checkMobile`이 핫바 DOM 이동
- **몬스터 카드**: `ELEM_ICO`, `.mon-meta`/`.mon-dist`/`.mvp-badge`

-----

## 패치 이력 — v9.03 (2026-07-02) 2-8·2-9

- **[2-8] 자동 스킬 = 핫바 등록 스킬만**: 공격·힐·버프·fallback 전부 `hotbarSkillSet` 필터. 핫바 스킬 0개면 평타만 (DEVREF-D)
- **[2-9] 구역 시스템**: `getZones()` 범용 자동 생성 (맵별 데이터 없음). `G.zoneIdx/zoneKills/nextSpawnAt`, 사용 전 `ensureZoneState()` 필수 (DEVREF-D)
- **리젠 딜레이**: 전멸 후 10~20초 무작위 (`ZONE_RESPAWN_MIN/MAX_MS`, 실딜레이=`G.lastRespawnDelay`) — huntTick 경로에서만 적용
- **구역 UI**: 지도 모달에 구역 카드(현재 위치 표시, 클릭 이동 `setZone(idx)`)
- **핫바 행동 추가**: '구역 전진'/'구역 후퇴' (`moveZone(dir)`)

-----

## 패치 이력 — v9.01 (2026-06-20~21)

- **아이템 타입 문자열**: `'소비'`는 삭제됨. 현재 소모품 타입은 `'소모품'`만 유효
- **db-cjb 키**: 모두 JOB 코드(`JOB_MG`, `JOB_ARC` 등). 한글 키 없음
- **HP/SP_COEFF**: 전승 2차 직업 7종 추가 (팔라딘·프로페서·클로운·집시·챔피언·스토커·크리에이터)
- **기본 스킬 키**: `"노비스 기본스킬"` 폐기 → `"기본 스킬"` 사용. loadCharacter 마이그레이션 포함
- **세이프티 월 SE**: `statusEffects.safetyWall={count, turns}` 패턴. `statusEffects['safety']` 사용 금지
- **오토 스펠 발동풀**: `'라이트닝 볼트'`, `'화이어 볼'` (썬더 볼트/파이어 볼은 DB에 없음)
- **보스 용족 분기**: `m.race === "용족"` — element가 아닌 race 필드
- **SE 부여 패턴**: `t.statusEffects={...}` 대입 금지 → `if(!t.statusEffects)t.statusEffects={}; t.statusEffects.xxx=value;`
- **쿨다운 분리**: `G.cooldowns` = 틱 기반(스킬 전용), `G.itemCooldowns` = 타임스탬프 기반(아이템 전용). 혼용 금지
- **refineLevel 키**: 슬롯명(`'무기'`, `'방어구'` 등) 사용. 아이템명 키 금지
- **getJobLvCap(job)**: 잡레벨 상한 반환 공용 함수. 노비스=10, 전승직=70, 나머지=50
- **_NC Set**: processTurn 티어빌더 내 no-op·제조 스킬 제외 목록. 신규 유틸 스킬 추가 시 여기에도 등록
- **즉사 스킬 MVP 면역**: 타로카드·아브라카다브라 즉사 효과 — `m.isMvp` 시 즉사 무효, HP 50% 감소로 대체
- **사망 EXP 손실**: `DB.expTable[p.baseLv]*0.01` 차감. Lv1·Lv99 예외. 레벨 다운 없음
- **refine()**: DB.refine 테이블 기반. 무기 Lv별 재료·비용·성공률 자동 분기. +10 상한