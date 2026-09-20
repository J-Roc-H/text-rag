# DEVREF-A — 파일 구조 · 코드 체계

> 로드 조건: **항상** (모든 작업 세션에 포함)
> 최종 검증: 2026-09-13 | 대상 코드: `source/template.html` + `source/data/*.json` (P4-03, build.py로 조립)
> ⚠ **P4-03(데이터 추출)·P4-01(processTurn 정리) 이후 줄번호로 전면 재확인·갱신 완료(2026-09-13).**
> db-items가 template.html에서 32,327줄짜리 인라인 블록 → 1줄짜리 마커로 바뀌면서 그 뒤 모든 코드의
> 줄번호가 크게 당겨졌었다. 이 문서와 DEVREF-E의 활성 인용은 전수 재확인됐다(DEVREF-B/C/D/F/G/H는
> 애초에 줄번호가 아니라 함수명으로 서술돼 있어 해당 없음). **이후 구조를 다시 바꾸는 작업(특히
> template.html 앞부분에 코드를 끼워넣는 경우)을 하면 이 문서 줄번호도 또 밀린다** — 새 작업 전엔
> 반드시 `grep`/`Select-String`으로 재확인할 것("패치 반영 확인 시 줄번호로 감싸는 함수를 먼저
> 확정"원칙의 연장).

-----

## 파일 구조 (P4-03, 2026-09-13 — 데이터 추출 + 빌드)

**편집 대상과 배포 산출물이 분리됐다.** 47,782줄 단일 HTML을 직접 고치던 방식에서,
데이터 4종을 외부 JSON으로 뽑고 빌드로 재조립하는 방식으로 바뀌었다. **이제 절대
`룬미드가츠_v9.16.html`을 직접 고치지 않는다** — 다음 빌드 때 조용히 덮어써 사라진다.

```
source/template.html        ← 편집 대상 (JS 로직 + HTML/CSS + 작은 db-* 블록, ~14,753줄)
source/data/db-monsters.json ← 편집 대상 (몬스터 DB, 항목당 1줄, 492줄/490종)
source/data/db-maps.json     ← 편집 대상 (맵 DB, 항목당 1줄, 97줄/95개)
source/data/db-npcs.json     ← 편집 대상 (NPC DB, 항목당 1줄, 95줄/93개)
source/data/db-items.json    ← 편집 대상 (아이템 DB, indent=2 사람이 읽기 편한 포맷, 2,876종)
build.py                     ← 위 5개를 합쳐 최종 HTML을 재생성
룬미드가츠_v9.16.html         ← 배포/실행용 산출물 (build.py 실행 결과, 직접 편집 금지)
```

**작업 순서**: ① `source/template.html`(로직·UI) 또는 `source/data/*.json`(데이터) 수정
② `python build.py` 실행 → `룬미드가츠_v9.16.html` 재생성(임시파일+원자적 교체로 안전)
③ 평소처럼 `python -m http.server`로 그 결과를 로드해 검증.

**왜 file:// 배포인데 외부 JSON을 또 인라인하는가**: 외부 JSON은 `fetch()`가
`file://`에서 CORS로 막힌다(DEVREF-E 보류-01). "파일 열면 실행"이 유일한 배포 방식이라
배포본은 반드시 데이터가 인라인된 단일 HTML이어야 한다 — `source/`는 개발자용 원본,
루트의 `.html`은 사용자에게 주는 완성품이다.

**서식은 각 데이터 파일이 단독 소유**: monsters/maps/npcs는 항목당 1줄(grep·diff에
유리), items만 `json.dumps(indent=2)`(사람이 자주 수기 편집하므로 가독성 우선). build.py는
포맷을 바꾸지 않고 파일 내용을 그대로 삽입만 한다 — 재포맷은 각 json 파일을 저장할 때
알아서 하면 된다(파이썬 `json.dump` 등).

**추출 과정에서 확인된 부수효과**: db-items에 존재하던 중복 최상위 키(문자열 레벨
집계로 대략 137건 후보, 실제 순수 중복은 이보다 적음 — 정밀 집계 안 함)가 `json.loads`
단계에서 마지막 값만 남고 조용히 사라졌다. **이건 데이터 손실이 아니다** — 브라우저의
`JSON.parse`도 중복 키에 대해 똑같이 마지막 값만 채택하므로, 실제 게임 동작은 이전과
동일하다(죽은 중복 텍스트만 사라짐). DEVREF-C의 "카드 중복 키 10쌍" 정리 항목과 연관 —
전수 정리는 이번 스코프 밖.

### 구 HTML 내부 블록 순서 (참고 — 지금은 `source/template.html` 안에 있음)

1. `<style>` — CSS
1. `<script id="db-monsters">`·`db-maps`·`db-npcs`·`db-items"` — 이제 `{{__DATA_XXX__}}` 마커, build.py가 채움
1. `<script id="db-skill-code">` — SK 코드 ↔ 스킬명 (JSON, 작아서 인라인 유지)
1. `<script id="db-job-init">` — 직업별 초기 스킬 (JSON, 작아서 인라인 유지)
1. `<script id="block-skills-db">` — `const DB_SKILLS` (JS)
1. HTML 뼈대 (lobby, app, modal 등)
1. `<script id="block-engine-logic">` — 게임 로직 전체

### 블록별 수정 빈도

|블록                  |수정 시점           |어디서|
|--------------------|----------------|---|
|`source/data/*.json`| 몬스터·맵·NPC·아이템 데이터 추가/수정 시 | 해당 json 파일 |
|`block-skills-db`   |스킬 추가 시         | `source/template.html` |
|`block-engine-logic`|로직/UI/게임 기능 추가 시| `source/template.html` |

-----

## 직업 코드 (JOB_XXX)

|코드     |직업   |코드      |직업    |
|-------|-----|--------|------|
|JOB_NOV|노비스  |JOB_HNOV|노비스 하이|
|JOB_SWD|소드맨  |JOB_HSWD|소드맨 하이|
|JOB_MG |마법사  |JOB_HMG |마법사 하이|
|JOB_ARC|궁수   |JOB_HARC|궁수 하이 |
|JOB_ACO|복사   |JOB_HACO|복사 하이 |
|JOB_THF|도둑   |JOB_HTHF|도둑 하이 |
|JOB_MER|상인   |JOB_HMER|상인 하이 |
|JOB_KNT|기사   |JOB_LKN |로드나이트 |
|JOB_CRU|크루세이더|JOB_PAL |팔라딘   |
|JOB_WIZ|위저드  |JOB_HWZ |하이위저드 |
|JOB_SGE|세이지  |JOB_PRF |프로페서  |
|JOB_HNT|헌터   |JOB_SNP |스나이퍼  |
|JOB_BRD|바드   |JOB_MIN |클로운  |
|JOB_DNC|댄서   |JOB_GYP |집시    |
|JOB_PRI|프리스트 |JOB_HPR |하이프리스트|
|JOB_MNK|몽크   |JOB_CHP |챔피언   |
|JOB_ASN|어쌔신  |JOB_SIN |어쌔신크로스|
|JOB_ROG|로그   |JOB_STK |스토커   |
|JOB_BSM|블랙스미스|JOB_WHS |화이트스미스|
|JOB_ALC|알케미스트|JOB_CRT |크리에이터 |

### 직업 계열별 코드 매핑

|계열 |1차     |2차-1   |2차-2       |전승-1   |전승-2       |
|---|-------|-------|-----------|-------|-----------|
|소드맨|JOB_SWD|JOB_KNT|JOB_CRU    |JOB_LKN|JOB_PAL    |
|마법사|JOB_MG |JOB_WIZ|JOB_SGE    |JOB_HWZ|JOB_PRF    |
|궁수 |JOB_ARC|JOB_HNT|JOB_BRD/DNC|JOB_SNP|JOB_MIN/GYP|
|복사 |JOB_ACO|JOB_PRI|JOB_MNK    |JOB_HPR|JOB_CHP    |
|도둑 |JOB_THF|JOB_ASN|JOB_ROG    |JOB_SIN|JOB_STK    |
|상인 |JOB_MER|JOB_BSM|JOB_ALC    |JOB_WHS|JOB_CRT    |

-----

## SK 코드 범위

|범위             |직업     |
|---------------|-------|
|SK_0001~SK_0003|노비스    |
|SK_1001~SK_1010|소드맨    |
|SK_1101~SK_1111|기사     |
|SK_1201~SK_1212|크루세이더  |
|SK_2001~SK_2014|마법사    |
|SK_2101~SK_2112|위저드    |
|SK_2201~SK_2222|세이지    |
|SK_2301~SK_2302|프로페서 전용|
|SK_3001~SK_3007|궁수     |
|SK_3101~SK_3119|헌터     |
|SK_3201~SK_3220|바드     |
|SK_3301~SK_3309|댄서     |
|SK_4001~SK_4013|복사     |
|SK_4101~SK_4118|프리스트   |
|SK_4201~SK_4217|몽크     |
|SK_5001~SK_5010|도둑     |
|SK_5101~SK_5113|어쌔신    |
|SK_5201~SK_5213|로그     |
|SK_6001~SK_6010|상인     |
|SK_6101~SK_6123|블랙스미스  |
|SK_6201~SK_6216|알케미스트  |

-----

## 핵심 함수 / 전역 변수

- `normalizeJob(name)` — 어떤 직업명이든 정규명으로 통일
- `JOB_NAME2CODE[직업명]` — 직업명 → JOB_XXX
- `DB.jobCode[JOB_XXX]` — JOB_XXX → 직업명
- `DB.jobInitSkills[JOB_XXX]` — 전직 시 지급할 SK_XXXX 배열
- `DB.skillCode[SK_XXXX]` — SK_XXXX → 스킬명
- `DB.jobAdvance[JOB_XXX]` — 전직 경로 `{reqJobLv, next[]}`
- `G` — 현재 게임 세션 (player, currentMap, battles, autoHunt 등)
- `DB` — 모든 데이터 (loadDB()로 초기화)

### 공용 함수 (v9.11 — 복붙 방지용. 새 경로를 만들 때 반드시 이걸 쓸 것)

같은 로직이 여러 벌 복붙돼 방어 수준이 갈리는 것이 이 프로젝트의 반복 사고 원인이었다.
아래 함수를 **우회해서 직접 구현하지 말 것.**

| 함수 | 대체한 복붙 | 용도 |
|---|---|---|
| `gainBaseExp(p, amount, silent)` | 레벨업 while 루프 **6곳** | 경험치 획득 + 베이스 레벨업. `silent`=오프라인 시뮬(로그·HP회복 억제) |
| `rollDrops(p, mon, opts)` | 드롭 처리 **5곳** | 드롭 굴림. **미등록 아이템 자동 차단**. `opts={silent, summary}` |
| `ensureSettings(p)` | `p.settings` 초기화 **3곳** | 누락 키 보강. `spawnMonsters` 가 덮어써 dropRate 소실되던 버그 방지 |
| `statCost(cur)` / `levelStatPoints(lv)` / `totalStatPointsAt(lv, isRebirth)` | — | 원작 누진 스탯 공식 |
| `performRebirth()` / `checkRebirthEligibility(p)` | — | 전승 실행 / 자격 판정(부작용 없음, 표시용 안전) |
| `resolveJobQuestTarget(q, p)` | — | 전승 여부로 `소드맨`/`소드맨 하이` 분기 |
| `goToNextJobQuestStep()` / `advanceJobQuestStep()` | — | 전직 퀘스트 스텝 전진 |
| `getJobLvCap(job)` | job cap 하드코딩 **2곳** | 잡레벨 상한(노비스 10/전승2차 70/나머지 50). `source/template.html` `4706`행(P4-03 이후 줄번호) |
| `isMagicJobCode(code)` / `MAGIC_JOB_CODES`(v9.15) | `skObj.job.includes('마법사'...)` 오판정 **2곳** | 마법 계열 job 판정. `getJobLvCap` 옆 신설, `JOB_MG/WIZ/HWZ/SGE/PRF` |
| `runHeadlessTicks(n, tickMs, summary, huntMap)`(2026-09-13) | `_silentSpawn()`+`_silentTurn()` — 오프라인용으로 **재구현된 축약 전투식 한 벌** | 오프라인 사냥. 온라인 진입점 `huntTick()`을 그대로 N틱 호출. `G.silentMode`로 DOM·타이머만 끈다 (P0-02③④) |
| `awardKillReward(p, mon, set)`(2026-09-13, processTurn 앞) | 스킬킬·평타킬 처치보상 복붙 **2곳** | 킬카운트·EXP·잡레벨업·제니·드롭·퀘스트훅 일괄 처리. AOE 사망 경로는 레벨업 타이밍이 달라 의도적으로 미포함(P4-01) |
| `_endTurnIfBattlesEmpty()`(2026-09-13, processTurn 앞) | `if(!G.battles.length){updateUI();...return;}` 복붙 **3곳** | "몬스터 전멸 → 이번 턴 종료" 가드. `return` 자체는 유지, 가드 로직만 통합(P4-01) |
| `loadPlayerData(rawData)` = `validateSave→migrateSave→normalizeSave`(2026-09-13) | `loadCharacter`/`importGame` 마이그레이션 중복 **2곳** | 세이브 로드 단일 경로 (P1-07). `p.saveVersion` 신설(현재 1) |

### 전투 엔진 핵심 함수 (함정 주의)

- **`calcStats()` 는 순수 함수가 아니다** — 반환값(파생 스탯) 외에 매 호출 시 `p.weaponType`·`p.weaponElement`
  를 장착 무기에서 재설정하는 **부수효과**가 있다. 무기속성 프리뷰가 이 부수효과+"원복 재호출"에 의존.
  → **전역 메모이즈/캐싱 금지**(stale 스탯 = 은닉버그). 같은 스코프 중복 호출만 hoist로 정리 가능(v9.13 2a).
  **(2026-09-13, P4-02 조사 결론) 턴당 6회+ 중복호출의 전역 캐싱은 착수하지 않기로 확정** — ①
  `updateUI()` 안의 진짜 2a 누락분(3940행 `s`를 재계산만 하던 4011행 `s2`) 하나는 재사용 상태변화가
  전혀 없어 안전하게 통합함. ② 반면 `procPlayerStatusTick`·`scheduleTickAspd`의 계산은 처음 볼 때
  단순 중복처럼 보이지만, 각각 그 시점까지 벌어진 **진짜 상태 변화**(스킬로 건 버프, 몬스터가
  건 상태이상, 속도 버프 등)를 반영해야 해서 캐시를 공유하면 안 된다 — 다시 계산해야 맞는
  경우다. ③ 이걸 전역 dirty-flag 방식으로 안전하게 하려면 calcStats(530줄)가 읽는 모든 상태
  변경 지점(장비·버프·스탯 포인트·레벨업·무게 등, 14,753줄 전체에 흩어져 있음)에 무효화 훅을
  **빠짐없이** 심어야 하는데, 하나라도 놓치면 "화면엔 안 뜨고 조용히 틀린 계산만 나오는" 최악의
  버그 유형이 된다. ④ 이미 측정된 실측 성능(30,000틱 570ms, P0-02③④ 검증)을 볼 때 calcStats
  중복호출은 애초에 병목이 아니었다 — **위험 대비 효용이 없는 최적화라 하지 않는 것이 맞는
  판단**. 전역 캐싱을 다시 검토하려면 calcStats 자체를 먼저 의존성 명세가 있는 순수 함수로
  재설계(부수효과 제거)하는 게 선행돼야 함.
- **`processTurn()` 분해 현황 (2026-09-13, P4-01 완료)** — 원래 752줄, 지금(`source/template.html`)
  4869~5522행(654줄). 추출 완료: `procAutoBerserk`·`procNaturalRegen`·`procAggressiveSpawn`·
  `procResummonSlaves`·`procPlayerStatusTick`(최상위), `runMonsterTurn(p,s)`·`pickPlayerSkill(p,s)`
  (processTurn 내 중첩, 경계-2편집 [[CORE_DEVREF]] #54), `_endTurnIfBattlesEmpty()`·`awardKillReward(p,mon,set)`
  (processTurn 앞, P4-01 신설). **함수 중간 `return` 3곳은 없애지 않았다** — signal값 전환이 필요했던
  이유(오프라인 헤드리스 호출)는 P0-02③④가 `G.silentMode`로 이미 우회 해결했다. 대신 그 3곳 중
  실제로 복붙이던 것만 정리: `_endTurnIfBattlesEmpty()`가 "몬스터 전멸 → 이번 턴 종료" 가드 3곳을,
  `awardKillReward()`가 스킬 단일킬·평타킬의 처치보상(킬카운트·EXP·잡레벨업·제니·드롭·퀘스트훅)
  2곳을 통합했다. **AOE 사망 경로는 의도적으로 안 건드림** — baseExp를 누적한 뒤 루프 끝에서 한 번만
  레벨업 반영하는 별개 방식이라, `awardKillReward`(매 킬 즉시 레벨업)로 합치면 레벨업 타이밍이
  달라진다. 검증: 시드 고정 PRNG로 리팩토링 전/후 빌드를 같은 시나리오(스킬킬·평타킬 각각)로
  돌려 최종 상태(킬수·EXP·잡레벨·제니·인벤토리) 완전 일치 확인. SE 실제 턴차감은
  `procPlayerStatusTick`의 `nSe` 재구성 루프(카운트있음/없음 2분기)가 담당 — 별도 차감 코드
  추가 금지(이중차감).
- **`processTurn()` 무음(헤드리스) 모드 (2026-09-13, P0-02③④)** — `G.silentMode`가 true면 DOM·타이머
  부작용만 끄고 계산은 그대로 돈다. 오프라인 사냥이 이 모드로 온라인 엔진을 재사용한다.
  **`updateUI`는 앞부분 스탯 클램프(`p.maxHp/maxSp` 재설정 + `hp/sp` 클램프)가 계산 부작용이라 유지**하고
  그 뒤만 생략한다 — 전부 건너뛰면 온라인과 상태가 갈라진다. 상세·함정은 `DEVREF-G`「오프라인 사냥」.

> P4-01·P4-02 모두 완료(2026-09-13) → 개발일지 v9.16 섹션 참조. 관련 잔여 백로그 없음(계속 미룰
> 항목은 "선행조건: calcStats 재설계"로 위에 명시)

-----

## 플레이어 오브젝트 (p) 주요 필드

```javascript
p = {
  name, job, baseLv, jobLv,
  baseExp, jobExp,
  hp, maxHp, sp, maxSp,
  str, agi, vit, int, dex, luk,
  statPoints, skillPoints, zeny,
  inventory: { "아이템명": 수량 },
  equip: { "슬롯명": "아이템명" },
  refineLevel: { "아이템명": 강화수치 },
  skills: { "스킬명": 레벨 },  // 0=미투자(표시됨), 1+=투자됨
  quests: { "퀘스트ID": { state, count } },
  unlockedMaps: { "맵명": true },
  cardCodex: { "카드명": true },
  killCount: { "몬스터명": 수 },
  statusEffects: {},
  savedMap: "귀환 지점"
}
```

-----

## 검증 도구 (2026-09-13, P1-08)

- `await runValidationGate()` — 콘솔 전용 회귀 게이트 5종(참조무결성·hasMvp 의미검사·job cap 단일소유·
  runHeadlessTicks 결정성·loadPlayerData 멱등성). 구조 리팩토링(P4-01·P4-03·코드 6분할) 착수 전 반드시 실행.
  상세는 `DEVREF-E`「P1-08」완료 이력 + 개발일지 v9.16 섹션
- **게이트 ④⑤는 "비교 대상"을 잘못 잡으면 실행 없이도 그럴듯해 보인다** — 실제로 두 번 잘못
  설계해서 거짓 FAIL을 냈다(온라인 맨 루프엔 사망복구 스캐폴딩이 없었고, round-trip은 raw 상태와
  1회 통과분을 비교했다). **새 게이트는 정상 케이스로 먼저 돌려 PASS를 실측하기 전엔 커밋하지 말 것**

## 코드 작업 원칙

- **`룬미드가츠_v9.16.html`을 직접 편집 금지 (2026-09-13, P4-03)** — 이건 이제 `build.py`가 만드는
  산출물이다. 편집은 `source/template.html`(로직) 또는 `source/data/*.json`(데이터)에서 하고,
  `python build.py`로 재생성한 뒤 그 결과로 검증한다. 산출물을 직접 고치면 다음 빌드 때 조용히
  사라진다
- **직업명 하드코딩 금지** — 반드시 JOB_XXX 코드 또는 normalizeJob() 경유
- **스킬 지급 하드코딩 금지** — 반드시 DB.jobInitSkills[코드] 사용
- **타겟 패치 방식 선호** — 대규모 재작성 금지, 요청 부분 외 수정 금지
- **스킬 등록**: `p.skills[name] = 0` (0레벨 등록 후 upgradeSkill 유도). `= 1` 직접 지급은 선행 우회이므로 퀘스트 보상 등 예외만 허용
- **스킬 체크**: `!(sname in p.skills)` 사용. `!p.skills[sname]`은 0과 undefined 동일 처리라 오류 발생
- **레거시 세이브 null 체크**: 새 하위 객체(`unlockedMaps` 등)는 반드시 `if (!p.unlockedMaps) p.unlockedMaps = {};` 패턴 사용
- `closeModal()`이 서비스 모달 열기 직후 호출되는 패턴 주의