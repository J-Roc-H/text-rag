# Item / card effect canonicalization patch (P0-A)

> **Correction pass (same session, commit after `8ea0121`)**: the "71 cards: rename
> `effect.effect`→`effect.type`" change below turned out to be a **behavior change**, not a
> safe rename — see `## Correction pass` at the bottom. 73 of the items described in this
> file's original "What changed" section were reverted; only 8 remain active. Read the
> correction section before treating anything below as current state. Full detail:
> `ITEM_EFFECT_AUDIT.md`.

## Scope

Full inventory audit of `source/data/db-items.json` effect representations (top-level
stat fields, `effect.type`, legacy `effect.effect`, string `effect`, `effect.stats`/`bonus`,
`effects[]`, raw rAthena script left in `desc`). This patch normalizes **only** structurally
duplicate or mis-keyed representations that were already confirmed data — it does not guess
new effect values from Korean names or descriptions, and does not implement a new
effects/conditional-effect engine. Full findings: `ITEM_EFFECT_AUDIT.md`.

## What changed (81 items)

- **71 cards**: `effect.effect` (a dead key — `calcStats()`'s card bonus block only ever
  reads `effect.type`) renamed to `effect.type`. Values unchanged; this just wires already-
  entered `stat`/`raceBonus` card data to the code path that was already built for it.
- **1 card** (은총받은 자 카드): `effect:{"effect":"derived","bonus":{"hit":15}}` collapsed to
  a top-level `hit:15` (was working by accident via the unconditional `eff.bonus` merge;
  promoted to the canonical flat-field form per the "simple unconditional numbers stay
  top-level" rule).
- **2 cards** (피에르 카드, 현신(골렘형) 카드): top-level string `effect` with sibling
  `stats`/`race`/`dmgMult` fields (never read by any code — dead data) restructured into the
  canonical form (`def:1` top-level for 피에르, proper `effect:{type:"raceBonus",...}` object
  for 현신(골렘형)).
- **7 cards**: removed exact-value duplication between top-level fields and
  `effect.stats`/`effect.bonus` (both were being applied, doubling the real in-game bonus).
  5 cards (드롭스·파브르·프리오니·호넷·루나틱) had the whole `effect` object removed since
  nothing besides the duplicate remained; 2 cards (고렘·스켈레톤) kept their `effect` object
  (weaponUnbreakable / seProc are not duplicates) with only the duplicated `bonus.atk` key
  stripped. The 루나틱 카드 case required recognizing `bonus.pd` as an engine alias of
  top-level `perfectFlee` — a naive same-key check would have missed it and left `pd`
  double-counted.
- **1 field-level fix**: 현신(인간형) 카드's `race` value corrected from `"인간"` to `"인간형"`
  — the card's own name says "인간형" and every other raceBonus card uses the `-형` suffixed
  race terms; this was a self-inconsistent legacy alias, not a new translation guess.

## Left alone — engine has no consumer at all (baseline-tracked)

- 이미르의 잔해 카드 (`increaseDropRate`) / 상처받은 모로크 카드 (`increaseExpRate`): both
  already used `effect.type`, but no code anywhere (`calcStats`/`processTurn`) reads either
  type value. Renaming the key would not fix anything; this needs actual engine support
  (P0-B+). Recorded in `source/data/effect-audit-baseline.json` so the new build gate reports
  them as WARN, not FAIL.

## Left alone — needs rAthena source verification (not touched)

- 44 weapons still carry raw rAthena `bonus`/`bonus2`/`autobonus`/`bAutoSpell` script text
  verbatim in `desc`. Per the task's decontamination rule, these are not hand-interpreted
  into game effects in this pass.
- 350 items (257 cards + 93 pieces of equipment) describe a conditional effect in `desc`
  (race/element/size damage, skill damage, autospell, on-kill effects, resistances, etc.)
  with zero structured backing. This is exactly the "conditional/special effect" category
  the task defers to a future `effects[]` canon — not converted here.

## build.py

Added `audit_item_effects(items)`, wired into `main()` after the existing map/NPC audits.
FAIL blocks the build for: reserved-word string effects, legacy `effect.effect` keys,
top-level/structured duplicate values, the banned `인간` race alias, and missing required
args for `raceBonus`/`seProc`/`lifesteal`. Two categories (`unknown-effect-type`,
`unknown-race`) can be downgraded to WARN only via a human-curated
`source/data/effect-audit-baseline.json` entry — nothing is auto-added to it. Desc-only /
raw-script findings are always WARN and never block the build; they exist so future
contamination is visible in build output, not to gate merges.

## Verification

```
python -m py_compile build.py
python build.py                              # OK, item effect audit: 396 WARN / 0 FAIL
node tests/actor-interaction-smoke.js        # OK
node tests/alberta-doll-exchange-smoke.js    # OK
node tests/refine-reveal-smoke.js            # OK
python tests/item-effect-audit-test.py       # ALL TESTS PASS (new)
```

## Deferred (explicitly out of scope for P0-A)

- No effect aggregator / `effects[]` engine implementation.
- No interpretation of the 44 raw rAthena scripts or the 350 desc-only conditional effects
  into game mechanics — they need rAthena pre-re source cross-checking first (394 items
  total).
- No change to `processTurn()` or any combat formula.

## Correction pass

Re-tracing `source/template.html` in full (not just the block quoted in the original audit)
found a second, completely separate consumption path this patch's audit had missed:
`processTurn()` re-parses every equipped item's cards on each hit and reads `card.effect.type`
directly to apply `raceBonus`/`seProc`/`lifesteal` in real combat (lines ~6307-6347).
`calcStats()`'s own `bonus.cardRaceBonus`/`cardSeProc`/`cardLifesteal` (which the original audit
cited as "the" consumer) are computed and then **silently dropped** — never included in
`calcStats()`'s return object, so they are dead code, not a real code path.

That means the "71 cards: rename `effect.effect`→`effect.type`" fix above was not a safe
key rename: because the real consumer reads `effect.type` directly from `DB.items`, the rename
activated real in-combat damage bonuses / stat bonuses that had never fired before. Treating
"the value already exists in the DB" as "already confirmed" was the mistake — none of these 73
items (71 renamed + 피에르/현신(골렘형)) could be corroborated against this project's own card
reference docs (`text-rag-docs/데이터베이스/카드_*db.md`, ~400 entries) or its monster DB
(every raceBonus card's supposed source monster is absent from `db-monsters.json`). All 73 were
reverted to their exact pre-`8ea0121` JSON (via `git show 8ea0121~1`) and marked
`"_pendingVerification": true` so `build.py`'s audit reports them as WARN (not a fresh
"legacy-key" FAIL) instead of silently re-activating.

`현신(인간형) 카드`'s `race:"인간"`→`"인간형"` fix was also reverted: it was justified by the
card's own name, not an rAthena source, so it doesn't meet the bar either (the item is part of
the reverted 73 anyway).

What's actually left active, verified against the project's card reference docs, and covered by
a new regression test (`tests/item-effect-canon-correction-smoke.js`, which executes
`calcStats()`/`parseItem()`/the real card-effect-on-hit block extracted verbatim from
`source/template.html`):

- 드롭스/파브르/프리오니/호넷/루나틱/고렘 카드: the 7-item top-level/`effect` duplicate
  removal (§ "What changed" above) — confirmed against the card reference docs, applies exactly
  once, un-equips cleanly.
- 스켈레톤 카드: only the duplicated `bonus.atk` was ever touched; its `seProc` was already
  `effect.type:'mixed'` before `8ea0121` and was never dead — not part of the revert.
- 은총받은 자 카드: the flat-field promotion is a no-op on behavior (was already applied via
  calcStats's unconditional `eff.bonus` merge) — kept.
- 고렘 카드's `weaponUnbreakable` is a newly-confirmed **엔진미지원** finding: the card
  reference docs confirm the effect is real ("무기는 절대로 손상되지 않는다"), but nothing in
  the engine implements weapon breakage at all, so the flag has no consumer regardless of key
  naming.

`build.py`'s `audit_item_effects()` now recognizes `_pendingVerification` (WARN instead of FAIL
for `legacy-effect-key`/`reserved-string-effect` only when marked) — a genuinely new,
unmarked occurrence of the same anti-pattern still fails the build. Verification after the
correction: `python build.py` → 0 FAIL / 469 WARN (up from 396; the 73 reverted items now show
as WARN instead of being silently active). All prior smoke tests plus the new
`item-effect-canon-correction-smoke.js` and `item-effect-audit-test.py` pass.

Full findings, the corrected consumption-path trace, and the per-item re-judgment table are in
`ITEM_EFFECT_AUDIT.md`.
