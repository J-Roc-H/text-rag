# DEVREF 인덱스 — 어떤 파일을 언제 로드할까

> **편집은 `source/template.html` + `source/data/*.json`에서, 빌드는 `python build.py`로.**
> (P4-03, 2026-09-13) `룬미드가츠_v9.16.html`은 이제 빌드 산출물이다 — 직접 고치지 않는다.
> 최종 검증 2026-09-13 | 2026-09-12부터 이 폴더는 **git 저장소**다. 베이스라인 커밋 = v9.14 동결.

## 파일 목록

|파일                      |내용                                                  |라인 수 |
|------------------------|----------------------------------------------------|-----|
|**DEVREF-A** `구조_코드체계`  |블록 구조, JOB/SK 코드표, 핵심 함수, **공용 함수 7종**, 플레이어 객체, 작업 원칙|~165줄|
|**DEVREF-B** `DB스키마`    |monsters/maps/npcs/skills DB 스키마, MVP slaves, wType, 무기 허용|~194줄|
|**DEVREF-H** `아이템DB`    |db-items 스키마, **weight/weightSrc + 무게 패널티 구간**, **드롭명↔아이템명**, dropSlots, rAthena 조인, 장비·화살·카드슬롯|~136줄|
|**DEVREF-C** `카드_아이템파싱` |parseItem 정규식, HTML 이스케이프, compound 패턴, 카드 현황       |~145줄|
|**DEVREF-D** `퀘스트_전직`   |퀘스트 타입·함수, 던전 잠금, 언어 장벽, 스킬 습득, **전직·전승 엔진**  |~165줄|
|**DEVREF-E** `미구현목록`    |**현재 개발 Backlog 전용** (P0~P5 우선순위 + 외부의존/보류) + **0-B 진행 로드맵**. 완료이력·상세스펙은 각 문서로 이관됨(2026-08-13)|~382줄 ⚠예산초과|
|**DEVREF-F** `에디터_UI`   |에디터 섹션 ID, DB뷰어 탭, 무기 티어 제한, p.options              |~265줄|
|**DEVREF-G** `전투_상태이상`  |SE 시스템, 스킬 로테이션(2-8), 구역·리젠(2-9), 노점, 화살 소모       |~205줄|

> **2026-08-07 분할**: DEVREF-D가 358줄로 예산 초과 → 전투 계열을 DEVREF-G로 분리.
> D=진행(퀘스트·전직·스킬 습득) / G=전투 루프. 파일명은 참조가 많아 유지.
>
> **2026-08-25 DEVREF-B 분할**: B가 318줄로 예산(300)을 넘겨 **아이템 계열 전량을 DEVREF-H로 분리**.
> B=몬스터·맵·NPC·스킬 / H=아이템. 「임시 몬스터 코호트 판별」은 주제가 몬스터라 B의 몬스터 절로 되돌렸다.
> 파일명은 참조가 많아 유지(D→G 분할과 같은 방식). 아이템 관련 참조는 전부 H로 재조준 완료.
>
> **2026-08-13 DEVREF-E 재편**: "완료+미완료+조사기록"이 뒤섞인 잡동사니 문서에서 **Backlog
> 전용**(P0~P5 + 외부의존/보류)으로 축소. 완료 이력 전량 → `룬미드가츠_개발일지.md`, 퀘스트/
> 스킬 상세표 → DEVREF-D, dropSlots 스키마 → DEVREF-B, ASPD 연동 타이머 배경 → DEVREF-G.
> 항목 ID가 P0-01 형식으로 바뀌었고, 구 ID(1-7, I-2, 2-1① 등)는 각 항목에 "기존 ID"로 보존됨.
> 아래 "자주 헷갈리는 것"·패치 이력의 구 DEVREF-E 코드 언급은 이 대응관계로 읽을 것.

-----

## 작업 유형별 로드 조합

|작업 유형           |필수       |선택             |
|----------------|---------|---------------|
|퀘스트·전직·스킬습득 수정  |A + D    |B (데이터 확인 필요 시)|
|전투 루프·상태이상·구역 수정|A + G    |B (데이터 확인 필요 시)|
|몬스터/맵 데이터 추가     |A + B    |—              |
|아이템 데이터 추가·무게   |A + H    |B (드롭 연동 시)  |
|카드 합성·인벤토리 UI 수정|A + C    |—              |
|에디터·DB뷰어 수정     |A + F    |—              |
|다음 작업 계획 수립     |E        |A              |
|NPC/퀘스트 데이터 추가  |A + B + D|—              |
|새 기능 설계         |A + 관련 파일|E (백로그 확인)     |

-----

## 자주 헷갈리는 것

- **스킬 DB의 `job`은 코드 표기다** (`JOB_MG`·`JOB_WIZ`). 마법 계열 판정은 `MAGIC_JOB_CODES`/`isMagicJobCode()`(block-game, getJobLvCap 옆) 단일 소유로 v9.15에서 수정됨 — 새 코드는 이 헬퍼만 쓸 것, 직접 `includes()` 재구현 금지
- **MVP 판정 기준은 `hp >= 40000`**. 게임 안에 이미 있다(업적 `boss1`). `hasMvp` 40건 중 14건이 일반 몬스터를 가리키던 것을 v9.15~9.15후속에서 9건 교정, 나머지 5건(전부 리뉴얼 이후 3세대 대륙 맵)은 사용자 확정으로 **의도적 미수정** (DEVREF-E P0-03 잔여 참조 — 추측 교정 금지)
- **kRO 몬스터명은 음역이 아니라 의역인 경우가 있다**: Evil Snake Lord → `흑사왕`(黑蛇王). "스네이크"/"뱀" 같은 음역 키워드로만 검색하면 존재하는 몬스터도 못 찾는다 — 못 찾았다고 "DB에 없음"으로 단정하기 전에 원작 monster_db AegisName의 한글 공식 로컬라이징명(의역 포함)을 먼저 확인할 것 (2026-09-13 쿤룬 hasMvp 교정에서 발견)
- **오프라인 사냥은 이제 온라인과 같은 코드다** (2026-09-13, P0-02③④ 완료). `_silentTurn`/`_silentSpawn`은 제거됐고 `runHeadlessTicks()`가 `huntTick()`을 그대로 N틱 호출한다 — 전투·성장 로직을 고치면 오프라인에도 자동 반영되므로 **두 경로를 따로 고치지 말 것**. 손댈 때 볼 함정 3개(가상 시계 / 요약 상태차분 / 사망 후 사냥터 복귀)는 `DEVREF-G`「오프라인 사냥」
- **`G.silentMode`가 켜진 동안 `updateUI`는 완전히 죽지 않는다** — 앞부분 스탯 클램프는 계산 부작용이라 유지되고 DOM만 생략된다. 무음 모드에 새 가드를 넣을 때 이 구분을 지킬 것 (DEVREF-A)
- **iCloud 디하이드레이트 파일은 `git add`에서 조용히 빠진다** (`Invalid argument`). 커밋 후 파일 수 대조 필수 (DEVREF-E 보류-02)

- **세이지 계열 스킬 소속**: 네이팜발칸·소울드레인·매직크래셔·마법력증폭 → `JOB_SGE` (DEVREF-B)
- **parseItem greedy 버그**: 반드시 lazy `+?` + `$` 앵커 사용 (DEVREF-C)
- **compound 아이템 DB 조회**: `parseItem(n)` → `.base` 패턴 (DEVREF-C)
- **스킬 등록**: `= 0` (DEVREF-A 원칙, DEVREF-D doJob 패턴)
- **카드 중복 키 10쌍**: 정리 필요 목록은 DEVREF-C
- **`$()`로 DOM 존재 체크 금지**: 요소가 없어도 더미 Proxy(truthy) 반환 → `if($('id'))`는 항상 참. 존재 체크는 `document.getElementById()` 사용 (2026-07-03 몰래하기 오버레이 무반응 버그 원인)
- **인벤토리 키를 `DB.items[key]`로 직접 조회 금지**: 소켓 표기(`이름 [N]`, 카드 박은 `이름 [N] <카드>`) 붙은 키는 그대로 조회하면 `undefined`. 항상 `parseItem(key)`를 먼저 거쳐 `.base`를 쓸 것 — `equipItem()`이 표준 패턴. 2026-09-20 P1-03(드롭 슬롯 표기)에서 이 패턴 누락 8곳(상점 판매·노점·창고·무게계산·쉴드스킬 2종) 발견해 교정 (DEVREF-H)
- **명중률 공식**: `80 + (HIT - FLEE)`, 5~95% 클램프 (원작 Pre-RE 동일). 플레이어→몬스터는 `t.flee`, 몬스터→플레이어는 `m.hit`(또는 `t.hit`) 직접 사용 — 레벨 근사치로 대체하는 코드가 남아있으면 버그 (2026-07-10 DEVREF-E 1-3에서 실전투+시뮬레이터+오프라인 틱 총 6곳 수정)
- **같은 로직 복붙이 이 프로젝트의 1번 사고 원인**: 레벨업 6곳·드롭 5곳·settings 3곳 전부 방어 수준이 달라 버그가 오래 살아남았다. v9.11에서 `gainBaseExp`/`rollDrops`/`ensureSettings`로 통합 — **새 경로를 만들 때 직접 구현하지 말 것** (DEVREF-A 공용 함수)
- **드롭명은 반드시 `db-items` 실재 키**: 오타는 예외 없이 조용한 드롭 실패로 나타난다. `window.__dropWarn=true`로 콘솔 경고 켜기 (DEVREF-H)
- **신규 아이템엔 `weight` 필수**: 없으면 무게 시스템이 그 아이템만 0으로 계산. 값 모르면 1 + `weightSrc:"stub"` (DEVREF-H)
- **`job3_*.reqJob`은 거짓 표기**: `위저드`라 적혀 있어도 실제 진입은 `마법사 하이`. `TRANS2ND_ENTRY_JOB` 환산 필수 (DEVREF-D)
- **1차→2차 조건은 40**: `db-job-advance`의 50은 안 쓰이는 값 (DEVREF-D)
- **브라우저 캐시**: `?v=` 를 바꿔도 구버전이 서빙될 수 있다. 검증 전 **신규 심볼 `typeof` 확인 선행** — 2026-08-07에 두 번 물려 20분 낭비
- **게임 html은 CRLF + BOM**: 스크립트로 앵커 치환 패치할 때 LF 앵커로 짜면 **조용히 0매치**. 읽기 `newline=None`으로 정규화 → 치환 → `utf-8-sig` + CRLF로 되쓰기. 앵커 개수 == 1 검증 필수 ([[CORE_DEVREF-B]] #63)
- **무게 UI 소유자는 `updateUI()`** — `renderChar`가 아니다. 게다가 `renderChar`는 파일 맨 끝에서 래퍼로 재할당되므로 `renderChar.toString()`으로 조회하면 원본 본문이 안 보인다. 패치 반영 확인은 **줄번호로 감싸는 함수를 먼저 확정한 뒤** 그 함수를 조회할 것
- **db-items/db-monsters JSON 서식 보존**: 사람이 직접 편집하는 파일. 스크립트로 재작성할 땐 items=`indent=2`, monsters=몬스터당 1줄 유지
- **번역 파이프라인 중복 아이템 의심**: 드롭테이블 이름과 실제 기능 아이템 이름이 "영문 음역 vs 순우리말"(엘루니움/에르늄, 블루포션/파란포션)이나 "자모 하나 차이"(오리데콘/오리데오콘)로 갈라진 사례가 v9.11~v9.12에서 총 9건 나옴. 새 스텁을 채우기 전엔 **공백 제거·색상 음역↔순우리말 치환한 이름으로 기존 비-스텁 아이템 존재 여부 먼저 확인** — 있으면 새로 채우지 말고 병합(DEVREF-E I-2, DEVREF-H)

-----

## 패치 이력 — v9.16 후속 (2026-09-13) P1-07 세이브 스키마 · P1-08 게이트 재설계 · P4-03 데이터 추출+빌드

- **P4-03**: `source/template.html`(14,753줄) + `source/data/*.json`(monsters/maps/npcs 항목당
  1줄, items는 `indent=2`) + `build.py` 신설. `룬미드가츠_v9.16.html`은 이제 빌드 산출물 — **직접
  편집 금지**. 원본/재조립본 데이터 딥 비교 전부 일치 확인. **2026-09-13 이전 줄번호 인용은 전부
  무효**(db-items 인라인 32,327줄 → 마커 1줄로 뒤 코드가 크게 당겨짐)
- **P1-07**: `migrateSave`/`normalizeSave`/`validateSave`/`loadPlayerData` 신설. `loadCharacter`·
  `importGame` 단일 경로로 통합, `p.saveVersion` 신설(현재 1)
- **P1-08 게이트④⑤ 재설계**: 둘 다 실제 캐릭터로 돌려보고서야 비교 대상이 잘못됐다는 게 드러남
  (④는 사망복구 스캐폴딩 누락, ⑤는 raw 상태와 1회 통과분을 비교) — 새 게이트는 반드시 정상
  케이스로 PASS를 실측한 뒤 커밋할 것
- 상세는 개발일지 v9.16 섹션, DEVREF-A/E 참조

## 패치 이력 — v9.16 (2026-09-13) P0-02③④ 오프라인 통합 · P0-03 9/14 · P1-08 검증 게이트

> 사용자 지시("P1-08기다리자")로 P0-02③④(별도 Opus 세션, `8618f50`→`dfc90eb`→`6af52d6`)·P0-03
> 추가 2건(`93a5de1`·`4cd8b47`)·P1-08(`634ce01`)을 v9.15.html에 순차 반영 후 한 번에 v9.16으로 승격.
> 구v9.15는 `versions/`에 스냅샷.

- **P1-08 검증 게이트**: `await runValidationGate()` 콘솔 함수, 5종(참조무결성/의미검사/job cap 단일소유/
  온오프라인 동일성/세이브 round-trip) 전부 PASS. 상세는 DEVREF-A「검증 도구」·DEVREF-E「P1-08」
- **P0-03 9/14**: 로컬 DB(`데이터베이스\몬스터_MVP.csv`) 대조로 2건 추가 교정 — 생체연구소4층→
  로드나이트 세이렌, 쿤룬(곤륜)→흑사왕(kRO 의역명이라 음역 검색으로 못 찾았던 사례)

- **P0-02③**: `_silentSpawn()`·`_silentTurn()`(오프라인 전용 축약 전투식) 제거.
  `runHeadlessTicks(n, tickMs, summary, huntMap)`가 온라인 진입점 `huntTick()`을 그대로 N틱 호출
- **P0-02④**: 플레이어→몬스터 명중판정·사망 패널티가 온라인 코드에서 그대로 적용됨(별도 구현 없음)
- **무음 모드**: `G.silentMode`/`G.silentSummary`/`G.silentDead`. 끄는 대상은 DOM·타이머뿐
  (`updateUI`는 스탯 클램프 유지). 가상 시계로 자연회복·포션 쿨타임 시간축 보정
- 검증: 시드 고정 PRNG로 **온라인 N틱 vs 오프라인 N틱 게임상태 전체 JSON 차분 = 0**
  (6시나리오 + 시드 5종). 명중률 실측 82.3%/기대 84%(n=1398). 사망 EXP 손실 6/6 공식일치.
  30,000틱 570ms. 상세 수치는 DEVREF-E §9, 구조·함정은 DEVREF-G「오프라인 사냥」

## 패치 이력 — v9.15 (2026-09-12) P0 3건 (마법판정 · 오프라인정렬①② · hasMvp 7/14)

- **P0-01**: `skObj.job.includes('마법사'...)`가 코드표기(`JOB_MG` 등)라 항상 false였던 마법 판정을
  `MAGIC_JOB_CODES`(JOB_MG/WIZ/HWZ/SGE/PRF)+`isMagicJobCode()` 단일 소유로 교체(getJobLvCap 옆 신설)
- **P0-02 ①②**: 오프라인 job cap 하드코딩 → `getJobLvCap()`, 탭 숨김 시 `huntTimer` 즉시 정지로
  이중 틱 제거(③④ 전투식 자체 통합은 이월, DEVREF-E 참조)
- **P0-03**: `hasMvp` 오류 14건 중 원작 Pre-RE MVP 확인 + DB 실재 확인된 7건 교정(아울바론·키엘-D-01·
  아트로스·크툴라눅스·이프리트·RSX-0806·고피니치), 잔여 7건은 근거 불충분으로 미수정·보고
- 검증: http 서버 로드 → 콘솔 에러 0, 전 `<script>` `node --check` 통과, 실호출 검증(processTurn·
  spawnMonsters·visibilitychange 이벤트 스파이) 3건 모두 통과
- 상세는 개발일지 v9.15 섹션, DEVREF-E §1/§9

## 패치 이력 — v9.14 (2026-08-25) 무게 구간별 패널티 (P2-02)

- **무게 패널티 3구간화**: 50% 초과 HP/SP 자연회복 정지 · 70% 초과 자동 전투스킬 불가(평타만, 수동 시전은 허용) · 90% 초과 ASPD ×1.3(기존). 임계값은 `calcStats()`가 단독 소유하고 `weightNoRegen`/`weightNoAutoSkill` 플래그로 노출 — 소비처(`procNaturalRegen`·`pickPlayerSkill`)는 플래그만 읽는다. 구간표는 `DEVREF-H 아이템DB.md`「weight / weightSrc」
- **`updateUI()` 무게 표시**: 색 구간을 50/70/90에 맞추고 `⚠N%` 뱃지 + `title` 툴팁으로 현재 패널티 나열 (기존 50/90 2구간이라 70~90에서 자동스킬이 멎은 이유가 화면에 안 보였음)
- 함정: **무게 UI 소유자는 `renderChar`가 아니라 `updateUI()`** (게다가 `renderChar`는 파일 끝에서 래퍼로 재할당됨 → `toString()` 조회가 원본을 못 본다). 그리고 **이 html은 CRLF + BOM** — 패치 스크립트 앵커를 LF로 짜면 전부 0매치
- 검증: http 서버 로드 → 콘솔 에러 0, 전 `<script>` `node --check` 통과, 두 게이트 실호출 검증(과적재 시 무회복·`null` 반환·쿨다운은 정상 차감). 상세는 개발일지 2026-08-25 섹션

## 패치 이력 — v9.13 (2026-08-12) 기술 부채 청소 (DEVREF-E 4순위)

- **死코드·중복·디버그잔재 6종 제거** (기능 무변경): `tickStatusEffects()`(호출0회, SE차감은 processTurn nSe루프 담당) · `flash()` no-op 함수+호출부 · `window.onerror` 중복정의 앞엣것(죽음) · `console.log` 디버그 14줄(`new Error().stack` 덤프 등) · BUFF_DEFS `safety`"(구형)" 유령키(safetyWall로 대체) · 프리셋 `wType:"검"`→`"한손검"`
- **calcStats 2a**: 전직추천 툴팁 `reasons` 객체가 `calcStats()` 12회 호출(실사용 1개) → `let cs=calcStats()` 1회 hoist. 2b(턴스코프 캐시)는 **비순수함수 위험**(calcStats가 `p.weaponType`/`weaponElement` 변이)라 미착수, processTurn 700줄 리팩토링과 묶어 대기
- 검증: 정적 http 서버 로드 → JS 무에러(주요함수 `typeof function`, 삭제심볼 `undefined`), onerror 1개, console.log 0. 함정: file:// 브라우저 차단 → `python -m http.server` 우회(단일 HTML 검증 표준)
- 잔여 4순위: processTurn 700줄 헬퍼분리(D) · calcStats 2b · 장비 diff 양손무기 방패 · 아이폰 QuickLook. 상세 DEVREF-E

## 패치 이력 — v9.12 (2026-08-11) 스텁 아이템 실데이터화 (드롭 상위 150종) + 번역 중복 통합

- **번역 파이프라인 중복 8건 통합**: `엘루니움`/`엘누니움`→`에르늄`, `엘루니움 스톤`→`에르늄원석`, `오리데콘`→`오리데오콘`, `낡은 카드앨범`→`낡은 카드첩`, `블루 포션`→`파란포션`, `화이트/블루/그린 허브`→`하얀/파란/초록허브`, `불의 화살`→`불화살`. 전부 "번역 파이프라인이 만든 이름 다른 복제품이 기존 구현 아이템과 따로 놀던" v9.11 패턴과 동일 — 이름만 다르고 실제로는 같은 아이템이라 병합(드롭테이블 키 치환 + 스텁 정의 삭제), 신규 생성 아님
- **스텁 528종 중 드롭 빈도 상위 150종 실데이터화**: rAthena Pre-Renewal `item_db`(공식 원작 수치 소스)를 KR↔AegisName 매핑으로 대조해 143종에 실제 `buy`/`sell`/`weight` 주입. `weightSrc` 신규값 `"official"` 추가 (rAthena 원작 데이터 출처, `csv`/`type`/`stub`과 구분). 스텁 528→**376**, 스텁이 차지하던 드롭 물량 비중 71.7%→**12.8%**
- **원작 Type=Healing 소모품 11종 실제 효과 연동**: 빨간허브·옐로허브·고기·사탕·캔디스트라이퍼·꿀·마스텔라의열매·딸기·위그드라실의열매·위그드라실의씨앗·몬스터사료 — `잡템`→`소모품`, rAthena 원작 스크립트(`itemheal`/`percentheal`) 수치 그대로 `heal`/`spHeal`/`effect` 필드 주입. `useItem()`에 `effect:'half'` 신규 분기 추가(`'full'` 로직 그대로 복사, 배율만 0.5 — 위그드라실의 씨앗 전용, 원작이 퍼센트 회복인데 엔진엔 100%만 있었음)
- 잔여: 스텁 376종(드롭테이블 미등장분 포함), `weightSrc:"stub"` 725종(이 중 349종은 이름 정상·무게만 미상 — I-3 별도 항목). 상세는 DEVREF-E I-2

## 패치 이력 — v9.11 (2026-08-07) 스탯 원작화 · 전승 · 전직트리 · 드롭/무게

- **스탯 누진 비용**: 비용 `floor((n-1)/10)+2`, 지급 `floor(lv/5)+3`, 초기 48 / 전승 100, 상한 99. 세이브는 `statSystemV2` 플래그로 1회 전액 리셋+환급
- **전승 퀘스트**: 원작 3단계 체인 + 자격 4종 + 추방. `p.rebirth` 불리언 1회 한정, HP/SP +25% (DEVREF-D)
- **전직 트리맵**: 상단바 `🌳 전직트리`. 40직업 전체 + 계열 탭 + SVG 연결선 + 상세 패널
- **드롭·무게 복구**: 번역 파이프라인 불일치로 드롭 65%가 유령이던 문제. 별칭 247 + 신규장비 101 + 스텁 528 → **유령 0**, **드롭 장비 57→286종**. 무게 2,745종 주입 (DEVREF-B)
- **결함 A~L 12종** 동시 수정 — 특히 `advanceJobQuestStep` 미정의로 전직퀘 전반이 파손 상태였고, job3 13종은 전승해도 도달 불가였음
- 잔여 과제는 DEVREF-E **I-1~I-6** (드롭확률·스텁 528·무게 877·무게밸런스·몬스터매칭 174·dropSlots)

## 패치 이력 — v9.03 (2026-07-10) 명중 공식 flee/hit 버그 수정 (DEVREF-E 1-3)

- 플레이어→몬스터 명중식이 `t.flee`를 무시하고 `t.lv` 근사치를 쓰던 버그 수정 (실전투 + 전투 시뮬레이터 3곳)
- 부가 발견: 몬스터→플레이어 명중식도 `m.hit` 대신 레벨 근사치 사용 중 → 같이 수정 (실전투 + 시뮬레이터 + 오프라인 틱 3곳)
- 상세는 룬미드가츠_개발일지 2026-07-10 참조 (구 DEVREF-E 완료 항목 1-3, 2026-08-13 개발일지로 이관)

## 버전 업데이트 워크플로우 (2026-07-10 도입)

사용자가 명시적으로 요청할 때만 실행("버전 올려줘" 등). 규칙: 소버전 +0.01(v9.03→v9.04, 하루=버전 1개).
셸 가능하면 `cp`로 새 버전 파일 생성 + 구버전은 `versions/`로 이동. 셸 불가하면 새 파일명만 안내하고 사용자가 직접 복사(대용량 html Read+Write 금지 — 토큰 낭비).
이후 개발일지 새 버전 섹션 추가 + DEVREF 갱신 + CLAUDE.md 현재 파일명 갱신. 상세 절차는 CLAUDE.md 참조.

## 설계 문서

- **`설계_월드맵_동서남북_3-13.md`** — 월드맵 방향 이동 + 필드 분할 설계 (v9.07에서 구현 완료, 상세는 룬미드가츠_개발일지 2026-07-25 v9.07 섹션)

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

- **[2-8] 자동 스킬 = 핫바 등록 스킬만**: 공격·힐·버프·fallback 전부 `hotbarSkillSet` 필터. 핫바 스킬 0개면 평타만 (DEVREF-G)
- **[2-9] 구역 시스템**: `getZones()` 범용 자동 생성 (맵별 데이터 없음). `G.zoneIdx/zoneKills/nextSpawnAt`, 사용 전 `ensureZoneState()` 필수 (DEVREF-G)
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