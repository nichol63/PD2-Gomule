# Display Decisions

This file records current presentation decisions that future sessions should not re-derive.

## Hidden Display Stats

These stats remain parsed but intentionally produce no display line:

- `transform_dye`: internal cosmetic dye color.
- `extra_holybolts`: `Skills.txt` uses it in Holy Bolt's bolt-count formula, but `ItemStatCost.txt` has no descfunc or display strings. Current fixtures show a noisy spread across gems, runes, bases, and zero values. Keep hidden until wording and item applicability are proven.
- `corruptor`: internal corruption-number tracking from `StrCorruptNum`; fixtures include many potions, rings, amulets, and other items where a fallback line is not user-facing.
- `map_mon_coldlength` and `map_mon_poisonlength`: supporting map damage duration stats hidden by the map formatter.

Latest fixture sanity: 134 Library save files checked, 3,000 raw `extra_holybolts`/`corruptor` properties found, 0 display leaks, 0 bad fallback strings.

## Shipped Display Families

- Map stat formatter handles map prefixes/suffixes through `formatMapStat`, except complex cases called out in the queue.
- Summon-cap stats use natural singular/plural wording.
- `extra_revives` renders as `+N to Maximum Revives`.
- `extra_bonespears` renders as `+N to Bone Spear Missiles`.
- `grims_extra_skele_mage` renders like other skeletal mage cap stats.
- `item_skillonequip` renders `Level N SkillName When Equipped`.
- `map_mon_skillondeath` renders `Monsters N% Chance to Cast Level L SkillName on Death`.
- `item_*_bytime` renders explicit time-of-day min/max ranges.

## Current Open Display Questions

- `map_mon_splash`: currently functional as `Monsters Melee Splash` with the value suppressed. Needs encoding audit before showing radius or percent.
- `item_*_bytime`: formatter is shipped, but signedness/scaling provenance can be tightened.
- PD2 scaling stats such as `item_dmgpercent_pereth` need fixture-backed wording and scaling proof before implementation.
