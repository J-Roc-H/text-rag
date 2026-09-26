# Item effect SP/cast consumption unification (P0-C2)

Continuation of `feat/item-effect-events-p0c1` (`c786ffd`). This patch connects exactly the
two values the task named — `spCostMul` and `castReduction` — to the real skill-cost and
cast-time formulas. Nothing else (damage reduction, immunity, healing, drops, skill grants)
was touched. Full P0-A/B/C1 context: `ITEM_EFFECT_AUDIT.md`,
`ITEM_EFFECT_COLLECTOR_PATCH_NOTES.md`, `ITEM_EFFECT_CONSUMER_PATCH_NOTES.md`.

## 1. Existing SP consumption paths (before this patch)

Grepped the whole file for `p.sp -=`, `spCost`, `cost =`: exactly two places ever deduct SP
for a skill cast (a third `p.sp-=`/`+=` pair, `maximizePower`'s periodic drain, is a status
effect, not a skill cast — left alone).

- **`processTurn()`'s auto-rotation** (~line 5960-6055): five call sites compute
  `cost = typeof sk.spCost==='function' ? sk.spCost(slv) : sk.spCost` and check `p.sp` against
  it — the emergency-heal pick, the tier-pointer pick (`pickFromTier`), the buff pick, the
  fallback pick, and finally the actual `p.sp -= cost` deduction once a skill is chosen. All
  five used the **raw, un-multiplied** base cost.
- **`useSkill()`'s manual cast** (~line 8429-8483): one sufficiency check
  (`if(p.sp < cost)`), one deduction (`p.sp -= cost`), and one refund
  (`p.sp += cost`, when a target-requiring skill is cast with no battle target) — again all
  using the raw base cost. `let s = calcStats()` was called **after** the SP check
  (irrelevant before this patch, since nothing needed `s` that early).

No other SP adjustment (`p.sp +=` natural regen at two sites, a consumable's `spHeal`, the
`maximizePower` drain) is a skill cost — none of those were touched, per the task's explicit
"NPC/service/non-skill SP 조작까지 억지로 바꾸지 마라."

## 2. `spCostMul` — confirmed meaning and unit

Traced to the original (pre-P0-B) inline card loop: `if(c.spCostMul) bonus.spCostMul *=
Number(c.spCostMul);`, starting from `bonus.spCostMul = 1`. **Multiplicative**, not additive
and not a percentage: `1.0` = no change, `0.7` = 30% cheaper, `1.5` = 50% more expensive.
P0-B's `collectItemEffects()`/`mergeItemEffectsIntoBonus()` already implement this exact
multiplicative accumulation (`fx.combat.spCostMul *= n`, merged as
`bonus.spCostMul *= fx.combat.spCostMul`) — nothing about its meaning needed to change, it was
just never read by anything. `calcStats()` exposes it as `s.cardSpCostMul` (unchanged name).
0 items in the current DB use `spCostMul`.

## 3. `getSkillSpCost()` — the one function every SP-cost site now calls

Added to `source/item-effects.js`:

```js
function getSkillSpCost(baseCost, stats) {
  var mul = (stats && stats.cardSpCostMul != null) ? stats.cardSpCostMul : 1;
  return Math.max(0, Math.floor((baseCost || 0) * mul));
}
```

Rounding is `Math.floor`, chosen by evidence, not preference: this project's cooldown
reduction from the very same `castReduction` value already uses `Math.floor`
(`Math.floor(skObj.cooldown*(1-s.castReduction*0.5))` and
`Math.floor(skObj.cooldown*(1-s.castReduction))`, both in `processTurn()`), and every other
derived numeric game value in the codebase (damage, EXP, zeny, refine bonus) uses `Math.floor`
too — `Math.ceil` appears only for countdown-timer displays, `Math.round` only for ms→tick unit
conversions. SP cost is a derived resource value, not a countdown or a unit conversion, so
`Math.floor` matches the existing pattern rather than introducing a new one.

All **eight** SP-cost call sites now compute `cost` through this one function with the same
`s` (calcStats() result, called once per turn/cast — never re-collected):

| Site | File location | Role |
|---|---|---|
| Emergency-heal pick | `processTurn()` ~5969 | auto sufficiency check |
| Tier-pointer pick | `processTurn()` ~5990 (`pickFromTier`) | auto sufficiency check |
| Buff pick | `processTurn()` ~6021 | auto sufficiency check |
| Fallback pick | `processTurn()` ~6039 | auto sufficiency check |
| Actual deduction | `processTurn()` ~6052 | auto deduction |
| Sufficiency check | `useSkill()` ~8460 | manual sufficiency check |
| Actual deduction | `useSkill()` ~8476 | manual deduction |
| Refund (no target) | `useSkill()` ~8483 | manual refund (reuses the same `cost` variable — not recomputed) |

`useSkill()`'s `let s = calcStats();` was moved from after the SP deduction to right before the
SP check, since the sufficiency check now needs `s.cardSpCostMul`. Verified safe by reading
`calcStats()`'s full body: it never reads `p.sp` or `p.hp`, so moving the call earlier changes
nothing about its result — confirmed by grep, not assumed.

Autospell (`triggerItemEffects`'s `autoSpell` handler, calling `sk.effect(...)` directly) was
**not** touched — it never went through an SP-cost check to begin with, and this patch only
unifies cost calculation for paths that already deducted SP.

## 4. `castReduction` — confirmed formula and integration point

Existing formula (`calcStats()`, unchanged structure):

```js
let castReduction = Math.min(1.0, totDex / 150);
if (se.bragi)      castReduction = Math.min(1.0, castReduction + se.bragi.castReduce);
if (se.suffragium) castReduction = Math.min(1.0, castReduction + se.suffragium.castReduce);
let instantCast = castReduction >= 1.0;
```

Unit: `0.0`–`1.0` fraction (`1.0` = instant cast), the same unit `se.bragi.castReduce` /
`se.suffragium.castReduce` already use (e.g. `bragi = {castReduce: slv*0.05, ...}`). The
pre-P0-B card loop's `bonus.castReduction += Number(c.castReduction)` was a plain, unscaled
addition — same style as this formula's own incremental `+=` — so item `castReduction` is
taken to be the same 0–1 fraction, not a 0–100 percentage. (0 items currently use this field,
so there's no live data to contradict this reading; the reasoning is stated explicitly here so
a future contributor with real source data can correct it if wrong.)

Inserted as one line, right after the DEX term and before the buffs:

```js
castReduction = Math.min(1.0, castReduction + (bonus.castReduction||0));
```

Position doesn't actually change the result: since every term is non-negative, `Math.min(1,
Math.min(1,x)+y)` equals `Math.min(1,x+y)` regardless of where `y` is inserted in the chain —
verified algebraically, and by the CAST D test (item + bragi combined) matching a plain sum.
"DEX (gear-independent base) → item (gear) → buffs (bragi/suffragium)" was chosen as the most
readable ordering, not because a different order would compute anything else.

`bonus.castReduction` is what P0-B's `mergeItemEffectsIntoBonus()` already folds
`fx.combat.castReduction` into — read from `bonus`, not `fx`, matching how every other merged
field (`mdef`, `maxHp`, etc.) is consumed later in `calcStats()`.

The existing clamp (`Math.min(1.0, ...)`) and `instantCast = castReduction >= 1.0` rule are
untouched — an oversized item value clamps at 1.0 exactly like an oversized DEX/buff value
always did (verified, CAST E).

## 5. Tests

New file: `tests/item-effect-resource-smoke.js` (kept separate from `item-effects-smoke.js`
and `item-effect-canon-correction-smoke.js` — each file now owns one P0 stage's concern).
`tests/_item-effect-harness.js` gained `makeGetSkillSpCost()` (loads the real function from
`item-effects.js`) and `runUseSkill(DB, G, name)`, which extracts the real `useSkill()` body
from `template.html` and executes it with its non-SP-relevant dependencies
(`gainBaseExp`/`rollDrops`/`checkQuestKill`/etc.) stubbed as no-ops — `calcStats`,
`getSkillSpCost`, and `parseItem` are the real functions throughout.

- SP A-C: `getSkillSpCost` against `mul` of 1 / 0.7 / 1.5, using the real `s.cardSpCostMul`
  produced by an actual synthetic card through the real collector.
- SP D: runs the **real** `useSkill()` end-to-end and confirms the SP actually deducted equals
  `getSkillSpCost(base, s)` computed independently — this is what makes "auto path's afford
  check" and "manual path's actual deduction" provably the same number, since both are the same
  function call on the same `s`.
- SP E: base cost 40, actual cost 28 (mul 0.7), player SP 30 — succeeds (the exact scenario
  from the task spec).
- SP F: insufficient SP — cast rejected, SP unchanged, warning logged, effect not run.
- CAST A-E: no-effect parity, item-only, DEX+item, bragi+item, and the overflow clamp — each
  checked against the real `calcStats()` output, not a reimplementation.

## 6. Verification

```
python -m py_compile build.py
python build.py                                  # OK, 0 FAIL / 469 WARN (unchanged from c786ffd)
node tests/actor-interaction-smoke.js            # OK
node tests/alberta-doll-exchange-smoke.js        # OK
node tests/refine-reveal-smoke.js                # OK
node tests/item-effect-canon-correction-smoke.js # ALL TESTS PASS
node tests/item-effects-smoke.js                 # ALL TESTS PASS
node tests/item-effect-resource-smoke.js         # ALL TESTS PASS (new, P0-C2)
python tests/item-effect-audit-test.py           # ALL TESTS PASS
```

Every real JS `<script>` block in the built HTML passes `node --check`.

**Parity**: with 0 live items using `spCostMul`/`castReduction`, `s.cardSpCostMul` is always 1
and `bonus.castReduction` is always 0 for every current loadout, so
`getSkillSpCost(base, s) === base` and the cast formula reduces to exactly what it computed
before this patch — full parity by construction, confirmed by the existing P0-B parity suite
(`item-effects-smoke.js`) still passing unchanged and by CAST A here.

## 7. Static check

`p.sp -=` / `p.sp +=` sites in `source/template.html` after this patch, and why each was or
wasn't touched:

| Site | Kind | Touched? |
|---|---|---|
| `processTurn()` auto deduction | skill cost | yes — via `getSkillSpCost` |
| `useSkill()` deduction | skill cost | yes — via `getSkillSpCost` |
| `useSkill()` refund | skill cost (undo) | yes — reuses the same discounted `cost` var |
| Natural SP regen (2 sites) | passive regen | no — not a skill cost |
| `maximizePower` periodic drain | status-effect upkeep | no — not a skill cast |
| Consumable `spHeal` | item-use heal | no — not a skill cost |

No leftover `p.sp -= cost`-style skill-cost path exists outside the two integrated sites.

## 8. What's left for the rest of P0-C

`healBoost`, damage-reduction fields (`raceDmgReduce`/`elemReduce`/`dmgReduceAll`/
`rangedDmgReduce`), `immune`/`magicImmune`, `dropBonus`, `grantSkill`, the `soulgain` path
(noted in P0-C1's patch notes), and `events.onKill`/`onDamaged`/`onTick` are all still just
collected into `fx.combat`/`fx.skill` by P0-B, not consumed anywhere yet. The 394-item
rAthena/desc verification backlog is unchanged. None of this blocks starting the next P0-C
stage.
