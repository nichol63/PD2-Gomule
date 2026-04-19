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

- `map_mon_splash`: audit and presentation guard shipped. Keep true map items value-suppressed as `Monsters Melee Splash`; do not show `100%`, skill id, or level. The real property is encoded as `[22913,100]`, where `22913 = (358 << 6) | 1`, matching `Properties.txt` fixed `proc_SplashDamage` skill id 358, level 1, chance 100. A recursive Library sweep found 156 raw occurrences: 45 canonical occurrences, all on map-like item codes, and 111 noncanonical occurrences, all on non-map items such as potions, runes, and armor. The formatter now renders only canonical `[22913,100]` and hides noncanonical values.
- `item_*_bytime`: audit complete. Keep current formatter behavior unchanged until a clean fixture-backed implementation batch exists. The packed layout is proven as one 22-bit value split into `center period` plus two 10-bit value slots, and affix data shows the min/max slots can be signed. Current fixtures contain many bytime-looking parser hits on potions and other non-gear items, so they are useful for smoke coverage but not enough to safely change display semantics.
- PD2 scaling stats such as `item_dmgpercent_pereth` need fixture-backed wording and scaling proof before implementation.
- Remaining single-value candidates: triage complete. `deep_wounds` and `eaglehorn_raven` have clean fixture and data-table evidence but still need exact string-table wording before display changes. Clout stats, `blood_warp_life_reduction`, and `immune_stat` remain blocked on cleaner fixture identity or display policy.

## Research Notes

### map_mon_splash

- Parser path: generic `saveParamBits !== null` branch reads two values, first 16 bits and second 7 bits.
- `ItemStatCost.txt`: id 427, `Save Param Bits=16`, `Save Bits=7`, `Encode=2`, `descfunc=9`, `descval=0`, `descstrpos=MapMon`, `descstr2=MapMonSplash`.
- `Properties.txt`: `map-mon-splash` uses function 11 with `stat1=map_mon_splash`, `*desc=splash`, `*param=358`, `*min=100`, `*max=1`.
- `Skills.txt`: skill id 358 is `proc_SplashDamage`.
- `D2Prop.java` descFunc 9 would include `pVals[0]` only for descval 1/2; descval 0 falls through to just the base string. Current `pd2-mule` intentionally improves this to `Monsters Melee Splash`.
- Fixture sweep: 134 save files, 156 total raw `map_mon_splash` properties, 45 canonical `[22913,100]` on map codes, 111 noncanonical on non-map codes. Top noncanonical values included `[32896,82] x21`, `[3395,104] x15`, `[33189,0] x14`, and `[53475,2] x10`.
- Shipped guard: only canonical `[22913,100]` renders. Noncanonical `map_mon_splash` values are hidden in presentation until a parser-boundary fix proves they are real.
- Fixture sanity after implementation: 134 save files checked, 156 raw `map_mon_splash` properties, 45 canonical entries displayed as `Monsters Melee Splash`, 111 noncanonical entries hidden, 0 noncanonical display leaks.

### item_*_bytime

- Parser path: generic no-param branch reads one `Save Bits=22` value and subtracts `Save Add=0`, matching `D2PropCollection.readProp` in `gomule-d2r`.
- `ItemStatCost.txt`: ids 268-303 are the active bytime stats, each with `Save Bits=22`, `Save Add=0`, no `Save Param Bits`, and descfunc 17 or 18 except `item_absorb_pois_bytime`, which has no display metadata. `item_find_gems_bytime` id 304 is a stub with no save bits and remains parser-filtered.
- `Properties.txt`: `/time` property rows use function 18 and name the slots as `center period`, `min`, and `max`; `Properties (copy).txt` further notes "max at center period, min at opposite period, linear progression".
- Bit layout remains `period = packed >> 20`, `minSlot = (packed >> 10) & 1023`, `maxSlot = packed & 1023`. Period values 0-3 map to Day, Dusk, Night, Dawn.
- Signedness evidence: bytime `ItemStatCost.txt` rows have `Signed=1`, and `MagicSuffix.txt` proves negative source data with `of Sunlight` using `ac/time`, `mod1param=0`, `mod1min=-10`, `mod1max=60`. `of Dawn` uses the positive control `mod1param=3`, `mod1min=10`, `mod1max=40`.
- Hidden scaling evidence: no extra divide/multiply/add scaling was found for bytime rows; the only data-table behavior described is linear interpolation between min and max around the center period.
- Java reference caveat: `D2Prop.java` returns placeholder text for descfunc 17/18, so it confirms historical GoMule did not implement bytime display rather than proving exact presentation wording.
- Fixture sweep: 134 save files, 9,433 raw/displayed bytime properties across 36 active stats. Of those, 5,244 have at least one 10-bit slot >=512, 4,989 have unsigned min greater than unsigned max, and 5,381 occur on obvious non-gear codes such as `rvl`, `mp5`, `rvs`, and healing/mana potions. The fixture library did not contain exact `item_armor_bytime` packed values for `of Dawn` (`center=3,min=10,max=40`) or `of Sunlight` (`center=0,min=-10,max=60`).
- Recommendation: do not change the formatter from this audit alone. A future bytime implementation should sign-extend the two 10-bit value slots and include exact fixture-backed display strings before changing user-visible output.

### single-value candidate triage

- Source set: `real-stats-compact.txt` contained 288 one-value stat rows. Comparing those rows with `property-display.mjs` and Library fixture output bucketed them as 76 explicit/labeled stats, 93 map-family stats, 36 bytime stats, 30 per-level stats, 33 no-display-metadata/internal rows, 9 scaling/design rows, 3 already-hidden rows, and 8 uncovered candidates.
- Already covered or intentionally handled by existing families: explicit labels, map stats, bytime stats, per-level stats, and hidden stats `transform_dye`, `extra_holybolts`, and `corruptor`.
- Keep no-display-metadata/internal rows out of the ready queue until item applicability and wording are proven. Examples include `passive_dodge`, `item_levelreq`, `manarecovery`, `item_lightcolor`, `velocitypercent`, and `questitemdifficulty`.
- Keep scaling/design rows grouped under STAT-004: `item_dmgpercent_pereth`, `item_mindamage_energy`, `item_dmgpercent_permissinghppercent`, `inc_splash_radius_permissinghp`, `lifedrain_percentcap`, `mon_cooldown1`, `mon_cooldown2`, `mon_cooldown3`, and `uber_difficulty`.
- `deep_wounds` has strong item evidence: `Gems.txt` Um Rune, prefix/suffix rows, Malice, and multiple unique item rows use the stat. Clean fixture examples exist in `_LOD_SharedStashSave.sss`, including amulets with `[300]`, class helms with `[350]` and `[360]`, Hellforged Plate with `[32]`, and Loricated Mail with `[70]`. Do not change display until the exact text behind `OpenWoundsItem` is proven.
- `eaglehorn_raven` has strong item evidence: Eaglehorn carries `eaglehorn-raven 500 500`, and Raven skill formulas consume `stat('eaglehorn_raven'.accr)`. Clean fixture examples exist in `_LOD_SharedStashSave.sss` on Diamond Bow and Crusader Bow samples with `[500]`. Do not change display until the exact text behind `EaglehornRaven` is proven.
- Clout stats (`dclone_clout`, `maxlevel_clout`, `dev_clout`, `rathma_clout`) have data-table evidence on trophies/charm rows, but the current Library scan did not find clean trophy fixture samples. Many current hits are parser-noise-looking potion entries, so do not format or hide them without fixture identity proof.
- `blood_warp_life_reduction` has table evidence on Suicide Branch and skill formulas, but the current exact-value fixture hits did not clearly identify that item. Keep it blocked until a clean item sample or saved-byte proof establishes the value and desired wording.
- `immune_stat` appears to support skill/map aura calculations (`Immune Aura`, `Immune Passive`, map boss skills) rather than item display. Current fixture hits include nonsensical gear and potion fallback lines; treat it as an internal/hidden candidate pending a separate display-policy batch.
- No implementation-ready single-value stat was promoted from this triage because the candidates with clean fixture evidence still lack exact display wording.
