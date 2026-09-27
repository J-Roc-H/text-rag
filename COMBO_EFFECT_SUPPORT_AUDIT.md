# COMBO_EFFECT_SUPPORT_AUDIT.md — P2-A.4 콤보 effect-support 정밀화

핵심 질문: rAthena combo Script의 미지원 효과 중, TextRAG의 기존 P0 canonical
field + 실제 gameplay consumer까지 정확히 연결되는 것만 안전하게 지원할 수 있는가?
**"parser가 읽을 수 있음 != 게임에서 실제 지원됨"** — 이번 단계는 숫자를 늘리기 위해
canonical 변환만 하고 consumer 없는 효과를 verified로 올리는 것을 금지한다.
canonicalize_combos.py/build.py 외에는 아무 것도 건드리지 않는다(calcStats/전투
코드/UI는 P2-A와 동일하게 이번에도 손대지 않았다).

> **⚠️ 2026-09-27 정정 공지**: 아래 §2-§9는 P2-A.4 최초 판정(2026-09-26) 원문을
> 그대로 보존한 기록이다. 독립검증 결과 `bUseSPrate`/`bAddClass`/`bSubRace,RC_All`
> 3종이 "consumer 존재"만 확인하고 **stacking/scope parity를 놓쳐** 잘못 SAFE로
> 승격됐음이 드러나 **취소**됐다(consumer는 실제로 있었다 — 결과가 원작과 달랐을
> 뿐이다). 최초 판정 문서를 조용히 덮어쓰지 않고 그대로 남긴 뒤, **§11(정정)**에
> 문제 발견 경위·rAthena pinned source(pc.cpp/battle.cpp) 재확인 결과·최종 판정을
> 기록한다. **최종 SAFE 목록은 §11이며, §3/§7/§8의 해당 표시(❌)가 붙은 행은
> §11 기준으로 이미 되돌려졌다.** 최신 수치는 §11의 표를 본다.

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
| ~~`bUseSPrate`/`bUseSPRate`~~ ❌**§11에서 취소** | ~~리터럴 1-인자만~~ | ~~`combat.spCostMul`, `multiplier=1+n/100`~~ | ~~getSkillSpCost: `baseCost*mul`; 아이템 파서: `fx.combat.spCostMul*=Number(it.spCostMul)`(곱연산, 기본값 1) — n% -> 배율 변환이 정확히 대응~~ **stacking parity를 확인하지 않은 채 판정 — §11 참조** |
| ~~`bAddClass,Class_All`~~ ❌**§11에서 취소** | ~~enum=Class_All만~~ | ~~`combat.atkPct`(그대로)~~ | ~~getOutgoingAtkPctMul: `1+(cardAtkPct\|\|0)/100`, 대상 필터 없음 — Class_All(전체 몬스터)과 트리거 일치~~ **scope parity(스킬 데미지 포함 여부)를 확인하지 않은 채 판정 — §11 참조** |
| ~~`bAddClass,Class_Boss`~~ ❌**§11에서 취소** | ~~enum=Class_Boss만(실 데이터 0건, 향후 대비)~~ | ~~`combat.bossAtk`(그대로)~~ | ~~applyOutgoingRaceElemSizeBossAtk: `if(cardBossAtk && target.isMvp) mul+=cardBossAtk/100` — Class_Boss와 트리거 일치~~ **위와 동일 사유로 취소** |
| ~~`bSubRace,RC_All`~~ ❌**§11에서 취소** | ~~enum=RC_All만~~ | ~~`combat.dmgReduceAll`(그대로)~~ | ~~applyIncomingItemReduction: `if(all) result*=(1-all/100)`, 종족 조건 없음 — RC_All(전종족)과 트리거 일치~~ **cross-field 합성 방식(stacking)을 확인하지 않은 채 판정 — §11 참조** |

**교훈(§11에서 재확인)**: 위 네 항목은 모두 "트리거 조건이 rAthena 문서와 의미상
일치한다"는 것까지만 확인하고 SAFE로 승격했다 — **"트리거가 같다"와 "여러 소스가
겹칠 때 결과까지 같다"는 별개 질문**이라는 게 이번 정정의 핵심 교훈이다. `bCastrate`만
consumer+scope+stacking 3축을 모두 실코드(pc.cpp까지)로 확인했고 끝까지 SAFE로
남았다.

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

## 5. before/after 수치 (최초 판정, ❌ §11에서 정정됨)

> 아래 표는 2026-09-26 최초 판정 시점 수치다. §11의 정정 후 최종 수치는 §11 §5절을 본다.

| | P2-A.3 종료 | P2-A.4 최초 판정(2026-09-26) |
|---|---|---|
| combo status verified | 38 | 46(+8) — ❌ 8건 중 6건(bAddClass 3 + bUseSPrate 3)이 §11에서 되돌아감 |
| combo status unsupported | 60 | 52(-8) |
| combo status source-needed | 58 | 58(불변) |
| COMBO_KNOWN_EFFECT_KEYS | 23개 | 28개(+castReduction/spCostMul/atkPct/bossAtk/dmgReduceAll) — ❌ 4개(spCostMul/atkPct/bossAtk/dmgReduceAll)가 §11에서 제거됨 |
| COMBO_CONSUMER_BACKED_KEYS | (신규) | 28개 — COMBO_KNOWN_EFFECT_KEYS와 항상 동일(assert로 강제, 이후 §11에서 COMBO_RUNTIME_SAFE_KEYS로 개명) |

**재검증 결과(§31, 기존 verified 38개 재감사)**: 38개 전부 `audit_combo_consumer_backed`
FAIL 0건으로 통과 — 숫자가 줄어들 가능성을 열어뒀지만(§31 "숫자가 감소해도 정확한 게
우선"), 실제로는 P0-close가 이미 이 23개 키 전부를 소비처까지 확인해뒀기 때문에
하나도 줄지 않았고 8개가 순증했다(diff 확인: `lost=set()`,
`gained=[0003-01,02,03, 0028-01, 0033-02, 0035-01,02, 0080-01]`). **이 재검증 자체는
유효하다 — 기존 23개 키는 문제가 없었다. 문제는 새로 추가한 5개 중 4개였다.**

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

## 7. combo-engine-extension-backlog.json (최초 판정, 순위는 §11에서 갱신됨)

`tools/gen_combo_engine_extension_backlog.py`가 matrix의 engine-extension-required/
trigger-model-missing/identity-mapping-gap 36개를
`priorityScore = unlockPotentialCombos / complexityWeight(low=1,medium=2,high=3)`로
정렬한다. 상위 3순위(최초 판정 시점):

| 순위 | constant | unlockPotential(콤보 수) | complexity | 근거 |
|---|---|---|---|---|
| 1 | `bMatkRate` | 27 | medium | 새 canonical 필드 + buildMatkBreakdown 소비처 추가 필요, 계산식은 단순 |
| 2 | `bLongAtkRate` | 6 | **low** | isRangedWeapon 구조 데이터 이미 존재, 소비처 함수 1개만 추가 |
| 3 | `bAspdRate` | 9 | high | 기존 flat aspd(*20ms)와 %기반 단위 체계 통합 리팩터 필요 |

빈도 1위(`bSubRace`, 8콤보)는 identity-mapping-gap(RC_Player_Human)이라 이 목록에서
`priorityScore=2.667`로 5위 밖으로 밀린다 — "빈도"와 "우선순위"가 다르다는 걸 데이터로
보여준다. **§11 정정 이후 `bUseSPrate`/`bAddClass`/`bSubRace`가 stacking-scope-mismatch로
이 backlog에 새로 편입되면서 순위가 바뀌었다 — 최신 순위는 §11 §9절을 본다.**

## 8. 수동 실데이터 검증 표본(§34)

| 구분 | 콤보 ID | rawStatement | 판정 |
|---|---|---|---|
| bSkillAtk #1 | rathena-pre-0062-01 | `bonus2 bSkillAtk,"AL_HEAL",50` | unsupported 유지(canonical-but-runtime-deferred) |
| bSkillAtk #2 | rathena-pre-0053-01 | `bonus2 bSkillAtk,"PR_SANCTUARY",...` 계열(bSkillHeal2) | unsupported 유지 |
| bMatkRate #1 | rathena-pre-0013-01 | `bonus bMatkRate,5` | unsupported 유지(engine-extension) |
| bMatkRate #2 | rathena-pre-0004-01 | `bonus bMatkRate,6` | unsupported 유지 |
| bAddClass #1 | rathena-pre-0003-01 | `bonus2 bAddClass,Class_All,4` | ~~SAFE 전환~~ ❌**§11에서 취소**(scope-mismatch) |
| bAddClass #2 | rathena-pre-0053-01 | `bonus2 bAddClass,Class_All,5` | ~~같은 콤보 내 bResEff/bSkillHeal2가 막아 콤보 자체는 여전히 unsupported(개별 effect는 SAFE)~~ ❌**§11에서 취소**(어차피 다른 이유로도 unsupported였음) |
| bCastrate #1 | rathena-pre-0028-01 | `bonus bCastrate,-10` | **SAFE 전환**(§11에서 stacking parity 재확인 후에도 유지) — `castReduction=0.1` |
| bCastrate #2 | rathena-pre-0060-01 | `bonus bCastrate,25` | **SAFE 전환**(§11에서 유지) — `castReduction=-0.25`(양수 부호도 정확히 반영) |
| bUseSPrate #1 | rathena-pre-0033-01 | `bonus bUseSPrate,-3` | ~~SAFE 전환~~ ❌**§11에서 취소**(stacking-mismatch) |
| bUseSPrate #2 | rathena-pre-0067-01 | `bonus bUseSPrate,-25` | ~~SAFE 전환~~ ❌**§11에서 취소** |
| AutoSpell #1 | rathena-pre-0020-01 | `bonus3 bAutoSpell,"NJ_HUUJIN",5,100` | unsupported 유지(identity-mapping-gap) |
| AutoSpell #2 | rathena-pre-0002-01 | `bonus3 bAutoSpellWhenHit,"HP_ASSUMPTIO",2,5` | unsupported 유지(trigger-model-missing) |
| status-proc #1 | rathena-pre-0019-01 | `bonus2 bAddEff,Eff_Stone,1000` | unsupported 유지(engine-extension) |
| status-proc #2 | rathena-pre-0071-01 | `bonus2 bAddEffWhenHit,Eff_Sleep,600` | unsupported 유지(trigger-model-missing) |
| fallback-dynamic #1 | rathena-pre-0004-01 | `bonus bCastrate,-getequiprefinerycnt(EQI_HEAD_TOP)` | unsupported, constant="bCastrate"(정밀화 확인) |
| fallback-dynamic #2 | rathena-pre-0026-01 | `bonus bDef,2-getequiprefinerycnt(...)-getequiprefinerycnt(...)` | unsupported, constant="bDef"(이전엔 "bonus"였음) |
| fallback-dynamic #3 | rathena-pre-0026-01 | `bonus bMdef,5+getequiprefinerycnt(...)+getequiprefinerycnt(...)` | unsupported, constant="bMdef"(이전엔 "bonus"였음) |

## 9. 회귀/빌드 검증 (최초 판정 시점 — §11에서 M-Q 추가됨)

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

## 10. 다음 트랙 판정 (최초 판정 — §11에서 갱신됨)

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

---

## 11. 정정(2026-09-27) — SAFE 판정 3종 취소

### 11.1 문제 발견 경위

독립검증(사용자 지시)에서 `safe-existing-consumer`로 승격한 효과 중 3종
(`bUseSPrate`, `bAddClass`, `bSubRace,RC_All`)이 rAthena와 TextRAG의 **실제
semantics가 일치하지 않음**이 확인됐다. 최초 판정(§2-§9)은 SAFE 조건을 "canonical
field 있음 + gameplay consumer 있음"으로만 확인했다 — **의미(semantics) + 적용범위
(scope) + stacking(중첩) 방식까지 동일한가**는 검증하지 않았다. 세 항목 모두
"트리거 조건이 rAthena 문서 문구와 일치한다"는 표면적 근거만으로 SAFE 처리됐다.

### 11.2 SAFE 정의 보강

SAFE는 이제 반드시 아래 3축을 모두 만족해야 한다(하나라도 false면 금지):

- **consumerPresent**: 실제 게임 코드가 그 canonical key를 읽어 적용하는가
- **scopeParity**: 원작이 적용되는 공격/스킬/트리거 범위와 TextRAG 소비처의 범위가 같은가
- **stackingParity**: 여러 소스가 겹칠 때 원작의 결합 방식과 TextRAG의 결합 방식이 같은가

`combo-effect-support-matrix.json`의 모든 entry에 `consumerPresent`/`scopeParity`/
`stackingParity` 3개 필드가 추가됐고, verdict enum에 **`stacking-scope-mismatch`**
(consumer는 있으나 scope 또는 stacking이 어긋남)가 7번째로 추가됐다.
`build.py`의 게이트는 `COMBO_CONSUMER_BACKED_KEYS` → **`COMBO_RUNTIME_SAFE_KEYS`**로
개명했다(이름 자체가 "consumer 존재"만을 뜻하지 않도록 — 개명 자체가 이번 사고의
재발 방지책 중 하나다). 함수명(`audit_combo_consumer_backed`)은 호출부/테스트
호환을 위해 유지했다.

### 11.3 rAthena pinned source 재확인(commit `e985006171d2eb320ee512a653f4c83aea3d81b6`)

`src/map/pc.cpp`/`src/map/battle.cpp`를 pinned commit에서 직접 재확인(WebFetch로
raw.githubusercontent.com에서 받아 grep)했다 — 추측이 아니라 실제 코드 라인이다.

**bUseSPrate (stacking 불일치)**:
```c
// pc.cpp case SP_SPRATE:
if (sd->state.lr_flag != LR_FLAG_ARROW)
    sd->dsprate+=val;                         // additive 누적
// pc_getstatus 등에서: val = sd->dsprate;     // 최종 (100+dsprate)/100을 "한 번만" 적용
```
두 아이템이 각각 `bUseSPrate,-20`이면 `dsprate=-40` → 최종 SP 소비 **60%**.
TextRAG는 `fx.combat.spCostMul *= Number(it.spCostMul)`로 소스별 **곱연산** 누적 —
0.8×0.8=**64%**. 소스 1개일 땐 두 방식이 같아(`1+n/100`과 `(100+n)/100`이 동일)
최초 검증에서 놓쳤지만, 2개 이상이면 원작(60%)과 TextRAG(64%)가 갈린다.

**bAddClass (scope 불일치)**:
```c
// battle.cpp battle_calc_cardfix(int32 attack_type, ...) -- attack_type 인자로
// BF_WEAPON/BF_MAGIC/BF_MISC 전부 처리하는 공용 함수
// 호출부: battle_calc_weapon_attack()(평타 *및* 물리 스킬 데미지 공용 함수)에서
//   wd.damage += battle_calc_cardfix(BF_WEAPON, ..., sd->right_weapon.addclass[...]+...)
// 별도로 battle_calc_magic_attack() 경로도 magic_addclass로 처리
```
즉 rAthena의 addclass는 **평타 + 물리 스킬(+마법 스킬 별도 경로)**에 광범위하게
적용된다. TextRAG의 `cardAtkPct`/`cardBossAtk` 소비처(`getOutgoingAtkPctMul`/
`applyOutgoingRaceElemSizeBossAtk`)는 P0-C5가 이미 확정한 대로 processTurn()의
**"평타 블록"에만** 연결돼 있다(정적 검사로 재확인: `getOutgoingAtkPctMul` 호출부가
정의부 포함 2곳뿐 — 스킬 데미지 계산 경로 어디에도 없음, 테스트 N). stacking 자체는
양쪽 다 additive라 일치하지만, scope 하나가 어긋나면 SAFE 조건 전체가 무효다.

**bSubRace,RC_All (cross-field stacking 불일치)**:
```c
// battle.cpp (battle_calc_weapon_attack 등 3곳)
race_fix = tsd->indexed_bonus.subrace[sstatus->race] + tsd->indexed_bonus.subrace[RC_ALL];
// 합산 후 단 한 번만 적용
```
예: `RC_All=-30`, `DemiHuman=+30`이면 `race_fix=0`(완전 상쇄). TextRAG
`applyIncomingItemReduction`은 `dmgReduceAll`과 `raceDmgReduce`를 **순차 곱연산**으로
따로 적용(`result*=(1-all/100)` 다음 `result*=(1-race/100)`) — 같은 예시에서
`result*1.30*0.70=0.91`(9% 감소)이 되어 원작의 0%(무변화)와 달라진다.

**bCastrate (재검증 후 유지)**:
```c
// pc.cpp(pre-re, non-RENEWAL_CAST) case SP_VARCASTRATE/SP_CASTRATE:
if (sd->state.lr_flag != LR_FLAG_ARROW)
    sd->castrate += val;                      // additive 누적
```
TextRAG calcStats도 `castReduction=Math.min(1.0, base+(bonus.castReduction||0))`이고
item collector도 `fx.combat.castReduction=(fx.combat.castReduction||0)+n`으로
**additive** — 두 소스가 -10%씩이면 원작 -20%/TextRAG -0.20 fraction으로 정확히
일치(테스트 P). **bCastrate만 3축 전부 통과해 SAFE로 유지된다.**

### 11.4 기존 raceDmgReduce는 건드리지 않음

P0부터 이미 쓰이던 `raceDmgReduce[특정종족]`(RACE_ENUM_MAP에 있는 10종) 자체는
이번에 뜯지 않았다. 정정 대상은 오직 이번에 새로 추가했던 `RC_All → dmgReduceAll`
매핑 하나다 — 특정 종족 하나만 있는 경우는 cross-field 합산 문제 자체가 발생하지
않는다(같은 필드 안에서의 additive 누적은 원작과 이미 일치).

### 11.5 코드 변경 요약

- `tools/canonicalize_combos.py`: `bUseSPrate`/`bUseSPRate`를 `VERIFIED_SIMPLE_BONUS`
  에서 제거, `VERIFIED_CLASS_BONUS2`(bAddClass 특수 처리)와 `SUBRACE_TO_ALL_KEY`
  (bSubRace RC_All 특수 처리) 메커니즘 완전 삭제. `UNSUPPORTED_REASONS`에 세 constant
  모두 원작 stacking/scope 불일치 근거를 담은 새 reason 추가. `bSubRace,RC_All`은
  전용 분기로 informative reason(SAFE는 아니지만 dmgReduceAll과 트리거는 같다는
  설명)을 유지.
- `build.py`: `COMBO_KNOWN_EFFECT_KEYS`에서 `spCostMul`/`atkPct`/`bossAtk`/
  `dmgReduceAll` 4개 제거(`castReduction`만 유지, 23+1=24개). 게이트 집합을
  `COMBO_RUNTIME_SAFE_KEYS`로 개명, docstring을 3축 기준으로 갱신.
- `tools/gen_combo_effect_support_matrix.py`: verdict enum에 `stacking-scope-mismatch`
  추가, 모든 entry에 `consumerPresent`/`scopeParity`/`stackingParity` 필드 추가,
  `SAFE_CONSTANTS`를 bCastrate/bCastRate 2개로 축소, 취소된 3종을
  `REVERTED_MISMATCHES`로 분리해 실패한 축을 명시.
- `tools/gen_combo_engine_extension_backlog.py`: target verdict에
  `stacking-scope-mismatch` 추가, bUseSPrate(low)/bAddClass(medium)/bSubRace(medium)
  complexity 신규 배정.

### 11.6 combo status before → after (정정 전 → 정정 후)

| | P2-A.3 종료 | P2-A.4 최초(❌) | **P2-A.4 정정 후(최종)** |
|---|---|---|---|
| verified | 38 | 46 | **40**(+2, bCastrate만) |
| unsupported | 60 | 52 | **58**(-2) |
| source-needed | 58 | 58 | 58(불변) |
| COMBO_KNOWN_EFFECT_KEYS | 23 | 28 | **24**(castReduction만 순증) |

### 11.7 matrix verdict before(최초 판정) → after(정정)

| verdict | 최초(2026-09-26) | 정정 후 |
|---|---|---|
| safe-existing-consumer | 7(항목 기준, constant 기준 4) | **2**(bCastrate/bCastRate만) |
| stacking-scope-mismatch | (없음) | **4**(bUseSPrate/bUseSPRate/bAddClass/bSubRace) |
| canonical-but-runtime-deferred | 1 | 1(불변) |
| trigger-model-missing | 2 | 2(불변) |
| identity-mapping-gap | 4 | 3(bSubRace가 stacking-scope-mismatch로 이동) |
| engine-extension-required | 30 | 30(불변) |
| dynamic-expression | 4 | 4(불변) |

### 11.8 기존 verified 38개(P0/P2-A originals) 재감사

가능한 범위에서 기존 23개 canonical key(P0-close가 이미 소비처를 확인해둔 것들)도
scope/stacking 관점에서 재점검했다: 6개 스탯/def/mdef/hit/flee/crit/pd/atk/maxHp/
maxSp/maxHpPct/maxSpPct/hpRegenPct/spRegenPct는 전부 flat 또는 %가산이 additive로
단순 누적되는 구조라 rAthena도 TextRAG도 같은 방식(둘 다 단일 필드에 단순 가산) —
cross-field 결합이 필요 없어 이번 사고 패턴(서로 다른 필드를 나중에 잘못 결합)이
발생할 수 없다. `raceDmgReduce`/`raceAtk`(bSubRace/bAddRace 특정 종족만,
RC_All 제외)/`elemReduce`(bSubEle 특정 속성만)도 같은 이유로 안전 — 같은 race/element
키 안에서의 additive 누적만 하고, RC_All류 "전체" enum과 교차 결합하는 경우가 없다.
`soulgain`(bSPGainRace)은 이벤트 기반(각 소스가 독립적으로 onKill 시 자기 값을
더함, 단일 필드로 미리 합쳐두지 않음)이라 cross-field 결합 문제가 구조적으로
발생하지 않는다. **재감사 결과 기존 23개 중 회귀 0건 — 정정 대상은 이번에 새로
추가했던 5개 중 4개(spCostMul/atkPct/bossAtk/dmgReduceAll)뿐이었다.**

### 11.9 engine-extension backlog 최종 순위(정정 후, 상위 5)

| 순위 | constant | verdict | unlockPotential | complexity | priorityScore |
|---|---|---|---|---|---|
| 1 | `bMatkRate` | engine-extension-required | 27 | medium | 13.5 |
| 2 | `bAddClass` | **stacking-scope-mismatch(신규 편입)** | 13 | medium | 6.5 |
| 3 | `bLongAtkRate` | engine-extension-required | 6 | low | 6.0 |
| 4 | `bUseSPrate` | **stacking-scope-mismatch(신규 편입)** | 5 | low | 5.0 |
| 5 | `bSubRace` | **stacking-scope-mismatch(신규 편입)** | 8 | medium | 4.0 |

`bUseSPrate`는 필요 엔진 작업이 "additive accumulator 필드 하나 추가"로 저복잡도라
`bLongAtkRate` 바로 다음 순위까지 올라왔다 — SAFE에서는 탈락했지만 engine-extension
관점에서는 여전히 저비용 후보다.

### 11.10 재발견된 부수 사실(숨기지 않음, §16)

item-level(콤보 이전부터 존재하던) `spCostMul` canonical 필드 자체가 **이미 곱연산
컨벤션**(`fx.combat.spCostMul*=Number(it.spCostMul)`)으로 만들어져 있다 — 이는 P0
단계의 기존 설계 결정이며, 콤보와 무관하게 이미 존재하던 것이다. 다만 현재
`db-items.json`에 이 필드를 실제로 쓰는 아이템이 **0건**이라(직접 조회 확인)
지금 당장 실제 게임플레이에 영향을 주는 라이브 버그는 아니다. 이번 정정(런타임 코드
동결, §18)에서는 고치지 않는다 — 추후 별도 트랙(P0 후속 또는 엔진 정비)에서 다룰
후보로 기록만 남긴다.

### 11.11 테스트

기존 A-L(24개 체크)을 E/F/G/I/L 위주로 수정(SAFE였던 항목이 이제 unsupported로
남는지 검증하도록 반전)하고, 신규 M-Q(§19 요구사항)를 추가했다:
- **M**: bUseSPrate additive(원작 60%) vs multiplicative(구 방식 64%) 불일치를
  숫자로 고정.
- **N**: bAddClass의 `getOutgoingAtkPctMul` 호출부가 정의부 포함 2곳뿐(스킬 경로
  없음)임을 정적 검사로 고정.
- **O**: RC_All(-30)+DemiHuman(+30) 예시에서 원작(0, 상쇄)과 TextRAG 순차 곱연산
  (0.91, 9%감소)이 다름을 숫자로 고정.
- **P**: bCastrate의 additive stacking parity(두 -10%가 원작/TextRAG 양쪽에서
  20 크기로 일치)를 재확인.
- **Q**: matrix에서 bCastrate는 3축 전부 true, 취소된 3종은 각각 실패한 축이
  false임을 확인.

총 61개 체크(A-Q) 전부 PASS. 기존 Python 감사 테스트 5개 + JS smoke 15개 전부
재실행 PASS(회귀 없음).

### 11.12 최종 검증

- `python3 build.py` → FAIL 0, 기존 5개 독립 WARN 카운터(map 1/item-effect 469/
  combo 64/identity 53/review 1) 불변, 신규 "combo effect-support(consumer-backed)
  audit" FAIL 0(3축 게이트로 개념 보강 후에도 통과 — `COMBO_KNOWN_EFFECT_KEYS`가
  24개로 줄어든 채 `COMBO_RUNTIME_SAFE_KEYS`와 계속 동일).
- **gameplay parity**: `git status --short -- index.html 룬미드가츠_v9.19.html`
  빈 diff — 런타임 코드는 이번 정정에서도 전혀 건드리지 않았다(§18).
- P2-A.5(bMatkRate/bLongAtkRate engine extension)와 combo matcher(P2-B) 착수는
  이 정정이 끝날 때까지 시작하지 않았다(§17).

### 11.13 P2-A.4 최종 종료 가능 여부

**가능.** SAFE 목록이 이제 consumer+scope+stacking 3축 전부 실코드(rAthena pinned
pc.cpp/battle.cpp 포함)로 확인된 `bCastrate`/`bCastRate` 2개로 정확히 좁혀졌고,
잘못됐던 3종은 원인·근거·수정 판정이 전부 문서(본 §11)와 matrix
(`consumerPresent`/`scopeParity`/`stackingParity`)에 남았다. 회귀 없음, 빌드 FAIL
0, gameplay parity 유지 전부 확인됐다.

**다음 P2-A.5 추천 범위**: §11.9 backlog 1-2순위인 `bMatkRate`(engine-extension,
unlockPotential 27, medium)와 `bAddClass`(stacking-scope-mismatch였지만 engine
작업 자체는 medium — 평타+물리 스킬 공통 소비처 신설)를 좁게 묶어 처리하는 것을
권장한다. `bUseSPrate`(low complexity, additive accumulator 필드 하나)도 저비용
후보로 함께 검토할 만하다. `bSubRace`(all+specific 합산 모델 변경, 기존
raceDmgReduce 자체는 건드리지 않아야 함)와 `bLongAtkRate`(low complexity)는 그
다음 우선순위. `bAutoSpell`/`skill`(스킬 identity 매핑)은 P2-A.1급 별도 프로젝트로
분리 권장 — P2-A.5 범위에 넣지 않는다. combo matcher(P2-B) 착수는 여전히 이르다.
