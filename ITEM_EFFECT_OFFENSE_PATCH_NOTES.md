# Item effect offensive-side consumption cleanup (P0-C5)

Continuation of `feat/item-effect-utility-p0c4` (`ffa5208`). Target fields: `atkPct`,
`raceAtk`, `elemAtk`, `sizeAtk`, `bossAtk`, `magicRaceAtk`, `skillDmg`, `defIgnore`,
`doubleAtkCard`. This is **not** "activate all nine" — six were already live before this
stage and are only reorganized here (parity preserved exactly); three are deliberately left
unconnected with documented reasons. Full P0-A/B/C1-C4 context: `ITEM_EFFECT_AUDIT.md`,
`ITEM_EFFECT_COLLECTOR_PATCH_NOTES.md`, `ITEM_EFFECT_CONSUMER_PATCH_NOTES.md`,
`ITEM_EFFECT_RESOURCE_PATCH_NOTES.md`, `ITEM_EFFECT_DEFENSE_PATCH_NOTES.md`,
`ITEM_EFFECT_UTILITY_PATCH_NOTES.md`.

## 1. Every player→monster damage path (full inventory)

Grepped every `t.currentHp -=`/`m.currentHp -=` in `template.html`. Two fundamentally
different kinds of damage code exist:

| Path | Physical/Magic | Skill name known | target race | target element | target size | boss/MVP | Shared choke point? |
|---|---|---|---|---|---|---|---|
| Normal attack (`processTurn()`, one block) | Physical | n/a (not a skill) | yes (`t.race`) | yes (`t.element`) | yes (`t.size`) | yes (`t.isMvp`) | **Yes — one formula** |
| Every individual active skill (~30-40 `effect(p,s,t,slv)` functions, e.g. 배쉬/네이팜비트/화이어볼트/메테오스톰/아수라 패황권/...) | Either, per-skill hardcoded | yes, but only *inside that one function* | sometimes (`t.element` checks exist ad hoc, e.g. 소울 스트라이크's undead check; `t.race` is never read by any of them) | ad hoc per-skill | never read | never read | **No — each function computes and applies its own damage independently** |
| Auto-skill-cast (`processTurn()`) / manual `useSkill()` / autospell proc | Same as above | same as above | same | same | same | same | Both just call `skObj.effect(p,s,t,slv)` — the shared code never sees a raw damage number, only the skill's own `{msg,type}` return, because the skill already wrote `t.currentHp -= d` *before* returning |
| DoT-on-monster (player→monster) | n/a | n/a | n/a | n/a | n/a | n/a | **None exists.** No monster-side status tick function was found (only `procPlayerStatusTick` for the player side) — poison/bleeding applied to monsters via card procs have no damage-tick consumer in this engine at all |
| Misc (원령무사 자해, 오토 카운터, 스내쳐, 슈링크, 포이즌 리액트, 리플렉트 쉴드 반사 등) | Physical, fixed formula | n/a | no | no | no | no | Each is its own small inline block, same pattern as skills |

**The critical finding**: only the **normal attack** has a single shared formula. Every one of
the ~30-40 individual skill `effect()` functions computes and applies its own damage
independently, with **zero** existing consumption of any of the 9 target fields inside any of
them. This directly shapes what can and cannot be connected without violating the task's
explicit "don't touch 30-40 individual skill formulas" / "don't build a damage-packet engine"
boundaries (§17/§25 of the task spec).

## 2. Each field's status (this branch, before any P0-C5 edit)

| Field | Collector (P0-B) | calcStats exposure | Pre-existing consumer |
|---|---|---|---|
| `atkPct` | ✅ simple key, summed | `s.cardAtkPct` | ✅ normal attack (`cardAtkMul`) |
| `raceAtk` | ✅ counter key, per-race map | `s.cardRaceAtk` | ✅ normal attack (`raceMul` += if `t.race` matches) |
| `elemAtk` | ✅ counter key, per-element map | `s.cardElemAtk` | ✅ normal attack (`raceMul` += if `t.element` matches) |
| `sizeAtk` | ✅ counter key, per-size map | `s.cardSizeAtk` | ✅ normal attack (`raceMul` += if `t.size` matches) |
| `bossAtk` | ✅ simple key, summed | `s.cardBossAtk` | ✅ normal attack (`raceMul` += if `t.isMvp`) |
| `defIgnore` | ✅ boolean flag | `s.cardDefIgnore` | ✅ normal attack (zeroes `effSoftDef`/`effHardDef`) |
| `magicRaceAtk` | ✅ counter key, per-race map | `s.cardMagicRaceAtk` | ❌ none |
| `skillDmg` | ✅ object, per-skill-name map | `s.cardSkillDmg` | ❌ none |
| `doubleAtkCard` | ✅ simple key, summed | `s.cardDoubleAtkCard` | ❌ none |

So six of nine fields were **already fully working** — only in the normal attack, never in any
skill — before this stage touched anything. This patch's job for those six was to organize the
existing, already-correct consumption without changing its behavior; for the other three, to
decide connect-or-defer with real evidence.

## 3. What actually changed: six working fields moved into named helpers

`source/template.html`'s normal-attack block previously inlined all six behind an unlabeled
4-line block. Moved verbatim (same order, same rounding position) into
`source/item-effects.js`:

```js
function applyOutgoingRaceElemSizeBossAtk(mul, target, stats) {
  if (!stats || !target) return mul;
  if (stats.cardRaceAtk && target.race && stats.cardRaceAtk[target.race]) mul += stats.cardRaceAtk[target.race] / 100;
  if (stats.cardElemAtk && stats.cardElemAtk[target.element]) mul += stats.cardElemAtk[target.element] / 100;
  if (stats.cardSizeAtk && stats.cardSizeAtk[target.size]) mul += stats.cardSizeAtk[target.size] / 100;
  if (stats.cardBossAtk && target.isMvp) mul += stats.cardBossAtk / 100;
  return mul;
}
function getOutgoingAtkPctMul(stats) { return 1 + ((stats && stats.cardAtkPct) || 0) / 100; }
function getOutgoingDefIgnore(target, stats) {
  var ignore = !!(stats && stats.cardDefIgnore);
  return { softDef: ignore ? 0 : ((target && target.softDef) || 0), hardDef: ignore ? 0 : ((target && target.def) || 0) };
}
```

`template.html`'s normal-attack block now calls these **at the exact same point** in the
formula — right where the four inline lines used to sit, still *before* `rawAtk` is floored and
*before* DEF is subtracted:

```js
raceMul = applyOutgoingRaceElemSizeBossAtk(raceMul, t, s);
let cardAtkMul = getOutgoingAtkPctMul(s);
let _defIgnore = getOutgoingDefIgnore(t, s);
let effSoftDef = _defIgnore.softDef;
let effHardDef = _defIgnore.hardDef;
let rawAtk = Math.floor((s.baseAtk + s.weaponAtk) * szP * elM * curseMul * raceMul * cardAtkMul);
let tot = Math.max(1, Math.floor((rawAtk - effSoftDef) * (1 - effHardDef/100)));
if(isC) tot = Math.floor(tot * 1.4);
```

**Formula order (unchanged, documented for the record)**: size penalty → element matrix →
curse debuff → race/element/size/boss card multipliers (added into the same `raceMul` that
already holds the 데몬베인/비스트베인/드래고놀로지 passive-skill bonuses) → ATK% multiplier →
floor into `rawAtk` → DEF subtraction (or full ignore) → floor into `tot` → crit ×1.4 → floor.
Nothing about this order or where the floors land was touched — the helpers are a pure
extraction, verified by direct comparison testing (§8) against hand-computed expected values
using the exact same formula.

**Units/semantics preserved as-is** (not redesigned this stage):
- `atkPct`: `20` = +20% (unchanged existing convention).
- `raceAtk`/`elemAtk`/`sizeAtk`/`bossAtk`: `N` = +N percentage points added into the same
  multiplicative `raceMul` the passive race/element skills already use — exact-match only
  (`t.race`/`t.element`/`t.size`/`t.isMvp`), no fuzzy matching, no default when metadata is
  absent (a monster with no `race` simply never matches any `raceAtk` key).
- `elemAtk`'s meaning (§8 of the task spec asked to confirm this explicitly): the existing code
  reads `t.element`, i.e. **the target monster's own defensive element** — "+N% damage dealt
  to monsters of element X" — not "add element X to my own attack." This is the current
  TextRAG meaning as already implemented; it was not changed or reinterpreted.
- `bossAtk`: only `t.isMvp` was ever read. Checked whether a separate "boss" flag exists
  distinct from MVP — found one, but it's a **cosmetic admin/monster-browser tab filter**
  (`let isBoss = m.hp >= 40000 || m.name.includes("MVP")` at a UI-only site), never read by
  any combat-damage code. `t.isMvp` remains the only boss concept relevant to damage; `bossAtk`
  was not expanded to also cover that unrelated UI flag.
- `defIgnore`: confirmed all-or-nothing — both `effSoftDef` and `effHardDef` are zeroed
  together, never a partial ignore. This was already how it worked; not touched.

## 4. `magicRaceAtk` — deferred

No common "magic damage" computation point exists to hook into. Every magic-dealing skill
(네이팜 비트, 소울 스트라이크, 화이어 볼트, 메테오 스톰, ...) computes `s.matk * <its own
multiplier> - t.softDef`, floors it, and applies it to `t.currentHp` entirely inside its own
`effect()` function — there is no shared "this is a magic hit, apply race multiplier here" step
anywhere. Implementing `magicRaceAtk` would require either editing every one of the ~15-20
magic-skill functions individually, or building a shared magic-damage-application step that
doesn't currently exist — both explicitly out of scope for this stage (§17/§25: don't touch
30-40 individual skill formulas, don't build a damage-packet engine). **Deferred**, per the
task's own explicit allowance (§28) for exactly this situation.

## 5. `skillDmg` — deferred

Collector shape is a plain object, `{"배쉬": 20}` (exact skill-name key, percentage value) —
unambiguous in itself. The blocker is architectural, not semantic: every skill's `effect()`
function computes its damage and writes `t.currentHp -= d` **before** returning control to
either `useSkill()` or `processTurn()`'s auto-cast site — by the time the caller sees anything
back (a `{msg, type}` object, no damage number), the hit has already landed. There is no point
between "skill picked" and "damage applied" where a caller could look up
`stats.cardSkillDmg[skillName]` and multiply, without either touching all ~30-40 individual
`effect()` bodies to consult it themselves (forbidden scope) or splitting "compute damage" from
"apply damage" into a real packet/engine (also explicitly forbidden this stage). **Deferred**,
for the same task-sanctioned reason as `magicRaceAtk`.

## 6. `doubleAtkCard` — deferred

Traced the only existing double-attack mechanic: `s.doubleAtkRate` (`calcStats()`), built
purely from the `더블 어택` passive skill level **and** gated on weapon type (`단검`/`카타르`
only): `doubleAtkRate = Math.min(50, daLv * 5)`. Unlike `dropBonus` in P0-C4, there is **no**
existing consumer named `doubleAtkCard`/`doubleAtk` anywhere to borrow a unit/scope precedent
from — `doubleAtkRate`'s cap (50) and weapon-type gate exist specifically for the skill-based
mechanic, and whether an item bonus should (a) require the same weapon-type gate, (b) share the
same 50 cap, or (c) work independently of both is genuinely undetermined by anything in this
codebase. (A separate combat *simulator*/preview function at `template.html` ~11552 reproduces
`doubleAtkRate`'s consumption for estimate purposes only — it's not the live combat engine and
was left untouched.) Guessing any of (a)/(b)/(c) would be exactly the "이름만 보고 확대" the
task explicitly forbids (§15). **Deferred**, ledger/ledger-adjacent `unsupported[]` entry added
(see §7) so this is visibly a "collected, not yet wired" state rather than a silent gap.

## 7. Ledger honesty for the three deferred fields

Per the task's explicit instruction (§23: "지원한다고 표시하면서 실행되지 않는 상태를 남기지
않는다... 보류한 필드는 ledger에서도 구분 가능한지 확인한다"), `collectItemEffects()` still
aggregates `magicRaceAtk`/`skillDmg`/`doubleAtkCard` normally (so `s.cardMagicRaceAtk`,
`s.cardSkillDmg`, `s.cardDoubleAtkCard` are ready for a future stage to consume) — the ledger
entry for each still reports `active: true` (the value genuinely was collected and merged) —
but each one **also** pushes a `fx.unsupported` entry with an explicit label (`"magicRaceAtk:
소비처 없음(P0-C5 보류 -- ...)"` etc.), reusing the existing `unsupported[]` mechanism the
collector already had for genuinely-unimplementable cases (string `effect`, unknown
`effect.type`, `weaponUnbreakable`). This makes "collected but nothing in gameplay reads it"
distinguishable from "collected and actively consumed" without inventing a new flag or
misrepresenting whether the value was summed. Verified by a direct test reading `fx.unsupported`
from the real `collectItemEffects()`.

## 8. Auto/manual parity

Not applicable this stage in the sense the task's §20 test asks about (배쉬 auto vs manual):
`skillDmg` (the field that test would exercise) is deferred, so there's no skill-specific
multiplier to check parity for. The six *connected* fields only ever apply inside the normal
attack, which has exactly one code path regardless of whether it fires from the auto-hunt loop
or is otherwise triggered — there is no separate "auto normal attack" vs "manual normal attack"
formula to diverge in the first place, so parity is structural, not something a test needs to
separately prove.

## 9. Live DB usage

```
atkPct: 0        raceAtk: 0       elemAtk: 0        sizeAtk: 0
bossAtk: 0       magicRaceAtk: 0  skillDmg: 0        defIgnore: 0
doubleAtkCard: 0
```

Confirmed via direct search of `db-items.json` (zero occurrences of every field name, including
nested shapes). Since the six connected fields' consumption code is unchanged behavior (only
relocated), and the three deferred fields were never consumed before or after this patch,
**every existing loadout's normal-attack damage is byte-for-byte identical** to pre-P0-C5 —
verified directly (§10), not assumed.

## 10. Tests and verification

New file: `tests/item-effect-offense-smoke.js`. Because `processTurn()` is too large to extract
and execute wholesale (same constraint noted in every prior P0-C stage), the real normal-attack
formula block was extracted as *source text* (from the `평타 및 크리티컬 처리` comment through
the line that applies `dmg` to `t.currentHp`) and executed in a sandbox with `Math.random`
shadowed by a controlled function (not a global monkeypatch — a local parameter named `Math`
that shadows the global inside the extracted snippet only, carrying every real `Math.*` method
plus a pinned `random`). This is the same "extract real source, never reimplement" discipline
every earlier stage's harness uses, just applied to a snippet inside a giant function instead of
a whole standalone function. New harness exports: `runNormalAttackFormula()` (plus
`sizeMatrix`/`elementMatrix`, extracted from `template.html`'s own inline
`<script id="db-size"/"db-element">` JSON, now included in `makeDB()` since the formula needs
them).

Tests: a baseline (no item effects → known hand-computed damage), one test per connected field
(match vs. mismatch/absent-metadata cases for raceAtk/elemAtk/sizeAtk/bossAtk, a direct value
check for atkPct, an ignore-vs-not comparison for defIgnore), a combined six-field test, a
root-pending test (zero effect), a deferred-fields test proving extreme synthetic values for
`magicRaceAtk`/`skillDmg`/`doubleAtkCard` produce **zero** change to computed damage or to
`doubleAtkRate`, a `fx.unsupported[]` content check for the three deferred fields, and a static
check that the three new helper functions are called from exactly one place each (the normal
attack block, nowhere else).

```
python3 -m py_compile build.py
python3 build.py                                  # OK, 0 FAIL / 469 WARN (unchanged from ffa5208)
node tests/actor-interaction-smoke.js             # OK
node tests/alberta-doll-exchange-smoke.js         # OK
node tests/refine-reveal-smoke.js                 # OK
node tests/item-effect-canon-correction-smoke.js  # ALL TESTS PASS
node tests/item-effects-smoke.js                  # ALL TESTS PASS
node tests/item-effect-resource-smoke.js          # ALL TESTS PASS
node tests/item-effect-defense-smoke.js           # ALL TESTS PASS
node tests/item-effect-utility-smoke.js           # ALL TESTS PASS
node tests/item-effect-offense-smoke.js           # ALL TESTS PASS (new, P0-C5)
python3 tests/item-effect-audit-test.py           # ALL TESTS PASS
```

Every real JS `<script>` block (16, unchanged count) in the rebuilt HTML passes `node --check`.
No `DB.items[...]` re-parse was introduced anywhere for these nine fields; all consumption goes
through `collectItemEffects → calcStats/itemEffects → applyOutgoingRaceElemSizeBossAtk /
getOutgoingAtkPctMul / getOutgoingDefIgnore`.

## 11. Where this leaves P0-C

With this stage, every field from the original P0-A/B audit that has a *concrete, evidence-
backed* consumption point is now connected: SP/cast (P0-C2), incoming damage reduction/status
immunity (P0-C3), grantSkill/soulgain/dropBonus (P0-C4), and the six working offensive fields
(P0-C5). What remains unconnected across all P0-C stages — `healBoost` (ambiguous meaning),
`magicImmune`/`armorElement` (different, larger mechanics), `rangedDmgReduce` (no ranged
metadata exists in combat), `magicRaceAtk`/`skillDmg`/`doubleAtkCard` (this stage, architectural
blockers) — all share the same property: connecting them for real would require either
resolving a genuine semantic ambiguity with original-source evidence that doesn't currently
exist in this codebase, or building a materially larger piece of engine (a real damage-packet
system, a magic-damage choke point, a status-application refactor) that no single P0-C stage was
scoped to build. That is a reasonable, evidence-based place to stop the "wire up collected
values" track. The 394-item rAthena original-source verification backlog remains separately
untouched, as it has been since P0-A.
