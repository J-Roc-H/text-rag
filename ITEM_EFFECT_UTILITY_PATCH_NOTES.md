# Item effect grantSkill / soulgain(onKill) / dropBonus unification (P0-C4)

Continuation of `feat/item-effect-defense-p0c3` (`9504c51`). Connects exactly three fields —
`grantSkill`, `soulgain`, `dropBonus` — to real gameplay. `healBoost` is explicitly excluded
this stage (see §8). Full P0-A/B/C1/C2/C3 context: `ITEM_EFFECT_AUDIT.md`,
`ITEM_EFFECT_COLLECTOR_PATCH_NOTES.md`, `ITEM_EFFECT_CONSUMER_PATCH_NOTES.md`,
`ITEM_EFFECT_RESOURCE_PATCH_NOTES.md`, `ITEM_EFFECT_DEFENSE_PATCH_NOTES.md`.

## 1. Every path that reads skill existence/level — learned vs effective

Grepped the whole file for `p.skills[`/`p.skills&&`. 40 sites remain after this patch,
classified into two buckets:

**Converted to `getEffectiveSkills(player, stats)`** (needs "can I use this skill *right now*"):
- `processTurn()`'s auto-rotation candidate pool (`pickPlayerSkill`'s `mySkillNames`,
  the active/buff-skill filters, the tier sort, the heal/buff/fallback picks, the final cast).
- `useSkill()`'s "배우지 않은 스킬" gate and the `slv` used for cost calc and `sk.effect(...)`.
- `buildSkillTab()` — the hotbar-registration list (what shows up when assigning a hotbar slot).

**Left on raw `player.skills`** (needs "did I permanently learn this", not "can I use it now"):
- Skill-point investment (`upgradeSkill`/`showSkillModal` — level display, prerequisite checks).
- Job change (`doJob`, and two admin tools that seed/max skills) — permanent skill-table writes.
- `mount()`'s `requiredSkill` check — classified as a permanent capability gate, the same
  category as a job condition, not a momentary combat-usability check. Not named in the task's
  own examples; documented here as an explicit boundary call rather than silently converted.
- Every passive-bonus lookup baked directly into `calcStats()` or into `processTurn()`'s own
  attack-formula (더블 어택/소울 드레인/HP·SP 회복력 향상/운기조식/이화접목/소지량 증가/
  페코페코 기수/디바인 프로텍션/리플렉트 쉴드/데몬 베인/비스트 베인/드래고놀로지/스내쳐/
  포션 연구/디스카운트/오버챠지/오토 버서크/배쉬 자체의 급소치기 확인/스틸 크로우). These
  read a passive skill's level as a *stat modifier*, not as "is this skill available to cast" —
  wiring grantSkill into them would mean rewriting `calcStats()`'s own internals to consult
  `getEffectiveSkills()` before `bonus` even exists, a materially larger refactor the task's
  own §4 examples (자동사냥 후보/수동 목록/useSkill/핫바등록/사용가능 판정) don't ask for.
  Left untouched; flagged here as a real, explicit scope boundary, not an oversight.
- The 15%-chance normal-attack autospell pick (`processTurn()` ~6248, `magicSkills.filter(sn=>
  p.skills[sn]>0)`) — picks a random *known* magic skill to auto-cast on hit. Not named in the
  task's §4 list either, and 0 live items currently proc autospell at all (per P0-C1's findings)
  — left on raw `p.skills`, documented as a found-but-unaddressed site for a future stage.
- The hotbar-slot SP-insufficiency dimming (`renderHotbar()` ~15771,
  `p.skills[slot.name]||1`) — a cosmetic-only display read; it doesn't block real use (the
  actual gate is in `useSkill()`, converted above). Left as-is: a minor, non-blocking display
  inconsistency for a granted skill assigned to a hotbar slot, not a gameplay bug.

## 2. `getEffectiveSkills(player, stats)`

Added to `source/item-effects.js`:

```js
function getEffectiveSkills(player, stats) {
  var learned = (player && player.skills) || {};
  var eff = {};
  Object.keys(learned).forEach(function (sn) { eff[sn] = learned[sn]; });
  var granted = stats && stats.cardGrantSkill;
  if (granted) {
    Object.keys(granted).forEach(function (sn) {
      var glv = Number(granted[sn]) || 0;
      if (glv > (eff[sn] || 0)) eff[sn] = glv;
    });
  }
  return eff;
}
```

`stats.cardGrantSkill` is P0-B's own already-max-merged collector output (multiple granting
items already reduce to one level per skill via `Math.max`). This function adds exactly one
more `Math.max` step against the player's permanent levels — matching the task's two examples
(permanent 3 + grant 1 → 3; permanent 1 + grant 5 → 5) exactly. **`player.skills` is never
written by this function** — it returns a fresh object every call, so unequipping makes the
granted skill vanish from the very next `calcStats()`-derived call, with zero save-data trace
(verified by GRANT D, real `useSkill()` end-to-end).

## 3. `soulgain` — direct-reparse removal and the new onKill path

**Existing path (before this patch)**: `useSkill()`'s manual-kill post-processing
(`~line 8506-8513` pre-patch) re-parsed every equipped item's cards from `DB.items` directly on
every kill, checking `c.soulgain.race === t.race` and adding `c.soulgain.sp` to `p.sp` (clamped
to `maxSp`), with **no** `Math.random()` call.

**New path**: `collectItemEffects()`'s `collectLegacyDirectFields()` now also pushes a
`{kind:'soulgain', race, sp}` event onto `fx.events.onKill` whenever a card has a `soulgain`
field (matching field existence, not race match — exactly like the existing `hpDrain`/`spDrain`
legacy fields already do; the race check moves to the executor, matching `raceBonus`'s own
precedent). `triggerItemEffects('onKill', context, events)` gained a `_triggerOnKillEvent`
handler for `soulgain` that reproduces the original race-check → `Math.min(maxSp, sp+sg)` →
log exactly, still with no `Math.random()` call (nothing to preserve an order for). `useSkill()`
now calls `triggerItemEffects('onKill', {player:p, target:t, stats:s, log}, s.itemEffects.events.onKill)`
instead of re-parsing `DB.items`.

## 4. Kill-path inventory and soulgain's (unchanged) scope

Grepped every `currentHp<=0`/`처치!` block in `template.html`. Four distinct kill sites exist:

| Site | Function | Reward path | Had soulgain before? |
|---|---|---|---|
| Auto skill-kill | `processTurn()` (~6113) | `awardKillReward()` | No |
| Auto AOE-kill | `processTurn()` (~6119, inline) | inline (not via helper) | No |
| Auto normal-attack kill | `processTurn()` (~6267) | `awardKillReward()` | No |
| Manual `useSkill()` kill | `useSkill()` (~8504) | inline (not via helper) | **Yes — the only one** |

soulgain was **never** wired into the three `processTurn()` auto-combat kill paths — only the
manual `useSkill()` kill path had it. This patch **does not expand that scope**: the
`triggerItemEffects('onKill', ...)` call was added only at the one site that already had the
behavior. Extending soulgain to auto-combat kills is a separate, explicit future decision, not
folded into this "move the existing behavior onto the canonical event path" stage.

## 5. soulgain parity

No new `Math.random()` was added (the original had none, and the task explicitly forbids adding
one where the original had none). Race-match → SP recovery, mismatch → no change, and the
`Math.min(maxSp, ...)` clamp are byte-for-byte the same computation, just executed through
`triggerItemEffects` instead of an inline `DB.items` re-parse (verified: SOULGAIN A/B/C direct,
SOULGAIN D end-to-end through the real `useSkill()`, SOULGAIN E static-checks `c.soulgain`/
`card.soulgain` for zero remaining direct-reparse occurrences in `template.html`).

## 6. `dropBonus` — unit, scope, and stacking (connected, not deferred)

Grepped the full drop-rate formula and its only prior consumer. `rollDrops()`'s existing line:

```js
let chance = mon.drops[k] * ((isCard ? set.cardRate : set.dropRate) + rich) * returnerMult(p);
```

where `rich` comes from `p.statusEffects.richManKim.dropBonus`, itself built by a real skill
effect as `dropBonus: slv*0.05` (`부자킴`/Rich Man Kim buff, `template.html` ~line 2318) — a
small **decimal additive fraction** (e.g. Lv5 → 0.25), added into the **same** `(rate + rich)`
term used for **both** card and non-card drops unconditionally (no `isCard`-based branching on
`rich` itself).

This is the **only pre-existing consumer of a field literally named `dropBonus`** in the
codebase, and it settles both open questions the task asked about with actual evidence rather
than a fresh guess:
- **Unit**: `0.1` = "+10 percentage points added to the rate multiplier", the same convention
  `richManKim.dropBonus` already uses — not `10` and not `1.1`.
- **Card vs. general drops**: `richManKim` applies to both uniformly (the formula doesn't
  branch on `isCard` for `rich`), so item `dropBonus` (same field name, same shape) inherits
  that same unconditional scope — not "명시적 보류" material, since a real precedent already
  answers the question the task raised.

`getItemDropBonus(stats)` (new, `item-effects.js`) sums `stats.cardDropBonus` (P0-B's own
already-collected raw-value array) into one fraction:

```js
function getItemDropBonus(stats) {
  var list = stats && stats.cardDropBonus;
  if (!list || !list.length) return 0;
  var sum = 0;
  list.forEach(function (v) { sum += Number(v) || 0; });
  return sum;
}
```

**Stacking**: plain summation into the *same* term `richManKim` already occupies —
`(isCard ? set.cardRate : set.dropRate) + rich + itemDropBonus` — matching `richManKim`'s own
single-additive-term style, not a new multiplicative design.

`rollDrops(p, mon, opts, stats)` gained a `stats` parameter (used only for
`getItemDropBonus(stats)`); the existing drop-rate computation, inventory writes, logging, and
card-codex bookkeeping are completely untouched. `awardKillReward(p, mon, set, stats)` gained
the same parameter and forwards it to its own `rollDrops()` call. All **four** call sites now
pass the turn's `calcStats()` result: the two `awardKillReward()` calls in `processTurn()`, the
inline AOE-kill `rollDrops()` call, and `useSkill()`'s inline manual-kill `rollDrops()` call.
The offline-hunt extrapolation (`extrapolateOffline()`, which explicitly documents "보상은 전부
기존 경로로 흘린다") now also computes `calcStats()` once (equipment doesn't change mid-extrapolation)
and passes it through, so offline catch-up drops stay in parity with online drops for any future
`dropBonus` item.

## 7. Static check — no new direct consumption paths

- `getEffectiveSkills(` appears at exactly 3 real call sites (`pickPlayerSkill`, `useSkill()`,
  `buildSkillTab()`), all listed in §1.
- `getItemDropBonus(` appears at exactly 1 call site, inside `rollDrops()` — the single
  canonical drop-computation function every kill path already funnels through.
- `c.soulgain`/`card.soulgain` (the old direct-reparse pattern) — 0 occurrences remaining.
- No new `DB.items[...]` re-parse was introduced anywhere for these three fields; every
  consumption goes through `collectItemEffects → calcStats/itemEffects → getEffectiveSkills` /
  `triggerItemEffects` / `getItemDropBonus`.

## 8. `healBoost` — still not implemented

Found again during this stage's own grep (SP/heal-related call sites) but, per the task's
explicit instruction, not touched. Its meaning is genuinely undetermined among at least four
readings (outgoing heal amplification, incoming heal amplification, consumable-only recovery
boost, or natural regen boost) and nothing in the current codebase disambiguates it. Left for a
dedicated future stage or an original-source verification pass — recorded here only as "found,
not implemented," not designed around.

## 9. Live DB usage

```
grantSkill: 0 items   soulgain: 0 items   dropBonus: 0 items
```

Confirmed by direct search of `db-items.json` (no occurrences of any of the three field names
anywhere in the file, including nested shapes). No current loadout can produce a non-default
`cardGrantSkill`/`onKill` soulgain event/`cardDropBonus`, so every existing player's gameplay is
untouched — parity holds by construction for all three fields.

## 10. Tests and verification

New file: `tests/item-effect-utility-smoke.js` — GRANT A-E (no-permanent+grant, permanent>grant,
grant>permanent, real `useSkill()` equip/unequip end-to-end with a `p.skills` no-trace check,
pending inert), SOULGAIN A-E (race match/mismatch/clamp, a real `useSkill()` end-to-end kill
proving the full collector→onKill pipeline, and a static zero-direct-reparse check), DROP A-F
(no-effect boundary parity, a synthetic dropBonus shifting the exact probability boundary,
combination with existing `dropRate`/`richManKim` in the same additive term, card-drop parity
with `richManKim`'s own unconditional scope, unequip reverting to null, pending inert). DROP
tests verify the **actual computed chance boundary** via a real, extracted `rollDrops()` run
with `Math.random` pinned just inside/outside the expected threshold — not a reimplementation
and not a statistical sample, a direct proof of the real formula's exact value.
`tests/_item-effect-harness.js` gained `makeGetEffectiveSkills()`, `makeGetItemDropBonus()`, and
`runRollDrops()`; `runUseSkill()` was extended to inject the real `getEffectiveSkills`/
`triggerItemEffects` (needed once `useSkill()` started calling them).

```
python3 -m py_compile build.py
python3 build.py                                  # OK, 0 FAIL / 469 WARN (unchanged from 9504c51)
node tests/actor-interaction-smoke.js             # OK
node tests/alberta-doll-exchange-smoke.js         # OK
node tests/refine-reveal-smoke.js                 # OK
node tests/item-effect-canon-correction-smoke.js  # ALL TESTS PASS
node tests/item-effects-smoke.js                  # ALL TESTS PASS
node tests/item-effect-resource-smoke.js          # ALL TESTS PASS
node tests/item-effect-defense-smoke.js           # ALL TESTS PASS
node tests/item-effect-utility-smoke.js           # ALL TESTS PASS (new, P0-C4)
python3 tests/item-effect-audit-test.py           # ALL TESTS PASS
```

Every real JS `<script>` block (16, unchanged count) in the rebuilt HTML passes `node --check`.
