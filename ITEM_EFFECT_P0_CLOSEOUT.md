# Item effect system P0 closeout audit

Continuation of `feat/item-effect-offense-p0c5` (`5ce9f84`). This is **not new feature work** —
it is a re-audit of everything P0-A through P0-C5 built, to confirm every collected effect
lands in exactly one of {actually consumed, UI-only-missing, explicitly deferred,
`_pendingVerification`, original-source-backlog} with no silent gap, then close P0. P1 (UI) is
explicitly **not** started here.

## 1. Problem before this audit

Across P0-A–C5, six patch-notes documents each verified their *own* stage's fields in
isolation. Nothing had re-walked the collector's *entire* output as one inventory to check for
a specific failure mode the task named directly: a field the collector marks `active: true` in
the ledger, with no real gameplay consumer, and no `unsupported`/`deferred` marker either —
i.e. something that *looks* live to a future P1 UI reading the ledger, but does nothing. That
gap turned out to exist for **4 fields** (found in §5 below).

## 2. What P0-A through P0-C5 actually resolved (recap)

- **P0-A + correction**: audited every `db-items.json` effect representation; reverted 73
  items to `_pendingVerification` after failing to confirm them against original sources.
- **P0-B**: single collection entry point (`collectItemEffects`); `calcStats()` stopped
  computing item effects itself.
- **P0-C1**: `processTurn()` stopped re-parsing `DB.items` per hit; `triggerItemEffects('onHit', ...)`
  became the single onHit executor (raceBonus/seProc/lifesteal/hpDrain/spDrain/inflict/autoSpell).
- **P0-C2**: `spCostMul`/`castReduction` connected to real SP-cost/cast-time formulas via
  `getSkillSpCost()`.
- **P0-C3**: `dmgReduceAll`/`raceDmgReduce`/`elemReduce`/`immune` connected to incoming
  damage/status via `applyIncomingItemReduction()`/`isStatusImmune()`.
- **P0-C4**: `grantSkill`/`soulgain`/`dropBonus` connected via `getEffectiveSkills()`,
  `triggerItemEffects('onKill', ...)`, `getItemDropBonus()`.
- **P0-C5**: `atkPct`/`raceAtk`/`elemAtk`/`sizeAtk`/`bossAtk`/`defIgnore` (already working)
  reorganized into named helpers; `magicRaceAtk`/`skillDmg`/`doubleAtkCard` deferred with
  documented architectural reasons.

## 3. Final effect consumption matrix

Every key the collector can produce (`makeEmptyItemEffects()` in `source/item-effects.js`,
enumerated mechanically), its `calcStats()` exposure, real consumer, and status.

| Effect | collector | calcStats exposure | 실제 소비처 | 현재 실행 | UI | 상태 |
|---|---|---|---|---|---|---|
| str/agi/vit/int/dex/luk | `fx.stat.*` | merged into `bonus.*` → `s.str` 등 | 전체 파생 스탯 계산 | O | O(기존) | 정상 |
| atk (카드 전용) | `fx.combat.atk` | `bonus.atk`→`wAtk` | 무기 ATK 풀 | O | O | 정상 |
| def (카드 전용) | `fx.combat.def` | `bonus.def`→DEF | DEF 계산 | O | O | 정상 |
| mdef | `fx.combat.mdef` | `bonus.mdef`→hardMDef | MDEF 계산 | O | O | 정상 |
| hit/flee/crit/aspd | `fx.combat.*` | `bonus.*`→total* | HIT/FLEE/CRIT/ASPD | O | O | 정상 |
| pd/perfectFlee | `fx.combat.pd` | `bonus.pd`→`s.pd` | Perfect Dodge | O | O | 정상 |
| maxHp/maxSp | `fx.combat.*` | `bonus.*`→totalMax* | MaxHP/MaxSP | O | O | 정상 |
| maxHpPct/maxSpPct/hpRegenPct/spRegenPct | `fx.combat.*` | `bonus.*` | MaxHP/MaxSP/자연회복 % 보정 | O | O | 정상 |
| spCostMul | `fx.combat.spCostMul` | `s.cardSpCostMul` | `getSkillSpCost()` | O | O(SP표시) | 정상 |
| castReduction | `fx.combat.castReduction` | `s.cardCastReduction` | calcStats castReduction 공식 | O | O | 정상 |
| dmgReduceAll/raceDmgReduce/elemReduce | `fx.combat.*` | `s.cardDmgReduceAll` 등 | `applyIncomingItemReduction()` | O | X(§4) | 실행정상/UI누락 |
| immune | `fx.combat.immune` | `s.cardImmune` | `isStatusImmune()` | O | X | 실행정상/UI누락 |
| grantSkill | `fx.skill.grantSkill` | `s.cardGrantSkill` | `getEffectiveSkills()` | O | X | 실행정상/UI누락 |
| dropBonus | `fx.combat.dropBonus` | `s.cardDropBonus` | `getItemDropBonus()`(`rollDrops`) | O | X | 실행정상/UI누락 |
| hpDrain/spDrain/inflict/autoSpell | `fx.events.onHit` | `s.itemEffects.events.onHit` | `triggerItemEffects('onHit',...)` | O | X | 실행정상/UI누락 |
| raceBonus/seProc/lifesteal | `fx.events.onHit` | 〃 | 〃 | O | X | 실행정상/UI누락 |
| soulgain | `fx.events.onKill` | `s.itemEffects.events.onKill` | `triggerItemEffects('onKill',...)`(useSkill 수동처치만) | O(범위 한정) | X | 실행정상/UI누락 |
| atkPct/raceAtk/elemAtk/sizeAtk/bossAtk | `fx.combat.*` | `s.cardAtkPct` 등 | 평타 공식(`applyOutgoingRaceElemSizeBossAtk`/`getOutgoingAtkPctMul`) | O | X | 실행정상/UI누락 |
| defIgnore | `fx.combat.defIgnore` | `s.cardDefIgnore` | 평타 공식(`getOutgoingDefIgnore`) | O | X | 실행정상/UI누락 |
| hpDrainSelf | `fx.combat.hpDrainSelf` | `s.cardHpDrainSelf` | 원령무사 자해 블록 | O | X | 실행정상/UI누락 |
| doubleAtkCard | `fx.combat.doubleAtkCard` | `s.cardDoubleAtkCard` | 없음 | X | X | 명시보류 |
| skillDmg | `fx.skill.skillDmg` | `s.cardSkillDmg` | 없음 | X | X | 명시보류 |
| magicRaceAtk | `fx.combat.magicRaceAtk` | `s.cardMagicRaceAtk` | 없음 | X | X | 명시보류 |
| healBoost | `fx.combat.healBoost` | `s.cardHealBoost` | 없음 | X | X | 명시보류(원작검증필요) |
| rangedDmgReduce | `fx.combat.rangedDmgReduce` | `s.cardRangedDmgReduce` | 없음 | X | X | 명시보류 |
| magicImmune | `fx.combat.magicImmune` | `s.cardMagicImmune` | 없음 | X | X | 명시보류(원작검증필요) |
| armorElement | `fx.combat.armorElement` | **없음(dead)** | 없음 | X | X | 명시보류 |
| weaponUnbreakable (`effect.type==='special'`) | `fx.unsupported`만(값 자체 미집계) | — | 없음(엔진에 무기파괴 메커닉 자체 없음) | X | X | 엔진미지원 |
| `increaseDropRate`/`increaseExpRate` (unknown effect.type) | `fx.unsupported`(baseline 등재) | — | 없음 | X | X | 엔진미지원(baseline 2건) |
| `_pendingVerification` 전체(73건) | `fx.pending`만 | — | 없음(구조적으로 도달 불가) | X | X | pending(원작검증필요) |
| events.onDamaged / events.onTick | 항상 빈 배열(집계하는 코드 자체가 없음) | `s.itemEffects.events.onDamaged/onTick` | 없음 | X | X | 원작검증필요(DB 스키마에 데이터 소스 자체가 없음) |

**최종 판정: consumer 없는 "active supported" 효과 = 0.** 실행 소비처가 없는 7개 필드
(doubleAtkCard/skillDmg/magicRaceAtk/healBoost/rangedDmgReduce/magicImmune/armorElement)는
이번 감사에서 전부 `fx.unsupported[]`에 명시적으로 표시되도록 고쳤다(§5) — "active인데 표시가
없는" 상태는 더 이상 없다.

## 4. UI-missing vs deferred — the distinction this audit relies on

"실행정상/UI누락" 항목들(위 표에서 O/X로 표시)은 게임 결과에 **이미 실제로 영향을 준다** —
단지 플레이어가 보는 화면(스탯 창, 카드 툴팁 등)에 그 근거가 아직 표시되지 않을 뿐이다. 이건
버그가 아니라 P1(UI)이 할 일이다. 반대로 "명시보류"/"엔진미지원"/"pending" 항목은 게임 결과에
**전혀 영향을 주지 않는다** — 이 구분이 이번 감사의 핵심이다.

## 5. Bug found and fixed: 4 fields silently active with no unsupported marker

`healBoost`/`rangedDmgReduce`(`_ITEM_EFF_SIMPLE_COMBAT_KEYS`의 일반 루프로 집계)와
`magicImmune`/`armorElement`(각자 전용 블록)는 값이 정상 집계되고 ledger에 `active: true`로
기록됐지만, 실제 소비처가 없는데도 `fx.unsupported`에 전혀 기록되지 않고 있었다 — 정확히 이번
과제 §1/§5가 경고한 "activity로 수집 → ledger도 active → 실제 소비처 없음 → unsupported/deferred
표시도 없음" 상태. `magicRaceAtk`/`skillDmg`/`doubleAtkCard`(P0-C5에서 이미 `fx.unsupported`
마킹을 추가함)와 달리, 이 4개는 P0-C3/C2 단계에서 "보류"라고 patch notes에는 적어놓고 collector
코드 자체에는 그 보류를 반영하지 않은 채 남아 있었다.

**수정**: 기존 게임플레이 결과는 전혀 바꾸지 않고(값 집계 로직·순서 불변), 각 필드가 이미
쓰던 방식과 동일하게 `fx.unsupported.push({...label...})`만 추가했다 — `_ITEM_EFF_SIMPLE_COMBAT_KEYS`
루프에는 `_DEFERRED_SIMPLE_COMBAT_REASONS` 맵(healBoost/rangedDmgReduce)을, `magicImmune`/
`armorElement`는 각자 블록에 직접 추가. `fx.combat.*`/`bonus.*`/`s.cardXxx`로 가는 값 자체는
건드리지 않았다(§9 검증, §10 회귀 테스트로 확인 — 회귀 없음).

이 4개 중 `armorElement`는 조사 중 추가로 발견: `bonus.armorElement`까지는 병합되지만
`calcStats()`의 최종 반환 객체에 `cardArmorElement` 필드 자체가 없다 — 다른 deferred
필드들(`cardHealBoost`, `cardRangedDmgReduce`, `cardMagicImmune` 등)은 최소한 `s.cardXxx`로
노출은 되는데, `armorElement`는 그 마지막 단계에도 없다. 이것도 게임 결과에 아무 영향이
없으므로(어차피 소비처가 없다) 버그로 취급하지 않고 "완전히 죽은 반환값"으로 그대로 문서화만
했다 — P1이 필요하면 그때 `cardArmorElement:bonus.armorElement`를 추가하면 된다.

## 6. `_pendingVerification` boundary re-confirmed

`_itemEffIsPending()`(root 또는 `.effect._pendingVerification`)이 true인 항목은 `stat`/
`combat`/`skill`/`events` 어디에도 진입하지 않는다 — equipment 경로는 완전히 스킵, card 경로는
`collectSimpleFields` 자체를 건너뛴다(단, `.effect`만 pending인 71건 형태는 최상위 단순
필드가 별개로 확정된 값이라 그대로 집계 — P0-C3에서 확정한 구분). 이번 감사에서 신규
unsupported 마킹 4건 전부에 대해 **루트-pending이면 unsupported[]에도 도달하지 않음**을
합성 픽스처로 직접 검증했다(`tests/item-effect-p0-close-smoke.js` CLOSE B) — pending과
unsupported가 섞이지 않는다.

## 7. Raw DB re-parsing final check

`grep -n "DB.items\["` 전체(약 90건)를 전수 분류했다. 카드 gameplay 효과(`.effect`/`cardEff`/
`hpDrain`/`spDrain`/`inflict`/`autoSpell`/`soulgain`/`grantSkill`/`dropBonus`/`raceAtk`/
`elemAtk`/`sizeAtk`/`bossAtk`/`atkPct`/`defIgnore`/`doubleAtk`/`skillDmg`/`magicRaceAtk`/
`spCostMul`/`castReduction`/`immune`/`magicImmune`/`armorElement`/`dmgReduceAll`/
`raceDmgReduce`/`elemReduce`/`rangedDmgReduce`/`healBoost`/`hpDrainSelf`)를 gameplay 코드에서
직접 재해석하는 잔존 패턴은 **0건**. 남은 `DB.items[...]` 읽기는 전부 다음 범주뿐:
- 아이템 이름/이모지/가격/무게/타입 표시(인벤토리·상점·창고·핫바·소켓 UI)
- 존재 여부 확인(드롭/도둑질/제작 재료가 실제 DB에 등록됐는지)
- `parseItem()` 자기 자신의 내부 로직(이름 정규화, 슬롯 수 폴백)
- 완전히 다른, 이미 문서화된 별개 메커닉(소모품 `effect` 문자열 enum('full'/'half'/'town'),
  화살 `hitEffect`, 스킬이 만드는 `m.inflict`/`p.statusEffects.autoSpell` 같은 런타임 상태 —
  전부 카드 DB의 `effect`/최상위 필드와 이름만 같을 뿐 다른 시스템)

`grep -n "cardEff\.\|card\.effect\b\|\.effect\.type\b"` (예전 v9.04 직접 재파싱 패턴의 가장
확실한 지표): **0건**.

## 8. Dead `calcStats()` return values

`calcStats()`가 노출하는 21개 `cardXxx` 필드 전부 확인(§3 매트릭스). 진짜 "완전히 죽은"
반환값은 `armorElement` 하나뿐(§5) — 나머지는 전부 실제 소비처가 있거나, 소비처가 없는
채로라도 최소한 `s.cardXxx`에는 노출되어 있어 미래 소비처가 즉시 쓸 수 있는 상태다.
`s.itemEffects.ledger`/`.pending`/`.unsupported`/`.events`는 gameplay 코드가 전혀 읽지
않지만, P0-B 자신의 주석이 이미 "P0-C 이후 소비처가 재사용한다"고 명시한 의도적 노출이라
죽은 값으로 취급하지 않는다(§9에서 P1의 정본 인터페이스로 재확인).

## 9. Ledger reliability audit (A-E)

`tests/item-effect-p0-close-smoke.js`로 공식 회귀 테스트화(실제 `collectItemEffects()`/
`calcStats()` 실행, 재구현 아님):

- **A**: 실제 적용 효과(hit+7 카드) → ledger `active:true` **그리고** 실제 `s.bonusHit`에도
  반영됨 확인.
- **B**: deferred 필드(doubleAtk/healBoost)에 999 같은 극단값을 넣어도 `s.doubleAtkRate`
  (실제 게임 수치)가 전혀 변하지 않음 확인.
- **C**: pending 카드는 active ledger 0, `pending[]`으로만 존재.
- **D**: 장착 중엔 ledger 존재, 해제하면 다음 `calcStats()` 호출에서 즉시 사라짐.
- **E**: 같은 카드의 같은 효과가 ledger에 두 번 들어가지 않음(정확히 1회).

## 10. UI-facing metadata already in the ledger

Ledger 각 항목은 이미 `source`(아이템/카드 이름), `sourceType`(`equipment`|`card`), `type`
(`stat`|`combat`|`skill`|`event`|`unsupported`|`pending`), `key`, `value`, `active`를 전부
갖고 있다 — P1이 요구하는 최소 메타데이터(§10)를 이미 만족한다. job/buff/combo 등 item-effects
ledger 밖의 소스는 이번 범위 밖(과제 지시대로 유지). 한국어 UI 문구는 이번에 만들지 않았다 —
`unsupported[].label`은 개발자 진단용 한국어 설명이며 플레이어 노출용 문구가 아니다.

## 11. 469 WARN decomposed

```
73  _pendingVerification 표시 항목의 reserved-string-effect/legacy-effect-key
     (71건 nested .effect pending + 2건 root pending)
44  desc에 rAthena 원시 스크립트가 그대로 남아 있음
350 desc에 효과 설명이 있으나 구조화 데이터 없음
2   baseline 등재 unknown-effect-type (이미르의 잔해 카드/상처받은 모로크 카드,
     increaseDropRate/increaseExpRate -- 엔진미지원으로 그랜드파더링)
0   effects[] 미소비 경고
─────
469 합계 (정확히 일치, 재검산 완료)
```

## 12. Data recount (P0 closeout snapshot)

```
전체 아이템: 2796  (카드 531 / 비카드 2265)
pending: 73  (root 2 / nested .effect 71)
active effect.type 객체(비-pending): 6
  - 드라큘라 카드(lifesteal), 새비지 베베 카드(seProc), 스켈레톤 카드(mixed+seProc):
    실제 소비처 있음(triggerItemEffects onHit)
  - 고렘 카드(special/weaponUnbreakable): 엔진미지원(atk:5는 별개로 정상 소비)
  - 이미르의 잔해 카드/상처받은 모로크 카드(unknown-effect-type): 엔진미지원, baseline 2건
raw rAthena 원시 스크립트(desc): 44
desc-only(구조화 데이터 없음): 350
카드 전용 atk 사용: 32   카드 전용 def 사용: 31
9개 offense/defense/utility/resource 필드(atkPct/raceAtk/elemAtk/sizeAtk/bossAtk/
  magicRaceAtk/skillDmg/defIgnore/doubleAtkCard/dmgReduceAll/raceDmgReduce/elemReduce/
  rangedDmgReduce/immune/magicImmune/armorElement/spCostMul/healBoost/castReduction/
  hpDrainSelf/grantSkill/dropBonus/soulgain/hpDrain/spDrain/inflict/autoSpell) 실제 사용: 0건
    (전부 synthetic fixture로만 검증됨 -- 실 데이터 0건이므로 parity는 구조상 100% 보장)
consumer 없는 active supported 효과: 0  ← 이번 감사의 종료 기준
```

## 13. Automated gate added

`build.py`에 `audit_item_effects_deferred_sync()` 추가(기존 `audit_item_effects_collector_sync`
바로 옆에서 같이 호출). `item-effects.js`의 `_DEFERRED_SIMPLE_COMBAT_REASONS` 맵의 키가
`_ITEM_EFF_SIMPLE_COMBAT_KEYS`에 실제로 존재하는지, `magicRaceAtk`가 `_ITEM_EFF_COUNTER_KEYS`에
남아있는지만 정적으로 확인한다 — 이번에 고친 "이름이 어긋나서 unsupported 마킹이 조용히
빠지는" 버그의 재발 방지용 최소 게이트다. 의도적으로 template.html 쪽 실제 소비 여부까지는
정적 파싱하지 않는다(과제 지시: 가치가 명확한 작은 gate만, 억지 parser 금지). 오타를 넣었을 때
실제로 `ValueError`를 던지는지 직접 검증했다(§14).

## 14. Tests and verification

New file: `tests/item-effect-p0-close-smoke.js` — 7개 deferred 필드 전체가 unsupported[]에
표시되는지(CLOSE A), 루트-pending이면 그 표시조차 사라지는지(CLOSE B), ledger 신뢰성 A-E.
새 build.py 게이트는 고의로 깨뜨린 가짜 `item-effects.js`로 실제 `ValueError`가 발생하는지
확인 후 정상 파일로 되돌렸다(반영구 변경 없음).

```
python3 -m py_compile build.py
python3 build.py                                  # OK, 0 FAIL / 469 WARN (분해 §11과 일치)
                                                   # + 신규 게이트 "item-effects.js deferred 필드 표시 동기화" OK
node tests/actor-interaction-smoke.js             # OK
node tests/alberta-doll-exchange-smoke.js         # OK
node tests/refine-reveal-smoke.js                 # OK
node tests/item-effect-canon-correction-smoke.js  # ALL TESTS PASS
node tests/item-effects-smoke.js                  # ALL TESTS PASS
node tests/item-effect-resource-smoke.js          # ALL TESTS PASS
node tests/item-effect-defense-smoke.js           # ALL TESTS PASS
node tests/item-effect-utility-smoke.js           # ALL TESTS PASS
node tests/item-effect-offense-smoke.js           # ALL TESTS PASS
node tests/item-effect-p0-close-smoke.js          # ALL TESTS PASS (new, 이번 감사)
python3 tests/item-effect-audit-test.py           # ALL TESTS PASS
```

빌드된 HTML의 실제 JS `<script>` 16개(불변) 전부 `node --check` 통과.

## 15. Canonical interface P1 must use

P1(UI)은 이 인터페이스만 읽으면 되고, `DB.items`/카드 데이터를 다시 해석할 필요가 없다:

```js
const s = calcStats();

// 아이템 효과 감사 트레일(P1의 정본 데이터 소스)
s.itemEffects.ledger        // [{source, sourceType, type, key, value, active}, ...]
s.itemEffects.unsupported   // [{source, sourceType, label}, ...] -- "집계는 됐지만 실행 안 됨"
s.itemEffects.pending       // [{source, reason}, ...] -- "_pendingVerification"
s.itemEffects.events        // {onHit:[], onDamaged:[], onKill:[], onTick:[]} (onDamaged/onTick은 항상 빈 배열)

// 기본 파생 스탯
s.str / s.agi / s.vit / s.int / s.dex / s.luk
s.atk / s.def / s.matk / s.mdef / s.softDef
s.hit / s.flee / s.crit / s.pd
s.maxHp / s.maxSp / s.hpRegen / s.spRegen
s.aspdDelay / s.aspdDisplay / s.doubleAtkRate

// 자원/시전
s.cardSpCostMul / s.castReduction / s.instantCast / s.bragiDelayReduce

// 실행 중(연결됨) 카드 확장 필드 -- 이미 실제 게임 결과에 영향을 주고 있음, UI만 미표시
s.cardDmgReduceAll / s.cardRaceDmgReduce / s.cardElemReduce / s.cardImmune
s.cardGrantSkill / s.cardDropBonus
s.cardRaceAtk / s.cardElemAtk / s.cardSizeAtk / s.cardBossAtk / s.cardAtkPct / s.cardDefIgnore
s.cardHpDrainSelf

// 보류 중(연결 안 됨) 카드 확장 필드 -- s.itemEffects.unsupported[]에 항상 같이 표시됨.
// P1이 "이 효과는 아직 작동하지 않음" 배지를 달고 싶다면 여기 값 대신
// s.itemEffects.unsupported의 존재 여부로 판단할 것(값 자체는 표시용으로만 참고).
s.cardMagicRaceAtk / s.cardSkillDmg / s.cardDoubleAtkCard
s.cardHealBoost / s.cardRangedDmgReduce / s.cardMagicImmune
// armorElement는 s에 노출되지 않음(§5/§8) -- 필요해지면 calcStats() 반환 객체에
// cardArmorElement:bonus.armorElement 한 줄 추가부터 시작할 것.
```

P1이 이 문서 밖에서 절대 하지 말아야 할 것: `DB.items[cardName]`을 다시 읽어 효과를 재해석하는
것. 표시가 필요한 모든 정보는 `s.itemEffects.ledger`/`unsupported`/`pending`과 위 `s.cardXxx`
값들로 충분해야 한다 — 부족하면 P1 단계에서 "메타데이터 보완"으로 이 문서를 갱신할 것(§10에서
이미 언급한 대로 기계적 필드 보완은 허용).

## 16. P0 closeout verdict

**P0 종료 가능.**

차단 사유 없음:
- consumer 없는 active supported 효과: **0**(§3/§12).
- deferred 필드가 active처럼 보이는 상태: **0**(§5에서 발견한 4건 전부 수정, §9로 회귀 테스트화).
- pending의 gameplay 영향: **0**(§6).
- gameplay 코드의 raw DB 효과 재파싱: **0**(§7).
- ledger와 실제 실행 불일치: **0건**(§9 A-E 전부 통과).
- 장착/해제 잔류: **0**(§9 D).
- 469 WARN: 전량 분해·재검산 완료, 전부 기존에 알려진 원작검증 백로그(§11) — 새로운 미분류
  WARN 없음.
- build.py PASS, 기존 테스트 전부 PASS, 신규 종료 테스트 PASS, built HTML JS syntax PASS.

남은 것(healBoost/magicImmune/armorElement/rangedDmgReduce/magicRaceAtk/skillDmg/
doubleAtkCard의 실제 구현, 394건 원작 대조)은 전부 "원작 검증 없이는 결정할 수 없음" 또는
"이번 트랙보다 큰 엔진이 필요함"이라는 동일한 성격의 벽이며, 전부 명시적으로 문서화되고
`unsupported[]`로 추적 가능한 상태다. P1(UI)은 이 문서의 §15 인터페이스만으로 시작할 수 있다.
