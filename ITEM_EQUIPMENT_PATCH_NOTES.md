# Item / equipment decontamination patch

## Scope

This patch removes only records that could be reconciled with the existing item-DB
schema and rAthena's **pre-renewal** item records. It deliberately does not bulk-fill
remaining `_stub:true` rows: a recognisable Korean name alone is not enough evidence
to decide the original item, its stats, or an engine-safe effect.

## Source records

Reference: rAthena `db/pre-re/item_db_{usable,equip,etc}.yml`.

| rAthena record | Applied game key | Applied data |
|---|---|---|
| 519 `Milk` | `우유` | Healing 27–37 HP; buy 25 / sell 12 / weight 3 |
| 525 `Panacea` | `파나케아` | Cures poison, silence, blind, curse, and confusion; buy 500 / sell 250 / weight 10 |
| 607 `Yggdrasilberry` | `이그드라실의 열매` | Full HP/SP; buy 5000 / sell 2500 / weight 30 |
| 608 `Seed_Of_Yggdrasil` | `이그드라실의 씨앗` | 50% HP/SP; buy 5000 / sell 2500 / weight 30 |
| 7024 `Bloody_Edge` | `블러디 엣지` | Etc item; buy 10000 / sell 5000 / weight 4 |
| 2203 `Glasses` + 2204 `Glasses_` | `글래스` | Existing `slots:1` merged representation; raw drop key `안경` is migrated to it |

rAthena weights are divided by 10 to use this project's documented integer weight
scale. Sell price follows the existing half-buy-price convention.

## Data corrections

- Removed 64 duplicate item IDs ending in `_`. They were slot variants stored as
  separate Korean-name keys even though this project represents the pair with one
  `slots` field.
- Retained the existing non-suffixed record and raised its `slots` to 1 for 29
  merged pairs where needed. This preserves the established CSV data while removing
  the fallback/stub copy.
- Removed eight confirmed alias records, including whitespace-only variants,
  `안경` → `글래스`, and the two `위그드라실` import spellings.
- Rewrote every affected monster-drop key to the canonical DB key. When old save
  data is loaded, inventory, equipped items, card codex, sell locks, hotbar items,
  and shared warehouse entries are migrated before ghost-item cleanup.
- Restored the three former stub records `우유`, `파나케아`, and
  `블러디 엣지`; restored Yggdrasil berry/seed source values and effects.
- Added ranged healing (`healMin` / `healMax`) and per-item cure lists so
  `우유` and `파나케아` execute their sourced effects rather than merely
  displaying corrected metadata.

## Intentionally deferred

- `위그드라실의 잎` is source-confirmed as a resurrection item, but the current
  game has no player-accessible post-death item-use window. It remains unconverted
  rather than becoming a consumable that would be spent without a working effect.
- The remaining `_stub:true` records, ambiguous Korean translation pairs, and
  items whose original scripts have no engine counterpart are left untouched for a
  separate evidence-and-engine-support pass.
