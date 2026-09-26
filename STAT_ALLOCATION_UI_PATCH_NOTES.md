# Stat allocation UX overhaul (P1-A)

Continuation of `audit/item-effect-p0-close` (`e0ba915`). P0 (item/card effect collection and
consumption) is closed as of that commit — this stage does **not** touch it. This is a UI/UX
change to the character-detail stat panel only. Scope is exactly four items:

1. Always show the next stat-up cost.
2. Show the red "can allocate" alert only when a stat can actually be raised right now.
3. Remove the `+10` button, replace it with `+1` / `최대` (max).
4. Show gained points and current holdings on level-up.

Explicitly out of scope (deferred to P1-B/C, per the task): combat-stat/ledger/special-effect
UI, `healBoost`/`magicImmune`/`armorElement`/`rangedDmgReduce`/`magicRaceAtk`/`skillDmg`/
`doubleAtkCard` implementation, equipment comparison, buff-source detail, ASPD/CAST detail
redesign, combo, the 394-item original-source backlog. `statSystemV2`/stat reset/rebirth
migration logic was not touched (regression-tested only).

## 1. 기존 문제

- 다음 칸을 올리는 데 필요한 포인트 수가 화면에 전혀 표시되지 않았다 — `statCost(cur)`는
  이미 존재했지만 UI에는 노출되지 않아, 사용자가 몇 점이 필요한지 알 방법이 없었다.
- 배지(`pts-badge`/`m-pts-badge`)가 `statPoints > 0`이면 항상 켜졌다. 그래서 포인트가
  1점 있어도 (예: STR이 91이라 다음 칸에 11점이 필요한 상황) 실제로는 아무것도 못 올리는데
  "배분 가능"처럼 보이는 빨간 알림이 떴다.
- `+10` 버튼은 고정 10칸 상승을 시도했는데, 실제 비용은 칸마다 다르므로(`statCost`가
  구간마다 증가) 정확히 몇 점이 드는지 예측 불가능했고, 포인트가 부족하면 일부만 올라가는지
  아예 안 올라가는지도 불명확했다.
- 레벨업 로그가 포인트 획득량이나 현재 보유량을 보여주지 않아, 몇 점을 얻었는지 누적
  포인트가 얼마인지 로그만으로 알 수 없었다.

## 2. statCost 공식 (변경 없음)

```js
function statCost(cur){ return Math.floor((cur - 1) / 10) + 2; }
```

이번 작업은 공식 변경이 아니다. 기존 `addStat`가 루프마다 이미 정확히 이 공식을 재사용하고
있었고, 이번에 추가한 `getMaxAffordableStatUps`/`canSpendStatPoint`도 전부 이 함수를 그대로
호출한다 — 별도로 재구현한 곳은 없다.

경계값(회귀 테스트로 고정): `statCost(1)=2`, `statCost(10)=2`, `statCost(11)=3`,
`statCost(20)=3`, `statCost(21)=4`, `statCost(91)=11`, `statCost(98)=11`.

## 3. canSpendStatPoint 기준

```js
function canSpendStatPoint(p){
  if(!p) return false;
  let pts = p.statPoints || 0;
  if(pts <= 0) return false;
  return STAT_KEYS.some(function(k){
    let cur = p[k] || 1;
    return cur < STAT_CAP && pts >= statCost(cur);
  });
}
```

"보유 포인트 > 0"이 아니라 "6개 스탯 중 하나라도 지금 당장 올릴 수 있는가"로 판정을
바꿨다. 포인트를 갖고 있어도 어느 스탯도 다음 칸 비용을 충당하지 못하면(예: 전부 상한
근접) false다. 이 함수가 배지 표시와 버튼 활성화 판정의 유일한 진입점이라, PC/모바일이
서로 다른 기준으로 어긋날 수 없다.

## 4. +10 제거 이유

- `+10`은 고정 칸수 상승이라 비용 예측이 불가능했다(구간마다 `statCost`가 달라짐 — 91→92는
  10점이지만 1→2는 2점).
- 포인트가 10칸 분량보다 적을 때의 동작(부분 상승/전체 실패)이 코드상 명확히 정의돼 있지
  않았고, 사용자가 그 동작을 예측할 방법도 없었다.
- "최대"는 "지금 가진 포인트로 이 스탯을 몇 칸까지 올릴 수 있는가"라는, 사용자가 실제로
  알고 싶어하는 질문에 직접 답한다. 계산은 `getMaxAffordableStatUps`가 전담하고 실행은
  기존 `addStat` 루프를 그대로 재사용하므로, "예측한 최대치"와 "실제로 오른 칸수"가
  다른 코드 경로를 타서 어긋날 가능성이 구조적으로 없다.

## 5. 최대 상승 계산

```js
function getMaxAffordableStatUps(cur, points){
  let n = 0, remain = points || 0;
  while(cur + n < STAT_CAP){
    let c = statCost(cur + n);
    if(remain < c) break;
    remain -= c; n++;
  }
  return n;
}
function addStatMax(st){
  let p = G.player; if(!p) return;
  let cur = p[st] || 1;
  let n = getMaxAffordableStatUps(cur, p.statPoints || 0);
  if(n <= 0){ log(`⚠ ${st.toUpperCase()}: 지금 보유 포인트로는 1칸도 올릴 수 없습니다.`,'warning'); return; }
  addStat(st, n);
}
```

과제 예시(STR 41, 20점 보유 → +3) 검증: `statCost(41)=6, statCost(42)=6, statCost(43)=6`
(41-48 모두 `floor((cur-1)/10)+2`로 4구간, 비용 6) → 3칸에 18점 소비, 남는 2점으로는
`statCost(44)=6`을 충당 못해 정지. `getMaxAffordableStatUps(41,20)===3` — 일치.

1칸도 못 올리면(`n<=0`) `addStat`를 호출하지 않고 경고 로그만 남긴다(상태 변화 없음).
`STAT_CAP` 도달 시에도 루프가 즉시 종료되어 `n=0`.

## 6. PC/모바일 배지 정책

PC("능력치" 버튼)와 모바일("캐릭터" 탭)은 `openCharDetail('stats')`를 통해 동일한 하나의
`#char-detail` DOM 패널을 공유한다(`mobileTab('char')`가 내부적으로 `openCharDetail('stats')`
를 호출) — 즉 스탯 패널은 PC용/모바일용 두 개의 구현이 아니라 하나뿐이다. 따라서 이번
수정은 한 곳(`updateUI()` 내부)만 고치면 되고, 두 배지(`pts-badge`, `m-pts-badge`)는 같은
루프에서 `canSpendStatPoint(p)` 한 번의 결과를 그대로 공유한다:

```js
let canSpend = canSpendStatPoint(p);
['pts-badge','m-pts-badge'].forEach(id=>{
  let b=document.getElementById(id);
  if(b){ b.textContent=canSpend?`●${pts}`:''; b.style.display=canSpend?'':'none'; }
});
```

색상 의미 규칙(과제 §13)대로: 빨강(배지 표시)=지금 행동 가능, 일반(버튼 opacity 1)=자원
있으나 지금 이 버튼은 조건부, 흐림(opacity 0.35)=자원 없거나 상한. 각 스탯의 `+1`/`최대`
버튼도 항상 보이되(더 이상 `display:none`으로 숨기지 않음) `opacity`/`cursor`만 토글해서
"버튼이 사라지는" 대신 "지금 안 된다"는 상태를 시각적으로 구분한다.

## 7. 레벨업 메시지

`gainBaseExp`의 레벨업 루프(코드베이스 전체에서 확인된 단일 레벨업 지점)에서:

```js
let gainedPts = levelStatPoints(p.baseLv); // 올리기 전 레벨 기준
p.statPoints = (p.statPoints||0) + gainedPts;
p.baseLv++;
lvUp = true;
if(!silent){
  let canSpendNow = canSpendStatPoint(p);
  log(`🌟 Base Lv.${p.baseLv} 달성 — 상태 포인트 +${gainedPts} · 보유 ${p.statPoints}${canSpendNow?' · 능력치 배분 가능':''}`,'level-up');
  notify('레벨 업!','gold'); pbReact('levelup');
}
```

획득량(`+${gainedPts}`)과 레벨업 후 누적 보유량(`보유 ${p.statPoints}`)을 항상 표시하고,
그 시점에 실제로 배분 가능한 스탯이 하나라도 있을 때만("전부 상한" 같은 예외 상황이 아닐
때만) "· 능력치 배분 가능" 문구를 덧붙인다 — 배지와 동일한 `canSpendStatPoint` 판정을
재사용해 로그와 배지가 항상 같은 결론을 내도록 했다.

## 8. 테스트

`tests/stat-allocation-ui-smoke.js` (신규, 9개 테스트) — `tests/_item-effect-harness.js`의
기존 범용 유틸(`extractBetween`/`extractFunction`/`html`, 수정 없음)로 `template.html`에서
`STAT_CAP` 선언부터 `addStatMax` 끝까지 실제 코드를 그대로 추출·실행(재구현 아님):

- `statCost` 경계값 7종 — 기존 공식과 일치.
- `getMaxAffordableStatUps` — 과제 예시(41세, 20점→+3) 포함 비용 구간 경계 다수, 정확히
  독립 검증 함수 `statCostTo`(기존, 누적비용)와도 교차 검증.
- `canSpendStatPoint` A-E — 과제 명세 5개 시나리오 전부.
- `+1`/`최대`/`포인트부족`/`상한` 4가지 클릭 케이스 — 실제 `addStat`/`addStatMax` 실행,
  "최대" 결과는 `getMaxAffordableStatUps`와 독립적으로 `statCostTo` 차이로도 교차 검증.
- 레벨업 2종 — 배분 가능/불가능(전원 상한) 각각에서 획득량·보유량·로그 문구·
  "능력치 배분 가능" 접미사 유무 확인.

전부 PASS. 기존 회귀 스위트(item-effects 계열 10개 파일 + `item-effect-audit-test.py`)도
전부 PASS — 이번 stat UI 변경이 P0 아이템/카드 효과 시스템에 영향을 주지 않았음을 확인.
