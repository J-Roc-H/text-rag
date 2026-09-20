# DEVREF-F — 에디터 · UI · 기타 시스템

> 로드 조건: **에디터·모달·DB뷰어** 작업 시

-----

## [UI 6종 개선] 게임 화면 UI 시스템 (2026-07-02)

### ① 로그 채널 필터 + 방치 요약

- `#log-filter` (map-hdr 아래 칩 바) → `setLogFilter(cls,el)` — `#game-log`에 `lf-battle`/`lf-loot`/`lf-sys` 클래스 토글, CSS `:not()` 셀렉터로 숨김 (로그 데이터는 유지)
- 요약 카드: `idleTrack(exp,zeny)` — 처치 지점 4곳에서 호출, `G.idleSum` 집계. `flushIdleSummary()` — huntTick마다 체크, `IDLE_SUMMARY_MS`(5분) 경과 시 `'summary'` 타입 로그로 방출. `toggleHunt` 시작 시 카운터 리셋
- 새 로그 타입: `summary` (`.sum-card` 스타일). 모든 필터에서 항상 표시

### ② 구역/리젠 HUD

- `#zone-hud` (map-hdr 중앙) — `updateZoneHud()` 렌더, `startZoneHudTimer()`(500ms 인터벌, loadCharacter에서 시작)
- 킬 게이지 `⚡ n/50` + 리젠 카운트다운 `💤 ns` (`.zone-chip` + `.zc-bar` 프로그레스)

### ③ 핫바 슬롯 상태

- `renderHotbar`: 쿨다운 → `.cd` + `.hb-cd-ov` 오버레이(중앙 숫자), SP 부족 → `.nosp`(흐림). 슬롯 id `hb-slot-{k}`
- `executeHotbar`: 발동 시 `.used` 클래스 재부여로 플래시 애니메이션 (`hbFlash`)

### ④ 장비 비교 diff (showItemDetail)

- 장비 타입 && 미장착 && 보유 시: `p.equip[slot]` 임시 스왑 → `calcStats()` 2회 비교 → 원복 후 `calcStats()` 재호출(부수효과 복원)
- 비교 필드: ATK/MATK/DEF/MDEF/HIT/FLEE/CRI/HP/SP — ▲초록/▼빨강
- 한계: 양손무기→방패 해제 미반영(과대평가 가능), Accessory는 빈 슬롯 기준

### ⑤ 모바일 레이아웃 (≤700px)

- **하단 탭 바** `#mobile-tabbar`: 로그/캐릭터/전투/가방/사냥. `mobileTab(t,el)` → 패널 전체폭 시트 토글, `syncMobileTab()` 상태 동기화, `syncMobileHunt()` 사냥 버튼 동기화(renderHotbar·toggleHunt에서 호출)
- **핫바 가로 스트립**: `checkMobile()`이 `#hotbar-panel` DOM을 main-area 하단↔right-panel 상단으로 이동 (6열 그리드)
- 구형 `#mobile-char-btn`/`#mobile-enc-btn` 숨김 처리 (코드 잔존), `#mobile-inv-btn` 탭 바 '가방'으로 대체
- 타이틀바 가로 스크롤 허용, `.map-info-disp` 모바일 숨김

### ⑥ 몬스터 카드

- `ELEM_ICO` 속성 앞글자→아이콘 맵. 메타라인(Lv·속성·크기·종족), 거리 칩 `.mon-dist`(distance>1), MVP `.mon-card.mvp` 골드 펄스(`mvpPulse`) + `.mvp-badge`

-----

## [스타일 정리 4종] 저자극 화면 (2026-07-02)

- **로그 팔레트**: `.le.*` 라이트/다크 전면 저채도화. 계열: 블루그레이(combat/dmg-dealt/crit/heal), 골드브라운(loot/gold/level-up), 저채도 레드(dmg-recv/warning/error). 새 로그 타입 추가 시 이 3계열에서 선택할 것
- **숫자**: `body{font-variant-numeric:tabular-nums}` 전역. 제니는 `toLocaleString()`
- **플랫화**: titlebar/panel-hdr/map-hdr/menu-btn/modal-hdr/sum-card/mvp카드 — 그라데이션 금지(단색), 크롬 box-shadow 금지. 바(bar-fill) 그라데이션만 예외
- **맵 틴트**: `applyMapTint()` (updateUI에서 호출) → `#game-log[data-tint=desert|sea|ice|village|dungeon|forest]`. 새 맵 추가 시 이름 키워드가 정규식에 걸리는지 확인 (DEVREF-F 본 섹션의 정규식 참조: 사막|해저|설원|던전|숲 등)

-----

## [3-10] 몰래하기 모드 — 엑셀 위장 오버레이 (2026-07-02)

### 동작

- **보스키 백틱(`)**: keydown 리스너 최상단(입력 필드 가드보다 앞) — `toggleStealth()`. 게임은 뒤에서 계속 진행
- **오버레이**: `#stealth-overlay` (JS 생성, `buildStealth()`, z-index 2147483000) — 가짜 스프레드시트 전체 화면. 애니메이션 없음
- **로그**: `log()` 말미 훅 → `stealthSetLog(t)` — 하단 상태표시줄 `#st-log` 한 줄 교체. `stealthSanitize()`가 HTML 태그+이모지 제거
- **document.title**도 "3분기 정산집계_v2.xlsx - 스프레드시트"로 전환

### 셀 매핑 (플레이어 암기용)

| 표 항목 | 실제 값 |
|---|---|
| 인건비 — 예산/집행/잔액/진행률 | maxHp / 소모 / **HP** / HP% |
| 경상운영비 — 잔액 | **SP** |
| 매출액 — 잔액 | **제니** |
| 목표달성률 — 진행률 | **EXP%** |
| 상태표시줄 우측 합계/개수 | 제니 / totalKills |

### 상태·연동

- `G.stealthOn`(세션) + `p.options.workMode`(세이브 저장) 동기화 — 로드 시 workMode true면 자동 위장 상태로 시작
- 갱신: `updateStealth()` 1초 인터벌 (`G._stTimer`)
- 구형 `toggleWorkMode()`(흑백 grayscale)는 `toggleStealth()` 리다이렉트로 대체. `body.work-mode` CSS는 데드코드 잔존 (4순위 청소 대상)
- 키보드 핫바(QWER)는 위장 중에도 동작 (설계 의도)
- **버그 수정(2026-07-03)**: `buildStealth()` 존재 체크가 `$()` 사용으로 항상 조기 return → 오버레이 미생성(버튼·백틱 무반응, 탭 제목만 변경). `document.getElementById()`로 교체. `$()`는 DOM 존재 체크 금지 (DEVREF-INDEX 참조)
- **복귀 UX(2026-07-03)**: ① 리본 바(`.st-ribbon`) 클릭 = `toggleStealth()` 복귀 ② 상태표시줄에 위장 힌트 "⏺ 매크로 기록: \`" 상시 표시 (실제 엑셀의 매크로 기록 표시로 위장). 커서는 default 유지 (pointer 금지 — 위장 목적)
- **위장 중 저장·종료(2026-07-03)**: `stealthSave()` = **조용한 저장** (localStorage 슬롯만, saveGame 1단계 로직 복제 — saveGame은 파일 대화상자/다운로드가 발생해 위장 중 사용 금지). 트리거: 우상단 '저장됨'(`#st-saved`) 클릭 / Ctrl+S(위장 중에만 가로챔) / X 로고 메뉴
- **위장 메뉴**: X 로고 클릭 → `stealthMenu()` 드롭다운(`#st-menu`) — 저장 / 자동 계산 중지·재개(=toggleHunt, 로그는 stealthSetLog로 덮어씀) / 통합 문서 닫기(=조용한 저장 후 exitToLobby 동일 정리 + initLobby, **오버레이는 유지**). 오버레이 바깥 클릭 시 메뉴 닫힘

-----

## 에디터 장비·아이템·카드 지급

### 장비 지급

- `id="e-equip-cat"` — 분류 select (무기/갑옷/방패/걸칠것/신발/투구류/Accessory/전체)
- `id="e-equip-filter"` — 텍스트 검색
- `id="e-equip-select"` — 필터된 목록 (size=5, `data-type` 속성 포함)
- `id="e-equip-qty"` — 수량 (1~99)
- `editorFilterEquipList()` / `editorGiveEquip()`

### 아이템 지급

- `id="e-item-cat"` — 분류 (소모품/잡템/재료/퀘스트아이템/전체)
- `id="e-item-filter"` / `id="e-item-select"` / `id="e-item-qty"` (1~999)
- `editorFilterItemList()` / `editorGiveItem()` — 퀘스트아이템 지급 후 `checkQuestGather()` 자동 호출

### 카드 지급

- `id="e-card-filter"` / `id="e-card-select"` / `id="e-card-qty"` (1~99)
- `editorFilterCardList()` / `editorGiveCard()` — cardCodex 등록 포함

-----

## 몬스터 DB 편집기 (2026-06-29 추가, 2026-06-30 UI 개편)

### 진입점

**타이틀바** `🐉 몬스터` 버튼 → `showMonsterListEditor()` 직접 호출.  
(구버전: 에디터 모달 내 섹션 → 제거됨)

### 함수 목록

| 함수 | 위치 | 설명 |
|---|---|---|
| `showMonsterListEditor()` | 에디터 헬퍼 섹션 위 | 검색 + 490마리 목록. 버튼: 💾 HTML 저장 / 닫기 |
| `showMonsterEditModal(id)` | 동 위 | 개별 편집 폼 (2컬럼). 버튼: 저장(→목록) / ← 목록 |
| `monEditAddDrop()` | 동 위 | `#me-drops-container`에 `.mon-drop-row` div 추가 |
| `saveMonsterEdit(id)` | 동 위 | 메모리의 `DB.monsters[id]` + `DB.maps` 갱신 |
| `exportModifiedHTML()` | 동 위 | `db-monsters`·`db-maps` 태그 갱신 후 HTML 다운로드 |

### 편집 폼 레이아웃 (2컬럼, 2026-06-30)

`grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))` — 뷰폭에 따라 1~2열 자동.

- **왼쪽 열**: 기본정보(이름/이모지/레벨/HP/ATK) + 어빌리티(STR~LUK 3×2 그리드) + 경험치/제니
- **오른쪽 열**: 방어/전투(DEF/softDEF/MDEF/HIT/FLEE/사거리/딜레이) + 속성/종족/크기
- **전체 폭**: 드롭 아이템 + 출몰 지역

### 드롭 행 구조 (.mon-drop-row)

```html
<div class="mon-drop-row">
  <select class="drop-item-sel">   <!-- DB.items 전체 select (window._monItemOpts) -->
  <input class="drop-item-rate">   <!-- 확률 % -->
  <button onclick="this.closest('.mon-drop-row').remove()">✕</button>
</div>
```

`window._monItemOpts` — `showMonsterEditModal` 호출 시 `DB.items` 전체를 sort → option HTML로 캐시.  
`monEditAddDrop()`은 이 캐시를 재사용하여 select를 생성.  
`saveMonsterEdit`는 `.drop-item-sel` 값을 읽음 (`.drop-item-name` 아님).

### 출몰 지역 체크박스

```html
<input type="checkbox" class="mon-map-cb" value="맵명">
```

`saveMonsterEdit`에서 `.mon-map-cb` 전수 순회 → `DB.maps[cb.value].monsters` 배열 동기화.  
체크 추가 시 `parseInt(id)` 형태로 push, 체크 해제 시 filter 제거.

### HTML 저장 원리

```javascript
document.getElementById('db-monsters').textContent = '\n' + JSON.stringify(DB.monsters, null, 2) + '\n';
document.getElementById('db-maps').textContent     = '\n' + JSON.stringify(DB.maps,     null, 2) + '\n';
let html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
// → Blob 다운로드
```

저장 후 script 태그 textContent가 갱신된 상태로 유지됨 (런타임 DB 객체에는 영향 없음).

-----

## DB 뷰어

진입점: 타이틀바 `🔍 DB뷰어` → `showDBViewer()` → `window.showDBViewerTab(tab)` → `buildViewer(tab)`

### 5개 탭

|탭      |검증 항목                                 |
|-------|--------------------------------------|
|monster|name/hp/atk/drops 누락 ❌, 드랍률 합계 >100% ⚠️|
|item   |type/buy/sell 누락 ❌, 무기인데 wType 없음 ⚠️   |
|map    |connected/monsters 빈 배열 ⚠️             |
|skill  |effect null(미구현) ⚠️, job/type 누락 ❌     |
|job    |전직 목록, 초기 스킬 수 표시                     |

### 직업 탭 데이터 접근 주의

```javascript
// DB.jobAdvance[code].next가 "__PREV_HIGH__" 문자열일 수 있음
const advRaw  = (jobAdvance[code] && jobAdvance[code].next) || [];
const advList = Array.isArray(advRaw) ? advRaw : [];
// SK 코드 배열 → 이름 변환
const initCodes = Array.isArray(jobInit[code]) ? jobInit[code] : [];
const initSk    = initCodes.map(c => skillCode[c] || c);
```

-----

## 무기 티어 제한 시스템

```javascript
const JOB_TIER = {
  JOB_NOV:0, JOB_HNOV:0,
  JOB_SWD:1, JOB_MG:1, JOB_ARC:1, JOB_ACO:1, JOB_THF:1, JOB_MER:1,
  JOB_HSWD:1, JOB_HMG:1, JOB_HARC:1, JOB_HACO:1, JOB_HTHF:1, JOB_HMER:1,
  // 나머지 2차 이상: 기본값 2 (undefined → tier 2)
};
const WEAPON_LV_MIN_TIER = {1:0, 2:1, 3:2, 4:2};
// Lv1: 노비스도 가능 / Lv2: 1차 이상 / Lv3~4: 2차 이상
```

`equipItem()` 내 무기 제한 로직:

```javascript
if(i.type === '무기'){
  const jobCode = JOB_NAME2CODE ? JOB_NAME2CODE[normalizeJob(p.job||'')] : null;
  const allowed = jobCode ? JOB_WEAPON_ALLOW[jobCode] : null;
  const wt = i.wType || '';
  if(allowed && wt && !allowed.includes(wt)){
    log(`⛔ ${p.job}은(는) ${wt} 계열 무기를 장착할 수 없습니다.`, 'error'); return;
  }
  const wlv = i.weaponLv || 1;
  const minTier = WEAPON_LV_MIN_TIER[wlv] ?? 0;
  const myTier  = jobCode !== null && JOB_TIER[jobCode] !== undefined ? JOB_TIER[jobCode] : 2;
  if(myTier < minTier){ log(`⛔ 이 무기는 ...만 장착 가능합니다.`, 'error'); return; }
}
```

-----

## 블레싱 스킬 공식 (수정됨, 2026-06-08)

- **수정 후**: `str:slv, int:slv, dex:slv` (Lv10에서 +10, Pre-Re 원작 기준)
- **수정 전**: `str:slv*3` (버그, Lv10에서 +30)
- 에디터 버프 하드코딩값: `str/int/dex: 10`

-----

## 자동사냥 옵션 필드 (`p.options`)

|필드          |설명                                 |
|------------|-----------------------------------|
|필드           |설명                                                      |
|-------------|--------------------------------------------------------|
|`huntStyle`  |`'immediate'`(소극적) / `'aggressive'`(공격적) / `'wait'`(몰이사냥)|
|`hpPotPct`   |HP X% 이하 포션 사용                                          |
|`spPotPct`   |SP X% 이하 포션 사용                                          |
|`buffFreq`   |버프 사용 빈도 (0=무제한, N=매N턴)                                 |
|`useBuffNpc` |버프 NPC 사용 여부                                            |
|`bossMode`   |`'조우하지않음'`/`'normal'`(1%)/`'보스만사냥'`                     |
|`healHpPct`  |HP X% 이하 시 힐 스킬 사용 (0=미사용)                              |
|`respawnMin` |리젠 대기 최소 초 (기본 0) — huntTick에서 ms 환산                     |
|`respawnMax` |리젠 대기 최대 초 (기본 2). max<min이면 min으로 보정                    |
|`zoneKillTh` |구역 자동 전환 킬 수 (기본 50, **0=자동 전환 끄기**) — `getZoneKillTh()` 경유|

### 옵션 모달 분화 (2026-07-03)

- 구 `showOptionModal` → **`showCombatOptionModal`**(⚔️ 전투 설정: huntStyle·bossMode·리젠·구역전환·포션·힐·버프·버프NPC) + **`showEnvOptionModal`**(⚙️ 환경 설정: 업무 모드·다크 모드 토글)
- 타이틀바 버튼도 ⚙️ 환경 설정 / ⚔️ 전투 설정 2개로 분리. 💼 업무 모드·🌙 다크 독립 버튼은 유지
- `ZONE_RESPAWN_MIN/MAX_MS` 상수는 미사용화(코드 잔존), `ZONE_KILL_THRESHOLD`는 `getZoneKillTh()`의 폴백으로만 사용
- 리젠 0초대일 때(1초 미만) "주변이 조용해졌다" 로그 생략

### huntStyle 동작 상세

| 값 | 동작 |
|---|---|
| `'immediate'` | 전투 종료 후 1마리 스폰 (기본값) |
| `'aggressive'` | 매 processTurn 틱마다 20% 확률로 추가 스폰 (최대 5마리). 다수 포위 시 flee 감소 적용. |
| `'wait'` | 3마리 미만이면 공격 보류. spawnMonsters()는 battles.length===0 시 정상 호출. |

`G.buffTick` — 버프 빈도 제한용 카운터