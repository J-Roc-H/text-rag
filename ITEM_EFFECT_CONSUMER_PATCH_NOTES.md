# Item effect event execution unification (P0-C1)

Continuation of `feat/item-effect-collector-p0b` (`c1b6c03`). This patch does exactly one
thing: `processTurn()` no longer re-parses equipped cards from `DB.items` to execute combat
event effects — it uses `s.itemEffects.events.onHit` (built once per turn by
`collectItemEffects()`, P0-B) and a new executor, `triggerItemEffects()`. No damage formula,
SP/resistance/immunity system, or any other consumption path was touched. Full P0-A/P0-B
context: `ITEM_EFFECT_AUDIT.md`, `ITEM_EFFECT_COLLECTOR_PATCH_NOTES.md`.

## 1. Removed direct re-parse paths

Both lived in `processTurn()` (`source/template.html`), right after damage is dealt on a
normal-attack hit:

- **Path A (legacy, unconditional)**: `Object.values(p.equip).forEach(...) → parseItem →
  DB.items[cardName+" 카드"] → card.hpDrain/spDrain/inflict/autoSpell`, executed regardless of
  whether the target survived the hit. 0 items in the current DB use these four fields.
- **Path B ("v9.04", guarded by `t.currentHp > 0`)**: `Object.keys(p.equip).forEach(...) →
  parseItem → DB.items[cardName+" 카드"] → card.effect.type` for `raceBonus`/`seProc`/
  `lifesteal`.

Both are gone. `processTurn()` now does, in the exact same two call sites (same guard
conditions, same position in the function):

```js
// Path A replacement — always runs
triggerItemEffects('onHit', { player, target: t, stats: s, DB, damage: dmg, isCrit: isC, log },
  events.filter(e => ['hpDrain','spDrain','inflict','autoSpell'].includes(e.kind)));

// Path B replacement — only if the target is still alive
if (t.currentHp > 0 && p.equip) {
  let ctx = { player: p, target: t, stats: s, DB, damage: dmg, isCrit: isC, log };
  triggerItemEffects('onHit', ctx, events.filter(e => ['raceBonus','seProc','lifesteal'].includes(e.kind)));
  dmg = ctx.damage;
}
```

where `events` is `s.itemEffects.events.onHit` (already computed once at the top of
`processTurn()` via `let s = calcStats();` — never re-collected mid-turn, per the task's
explicit requirement).

## 2. `triggerItemEffects()` — what it supports

New in `source/item-effects.js`: `triggerItemEffects(eventName, context, events)`, dispatching
each event by `evt.kind` (a small switch, not a framework). For `eventName === 'onHit'`:

`raceBonus`, `seProc`, `lifesteal` (currently the only kinds with real DB data) and
`hpDrain`/`spDrain`/`inflict`/`autoSpell` (defined and tested against a synthetic fixture — 0
real items use them today, same as before this patch; nothing new activated).
`onDamaged`/`onKill`/`onTick` are accepted by the dispatcher but have no handlers yet — no
current data or consumption path needs them.

Every handler's condition and computation is copied verbatim from the removed inline code —
same `Math.floor`, same `Math.min` clamps, same log strings (including the hardcoded "로드오브
데스" text on `random_debuff` regardless of which card actually triggered it, and the fact that
`hpDrain`/`spDrain` logs never name the source card — both quirks of the original code,
preserved rather than "improved").

## 3. RNG call order — the part that had to be exactly right

The two original blocks are **separate loops**, so before this patch every legacy-path
`Math.random()` call (hpDrain → spDrain → inflict's up-to-3 sub-checks → autoSpell, for every
card on every equip slot) happened before any proc-path call (raceBonus has none; seProc and
lifesteal each call once). `collectItemEffects()`'s per-card loop, however, calls
`collectCardEffectObject` (proc kinds) and `collectLegacyDirectFields` (legacy kinds) back to
back for each card — so a naive single `fx.events.onHit` array would have interleaved
legacy/proc events per card instead of "all legacy, then all proc" globally. Caught and fixed
during this patch (not shipped broken and left for later): `onHitEvent()` now routes into two
internal buffers by `kind`, and `collectItemEffects()` concatenates `legacyBuffer.concat(procBuffer)`
once at the end. Each buffer internally keeps the same equip-slot → card-socket order both
original loops used (`Object.keys(p.equip)`/`parsed.cards`, identical in both). Verified in
`tests/item-effects-smoke.js` (P0-C1 D): two event cards produce exactly the expected
`Math.random()` call count in the expected order.

Currently, with 0 legacy-field items in the DB, this reordering has no observable effect on
live gameplay (the legacy buffer is always empty) — but it would have caused an RNG-order
regression the moment any card ever used these fields, so it's fixed now rather than left as a
latent bug.

## 4. `_pendingVerification` / `unsupported` — structurally unreachable, not just filtered

`collectItemEffects()` already refuses to inspect a pending item/card's `effect` payload at all
(P0-B). Since `triggerItemEffects()` only ever receives whatever `collectItemEffects()` put in
`events.onHit`, and never reads `DB.items` itself, a pending or unsupported effect has no path
into execution — there is no filter to bypass, because the raw data structural never reaches the
executor. Verified directly (`tests/item-effect-canon-correction-smoke.js` §5, using a real
pending card): zero events produced, zero damage/state change when those zero events are fed to
the real `triggerItemEffects()`.

## 5. New finding: a third direct-reparse path exists, outside this patch's scope

`useSkill()` (manual skill cast completion, ~line 8484) has its own on-kill direct re-parse:

```js
_pr.cards.forEach(cn => { let c = DB?.items?.[cn+" 카드"]; if(!c||!c.soulgain) return;
  if(!t.race||t.race!==c.soulgain.race) return;
  let sg=c.soulgain.sp||0; _p.sp=Math.min(_p.maxSp,_p.sp+sg);
  log(`💜 <b>[소울게인]</b> ${c.soulgain.race} 처치 SP +${sg}!`,'system');
});
```

This is a **different function** than `processTurn()` (manual skill kills, not auto-attack),
uses a field name (`soulgain`) this patch's scope never named, and 0 items in the current DB use
`soulgain` (same "defined path, zero live data" situation as the legacy 4 fields). Per this
patch's explicit scope — `processTurn()`'s two named direct-reparse paths only — it was **not**
touched: no new event kind, no collector wiring, no execution change. Confirmed via a full-file
grep for `card.effect`/`c.effect`/`cardEff.type` that `processTurn()` itself has zero remaining
direct card-effect reads. `soulgain` is left as a known, documented remaining direct-consumption
path for a future stage to unify (it wasn't found in the P0-A/P0-B audits either — the item-level
field inventory never scanned for `soulgain` specifically since no item uses it; caught now only
by tracing every `DB.items[...+"카드"]` occurrence for this patch's static check, §7).

## 6. Static check: `processTurn()` direct card-interpretation patterns

Grepped `source/template.html` after the patch for `cardEff.type`, `card.effect.type`,
`card.hpDrain`, `card.spDrain`, `card.inflict`, `card.autoSpell`, and any `card.effect`/`c.effect`
access: **zero matches**. The remaining `DB.items[cn+" 카드"]` lookups elsewhere in the file
(display name resolution, card-socket UI, inventory tooltips — `getItemDisplayName`,
`showCardCompoundModal`, equip-slot rendering) were checked individually and only read
`prefix`/`suffix`/display fields, never `.effect` or a combat-execution field — confirmed by
context, not by the grep alone, per the task's instruction not to fail on string matches without
checking real usage.

## 7. Tests

`tests/_item-effect-harness.js` updated: the old `applyCardEffectOnHit` (which extracted the
now-deleted inline block from `template.html` as text) is replaced by `makeTriggerItemEffects()`,
which loads the real `triggerItemEffects` straight from `source/item-effects.js`.

- `tests/item-effect-canon-correction-smoke.js` §5 rewritten to drive the full
  `collectItemEffects()` → `triggerItemEffects()` pipeline (previously it fed a hand-extracted
  code snippet): confirms a pending raceBonus card produces zero events and zero damage change,
  and a hypothetically-verified one fires only against the matching race.
- `tests/item-effects-smoke.js` gained a P0-C1 section: seProc and lifesteal executed with fixed
  injected `random` (0.01 → fires, 0.99 → doesn't, matching the task's exact spec), the legacy
  4-field executor against a synthetic fixture (0 real cards affected), multi-card RNG order and
  call-count verification, and a single-collect/single-trigger-per-turn duplicate-execution guard.

## 8. Verification

```
python -m py_compile build.py
python build.py                                  # OK, 0 FAIL / 469 WARN (unchanged from c1b6c03)
node tests/actor-interaction-smoke.js            # OK
node tests/alberta-doll-exchange-smoke.js        # OK
node tests/refine-reveal-smoke.js                # OK
node tests/item-effect-canon-correction-smoke.js # ALL TESTS PASS (raceBonus via real pipeline)
node tests/item-effects-smoke.js                 # ALL TESTS PASS (P0-B parity + P0-C1 execution)
python tests/item-effect-audit-test.py           # ALL TESTS PASS
```

Every real JS `<script>` block in the built HTML (16 non-JSON blocks, including `block-engine`
where `processTurn()`/`calcStats()` live and `item-effects-v1`) passes `node --check`.

## 9. What's left for the rest of P0-C

- The `soulgain` direct-reparse path in `useSkill()` (§5) — a fourth event kind
  (`onKill`-shaped) this stage deliberately didn't touch.
- `events.onKill`/`onDamaged`/`onTick` have a dispatcher entry point but no handlers or data yet.
- `applyDamage` consolidation, resistances (`raceDmgReduce`/`elemReduce`/`dmgReduceAll`/
  `rangedDmgReduce`/`immune`/`magicImmune`) actually affecting incoming damage, SP-cost
  (`spCostMul`), `healBoost`, `castReduction` wiring into their real formulas, `dropBonus`/
  `grantSkill` actually taking effect — all still just collected into `fx.combat`/`fx.skill` by
  P0-B, not consumed anywhere yet.
- The 394-item rAthena/desc verification backlog (unchanged, not this stage's job).

None of the above blocks starting the next P0-C stage — this patch's only job was making
`processTurn()`'s already-active card events go through one execution path instead of two
inline re-parses, with zero behavior change, and that's done.
