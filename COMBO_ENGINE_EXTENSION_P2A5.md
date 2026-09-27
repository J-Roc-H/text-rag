# COMBO_ENGINE_EXTENSION_P2A5.md — bMatkRate / bUseSPrate 엔진 확장

P2-A.4에서 `engine-extension-required`로 남겨둔 효과 중 **bMatkRate**와
**bUseSPrate/bUseSPRate** 두 개만, 기존 TextRAG 계산축(calcStats MATK 계산부,
getSkillSpCost) 안에서 원작 semantics를 국소적으로 정확히 재현할 수 있음을 확인하고
실제로 consumer-backed 상태로 만들었다. bAddClass/bLongAtkRate/bSkillAtk/AutoSpell/
status-proc/combo matcher/set UI는 이번 범위 밖이다(§17-18, 명시적 보류).

## 1. 왜 두 효과만 골랐는가

`combo-engine-extension-backlog.json`(P2-A.4-정정 산출물) 상위 항목 중, **기존
계산축을 그대로 확장**할 수 있고(새 데이터 모델/새 identity 매핑 불필요) 원작
semantics를 실코드로 100% 확인할 수 있는 것만 골랐다:
- `bMatkRate`: MATK는 이미 calcStats에 단일 계산 지점(`baseMAtk`/`totalMAtk`)이 있다 —
  rAthena의 `matk_rate` 배율을 그 지점에 한 줄 추가하면 된다.
- `bUseSPrate`: SP 소비는 이미 `getSkillSpCost()` 단일 정본 함수가 있다 — rAthena의
  `dsprate` 배율을 그 함수에 한 항 추가하면 된다.
반면 `bAddClass`는 평타 전용 소비처를 스킬 데미지 경로까지 넓혀야 하고(§17),
`bLongAtkRate`는 원거리 공격 판정 자체를 재조사해야 해서(§18) 이번 범위에서 뺐다.

## 2. rAthena 실코드(pinned commit `e985006171d2eb320ee512a653f4c83aea3d81b6`)

**matk_rate** (`src/map/status.cpp`, `#ifndef RENEWAL`/pre-RE 분기, `SCB_MATK` 블록):
```c
int32 matk_min = status_base_matk_min(status);   // INT + (INT/7)^2, 순수 INT 공식
int32 matk_max = status_base_matk_max(status);   // INT + (INT/5)^2
if (sd != nullptr) {
    matk_min += sd->bonus.ematk; matk_max += sd->bonus.ematk;       // flat 아이템 MATK
    matk_min += sd->bonus.ematk_hidden; matk_max += sd->bonus.ematk_hidden;
    if (sd->matk_rate != 100) {                   // rate는 base+flat 다음에 적용
        matk_min = matk_min * sd->matk_rate / 100;
        matk_max = matk_max * sd->matk_rate / 100;
    }
}
// ... 이후(§5) pseudobuff/consumable/SC_MAGICPOWER 등 별도 flat/% 가산
```
`sd->matk_rate`는 `pc.cpp`에서 `case SP_MATK_RATE: sd->matk_rate += val;`로 100을
기준으로 additive 누적되고(`status.cpp: sd->matk_rate = 100;` 초기화,
`if(sd->matk_rate<0) sd->matk_rate=0;` 하한 clamp), pre-RE 전용 분기다.

**dsprate** (`src/map/skill.cpp`, `skill_get_requirement`):
```c
req.sp = skill->require.sp[skill_lv-1];           // 스킬 DB 기본 SP 비용
// ... sp_rate(스킬 자체 %, 별개 메커닉) 처리 ...
if (sd->dsprate != 100)
    req.sp = req.sp * sd->dsprate / 100;           // 정수 나눗셈(절삭)
// ... skillusesprate/skillusesp(별개 상수, bUseSPrate 아님) ...
req.sp = cap_value(req.sp * sp_skill_rate_bonus/100, 0, SHRT_MAX);  // 최종 0 하한
```
`sd->dsprate`는 `pc.cpp`에서 `case SP_SPRATE: sd->dsprate+=val;`로 100 기준
additive 누적되고(`status.cpp: sd->dsprate = 100;` 초기화,
`if(sd->dsprate<0) sd->dsprate=0;` 하한 clamp).

## 3. bMatkRate 공식

TextRAG `source/template.html` calcStats MATK 계산부(수정 후):
```js
let baseMAtk = totInt + Math.pow(Math.floor(totInt/5), 2);   // 기존 그대로(INT/5 공식)
let itemFlatMAtk = bonus.matk || 0;                            // 기존 flat 필드(현재 항상 0 -- §6 참조)
let matkRateMul = Math.max(0, 100 + (bonus.matkPct||0)) / 100; // rate, 0% 하한 clamp
let bonusMAtk = Math.floor((baseMAtk + itemFlatMAtk) * matkRateMul) - baseMAtk;
if(se.imposMannus) bonusMAtk += (se.imposMannus.matkBonus||0);  // 기존 버프, rate 이후 가산(그대로 유지)
if(se.ampMagic)    bonusMAtk += Math.floor(baseMAtk*(se.ampMagic.matkBonus||0));
if(se.lexAeterna)  bonusMAtk += baseMAtk;
let totalMAtk = baseMAtk + bonusMAtk;
```
`matkPct=0`(모든 기존 아이템)이면 `matkRateMul=1`이라 `bonusMAtk`가 정확히 기존
`itemFlatMAtk`(=`bonus.matk||0`)로 돌아가 **기존 결과와 완전히 동일**하다
(zero-effect parity, 테스트 M).

## 4. bUseSPrate 공식

`source/item-effects.js` getSkillSpCost() (수정 후):
```js
function getSkillSpCost(baseCost, stats) {
  var legacyMul = (stats && stats.cardSpCostMul != null) ? stats.cardSpCostMul : 1;
  var ratePct = (stats && stats.cardSpCostRatePct != null) ? stats.cardSpCostRatePct : 0;
  var rateMul = Math.max(0, 100 + ratePct) / 100; // dsprate 0% 하한 clamp와 동일
  return Math.max(0, Math.floor((baseCost || 0) * rateMul * legacyMul));
}
```
`spCostRatePct=0`이고 기존 `spCostMul=1`(모든 기존 아이템)이면 결과가 기존과 완전히
동일하다(zero-effect parity, 테스트 M).

## 5. stacking

둘 다 rAthena에서 100 기준 **additive accumulator**다 — 신규 canonical 필드
`matkPct`/`spCostRatePct`를 item-effects.js의 `_ITEM_EFF_SIMPLE_COMBAT_KEYS`(기존
atkPct/maxHpPct 등과 같은 additive 누적 제네릭 경로)에 얹어 그대로 재현했다:
- `bMatkRate,6` + `bMatkRate,4` → `matkPct=10`(테스트 H).
- `bUseSPrate,-20` + `bUseSPrate,-20` → `spCostRatePct=-40` → 최종 60%
  (곱연산이면 64%가 되어 원작과 달랐을 것 — 테스트 B, P2-A.4-정정이 발견한 사고
  패턴의 재발을 이번엔 구조적으로 막았다).

## 6. 기존 TextRAG field와 관계

- **spCostMul**(기존, 곱연산): P2-A.4-정정 사고의 원인이었던 필드. 이번엔 재사용하지
  않고 완전히 별개인 `spCostRatePct`(additive)를 신설했다. `getSkillSpCost()`에서
  둘은 `rateMul * legacyMul`로 함께(하지만 독립적으로) 곱해진다(테스트 E). §3의
  "기존 spCostMul source 감사" 결과 `db-items.json`에 이 필드를 쓰는 아이템이
  **0건**이라 오재사용 위험 자체가 없었다(§5 결과 참조).
- **bonus.matk**(기존 flat MATK 필드): 조사 중 이 필드가 **어떤 아이템 필드로도
  채워지지 않는 dead 코드**임을 발견했다(P0-close가 이미 "bMatk: 파생값이라 직접
  가산 지점 불명확"으로 기록해둔 것과 일치). `itemFlatMAtk = bonus.matk||0`은
  현재 항상 0이지만, 수식 자체는 이 필드가 언젠가 채워지더라도 rAthena 순서
  (base+flat)*rate를 정확히 재현하도록 만들어뒀다 — 이번 단계에서 그 dead 코드를
  고치지는 않았다(범위 밖, §16 collector 확장 지시는 "새 필드 추가"만 요구했다).

## 7. 테스트

- `tests/combo-engine-extension-p2a5-smoke.js`(엔진 레벨, JS, A-J + M + N, 16개
  체크): SP 단일/이중/양수/하한clamp/기존필드관계/8호출부회귀, MATK 단일/이중/
  순서/음수/하한clamp, zero-effect parity, 장비비교 parity. 전부 PASS.
- `tests/combo-engine-extension-p2a5-test.py`(canonicalizer 레벨, K/L/O + 실데이터
  + matrix, 24개 체크): 리터럴 안전 변환, 동적 표현식 계속 unsupported, 취소된
  키 여전히 배제, COMBO_RUNTIME_SAFE_KEYS 정합성. 전부 PASS.
- `tests/combo-effect-support-test.py`(P2-A.4-정정 원본, E/M/Q 갱신) 전부 PASS.
- 기존 JS smoke 15개 + Python 감사 테스트 전부 재실행 PASS(회귀 없음).

## 8. combo unlock 변화

| | P2-A.4-정정 종료 | P2-A.5 종료 |
|---|---|---|
| verified(=strict runtime-ready) | 40 | **47**(+7) |
| unsupported | 58 | **51**(-7) |
| source-needed | 58 | 58(불변) |
| COMBO_KNOWN_EFFECT_KEYS/COMBO_RUNTIME_SAFE_KEYS | 24 | **26**(+matkPct, +spCostRatePct) |

새로 verified된 7건: `rathena-pre-0013-01/02`, `rathena-pre-0023-01/02`(bMatkRate),
`rathena-pre-0033-02`, `rathena-pre-0035-01/02`(bUseSPrate). 기존 verified 40개
전량 재검증 결과 회귀 0건.

matrix verdict: `safe-existing-consumer` 2→**5**(bCastrate/bCastRate/bMatkRate/
bUseSPrate/bUseSPRate), `engine-extension-required` 30→**29**(bMatkRate 이동).

## 9. 남은 engine backlog(상위 5, 재계산 후)

| 순위 | constant | verdict | unlockPotential | complexity | priorityScore |
|---|---|---|---|---|---|
| 1 | `bAddClass` | stacking-scope-mismatch | 13 | medium | 6.5 |
| 2 | `bLongAtkRate` | engine-extension-required | 6 | low | 6.0 |
| 3 | `bSubRace` | stacking-scope-mismatch | 8 | medium | 4.0 |
| 4 | `bAspdRate` | engine-extension-required | 9 | high | 3.0 |
| 5 | `bHealPower` | engine-extension-required | 8 | high | 2.667 |

`bMatkRate`/`bUseSPrate`는 이 목록에서 완전히 빠졌다(엔진 확장 완료, SAFE로 이동).

## 10. P2-B 판정

**P2-A.6(bAddClass/bLongAtkRate) 필요**: `bAddClass`가 이제 unlock-potential 1위
(13콤보, medium complexity — 평타+물리 스킬 공통 소비처 신설)이고, `bLongAtkRate`는
여전히 저복잡도(6콤보, low — `isRangedWeapon` 구조 데이터 이미 존재)라 비용 대비
효과가 크다. 둘 다 이번 P2-A.5에서 확인한 것과 같은 "기존 계산축 국소 확장" 패턴이
적용 가능한지 재조사가 필요하다(특히 bAddClass는 스킬 데미지 계산 지점 자체를 새로
노출해야 하므로 이번보다 범위가 크다).

**combo matcher(P2-B) 착수는 여전히 이르다** — strict runtime-ready 47건은
P2-A.4-정정의 40건보다 견고해졌지만, bAddClass 처리만으로 최대 13건이 더 늘어날
잠재력이 있어 P2-A.6을 먼저 처리하는 편이 유리하다.
