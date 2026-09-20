# DEVREF-D — 퀘스트 · 스킬 · 전투 시스템

> 로드 조건: **퀘스트·스킬·전투·상태이상** 관련 로직 작업 시
> 최종 검증: 2026-08-07 | 대상 코드: 룬미드가츠_v9.11.html

-----

## 퀘스트 시스템

### 퀘스트 상태값

`locked` → `available` → `active` → `completable` → `done`

- repeatable: `done` → `available` (리셋)

### TUTORIAL_QUESTS 엔트리

```javascript
"퀘스트ID": {
  title, npc, type, reqLv,          // 기본 필드
  unlock: "해금할 맵명",             // 완료 시 unlockedMaps에 추가
  next: "다음퀘스트ID",              // 완료 시 자동 해금
  repeatable: true,
  reward: { zeny, exp, jexp, items: {"아이템명": 수량} },
  // 타입별:
  // kill:         target, count
  // gather:       target, count
  // gather_multi: targets: [{item, count}, ...]
  // talk:         (수락 즉시 completable)
  // interact:     target_npc
  dialog: [...],
  dialog_later: [...],
  dialog_complete: [...],
  dialog_progress: "텍스트 {count}개 더..."
}
```

### 관련 함수

```
initTutorialQuests(p)     캐릭터 생성 시 초기 해금
acceptQuest(id)           수락 (레벨 체크 포함)
checkQuestKill(name)      몬스터 처치 시 호출
checkQuestGather()        아이템 변화 시 호출
giveQuestReward(q)        보상 지급 (zeny/exp/jexp/items/unlock)
unlockNextQuest(q)        next 퀘스트 해금
handleDialogEnd(id, branch)  대화 완료 처리
getNpcQuestBadge(npc)     NPC 뱃지 표시
```

-----

## 던전 잠금 시스템

```javascript
const DUNGEON_LOCKS = {
  "맵명": { msg: "차단 메시지" }, ...
}
```

해금: 퀘스트 `unlock` 필드 → `giveQuestReward` 자동 처리  
또는 `dungeon_access` NPC 결제 → `talkNPC` 처리

|던전          |해금 조건          |
|------------|---------------|
|프론테라 지하수로 1층|Q_CULVERTS     |
|거북섬         |거북 할아버지 10,000z|
|침몰선         |피스크 250z       |
|바이알란 섬      |선원(바이알란) 150z  |
|오딘 신전       |발굴 안내인 800z    |
|아루나펠츠 신전 성역 |Q_RAC_SANCTUARY|
|생체연구소 1층    |Q_LHZ_BIOLAB   |

-----

## 언어 장벽 시스템

NPC에 `"race": "우탄족"` → Q_UMB_LANGUAGE 완료 전 정상 대화 불가.  
예외: Q_UMB_LANGUAGE의 `npc` NPC(카르카탄)는 퀘스트가 available/active/completable이면 허용.  
적용 NPC: 카르카탄, 두개골 NPC, 우탄 꼬마

-----

## 스킬 시스템

### doJob 전직 시 스킬 초기화 로직

```javascript
// ✅ 현재 방식: 기존 투자 스킬 보존, 신규만 0으로 등록
if (sname && !(sname in p.skills)) p.skills[sname] = 0;

// ❌ 구버전 (버그): 모든 신규 스킬이 강제 1레벨
if (sname && !p.skills[sname]) p.skills[sname] = 1;
```

### upgradeSkill — 선행조건 체크

```javascript
function upgradeSkill(name) {
  if ((p.skillPoints||0) <= 0) { ... return; }
  if ((mySkills[name]||0) >= sk.maxLv) return;
  if (sk.req) {
    for (let rn in sk.req) {
      if ((mySkills[rn]||0) < sk.req[rn]) { log('선행 필요'); return; }
    }
  }
  p.skillPoints--;
  p.skills[name] = (p.skills[name] || 0) + 1;
}
```

-----

## 전직 · 전승 엔진 (v9.11 전면 정비)

### 데이터를 그대로 믿으면 안 되는 3곳

1. **`db-job-advance` 의 1차→2차 `reqJobLv:50` 은 쓰이지 않는 값.** 실제 NPC 퀘스트 경로는 `JOB_QUESTS.job2_*.reqJobLv = 40`. UI에 표시할 땐 **40**을 써야 한다.
2. **`job3_*.reqJob` 은 전승 이전 직업명(`위저드`)으로 적혀 있다.** 대사가 그 시절을 회상하기 때문. 실제 진입 직업은 `TRANS2ND_ENTRY_JOB[reqJob]` = `마법사 하이`. **판정·표시 양쪽 다 환산 필수.**
3. **`db-job-advance["JOB_HNOV"].next` 는 배열이 아니라 문자열 `"__PREV_HIGH__"`.** `Array.isArray` 분기 필요. 실제 대상은 `BASE1ST_TO_HIGH[p.prevJobCode]`.

### 전승 흐름 (원작 3단계)

```
유노 현자 메테우스 실페 (1,285,000z 후원) → p.ymirDonated = true
유노 이미르의 책 ("몸을 맡긴다")            → unlockedMaps['발할라'] + 이동
발할라 발키리 (job_change → rebirth_valkyrie 퀘스트)
  자격 미달 → expelFromValhalla()  : 유노로 추방 + 발할라 해금 회수 (후원금은 유지)
  통과      → performRebirth()     : 노비스 하이 / Lv1·1 / statPoints 100 / 1차 도시 귀환
```

- 발할라는 `DUNGEON_LOCKS` 로 잠겨 있어 걸어 들어갈 수 없다.
- `p.rebirth` 는 **불리언 1회 한정** (구 세이브의 숫자는 loadCharacter에서 정규화).
- 전승 캐릭터는 `calcStats` 에서 최대 HP/SP **+25%** (`rebirthPct`).
- `performRebirth()` 는 `doJob()` 을 **경유하면 안 된다** — doJob이 skillPoints/statPoints를 덮어쓴다.

### 하이 라인 진입

`노비스 하이 → 하이 1차` 는 **기존 job1 퀘스트 6종을 공유**하고 `highTargetJob` 으로 갈린다
(`resolveJobQuestTarget`). `하이 1차 → 전승 2차` 는 `NPC_JOB_QUEST_MAP` 에 `"마법사 하이"` 키가 있어야 열린다.

### handleJobQuestNpc 조건 종류

`reqRebirth`(먼저 검사 — 비전승자에게 "마법사 하이가 아니다"라고 하면 길을 오해한다) · `reqJob`(TRANS2ND 환산) · `reqJobLv` · `reqBaseLv` · `reqRebirthEligible`(발키리 전용, 미달 시 추방).

### 배타 그룹 주의

`cancelExclusiveJobQuests` 는 **상대 엔트리가 없으면 `failed` 를 만들지 않는다.**
따라서 `p.jobQuests[상대]` 만 봐서는 닫힘을 알 수 없다 — `JOB2_EXCLUSIVE_GROUPS` 를 직접 훑어
`['active','done']` 인 형제가 있는지 확인해야 한다 (전직 트리맵이 "가능"이라 거짓말하던 원인).

-----

### type:“hidden” 처리 스킬 (스킬창 미표시)

|스킬     |직업     |
|-------|-------|
|성체강복   |JOB_PRI|
|토키 박스  |JOB_HNT|
|클로즈 컨파인|JOB_ROG|

-----

> **전투·상태이상·구역·노점·화살은 [[DEVREF-G 전투 상태이상]]으로 분리** (2026-08-07, 예산 초과).

-----

## 스킬 시스템 현황 (2026-06-21 기준, 2026-08-13 DEVREF-E에서 이관)

- 구현 완료: 전 직업 270종+ (Pre-Re 기준 거의 완비)
- effect 미구현(플레이스홀더): 함정 설치/제작/워프 등 시스템 미구비 기능. 관련 백로그: DEVREF-E P3-02
- 제조 스킬 전반(파머시·화살 제조·단검~창 제작 7종·철/강철/속성석 제조): v9.08에서 재료소모·성공률 도입 완료(DEVREF-E 완료 이력 2-5, 개발일지 2026-07-25)

-----

## 참조: 스킬 퀘스트 상세 (DEVREF-E P3-01, 2026-08-13 이관)

| 퀘스트 | 직업 | 재료 | 보상 스킬 |
|---|---|---|---|
| 이동 HP 회복 | 소드맨 Lv35+ | 패디드 아머 1 | 이동 HP 회복 |
| 오토 버서크 | 소드맨 Lv35+ | 나비가루35+끔찍한입10+썩은손톱10+꿀10 | 오토 버서크 |
| 환영화살 | 헌터 | 저주받은루비5+하피의깃털5+펫먹이30 | 환영화살 |
| 사이트 블라스터 | 위저드 | 크리스탈블루10+초록생명력10+레드블러드10+바람의정수10 | 사이트 블라스터 |
| 더비어스 세일즈맨십 | 화이트스미스 | 강철1+석탄5+철망치1+데트리먼덱스타1 | 더비어스 세일즈맨십 |
| 그리드 | 화이트스미스 | 소지 무게 500 이하 조건 | 그리드 |
| 어쌔신 히든 스킬 | 어쌔신 | 사파이어 1 | 히든 스킬 |
| 연금술 효율 | 연금술사 | 알코올5+불멸의심장5 | 연금술 효율 |
| 제초제 | 연금술사 | 식물병 50 | 제초제 |
| 고급 연금술 | 연금술사 | 젤로피15+노란허브3+버섯포자5+슛2 | 히든 스킬 |

## 참조: 체인 퀘스트 상세 (DEVREF-E P5, 2026-08-13 이관)

| 퀘스트 | 특이사항 | 핵심 보상 |
|---|---|---|
| 더 사인 (7단계) | Q_SIGN_1 → Q_GEF_GEFFENIA | 루시퍼의 비탄 + 게페니아 입장 |
| 왕실 연회 | 6개 도시 NPC 탐문 | 프론테라 성 입장 |
| 저주받은 검 | 6도시 28단계 | 그림투스/미스텔테인/엑스큐셔너 |
| 아인브로크 살인 사건 | 사과100+탐문 체인 | EXP 대량 |
| 키엘 하이어 | 비밀 코드 4772961 | 기계인형 던전 해금 |
| 반란 퀘스트 | 4개 퀘스트 동시 선행 | EXP 대량 |
| 위험한 소문 | 바이오랩 체인 3단계 | 볼체프 지름길 |
| 비행선 티켓 | 3회 대화+4단계 탐문 | 무료 티켓 4장 |
| 불운한 에메랄드 / 대통령 퀘스트 / 공장 유지 보수 / 연인 퀘스트 / 유슬란의 약혼자 / 메토의 연구 저지 | — | EXP/아이템 |
