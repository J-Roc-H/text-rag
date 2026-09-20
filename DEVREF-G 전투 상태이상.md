# DEVREF-G — 전투 · 상태이상 · 구역 · 경제

> 로드 조건: **전투 루프·상태이상·구역/리젠·노점·화살** 관련 작업 시
> 최종 검증: 2026-08-07 | 대상 코드: 룬미드가츠_v9.11.html
> (부분 갱신: 2026-09-13 「오프라인 사냥」 절 신설 + 리젠 딜레이 서술 교정 — 대상 코드 v9.16 승격)
> 2026-08-07 분할: `DEVREF-D`가 358줄로 예산(300) 초과 → 전투 계열을 이 파일로 분리.
> 진행(퀘스트·전직·스킬 습득)은 [[DEVREF-D 퀘스트 스킬 전투]] 유지.

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
- 오프라인 사냥도 `huntTick()`을 그대로 호출하므로 **구역/리젠 딜레이가 온라인과 똑같이 적용된다**
  (2026-09-13 P0-02③④ 이후. 그 전에는 `_silentTurn` 축약 시뮬이라 미적용이었다 — 아래 「오프라인 사냥」 절)

### 주의

- `G.zoneIdx` 사용 전 반드시 `ensureZoneState()` 호출 (레거시 세이브 / 맵 변경 대응)
- 스폰 풀 접근은 `zones[Math.min(G.zoneIdx, zones.length-1)]`로 클램프
- MVP·보스만사냥 분기는 구역과 무관 (기존 로직)

-----

## 오프라인 사냥 — 온라인 엔진 헤드리스 재사용 (2026-09-13, P0-02③④)

탭을 숨겼다 돌아오면 `visibilitychange` 핸들러가 `processOfflineTicks(elapsedMs)`를 부른다.
**구버전은 여기서 `_silentSpawn()`/`_silentTurn()`이라는 별도 축약 전투식을 돌렸다** — 평타 전용이라
스킬 로테이션·크리·상태이상·화살·카드 proc·MVP 슬레이브가 없고 플레이어→몬스터는 무조건 명중,
사망 패널티도 없어서 오프라인이 사실상 다른 게임이었다. 지금은 둘 다 제거되고
`runHeadlessTicks()`가 **온라인 사냥의 진입점 `huntTick()`을 그대로 N번 호출**한다.

### 무음(헤드리스) 모드 스위치

| 전역 | 뜻 |
|---|---|
| `G.silentMode` | true 동안 DOM·타이머 부작용을 끈다. 전투 계산은 한 줄도 분기하지 않는다 |
| `G.silentSummary` | 오프라인 요약 객체. `rollDrops`가 opts 없이 호출돼도 여기에 집계한다 |
| `G.silentDead` | 이번 틱에 플레이어가 죽었다는 신호. 온라인의 `setTimeout(2초)` 휴식을 대체 |

`silentMode`에서 즉시 반환하는 함수: `log`(정의 2곳 전부)·`notify`·`spawnDmg`·`renderMonsters`·
`renderStatusHUD`·`checkVending`·`scheduleTickAspd`.
**`updateUI`는 예외** — 앞부분의 `p.maxHp/maxSp` 재설정 + `hp/sp` 클램프는 *계산 부작용*이라
그대로 수행하고 그 뒤 DOM 갱신만 건너뛴다. 이 클램프까지 건너뛰면 온라인과 상태가 갈라진다.

### 함정 3개 (건드릴 때 반드시 볼 것)

1. **가상 시계** — 자연회복(`procNaturalRegen`)·포션 쿨타임(`useItem`의 `G.itemCooldowns`)·
   과적재 경고 스로틀은 전부 `Date.now()` 기반이다. 수천 틱을 실시간 수백 ms에 돌리면 이들이
   "시간이 안 흘렀다"로 판정돼 **오프라인 플레이어만** 회복도 포션도 못 쓴다. `runHeadlessTicks`는
   시뮬 구간에서만 `Date.now`를 틱 시간으로 바꿔 끼우고 `finally`에서 원복한다. 지우면 안 된다
2. **집계는 상태 차분** — 처치보상 경로가 3곳(스킬 단발/광역/평타)이라 요약 훅을 심으면 3곳을
   건드려야 한다(P4-01 영역). 그래서 kills=`p.totalKills`, exp=`p.records.totalExp`,
   zeny=`p.records.totalZeny` 차분으로 뽑고, `jobExp`는 레벨업이 `lv*50`씩 소비하므로
   **소비분을 되돌려 더해** 계산한다. 잡레벨업 공식을 바꾸면 이 계산도 같이 고쳐야 한다
3. **사망 후 사냥터 복귀** — `processTurn`의 사망 분기는 `G.currentMap`을 `savedMap`(마을)으로
   옮긴다. 러너가 휴식 틱(2초분)을 스킵한 뒤 `huntMap`으로 되돌린다. 구버전은 되돌리지 않아
   **첫 사망 이후 남은 오프라인 구간이 통째로 무수확**이었다

### 상한

- `MAX_TICKS = 30000` (약 100분치). 실측 30,000틱 = 480~570ms (16~19µs/틱)
- 실시간 `budgetMs = 8000` 초과 시 중단 + `summary.timeCapped` → 보고 문구에 표시
  (확인 못 한 구간을 "이상 없음"으로 합치지 않는다 — [[CORE_DEVREF-B]] #36)

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

-----

## ASPD 연동 타이머 현황 (2026-08-13, DEVREF-E P1-01/P1-02 배경)

- **자연회복(HP/SP)**: v9.06부터 실시간 1000ms 간격으로 분리 완료 (ASPD 무관, `p.lastHpRegenTime`/`lastSpRegenTime` 타임스탬프 방식). 상세 구현 기록: `룬미드가츠_개발일지.md` 2026-07-25 v9.06 섹션
- **플레이어 상태이상(`procPlayerStatusTick`)**: 2026-09-20 실시간 1000ms 간격으로 분리 완료(`p._lastStatusTickAt` 타임스탬프, 자연회복과 동일 패턴). turns 감소·독/생츄어리/맥시마이즈파워 매턴 효과·자기 버프까지 전부 포함. **원래 백로그(P1-01)가 지목했던 스킬 쿨다운·화살 hitEffect proc은 실측 결과 버그가 아니었음**(쿨다운은 `틱수=쿨타임ms/aspdDelay` 수식이 실시간과 정확히 상쇄, 화살proc 공격빈도 비례는 원작 정상 동작) — 실제 "고AGI 무적" 원인은 몬스터가 건 CC/DoT가 플레이어 자신의 ASPD 틱 주기에 묶여 실시간으로 빨리 풀리던 이 함수였다. 상세: 개발일지 2026-09-20
- **몬스터/타겟 상태이상**: `t.statusEffects[se]=턴수`(단순 숫자, 플레이어 쪽과 다른 구조) — 감소 지점 미특정, 이번 작업 범위 밖. 다음에 확인 필요
- **전투 중 자연회복**: 원작 Pre-Re는 전투 중 정지되나, 이 게임은 방치형 자동전투라 "비전투 휴식" 자체가 구조적으로 없음 — 2026-09-20 사용자 확정으로 **현행(전투 중에도 매 턴 hpRegen) 유지, 구현 안 하기로 종결** (DEVREF-E P1-02)
