# Status/Stat/Equip UI — P1 종료감사 (P1-close)

Continuation of `feat/equipment-compare-ui-p1c`(`eac63a1`). 이번 작업은 새 기능 개발이
아니다 — P1-A(스탯 배분)/P1-B(전투 능력치+적용 효과)/P1-C(장비 비교)가 실제로 하나의
일관된 데이터 체계로 닫혔는지 전수 재검사하고 P1을 종료한다. P1 범위를 넘는 문제는 고치지
않고 backlog로 분리한다(§8).

## 1. P1 시작 전 문제

캐릭터 상태창에 다음이 없었다: 다음 스탯 상승 비용 표시, 실제 배분 가능 여부에 근거한
빨간 알림, PD/MaxHP/MaxSP/자연회복 표시, 실제 적용 중인 아이템/카드 효과 표시, 장비 교체
전 실제 능력치 변화 미리보기. 스탯 배분은 `+10` 고정 버튼이라 비용 예측이 불가능했고,
전투 능력치는 계산은 되지만(`s.pd`/`s.hpRegen` 등) 화면에 없었고(P0 §15 정본 인터페이스는
이미 있었다), 특수효과는 "집계되지만 실행 안 되는" 상태와 "실행되는" 상태를 화면에서
구분할 방법이 없었다.

## 2. P1-A (스탯 배분)

승리조건 재검사 — 전부 실제 코드에 존재:
- 다음 비용 항상 표시(`#cost-str` 등, `statCost(cur)`).
- `+1`/`최대`(`addStat`/`addStatMax`, `getMaxAffordableStatUps`).
- 실제 배분 가능할 때만 빨간 알림(`canSpendStatPoint(p)` — PC `pts-badge`/모바일
  `m-pts-badge` 공유 단일 판정).
- 레벨업 시 획득량+보유량 로그(`gainBaseExp` 내부, `levelStatPoints` 기반).

`statCost`/`STAT_CAP`/`getMaxAffordableStatUps`/`canSpendStatPoint`는 각각 정확히 한 곳에만
정의돼 있다(grep으로 재확인, §3). P1-C의 장비 비교는 이 함수들을 전혀 건드리지 않는다(스탯
배분과 장비 능력치는 서로 다른 관심사).

## 3. P1-B (전투 능력치 + 적용 효과)

승리조건 재검사 — 전부 존재:
- 기본 능력치: 투자값(`p.str` 등) + 총 보너스(`+N`) + 가능한 범위의 출처 분해
  (직업/장비/카드/버프/기타, `getStatBonusBreakdown`).
- 전투 능력치: ATK/MATK/DEF/MDEF/HIT/FLEE/CRIT/PD/ASPD(+실제 delay)/CAST/MaxHP/MaxSP/
  HP·SP 자연회복 — `#stat-atk`~`#stat-spregen` DOM id 전부 확인.
- 적용 효과: `getItemEffectAtomicRows(s)`(단일 ledger entry → 표시행)로부터 그룹화된
  active 목록, `fx.unsupported` 기반 미지원(⚠) 목록, `fx.pending` 기반 검증대기 목록,
  각 행의 source(카드/장비 이름) 표시까지 전부 확인.

**formatter coverage 감사(§10-11)**: `ITEM_EFFECT_P0_CLOSEOUT.md` §3의 소비 매트릭스에서
"실행정상/UI누락"으로 명시적으로 표시됐던 9개 행(dmgReduceAll/raceDmgReduce/elemReduce,
immune, grantSkill, dropBonus, hpDrain/spDrain/inflict/autoSpell, raceBonus/seProc/
lifesteal, soulgain — atkPct/raceAtk/elemAtk/sizeAtk/bossAtk/defIgnore/hpDrainSelf 포함)
**전부** `EFFECT_LEDGER_FORMATTERS`에 formatter가 있다 — P0가 발견한 "UI누락" 문제가 지금
0건이다. deferred 7종(magicRaceAtk/skillDmg/doubleAtkCard/healBoost/rangedDmgReduce/
magicImmune/armorElement)은 의도적으로 formatter가 없고 `fx.unsupported`로만 표시된다
(정상). 단순 stat/flat 효과(str~luk/atk/def/mdef/hit/flee/crit/aspd/pd/maxHp/maxSp/
maxHpPct/maxSpPct/hpRegenPct/spRegenPct)는 `EFFECT_HIDE_KEYS`로 의도적으로 숨겨진다(이미
기본/전투 능력치 합계에 반영돼 중복 표시 방지) — 이건 과제 §11이 명시적으로 허용한 경우다.

## 4. P1-C (장비 비교)

승리조건 재검사 — 전부 존재: `현재→calcStats()` vs `후보(clone)→calcStats()` diff(별도
공식 없음), STR~LUK/ATK/MATK/DEF/MDEF/HIT/FLEE/CRIT/PD 숫자 diff, ASPD(표시값+delay 별도
방향 판정)/CAST(감소율+즉시시전) diff, 특수효과 gained/lost/changed(`getItemEffectDiffRows`,
`getItemEffectAtomicRows` 재사용 — 두 번째 formatter 없음), unsupported/pending 별도 표시,
실제 equip parity(§7 재확인).

**effect diff coverage 감사(§12)**: `_effectIdentityDiscriminator`가 맵값 키 6종
(raceAtk/elemAtk/sizeAtk/raceDmgReduce/elemReduce/grantSkill)과 이벤트 키 4종
(immune/raceBonus/seProc/autoSpell)에 조건별 discriminator를 갖고 있고, 나머지 단일값
키(atkPct/bossAtk/defIgnore/dmgReduceAll/spCostMul/castReduction/hpDrainSelf/lifesteal/
hpDrain/spDrain/inflict/dropBonus/soulgain은 race로)는 key 하나로 identity가 충분하다 —
formatter가 있는 모든 키가 diff 가능하다. 커버리지 누락 0건.

## 5. 최종 데이터 흐름

```
player/equip/statusEffects
        ↓
    calcStats()
        ↓
 ┌────────────────────┬───────────────────────────┐
 │ 상태창(#char-detail)│ 장비 비교(showItemDetail)   │
 │ current stats       │ current stats(calcStats()) │
 │ s.itemEffects.ledger│ candidate stats             │
 │ (getItemEffectAtomic│  = calcStats(clone)         │
 │  Rows→그룹 표시)     │ ledger diff                 │
 │                     │  (getItemEffectDiffRows,    │
 │                     │   같은 atomic rows 재사용)   │
 └────────────────────┴───────────────────────────┘
```

장비 비교 후보만 `clone = _cloneLoadoutForComparison(p)`(player+equip 얕은 복제) +
`resolveEquipSlot`/`applyCandidateEquip`(equipItem()과 완전히 같은 코드) → `calcStats(clone)`
경로를 거친다. `G.player`는 이 과정에서 전혀 mutate되지 않는다(§13에서 재확인).
`calcStats(playerOverride)`(P1-C에서 추가한 유일한 시그니처 변경)는 최상단 한 줄 외에는
전부 지역변수 `p`만 참조하므로, 후보 계산이 실제 플레이어 상태에 새는 경로가 없다.

## 6. PC/모바일

`#char-detail`(PC "능력치" 버튼/모바일 "캐릭터" 탭)과 `showItemDetail`(장비 상세 모달)
모두 단일 함수·단일 DOM이다 — grep으로 재확인한 결과 모바일 전용 분기(`isMobile` 등)가
stat/effect/equip 관련 코드 어디에도 없다. `canSpendStatPoint`/`getItemEffectAtomicRows`/
`getEquipmentComparison`은 각각 정확히 한 곳에서만 정의되고 PC/모바일이 같은 호출 결과를
공유한다. 유일한 차이는 CSS 미디어쿼리(`@media(max-width:700px)`)로 적용 효과·장비 비교
박스가 모바일에서만 기본 접힘 — 계산은 완전히 동일.

## 7. 테스트

| 파일 | 보장 범위 |
|---|---|
| `tests/stat-allocation-ui-smoke.js` | statCost 경계값, getMaxAffordableStatUps, canSpendStatPoint A-E, +1/최대 실제 클릭, 레벨업 로그 |
| `tests/status-detail-ui-smoke.js` | 기본 stat 출처 분해(단일 소스별), PD/ASPD/CAST 실값, active ledger 3그룹 분류, deferred/pending 배제, 장착해제 반영, 단순효과 중복없음 |
| `tests/equipment-compare-smoke.js` | 단순/복합/카드 장비 diff, deferred/pending 처리, 동일장비 무변화, 빈슬롯, 실제 equip parity E2E, 장착불가, 양손무기-방패해제 |
| `tests/status-ui-p1-close-smoke.js`(신규) | job+equip+card+buff **동시 존재** 시 breakdown 합계=최종값(개별 테스트엔 없던 4종 동시 케이스), 악세서리 2슬롯 만석 상태에서 3번째 후보 비교 시 정확한 슬롯교체 예측(구형 버그 재발 방지 회귀) |

기존 테스트를 합칠 필요는 없다고 판단했다(과제 §19) — 각 파일이 서로 다른 스테이지의
서로 다른 관심사를 보장하고 중복이 없다. 전체 15개 JS 테스트 + `item-effect-audit-test.py`
전부 PASS.

## 8. P1 범위 밖 backlog

| 항목 | 문제 | 왜 P1 차단이 아닌지 | 다음 시작점 |
|---|---|---|---|
| A. 상점 `getEquipCompareHtml` | `let slot=it.type` — 악세서리를 `'Accessory'`라는 존재하지 않는 슬롯 키로 취급, 두 슬롯이 이미 찬 상태에서 교체량을 과소평가(사라지는 효과 누락) | P1-C의 정본 경로(`showItemDetail`→`getEquipmentComparison`)는 오염되지 않음(호출 관계 확인 — `getEquipCompareHtml`은 상점 매입 상세 1곳에서만 호출됨) — 원래도 P1-C 범위(인벤토리/장비창) 밖의 별도 레거시 기능 | 상점 UI를 다룰 다음 스테이지에서 `getEquipmentComparison`으로 교체하거나 최소 슬롯판정만 `resolveEquipSlot`으로 고치기 |
| B. `renderChar()`/`statBreakdowns`/stat-tooltip | 대상 DOM `#char-info`가 템플릿에 없어 렌더 결과가 어디에도 표시되지 않는 죽은 경로(P1-B에서 최초 발견, 이번에도 재확인) | 현재 `#char-detail` UI가 필요로 하는 모든 기능(값 표시, 출처 분해, 효과 목록)이 전부 새 경로(getStatBonusBreakdown/getItemEffectAtomicRows)에 있다 — 죽은 경로는 계산은 유효하지만 참조되지 않는 무해한 코드 | 다음에 UI 코드 정리 스테이지에서 삭제하거나, 대신 살려서 hover 툴팁으로 재활용할지 결정 |
| C. combo/set | 미착수 | 애초에 P1 범위 아님 | 별도 전투 시스템 스테이지 |
| D. 보류 효과 7종 실제 엔진(magicRaceAtk/skillDmg/doubleAtkCard/healBoost/rangedDmgReduce/magicImmune/armorElement) | P0에서 이미 unsupported[]로 추적 가능하게 문서화, 실제 게임 로직 미구현 | P1은 "표시"만 담당(⚠ 현재 미지원) — 실제 구현은 애초에 P0/P1 범위 밖으로 명시 보류됨 | 원작 근거 확보 후 별도 스테이지 |
| E. 원작 검증 backlog 394건 | 미착수 | UI/표시 문제가 아니라 데이터 정확성 문제 | 별도 데이터 검증 스테이지 |

## 9. 종료 판정

**종료 가능.** P1-A/B/C 승리조건 전부 실제 코드에 존재하고 유지됨을 재확인했다. 상태창/
장비 비교가 `calcStats()`+`s.itemEffects.ledger/unsupported/pending`이라는 단일 정본만
읽으며(DB.items 재파싱 0건, 별도 stat 공식 0건, 재확인), PC/모바일이 완전히 같은 계산을
공유한다(분기 0건). formatter coverage 감사 결과 P0가 지적했던 "실행정상/UI누락" 9개
행이 전부 닫혔고, 장비 비교 effect diff에서도 커버리지 누락이 없다. 장비 비교의 state
mutation은 0건(실제 equip parity 전부 PASS, 악세서리 2슬롯 만석 케이스 포함 신규 확인).
상점 레거시 버그와 죽은 렌더 경로는 실제 사용 중인 P1 UI를 오염시키지 않음을 확인해
별도 backlog로 분리했다(§8). 이번 감사에서 코드 수정은 0건이었다(신규 회귀 테스트
1개 파일만 추가) — 발견된 모든 항목이 이미 정상이거나 P1 범위 밖이었기 때문이다.
