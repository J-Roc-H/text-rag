# Item effect defense/immunity unification (P0-C3)

Continuation of `feat/item-effect-resource-p0c2` (`55a7270`). Connects exactly five fields —
`dmgReduceAll`, `raceDmgReduce`, `elemReduce`, `rangedDmgReduce`, `immune` — to the real
incoming-damage and hostile-status pipelines. `armorElement`, `magicImmune`, `healBoost`,
`dropBonus`, `grantSkill`, `soulgain`, `onKill`/`onDamaged`/`onTick`, and a full `applyDamage`
consolidation were explicitly out of scope and untouched. Full P0-A/B/C1/C2 context:
`ITEM_EFFECT_AUDIT.md`, `ITEM_EFFECT_COLLECTOR_PATCH_NOTES.md`,
`ITEM_EFFECT_CONSUMER_PATCH_NOTES.md`, `ITEM_EFFECT_RESOURCE_PATCH_NOTES.md`.

## 1. Player incoming-damage paths (full inventory)

Grepped the whole file for `p.hp -=`/`p.hp=`, `dmg-recv`-tagged logs, and every hostile
`statusEffects` write. Every path that can reduce the player's HP:

| Path | Attacker | Race/element available | Ranged determinable | Classification |
|---|---|---|---|---|
| Monster special/boss skill damage (`processTurn()` ~6374-6396) | `m` (monster) | `m.race` always; `m.element` used as the attack's element **only** when `isSkillMagic` (existing `siegfried` precedent) | No | Combat — **connected** |
| Monster normal attack (`processTurn()` ~6397-6419) | `m` | `m.race` always; no established "this hit's element" concept (see §3) | No | Combat — **connected** (race + all only) |
| Poison DoT tick (`processTurn()` ~5771) | none (status tick, no attacker object) | n/a | n/a | DoT — **left untouched**, per task's explicit instruction not to touch un-verified DoT/self-damage paths |
| Bleeding DoT tick (`processTurn()` ~5774) | none | n/a | n/a | DoT — **left untouched** |
| `원령무사` card self-drain (`processTurn()` ~5759, `cardHpDrainSelf`) | self (item downside, not an attack) | n/a | n/a | Self — **left untouched**, not an incoming attack |
| Death/resurrect HP writes (~6455-6477) | n/a (state transitions, not damage) | n/a | n/a | Not damage — out of scope |
| Tutorial/onboarding demo HP writes (~16272, ~16296) | scripted demo, not live combat | n/a | n/a | Out of scope |

Only the two combat-attack paths are genuine "attacker deals damage to the player" routes;
everything else is either not an attack (self-drain, death/resurrect) or a DoT/self-damage
path the task explicitly said to leave alone absent original-source confirmation.

## 2. Hostile status-infliction paths (full inventory)

Grepped every `p.statusEffects[...]=`/`p.statusEffects.x=` write:

| Path | Source | Classification |
|---|---|---|
| `m.inflict` roll (`processTurn()` ~6442) | monster → player | Hostile — **connected** |
| 화이어 월 / 여러 자기 스킬 (`p.statusEffects['fireWall']=...` 등) | self-cast buffs | Self — untouched |
| 행인(passerby) NPC buff (~5449) | friendly NPC service | Positive/service — untouched |
| 관리자 에디터 `editorApplyBuff` (~10228) | debug/admin tool | Not gameplay — untouched |
| Cure effects (`cure` item, `curable`/`silence,blind,chaos` removal) | player-initiated removal | Not infliction — untouched |

**`m.inflict` is the only hostile (monster → player) status-infliction path in the entire
codebase.** It is also currently dead data: 0 monsters in `db-monsters.json` use `inflict`.
`triggerItemEffects`'s own `inflict`/`seProc` handlers (P0-C1) write to `t.statusEffects`
(the **monster** target of the player's cards), a different direction and a different ad-hoc
vocabulary (`stun`/`confusion`/`silence`/`sleep`/`blind`/`random_debuff`) — not relevant here.

## 3. race/element/ranged metadata availability

- **race**: `m.race` is a fixed monster attribute, always readable, used unconditionally in
  both combat-damage branches (e.g. `드래곤 브레스` skill-name selection at `m.race==='용족'`
  in either branch). Real vocabulary (`db-monsters.json`, not the stale admin-editor dropdown
  at line ~9763 which lists a different, mismatched set): `곤충/동물/드래곤/무형/식물/악마/어류/
  언데드/인간형/천사`. 179 of 490 monsters have no `race` at all — those attackers simply never
  match any `raceDmgReduce` key (never guessed).
- **element**: `m.element` is the monster's *body* element (always present, 0 monsters missing
  it), not a per-skill attack element — the engine has no such per-skill concept anywhere. The
  existing codebase already has a precedent for what "this hit's element" means: `siegfried`
  (elemental resist buff) reduces damage using `m.element` **only inside the `isSkillMagic`
  branch** (`p.statusEffects.siegfried && isSkillMagic`), never for plain physical attacks —
  even physical special skills like 배쉬/헬 저지먼트/드래곤 브레스 are excluded. `elemReduce`
  mirrors this exact scope: `context.element` is set to `m.element` only when `isSkillMagic` is
  true, and left `undefined` for every normal attack and every non-magic special skill. This is
  not a guess — it's the identical scope an existing analogous mechanic already uses.
- **ranged**: no per-attack ranged flag exists anywhere. `m.range` (monster attack-range stat)
  is only ever read by the monster-editor admin form (`me-range` input) — it is never read by
  `processTurn()`'s actual damage resolution. `m.distance` is "turns until the monster closes
  in before it can attack at all" (pure positioning, seeded from the *player's* job/weapon via
  `getInitialDistance(p)`, not the monster's own range), not a per-hit ranged/melee tag. Even
  the existing `디펜더` skill status (`desc:"원거리 물리 피해 80% 감소"`) doesn't actually check
  anything ranged-related in its own damage-reduction code — it unconditionally reduces all
  physical damage, which is itself an existing desc/implementation mismatch (out of scope to
  fix here, but strong independent confirmation that this engine has no working
  ranged-vs-melee distinction to hook into). **`rangedDmgReduce` is therefore deferred**: the
  field stays fully collected by P0-B (`s.cardRangedDmgReduce`), just unconsumed — no fake
  boolean was invented to give it something to key off of.

## 4. `applyIncomingItemReduction()` — value unit and stacking rule

Added to `source/item-effects.js`:

```js
function applyIncomingItemReduction(damage, context, stats) {
  if (!stats || !damage) return damage;
  var ctx = context || {};
  var result = damage;
  var all = stats.cardDmgReduceAll;
  if (all) result *= (1 - all / 100);
  var raceMap = stats.cardRaceDmgReduce;
  if (raceMap && ctx.attackerRace != null && raceMap[ctx.attackerRace]) {
    result *= (1 - raceMap[ctx.attackerRace] / 100);
  }
  var elemMap = stats.cardElemReduce;
  if (elemMap && ctx.element != null && elemMap[ctx.element]) {
    result *= (1 - elemMap[ctx.element] / 100);
  }
  return result;
}
```

**Unit** (0 live items use any of these three fields — cannot be confirmed from real data, so
this is stated explicitly as a *TextRAG canonical rule*, not an rAthena/original-game fact):
raw percentage numbers, `30` meaning 30% (matching the task's own example
`raceDmgReduce: {"인간형": 30}`). This follows the majority convention of every sibling field in
the same collector return object — `maxHpPct`/`maxSpPct`/`hpRegenPct`/`spRegenPct`/`atkPct` all
store a raw percentage and divide by 100 at the point of consumption
(`(1 + (bonus.maxHpPct||0)/100)` etc., `template.html` `calcStats()`). Note this convention is
**not** universal in this object — `castReduction` (P0-C2) is a 0-1 fraction, and
`hpDrainSelf` divides by 10, not 100 — so this is a considered choice among competing sibling
conventions, not a mechanical copy; it's documented here precisely so a future contributor with
real data can correct it if wrong.

**Stacking** (also a TextRAG canonical rule, also unconfirmed by live data): **sequential
multiplication**, `damage * (1-all/100) * (1-race/100) * (1-elem/100)`, not "sum percentages
then apply once." This is not an arbitrary choice — it's the exact pattern the existing
defensive-status chain in the same `processTurn()` block already uses for combining multiple
independent damage-reduction sources: `devotion` → 디바인 프로텍션 → `kyrie` → `diamondBody` →
`defender` → `siegfried` → `godsBless`, each one re-multiplying the *already-reduced* `mdg` by
its own `(1 - x)`. Item reduction was added as one more step appended to that same sequential
chain, using the same combination rule, rather than inventing a new design.

**Clamping**: the function itself does *no* `Math.max(1, ...)` — per the task's explicit
instruction, that responsibility stays with the call site, exactly like every other step in the
existing chain (`mdg=Math.max(1,Math.floor(mdg*(1-x)))` at each of the 7 existing steps). The
call sites wrap `applyIncomingItemReduction()` the same way.

## 5. Integration points

Two combat-damage sites in `processTurn()`, appended as the last step of each existing
defense-status chain (after `godsBless`/`defender`, before `p.hp -= mdg`):

```js
// skill/boss-skill branch
if(mdg>0) mdg=Math.max(1,Math.floor(applyIncomingItemReduction(mdg,
  { attackerRace:m.race, element:isSkillMagic?m.element:undefined, kind:isSkillMagic?'magic':'physical' }, s)));
// normal-attack branch
if(mdg>0) mdg=Math.max(1,Math.floor(applyIncomingItemReduction(mdg,
  { attackerRace:m.race, kind:'physical' }, s)));
```

Only real, already-computed information is passed (`m.race`, `m.element`, the already-existing
`isSkillMagic` flag) — no field is invented. `kind` is included in the context shape per the
task's spec but is not yet read by any of the three connected numeric fields (none of
`dmgReduceAll`/`raceDmgReduce`/`elemReduce` currently distinguish physical vs magic in their
schema) — it's forwarded for a future stage's use, not fabricated for this one.

One hostile-status site in `processTurn()`'s `m.inflict` roll:

```js
if(m.inflict) Object.keys(m.inflict).forEach(k=>{ if(Math.random()<m.inflict[k]){
  if(isStatusImmune(k,s)){ log(`🛡️ ${k} 면역!`,'system'); return; }
  if(!p.statusEffects) p.statusEffects={}; p.statusEffects[k]={turns:...}; log(...);
} });
```

`isStatusImmune(status, stats)` is checked **after** the existing `Math.random()<m.inflict[k]`
roll, not instead of it — RNG call count/order is unchanged, since immunity blocks the
*application*, not the roll (matching how immunity works everywhere else in this game's
design: a hit still "connects", the status just doesn't stick). The check runs before any
`p.statusEffects` write, so an immune player's existing status/duration is never touched.

```js
function isStatusImmune(status, stats) {
  var list = stats && stats.cardImmune;
  return !!(list && list.indexOf(status) !== -1);
}
```

Only `stats.cardImmune` (the already-collected `calcStats()` field) is read — no `DB.items`
re-parsing. There is exactly one call site of `isStatusImmune(` in the whole codebase (verified
by test, §7 below) and it is the `m.inflict` block — self-buffs and friendly-NPC buffs never go
through it, so they are structurally unaffected by `immune`.

## 6. `immune` canonical vocabulary and shape

Collector shape (already fixed by P0-B, not changed here): raw item field `immune: [...]`
(array of strings), merged into `bonus.immune`/`s.cardImmune` as a deduplicated array — matches
the task's own first example (`["freeze","stun"]`), not the object-map alternative. Canonical
status keys are `DB.statusEffects`'s own internal keys (`source/template.html` inline
`<script id="db-status">`): `poison, stun, freeze, stone, curse, blind, silence, sleep,
bleeding, chaos` — English internal keys with Korean `name` for UI, the same key domain
`m.inflict`'s `Object.keys(m.inflict)` already indexes into `DB.statusEffects[k]` with. This is
a different vocabulary from `triggerItemEffects`'s onHit-proc sub-statuses
(`stun/confusion/silence/sleep/blind/random_debuff`, applied to the **monster** target, not the
player) — the two are not interchangeable and this patch does not conflate them.

## 7. Latent collector bug found and fixed (P0-C3, self-caught)

While writing the pending-immunity test, found that a card marked `_pendingVerification: true`
at its own **root** (the "sibling-field shape" from the P0-A correction, 2 real items:
`피에르 카드`, `현신(골렘형) 카드`) still had its plain top-level simple fields (would include
`immune`/`dmgReduceAll`/`raceDmgReduce`/`elemReduce` if any existed) collected anyway, because
`collectItemEffects()`'s pending-card branch called `collectSimpleFields()` unconditionally,
reasoning (in its own P0-B comment) that "펜딩과 무관한 단순 필드는 이미 확정된 값" — true only
for the *nested* `.effect._pendingVerification` shape (71 real items, where only the `.effect`
object itself is disputed and sibling flat fields like `str` are separately confirmed), not for
the *root*-level marker (where the whole item is disputed). Fixed by adding
`_itemEffIsRootPending(it)` and skipping `collectSimpleFields()` for cards whose root itself
carries the marker, while keeping the existing behavior unchanged for the 71 effect-only-pending
items. **Zero live impact**: verified via script that neither of the 2 real root-pending items
has any top-level simple field to begin with — this was a latent gap, not an active bug,
exactly like P0-C1's onHit-ordering fix.

## 8. `magicImmune` / `armorElement` — deliberately deferred

Both remain collected by P0-B (`s.cardMagicImmune`, `bonus.armorElement`) and untouched this
stage, per the task's explicit instruction:
- `magicImmune`: ambiguous scope (zero magic damage? all magic skills no-op? status effects
  from magic sources too? does it block buffs/heals?) — implementing it as a naive
  `kind==='magic' → damage 0` without original-source verification would be exactly the kind of
  unverified behavior change this whole project exists to avoid.
- `armorElement`: requires the defense-element × attack-element resistance matrix, not a flat
  percentage reduction — a materially different mechanic from `elemReduce`, and this project's
  player-side defensive-element system hasn't been separately verified as complete. Folding it
  into `elemReduce` would conflate two different mechanics.

## 9. Live DB usage

```
raceDmgReduce: 0 items    elemReduce: 0 items    dmgReduceAll: 0 items
rangedDmgReduce: 0 items  immune: 0 items         (magicImmune: 0, armorElement: 0)
```

Confirmed by direct search of `db-items.json` (including nested/nonstandard shapes — zero
occurrences of any of these key names anywhere in the file). Since none of the two connected
combat-damage sites nor the one immunity site can ever encounter a non-default value from real
data, gameplay is byte-for-byte identical to pre-patch behavior for every existing loadout —
parity holds by construction, not by chance.

## 10. Tests and verification

New file: `tests/item-effect-defense-smoke.js` — DEF A-G (no-effect parity, flat 10%, race
match/mismatch, element match/mismatch, missing-metadata no-op, combined sequential-multiply,
equip/unequip/re-equip) and IMM A-F (no immunity, matching immunity, non-matching status,
unequip restores normal application, pending immunity fully inert, and a static proof that
`isStatusImmune(` has exactly one call site and it's inside the `m.inflict` block). All run the
real `collectItemEffects()`/`calcStats()`/`applyIncomingItemReduction()`/`isStatusImmune()` —
nothing reimplemented. `tests/_item-effect-harness.js` gained `makeApplyIncomingItemReduction()`
and `makeIsStatusImmune()`.

```
python3 -m py_compile build.py
python3 build.py                                  # OK, 0 FAIL / 469 WARN (unchanged from 55a7270)
node tests/actor-interaction-smoke.js             # OK
node tests/alberta-doll-exchange-smoke.js         # OK
node tests/refine-reveal-smoke.js                 # OK
node tests/item-effect-canon-correction-smoke.js  # ALL TESTS PASS
node tests/item-effects-smoke.js                  # ALL TESTS PASS
node tests/item-effect-resource-smoke.js          # ALL TESTS PASS
node tests/item-effect-defense-smoke.js           # ALL TESTS PASS (new, P0-C3)
python3 tests/item-effect-audit-test.py           # ALL TESTS PASS
```

Every real JS `<script>` block (16, unchanged count) in the rebuilt HTML passes `node --check`.

**Static checks**: `applyIncomingItemReduction(` appears exactly twice in `template.html` (the
two combat-damage sites); `isStatusImmune(` exactly once (`m.inflict`); no direct
`DB.items[...]` re-read of any of the five fields exists anywhere outside `item-effects.js`'s
own collector.

## 11. What's left for the rest of P0-C

`healBoost`, `dropBonus`, `grantSkill`, `magicImmune`, `armorElement`, the `soulgain` path
(noted in P0-C1), `events.onKill`/`onDamaged`/`onTick`, and the full `applyDamage` consolidation
are all still just collected, not consumed. `rangedDmgReduce` stays collected-but-unconsumed
specifically because no ranged-attack metadata exists to key it off (§3) — a future stage could
revisit this only if/when the combat system gains a real per-attack ranged distinction. The
394-item rAthena verification backlog is unchanged.
