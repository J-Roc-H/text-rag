# Item effect collector unification (P0-B)

Continuation of `fix/item-effect-canon-p0a` (`8ea0121` audit, `18eeeab` correction). This
patch is a **structural refactor only** — it introduces a single collection entry point for
item/card effects and makes `calcStats()` consume it, without changing any currently-safe
gameplay result. No new effect activation, no `_pendingVerification` activation, no desc-only
or raw-script interpretation, no engine-unsupported effect implementation. Full audit/context:
`ITEM_EFFECT_AUDIT.md`.

## 1. Existing effect-reading paths (before this patch)

- `calcStats()` (`source/template.html` ~3953-4488) read every equipped item's own top-level
  fields (str/agi/vit/int/dex/luk/mdef/maxHp/maxSp/hit/crit/flee/aspd) **and** every socketed
  card's top-level fields **and** each card's `effect` object, all inline in one big loop, and
  accumulated everything into a single `bonus` object.
- `calcStats()` also computed `bonus.cardRaceBonus`/`cardSeProc`/`cardLifesteal` from
  `effect.type` — dead computation, confirmed in the P0-A correction pass: never included in
  `calcStats()`'s return object, so nothing could ever read it.
- The real raceBonus/seProc/lifesteal consumer is a completely separate direct re-parse inside
  `processTurn()` (~6307-6347) that reads `card.effect.type` straight from `DB.items` on every
  hit. A second, older direct-parse path (~6270-6287) reads `hpDrain`/`spDrain`/`inflict`/
  `autoSpell` off the card object directly; 0 items currently use those four fields.
- `p.cardEffects.weaponUnbreakable` was set by `calcStats()` but never read anywhere — also
  dead (confirmed newly in this patch by a full-file re-check, not just a single grep).

## 2. What `collectItemEffects()` now owns

New file: `source/item-effects.js`, entry point `collectItemEffects(p, DB, parseItem)`.

For every equipped item and every socketed card, it now collects (and previously
`calcStats()` computed inline):

- **stat**: str/agi/vit/int/dex/luk bonuses (top-level fields on equipment or cards, and
  `effect.stats` for cards where `effect.type` is `stat`/`mixed`).
- **combat**: mdef/maxHp/maxSp/hit/flee/crit/aspd/pd(perfectFlee) bonuses, `%`-based bonuses
  (maxHpPct/maxSpPct/hpRegenPct/spRegenPct/atkPct), conditional damage
  (raceAtk/elemAtk/sizeAtk/magicRaceAtk/bossAtk), resistances
  (raceDmgReduce/elemReduce/dmgReduceAll/rangedDmgReduce/immune/magicImmune/armorElement),
  and the remaining special fields (spCostMul/healBoost/castReduction/doubleAtkCard/
  defIgnore/hpDrainSelf/dropBonus). Also a card's flat ATK/DEF bonus (`c.atk`/`c.def` and
  `effect.bonus.atk`) — equipment's own ATK/DEF stay in `calcStats` (see §3).
- **skill**: `skillDmg`/`grantSkill` (moved out of `combat` into their own bucket per the
  task's schema — no behavior change, just where the accumulator lives).
- **events.onHit**: `raceBonus`/`seProc`/`lifesteal` (from `effect.type`) and
  `hpDrain`/`spDrain`/`inflict`/`autoSpell` (legacy top-level fields, 0 items currently)
  normalized into one shape. **Collected as data only — not executed.** `processTurn()`'s
  direct re-parse still does the actual execution (§4); this is deliberate per the task's
  scope, not an oversight.
- **unsupported**: `effect.type==='special'`+`weaponUnbreakable` (now confirmed
  engine-unsupported — no weapon-break mechanic exists anywhere), an unrecognized
  `effect.type` value, or a bare string `effect` (always legacy/unverified after the P0-A
  correction).
- **pending**: any item/card marked `_pendingVerification:true` — the `effect` payload is
  never read (not even inspected for shape), only `{source, reason}` is recorded. Plain
  top-level fields on a pending item are unaffected (they're never marked pending themselves)
  and are still collected normally — current data has none, but the distinction matters
  structurally.
- **ledger**: one entry per contribution, `{source, sourceType, type, key, value, active}` —
  the mechanical "what came from where, is it live" record the task asked for. No Korean
  prose, no UI polish — just data.

`calcStats()` calls `collectItemEffects(p, DB, parseItem)` once, then
`mergeItemEffectsIntoBonus(fx, bonus)` folds the result into its existing `bonus` accumulator
(same object mount/status-effect/skill-passive code also writes into) and returns
`s.itemEffects = fx` so P0-C (and anything else) can reuse the same collection without
re-deriving it.

## 3. What stays in `calcStats()`, and why

Per the task's explicit boundary: **physical base performance ≠ item effect.**

- Weapon's own ATK (`i.atk` → `wAtk`), armor's own DEF (`i.def` → `bonus.def`), the
  Pre-Renewal refine-DEF bonus, weapon type/element assignment (`p.weaponType`/
  `p.weaponElement`) — these come from the equipped item's own base stat line, not an
  attached effect, and stay exactly where they were.
- Weapon-training passive skill ATK bonuses, job-level stat bonuses, mount effects,
  status-effect (buff/debuff) contributions to `bonus.*`, and the entire derived-stat math
  (baseAtk/weaponAtk/refineBonus/ASPD formula/etc.) — none of this is item/card data, so none
  of it moved.
- `bonus.atk` remains a shared accumulator: mount's `atkBonus` and the collector's
  `fx.combat.atk` both add into it, and the existing `wAtk += (bonus.atk||0)` line (unchanged)
  folds both into `weaponAtk` — same final total as before, just two different sources adding
  to the same bucket instead of one inline block doing both.

Ambiguous cases left in place rather than guessed: none found needing a judgment call this
pass — the boundary (ATK/DEF/refine/type/element/slots/weight/equippability vs. everything
else) matched the actual code cleanly once traced.

## 4. `processTurn()` direct re-parse — still there, on purpose

`raceBonus`/`seProc`/`lifesteal` (~6307-6347) and the legacy `hpDrain`/`spDrain`/`inflict`/
`autoSpell` path (~6270-6287) are untouched. `collectItemEffects()` normalizes the same
underlying data into `fx.events.onHit`, but nothing consumes that list yet — execution still
comes exclusively from `processTurn()` re-reading `DB.items` directly. Verified no double
execution: `collectItemEffects()` calls no `Math.random()`, mutates no player/monster state,
and is proven idempotent by `tests/item-effects-smoke.js` (§E — calling it twice yields
identical `events.onHit`).

## 5. Removed as confirmed-dead (not just via one grep)

- `bonus.cardRaceBonus` / `bonus.cardSeProc` / `bonus.cardLifesteal` computation inside
  `calcStats()` — traced to confirm they never appeared in the return object `s`, so nothing
  outside `calcStats()` could ever have read them.
- `p.cardEffects.weaponUnbreakable` assignment — traced every reference to `cardEffects` in
  `source/template.html`; the only two occurrences were the assignment itself. No weapon-break
  mechanic exists anywhere in the codebase for it to gate. Represented now only via
  `fx.unsupported`/ledger (`active:false`).

## 6. `_pendingVerification` boundary (P0-C readiness)

`collectItemEffects()` checks `_pendingVerification` on both the item/card object and its
`effect` payload before touching `effect` at all — a pending item's `effect` is never even
inspected for shape (string vs object), only recorded as `{source, reason}` in `fx.pending`.
This is enforced by code, not by convention, and covered by `tests/item-effects-smoke.js`
test D (zero calcStats delta, zero active ledger entries, one pending entry).

## 7. `build.py`

- `source/item-effects.js` is injected as its own `<script id="item-effects-v1">` block,
  first among the injected scripts (before world-map/services/etc.), right before `</body>`.
- Verified this is safe: `calcStats()` lives in `<script id="block-engine">`, far earlier in
  the document, but nothing calls it until `window.onload=doLoading` fires — grepped for any
  top-level (non-function-body) call to `calcStats()`/`renderChar()`/similar and found none.
  All script tags (main template scripts and every injected side-file) finish executing,
  defining every top-level function into global scope, before `onload` runs. Injection order
  among script tags therefore doesn't affect correctness here; `item-effects.js` is placed
  first anyway as a readability/layering choice, not a requirement.
- New audit: `audit_item_effects_collector_sync()` parses `KNOWN_ITEM_EFFECT_TYPES` out of
  `source/item-effects.js` and fails the build if it doesn't exactly match `build.py`'s own
  `KNOWN_EFFECT_TYPES` set — the two files each carry their own copy of "effect types the
  engine understands," and without this check they could silently drift apart, which would
  desync the collector's actual behavior from `audit_item_effects()`'s `unknown-effect-type`
  judgment. Deliberately narrow (a single sync check) per the task's "don't over-expand the
  audit" instruction — the `_pendingVerification`-never-active guarantee is a runtime code
  property, verified by the JS test suite (§6), not something `build.py`'s static JSON scan
  can check.

## 8. Verification / parity

```
python -m py_compile build.py
python build.py                                  # OK, 0 FAIL / 469 WARN (unchanged from 18eeeab)
node tests/actor-interaction-smoke.js            # OK
node tests/alberta-doll-exchange-smoke.js        # OK
node tests/refine-reveal-smoke.js                # OK
node tests/item-effect-canon-correction-smoke.js # ALL TESTS PASS (updated to route through item-effects.js)
node tests/item-effects-smoke.js                 # ALL TESTS PASS (new, P0-B)
python tests/item-effect-audit-test.py           # ALL TESTS PASS
```

`tests/item-effects-smoke.js` covers: A) equip→exactly-once→unequip→revert→re-equip→exactly-
once for a simple stat card; B) perfectFlee(`pd`) matches the pre-refactor value; C) dedup'd
cards (고렘) still apply exactly once through the collector; D) a `_pendingVerification` card
produces zero calcStats delta, zero active ledger entries, and one pending entry; E) an
already-active event effect (스켈레톤 카드's seProc) is normalized into `events.onHit` exactly
once and the collector doesn't execute or duplicate it (idempotent, pure); F) multiple
equipped slots and multiple cards on one slot sum correctly per source; and a parity check
across 6 representative loadouts confirming STR/AGI/VIT/INT/DEX/LUK, ATK(weaponAtk)/DEF/MDEF,
HIT/FLEE/CRIT/PD, MaxHP/MaxSP, and ASPD are bit-for-bit identical to a from-scratch
reimplementation of the pre-P0-B inline logic (cross-terms like DEX→HIT and VIT→MaxHP are
accounted for explicitly, not glossed over as "refactor noise").

A parity mismatch was in fact caught and root-caused during development (not waved off): an
early version of the ASPD parity check compared against a bare-handed baseline instead of
"same weapon, no card," which made a weapon-type swap look like a card-driven ASPD change.
Fixed by comparing against a same-weapon baseline throughout, which is also what the 고렘
weaponAtk test in the P0-A correction suite already did for the same reason.

## 9. Explicitly deferred (not started this pass)

P0-C combat-consumption unification (`applyDamage`, wiring `events.onHit` execution to replace
the direct re-parse, resistances/immunities/SP-cost/healBoost/dropBonus/grantSkill actually
taking effect in combat), the 394-item rAthena/desc verification backlog, combo systems, and
status UI — none of this was touched, per the task's explicit "이번에 하지 말 것" list.
