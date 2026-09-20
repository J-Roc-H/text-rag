# DEVREF-D — 퀘스트 · 스킬 · 전투 시스템

> 로드 조건: **퀘스트·스킬·전투·상태이상** 관련 로직 작업 시

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

### type:"hidden" 처리 스킬 (스킬창 미표시)

|스킬     |직업     |
|-------|-------|
|성체강복   |JOB_PRI|
|토키 박스  |JOB_HNT|
|클로즈 컨파인|JOB_ROG|

-----

## 상태이상(SE) 시스템

### 주요 SE 키 목록

|키              |구조                  |설명                                  |
|---------------|--------------------|------------------------------------|
|`devotion`     |`{turns, dmgReduce}`|피해 감소 (dmgReduce = slv×0.06, 최대 0.3)|
|`redemptio`    |`{turns:9999}`      |사망 1회 방지, 발동 시 삭제 hp=1              |
|`resurrectBuff`|`{turns:9999, hp}`  |사망 시 hp×maxHp로 자동 부활                |
|`richManKim`   |`{turns, dropBonus}`|드롭률 보너스                             |
|`spiritSphere` |숫자(개수)              |몽크 정신구                              |

### 사망 처리 우선순위

```javascript
if(dd){
  if(p.statusEffects?.redemptio){
    delete p.statusEffects.redemptio; p.hp=1; dd=false;
  } else if(p.statusEffects?.resurrectBuff){
    p.hp = Math.floor(p.maxHp * p.statusEffects.resurrectBuff.hp);
    delete p.statusEffects.resurrectBuff; dd=false;
  } else { /* 일반 사망 → 마을 귀환 */ }
}
```

### SE 틱다운 타입별 처리

```
typeof v === 'number'    → 숫자형 SE (spiritSphere). 감소 없이 보존
v.count && !v.turns      → count 전용 SE. count>0이면 보존
v.count && v.turns       → 복합 SE (safetyWall, kyrie). turns-- 후 양쪽>0 보존
v.turns                  → 일반 turns SE. turns-- 후 >0이면 보존
```

### calcStats SE 연동 목록 (주요)

|SE 키                                                                      |효과                  |
|--------------------------------------------------------------------------|--------------------|
|`gloria`                                                                  |LUK+                |
|`concentration`                                                           |AGI+, DEX+          |
|`defender`                                                                |DEF+30%+10, ASPD×1.5|
|`thQuicken`/`spearQuicken`/`sunsetCross`                                  |ASPD 단축             |
|`bragi`                                                                   |캐스팅단축, 딜레이감소        |
|`explosion`/`overThrust`/`nibelung`/`loudBang`                            |ATK%                |
|`aspersio`/`flameLauncher`/`frostWeapon`/`lightningLoader`/`seismicWeapon`|weaponElement 오버라이드 |

### processTurn SE 처리 목록 (주요)

|SE             |처리                    |
|---------------|----------------------|
|`sanctuary`    |턴당 HP 회복              |
|`maximizePower`|턴당 SP 소모, 부족 시 소멸     |
|`safetyWall`   |물리 공격 차단 (count 감소)   |
|`kyrie`        |피해 흡수 (count 감소)      |
|`autoGuard`    |rate% 확률 완전 차단 (방패 필요)|
|`enchantPoison`|공격 명중 시 독 부여          |
|`autoSpell`    |평타 명중 시 rate% 마법 자동 발동|
|`poison`       |maxHp×1.5% 틱 피해       |
|`bleeding`     |maxHp×3% 틱 피해         |

### 몬스터 SE 공격 차단 (2026-06-11 추가)

몬스터 공격 for 루프의 `if(m.currentHp<=0) continue;` 직후에 삽입:
- `m.statusEffects.stun > 0` → 로그 출력 + 턴 차감 + 0이하면 키 삭제 + `continue`
- `m.statusEffects.sleep > 0` → 동일
- `m.statusEffects.freeze > 0` → 동일
- `poison`·`blind`·`silence`·`curse`는 공격을 막지 않음 (원작 기준)

### 화살 hitEffect proc (2026-06-11 추가)

스킬 명중 후 + 평타 명중 후 양 경로에서 `s.usesArrow && t.currentHp>0` 조건 하에:
- 인벤에서 `ammo:true && hitEffect` 있는 화살 탐색
- `Math.random() < hitEffect.chance` 이면 `t.statusEffects[se] = turns`
- 지원 SE: `poison`(8턴), `stun`·`sleep`·`freeze`·`blind`·`silence`·`curse`(3턴)
- 위치: enchantPoison 블록 직후 (스킬 경로 line ~5422, 평타 경로 line ~5557)

-----

## [2-8] 전투 스킬 로테이션 — 핫바 연동 (2026-07-02)

`processTurn`의 자동 스킬 사용은 **핫바에 등록된 스킬만** 후보로 삼는다.

```javascript
// processTurn 스킬 선택부 상단
const hotbarSkillSet = new Set(Object.values(p.hotbar||{})
  .filter(sl=>sl&&sl.type==='skill').map(sl=>sl.name));
```

- **공격 풀** `allActSkills`, **힐** `healPick`(힐/응급치료), **버프** `buffCandidates`, **fallback**(rank0) 전부 `hotbarSkillSet.has(sn)` 조건 적용
- 핫바에 스킬이 0개면 자동 전투는 **평타만** (fallback 없음 — 의도된 설계)
- 티어 큐(high/mid/low, rank 기반 포인터 로테이션)는 유지 — 후보만 축소
- `sigStr`이 `allActSkills` 기반이므로 핫바 변경 시 티어 큐 자동 재빌드 (별도 무효화 불필요)
- 수동 키 입력(`executeHotbar`→`useSkill`)은 핫바 제한과 무관하게 즉발 (쿨타임/캐스팅 동일 적용)

-----

## [2-9] 구역(zone) 시스템 + 리젠 딜레이 (2026-07-02)

위치: `spawnMonsters` 직전 (block-engine-logic). 맵별 데이터 작업 없는 **범용 자동 생성** 방식.

### 상수

```javascript
const ZONE_COUNT = 4;                 // 구역 수 (A~D)
const ZONE_KILL_THRESHOLD = 50;       // 자동 전진 처치 수
const ZONE_RESPAWN_MIN_MS = 10000;    // 전멸 후 리젠 딜레이 최소
const ZONE_RESPAWN_MAX_MS = 20000;    // 최대 — 10~20초 무작위 (2026-07-02 30초 고정에서 변경)
// 실제 딜레이는 G.lastRespawnDelay에 저장 (HUD 프로그레스 계산용)
```

### 함수

| 함수 | 역할 |
|---|---|
| `getZones(mapName)` | `md.monsters` 레벨 오름차순 정렬 → 균등 4분할 (종수<4면 축소, 1구역이면 미적용). 맵 명시 `zones` 우선. `_zoneCache` 캐시 |
| `ensureZoneState()` | `G._zoneMap !== G.currentMap`이면 `G.zoneIdx/zoneKills/nextSpawnAt` 리셋 — **자기치유형** (맵 이동 경로 전수 수정 불필요) |
| `addZoneKill()` | 처치 지점 4곳(평타/스킬/광역/useSkill)에서 호출. 50킬 도달 시 자동 전진(순환) + 로그 |
| `moveZone(dir)` | 수동 전환 (+1/-1). 전투 중 불가. 핫바 행동 '구역 전진'/'구역 후퇴' |
| `setZone(idx)` | 특정 구역 직접 이동 — 지도 모달(showMapModal)의 구역 카드 클릭. 전투 중 불가 |
| `getZoneSuffix()` | `updateUI` map-name-disp용 " · 구역 B (Lv3~7)" 서픽스 |

### 리젠 딜레이 (huntTick)

- 전투 중이면 `G._battleWasActive=true`, 전멸 감지 시 `G.nextSpawnAt = now+30초` 설정 후 스폰 보류
- `spawnMonsters`는 huntTick에서만 호출됨 → 이 경로 하나로 전체 커버
- 오프라인 사냥 시뮬레이션은 구역/리젠 미적용 (추상 시뮬 유지)

### 주의

- `G.zoneIdx` 사용 전 반드시 `ensureZoneState()` 호출 (레거시 세이브 / 맵 변경 대응)
- 스폰 풀 접근은 `zones[Math.min(G.zoneIdx, zones.length-1)]`로 클램프
- MVP·보스만사냥 분기는 구역과 무관 (기존 로직)

-----

## 노점(벤딩) 시스템

### 핵심 상태 변수

```javascript
G.vendingSlots      // [{item:"아이템명", price:설정가, qty:수량}]
G.lastVendingCheck  // Date.now() (30초 주기 체크용)
window.__vs         // showVendingStatus 전역 참조
window.__vRender    // renderVendingModal 전역 참조
```

### 구매 확률 공식

```javascript
// 기준가 = it.buy || it.sell * 2
const ratio = slot.price / base;
const buyChance = Math.min(0.95, Math.max(0.03, 0.9 / (Math.pow(ratio, 1.2) + 0.5)));
```

-----

## 화살 소모 시스템 (2026-06-11)

### 개요

활(`wType:"활"`) 장비 시 매 공격마다 인벤의 `ammo:true` 소모품을 1개 소모. 화살 ATK·속성은 `calcStats()`에서 반영.

> **DEX 공식 적용 무기**: `isRangedWeapon` = `['활','악기','채찍'].includes(p.weaponType)` — 세 무기 모두 DEX 기반.  
> **화살 소모**: `usesArrow` = `p.weaponType === '활'` — 활만 해당. 악기·채찍은 화살 불필요.

### calcStats() 적용 위치

```javascript
// let weaponAtk = wAtk + refineBonus; 바로 아래
if(isRangedWeapon){
  for(let _an in (p.inventory||{})){
    let _ai=DB.items[_an];
    if(_ai&&_ai.ammo&&(p.inventory[_an]||0)>0){
      if(_ai.atk)     weaponAtk+=_ai.atk;
      if(_ai.element) p.weaponElement=_ai.element;
      break;
    }
  }
}
```

### processTurn() 화살 체크/소모 위치

1. **공격 전 체크** (몰이사냥 skipAttack 블록 바로 아래):
   - `ammo:true && qty>0` 아이템이 없으면 `skipAttack=true`, 경고 로그 출력
2. **스킬 사용 후 소모** (`sUsed=true` 직후):
   - `ammo:true` 아이템 1개 감소 (0이하면 키 삭제)
3. **평타 후 소모** (`if(!sUsed)` 블록 안, hit/miss else 클로즈 이후):
   - 명중/빗나감 불문 1개 소모

### checkVending() 흐름

1. `Date.now() - G.lastVendingCheck < 30000`이면 return
1. 각 슬롯 확률 계산 → 구매 성공 시 `slot.qty--`, `p.zeny += slot.price`
1. 빈 슬롯(`qty <= 0`) 자동 제거
1. `processTurn()` 말미에서 호출