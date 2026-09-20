# DEVREF-A — 파일 구조 · 코드 체계

> 로드 조건: **항상** (모든 작업 세션에 포함)

-----

## 파일 구조

```
룬미드가츠_v8.html   ← 단일 파일 (DB + 로직 + UI 전부 포함)
```

### HTML 내부 블록 순서

1. `<style>` — CSS
1. `<script id="db-monsters">` — 몬스터 DB (JSON)
1. `<script id="db-maps">` — 맵 DB (JSON)
1. `<script id="db-npcs">` — NPC DB (JSON)
1. `<script id="db-items">` — 아이템 DB (JSON)
1. `<script id="db-skill-code">` — SK 코드 ↔ 스킬명 (JSON)
1. `<script id="db-job-init">` — 직업별 초기 스킬 (JSON)
1. `<script id="block-skills-db">` — `const DB_SKILLS` (JS)
1. HTML 뼈대 (lobby, app, modal 등)
1. `<script id="block-engine-logic">` — 게임 로직 전체

### 블록별 수정 빈도

|블록                  |수정 시점           |
|--------------------|----------------|
|`db-*` JSON 블록들     |CSV 교체 시만       |
|`block-skills-db`   |스킬 추가 시         |
|`block-engine-logic`|로직/UI/게임 기능 추가 시|

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

## 코드 작업 원칙

- **직업명 하드코딩 금지** — 반드시 JOB_XXX 코드 또는 normalizeJob() 경유
- **스킬 지급 하드코딩 금지** — 반드시 DB.jobInitSkills[코드] 사용
- **타겟 패치 방식 선호** — 대규모 재작성 금지, 요청 부분 외 수정 금지
- **스킬 등록**: `p.skills[name] = 0` (0레벨 등록 후 upgradeSkill 유도). `= 1` 직접 지급은 선행 우회이므로 퀘스트 보상 등 예외만 허용
- **스킬 체크**: `!(sname in p.skills)` 사용. `!p.skills[sname]`은 0과 undefined 동일 처리라 오류 발생
- **레거시 세이브 null 체크**: 새 하위 객체(`unlockedMaps` 등)는 반드시 `if (!p.unlockedMaps) p.unlockedMaps = {};` 패턴 사용
- `closeModal()`이 서비스 모달 열기 직후 호출되는 패턴 주의