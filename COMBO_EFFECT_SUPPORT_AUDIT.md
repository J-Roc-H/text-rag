# COMBO_EFFECT_SUPPORT_AUDIT.md — P2-A.4 콤보 effect-support 정밀화

핵심 질문: rAthena combo Script의 미지원 효과 중, TextRAG의 기존 P0 canonical
field + 실제 gameplay consumer까지 정확히 연결되는 것만 안전하게 지원할 수 있는가?
**"parser가 읽을 수 있음 != 게임에서 실제 지원됨"** — 이번 단계는 숫자를 늘리기 위해
canonical 변환만 하고 consumer 없는 효과를 verified로 올리는 것을 금지한다.
canonicalize_combos.py/build.py 외에는 아무 것도 건드리지 않는다(calcStats/전투
코드/UI는 P2-A와 동일하게 이번에도 손대지 않았다).

## 1. 범위

P2-A.3이 넘긴 병목: identity-complete(모든 requiredItems resolved) 101개 콤보 중
60개가 순전히 `unsupported` 효과 때문에 막혀 있었고, backlog 1위는 단순 빈도가 아니라
"단독으로 콤보를 완성시키는 빈도"(soloFixRuntimeReadyPotential) 기준 `bSkillAtk`(7건
중 6건 solo-fix)였다. 이번 단계는 그 backlog의 각 constant를 **실제 게임 코드**
(calcStats/getSkillSpCost/applyIncomingItemReduction/isStatusImmune/
_triggerOnHitEvent/triggerItemEffects, 전부 index.html)를 다시 읽어 "canonical 필드
이름만 있는지" vs "그 필드를 실제로 읽어 게임 결과에 반영하는 코드가 있는지"를
하나씩 재확인했다.

## 2. verdict 6종

| verdict | 의미 |
|---|---|
| `safe-existing-consumer` | canonical 필드 + 실제 gameplay consumer 모두 확인됨 — canonicalize_combos.py가 지원 |
| `canonical-but-runtime-deferred` | P0가 canonical 필드는 갖고 있으나 그 필드 자체가 게임에 영향을 주지 않음(P0-close "명시보류") |
| `trigger-model-missing` | 그 트리거를 모으는 코드 자체가 없음(예: onDamaged는 항상 빈 배열) |
| `identity-mapping-gap` | 트리거/consumer는 존재하나 rAthena 식별자(스킬 ID, pseudo-race 등)를 TextRAG 식별자로 옮길 근거가 없음(추측 금지) |
| `engine-extension-required` | 해당 메커닉을 다루는 소비처 코드 자체가 없음(새 계산식 필요, 이번 단계에서 추가하지 않음) |
| `dynamic-expression` | 값 자체가 `getequiprefinerycnt()` 등 동적 표현식이라 평가하지 않음(상수 추출만) |

전량은 `source/data/combo-effect-support-matrix.json`(48개 constant, 생성기
`tools/gen_combo_effect_support_matrix.py`)에 있다. 분포: safe 7 · deferred 1 ·
trigger-missing 2 · identity-gap 4 · engine-extension 30 · dynamic-expr 4.
**대다수(30/48)가 여전히 engine-extension-required로 끝났다 — 이것은 실패가 아니라
정확성이 우선이라는 이번 단계 원칙(§24)이 의도한 결과다.**

## 3. SAFE로 확정된 4개 constant (7개 항목 — enum/case 변형 포함)

| constant | 조건 | canonical target | 실코드 근거 |
|---|---|---|---|
| `bCastrate`/`bCastRate` | 리터럴 1-인자만 | `combat.castReduction`, `fraction=-n/100` | calcStats: `castReduction=Math.min(1.0, base+(bonus.castReduction\|\|0))` — 하한 clamp 없어 n>0(캐스팅 증가)도 그대로 반영됨을 실코드로 확인 |
| `bUseSPrate`/`bUseSPRate` | 리터럴 1-인자만 | `combat.spCostMul`, `multiplier=1+n/100` | getSkillSpCost: `baseCost*mul`; 아이템 파서: `fx.combat.spCostMul*=Number(it.spCostMul)`(곱연산, 기본값 1) — n% -> 배율 변환이 정확히 대응 |
| `bAddClass,Class_All` | enum=Class_All만 | `combat.atkPct`(그대로) | getOutgoingAtkPctMul: `1+(cardAtkPct\|\|0)/100`, 대상 필터 없음 — Class_All(전체 몬스터)과 트리거 일치 |
| `bAddClass,Class_Boss` | enum=Class_Boss만(실 데이터 0건, 향후 대비) | `combat.bossAtk`(그대로) | applyOutgoingRaceElemSizeBossAtk: `if(cardBossAtk && target.isMvp) mul+=cardBossAtk/100` — Class_Boss와 트리거 일치 |
| `bSubRace,RC_All` | enum=RC_All만 | `combat.dmgReduceAll`(그대로) | applyIncomingItemReduction: `if(all) result*=(1-all/100)`, 종족 조건 없음 — RC_All(전종족)과 트리거 일치 |

**per-instance 원칙 재확인**: 같은 constant라도 인스턴스에 따라 판정이 갈린다 —
`bCastrate`는 리터럴 1-인자면 SAFE지만 스킬 지정 2-인자(`bonus2
bCastrate,"AL_HOLYLIGHT",-50`, 실데이터 rathena-pre-0049-01)나 동적 표현식
(`bonus bCastrate,-getequiprefinerycnt(...)`, rathena-pre-0004-01/0005-01/0064-01)은
여전히 unsupported다. `bSubRace`도 RC_All은 SAFE지만 같은 콤보에 항상 함께 등장하는
RC_Player_Human(rathena-pre-0045-01~0050-02, 7개 콤보 전부)은 여전히
identity-mapping-gap이라 그 콤보들은 여전히 `unsupported` 상태다 — **RC_All 지원이
콤보를 완성시키지 못한다는 것도 실데이터로 확인**(솔로-fix potential 0, P2-A.3의
원래 backlog 판정과 일치).

## 4. 확정적으로 계속 미지원인 주요 constant

| constant | verdict | 근거 |
|---|---|---|
| `bSkillAtk` | canonical-but-runtime-deferred | ITEM_EFFECT_P0_CLOSEOUT.md가 이미 skillDmg 소비처 0건("명시보류")으로 확정 — 재확인만, 신규 조사 불필요 |
| `bMatkRate` | engine-extension-required | buildMatkBreakdown 실코드 재확인: `bonus.matk`는 flat만 가산, %기반 MATK 필드 자체가 없음 |
| `bAutoSpell` | identity-mapping-gap | `_triggerOnHitEvent` case autoSpell(`DB.skills[evt.skill].effect`) 트리거는 존재하나, 콤보에 쓰인 rAthena 스킬 ID(NJ_HUUJIN/MO_EXTREMITYFIST/AL_CRUCIS 등 10종) 전수를 DB.skills에서 grep한 결과 0건 일치 — TextRAG는 한글 스킬키를 쓰고 rAthena 스킬 ID와 대응 테이블이 없음(추측 금지) |
| `bAutoSpellWhenHit`/`bAddEffWhenHit` | trigger-model-missing | `events.onDamaged`는 항상 빈 배열(집계 코드 자체가 없음) — ITEM_EFFECT_P0_CLOSEOUT.md 재확인과 정확히 일치 |
| `bAddEff` | engine-extension-required | `_triggerOnHitEvent` case inflict는 stun/confusion/random_debuff 3종 고정 필드(turns도 하드코딩)만 지원; 실데이터의 Eff_Stone/Eff_Curse/Eff_Blind는 그 3종에 없음 — Eff_Stun/Eff_Confusion 리터럴 2-인자라면 이론상 안전할 수 있으나 실 콤보 데이터에 사례 0건이라 코드 추가하지 않음 |
| `bResEff` | engine-extension-required | isStatusImmune 실코드 재확인: `cardImmune` 배열 존재 여부만 보는 이진 면역 — 부분 저항 %를 표현할 자료구조 자체가 없음 |
| `bLongAtkRate` | engine-extension-required(저복잡도) | `isRangedWeapon=['활','악기','채찍'].includes(p.weaponType)` 구조 데이터는 있으나, 이를 조건으로 ATK%를 가산하는 소비처가 없음 — engine-extension-backlog 2순위(신규 데이터 불필요, 소비처 함수만 추가하면 됨) |

## 5. before/after 수치

| | P2-A.3 종료 | P2-A.4 종료 |
|---|---|---|
| combo status verified | 38 | **46**(+8) |
| combo status unsupported | 60 | **52**(-8) |
| combo status source-needed | 58 | 58(불변) |
| COMBO_KNOWN_EFFECT_KEYS | 23개 | **28개**(+castReduction/spCostMul/atkPct/bossAtk/dmgReduceAll) |
| COMBO_CONSUMER_BACKED_KEYS | (신규) | 28개 — COMBO_KNOWN_EFFECT_KEYS와 항상 동일(assert로 강제) |

**재검증 결과(§31, 기존 verified 38개 재감사)**: 38개 전부 `audit_combo_consumer_backed`
FAIL 0건으로 통과 — 숫자가 줄어들 가능성을 열어뒀지만(§31 "숫자가 감소해도 정확한 게
우선"), 실제로는 P0-close가 이미 이 23개 키 전부를 소비처까지 확인해뒀기 때문에
하나도 줄지 않았고 8개가 순증했다(diff 확인: `lost=set()`,
`gained=[0003-01,02,03, 0028-01, 0033-02, 0035-01,02, 0080-01]`).

## 6. fallback(bonus/bonus2) constant 이름 정밀화(§124)

기존 `parse_statement`의 마지막 분기는 `bonus3/4/5`만 두 번째 단어를 추출하고
`bonus`/`bonus2`는 첫 단어("bonus"/"bonus2" 그 자체)를 constant로 남기는 버그가
있었다 — 동적 표현식이나 인자 없는 플래그형 bonus(`bonus bNoCastCancel;`)가 전부
"bonus"라는 뭉뚱그려진 이름으로 감사 보고서에 쌓였다. 정규식을
`^(bonus[2-5]?)\s+(\w+)`로 통일해 bonus/bonus2/3/4/5 전부 실제 상수명을 추출하도록
고쳤다(추출만, 값은 절대 평가하지 않음). 재생성 결과 "bonus"(18건)/"bonus2"(9건)
레이블이 census에서 완전히 사라지고 bDef/bMdef/bHit/bMatk/bMatkRate/bSubEle/
bAddMonsterDropItem/bAddItemHealRate/bAddDefMonster/bUnbreakableArmor/
bNoCastCancel 등 실제 상수로 정확히 재배정됐다(테스트 J로 회귀 고정).

## 7. combo-engine-extension-backlog.json

`tools/gen_combo_engine_extension_backlog.py`가 matrix의 engine-extension-required/
trigger-model-missing/identity-mapping-gap 36개를
`priorityScore = unlockPotentialCombos / complexityWeight(low=1,medium=2,high=3)`로
정렬한다. 상위 3순위:

| 순위 | constant | unlockPotential(콤보 수) | complexity | 근거 |
|---|---|---|---|---|
| 1 | `bMatkRate` | 27 | medium | 새 canonical 필드 + buildMatkBreakdown 소비처 추가 필요, 계산식은 단순 |
| 2 | `bLongAtkRate` | 6 | **low** | isRangedWeapon 구조 데이터 이미 존재, 소비처 함수 1개만 추가 |
| 3 | `bAspdRate` | 9 | high | 기존 flat aspd(*20ms)와 %기반 단위 체계 통합 리팩터 필요 |

빈도 1위(`bSubRace`, 8콤보)는 identity-mapping-gap(RC_Player_Human)이라 이 목록에서
`priorityScore=2.667`로 5위 밖으로 밀린다 — "빈도"와 "우선순위"가 다르다는 걸 데이터로
보여준다.

## 8. 수동 실데이터 검증 표본(§34)

| 구분 | 콤보 ID | rawStatement | 판정 |
|---|---|---|---|
| bSkillAtk #1 | rathena-pre-0062-01 | `bonus2 bSkillAtk,"AL_HEAL",50` | unsupported 유지(canonical-but-runtime-deferred) |
| bSkillAtk #2 | rathena-pre-0053-01 | `bonus2 bSkillAtk,"PR_SANCTUARY",...` 계열(bSkillHeal2) | unsupported 유지 |
| bMatkRate #1 | rathena-pre-0013-01 | `bonus bMatkRate,5` | unsupported 유지(engine-extension) |
| bMatkRate #2 | rathena-pre-0004-01 | `bonus bMatkRate,6` | unsupported 유지 |
| bAddClass #1 | rathena-pre-0003-01 | `bonus2 bAddClass,Class_All,4` | **SAFE 전환** — effects에 `atkPct=4` 반영 확인 |
| bAddClass #2 | rathena-pre-0053-01 | `bonus2 bAddClass,Class_All,5` | 같은 콤보 내 bResEff/bSkillHeal2가 막아 콤보 자체는 여전히 unsupported(개별 effect는 SAFE) |
| bCastrate #1 | rathena-pre-0028-01 | `bonus bCastrate,-10` | **SAFE 전환** — `castReduction=0.1` |
| bCastrate #2 | rathena-pre-0060-01 | `bonus bCastrate,25` | **SAFE 전환** — `castReduction=-0.25`(양수 부호도 정확히 반영) |
| bUseSPrate #1 | rathena-pre-0033-01 | `bonus bUseSPrate,-3` | **SAFE 전환** — `spCostMul=0.97`(콤보는 여전히 source-needed, identity 미해결이 별도 원인) |
| bUseSPrate #2 | rathena-pre-0067-01 | `bonus bUseSPrate,-25` | **SAFE 전환** — `spCostMul=0.75` |
| AutoSpell #1 | rathena-pre-0020-01 | `bonus3 bAutoSpell,"NJ_HUUJIN",5,100` | unsupported 유지(identity-mapping-gap) |
| AutoSpell #2 | rathena-pre-0002-01 | `bonus3 bAutoSpellWhenHit,"HP_ASSUMPTIO",2,5` | unsupported 유지(trigger-model-missing) |
| status-proc #1 | rathena-pre-0019-01 | `bonus2 bAddEff,Eff_Stone,1000` | unsupported 유지(engine-extension) |
| status-proc #2 | rathena-pre-0071-01 | `bonus2 bAddEffWhenHit,Eff_Sleep,600` | unsupported 유지(trigger-model-missing) |
| fallback-dynamic #1 | rathena-pre-0004-01 | `bonus bCastrate,-getequiprefinerycnt(EQI_HEAD_TOP)` | unsupported, constant="bCastrate"(정밀화 확인) |
| fallback-dynamic #2 | rathena-pre-0026-01 | `bonus bDef,2-getequiprefinerycnt(...)-getequiprefinerycnt(...)` | unsupported, constant="bDef"(이전엔 "bonus"였음) |
| fallback-dynamic #3 | rathena-pre-0026-01 | `bonus bMdef,5+getequiprefinerycnt(...)+getequiprefinerycnt(...)` | unsupported, constant="bMdef"(이전엔 "bonus"였음) |

## 9. 회귀/빌드 검증

- `tests/combo-effect-support-test.py`(시나리오 A-L, 24개 체크) 신규 작성, 전부 PASS.
- 기존 Python 감사 테스트 5개(`combo-item-identity-test.py`,
  `combo-item-identity-review-test.py`, `combo-item-identity-final-review-test.py`,
  `item-combo-audit-test.py`, `item-effect-audit-test.py`) 전부 재실행 PASS.
- 기존 JS smoke 테스트 15개 전부 재실행 PASS.
- `python3 build.py` → FAIL 0, 기존 5개 독립 WARN 카운터(map 1/item-effect 469/
  combo 64/identity 53/review 1) 불변 + 신규 "combo effect-support(consumer-backed)
  audit" 카운터 FAIL 0(WARN 없음, fails-only 게이트).
- **gameplay parity**: `git status --short -- index.html 룬미드가츠_v9.19.html`
  빈 diff — 이번 단계는 calcStats/전투 코드를 전혀 건드리지 않았으므로 당연한
  결과지만 명시적으로 재확인했다.

## 10. 다음 트랙 판정

**P2-A.5(engine extension)이 필요한가, 바로 P2-B(매처)로 갈 수 있는가**: 이번 단계로
identity-complete 콤보 중 8개가 추가로 runtime-ready(46/156)가 됐지만, 여전히
`bMatkRate`(27콤보) 하나가 unlock-potential의 압도적 1위이며 complexity가 medium(새
필드 + 소비처 함수 정도)이라 투자 대비 효과가 크다. `bLongAtkRate`(6콤보, low
complexity)도 저비용 고효율이다. **P2-A.5로 이 둘(bMatkRate, bLongAtkRate)만 먼저
좁게 처리하는 편이 P2-B보다 낫다** — combo-engine-extension-backlog.json이 이미
그 우선순위를 데이터로 뒷받침한다. `bAutoSpell`/`skill`(identity-mapping-gap)은
P2-A.1~A.3급의 별도 "스킬 identity 복구" 프로젝트가 필요한 수준이라 이번 결정과
분리해서 다뤄야 한다. P2-B(매처) 착수는 여전히 이르다 — runtime-ready 46건은
P2-A.3의 38건보다 견고해졌지만, bMatkRate/bLongAtkRate 처리로 더 늘릴 여지가
뚜렷이 남아 있다.
