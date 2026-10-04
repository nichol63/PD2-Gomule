# Display Decisions

## Current recovery result (2026-09-05)

The historical missing-string conclusions below are superseded by [installed archive evidence](mpq-string-proof.json). [STAT-007 proof](stat-007-proof.md) documents the shipped Deep Wounds label and historical Eaglehorn [500] sentence, the archive/reference metadata mismatch, and the retained fallbacks. Blood Warp and scaling payloads are now available for a separate row/version and fixture validation batch; no corresponding formatter changes have shipped. Historical uncommitted fixture counts were preserved and not re-swept during recovery.

This file records current presentation decisions that future sessions should not re-derive.

## Hidden Display Stats

These stats remain parsed but intentionally produce no display line:

- `transform_dye`: internal cosmetic dye color.
- `extra_holybolts`: `Skills.txt` uses it in Holy Bolt's bolt-count formula, but `ItemStatCost.txt` has no descfunc or display strings. Current fixtures show a noisy spread across gems, runes, bases, and zero values. Keep hidden until wording and item applicability are proven.
- `corruptor`: internal corruption-number tracking from `StrCorruptNum`; fixtures include many potions, rings, amulets, and other items where a fallback line is not user-facing.
- `dclone_clout`, `maxlevel_clout`, `dev_clout`, `rathma_clout`: trophy/charm aura markers. `UniqueItems.txt` ties them to disabled trophy/charm rows, the desc keys are absent from local PD2 `.tbl` files, and current Library hits are dominated by potion/non-trophy display leaks.
- `immune_stat`: internal immunity plumbing used by `Immune Aura`, `Immune Passive`, and related monster skills. Current fixture hits are noisy gear/potion leaks; the stat is not treated as a user-facing item line.
- `mon_cooldown1`, `mon_cooldown2`, `mon_cooldown3`: internal monster cooldown/plumbing stats. They appear only in `ItemStatCost.txt`, reuse the unrelated `ModitemdamFiresk` desc key, and current Library hits are obvious fallback leaks on potions and unrelated gear.
- `map_mon_coldlength` and `map_mon_poisonlength`: supporting map damage duration stats hidden by the map formatter.

Latest fixture sanity: 134 Library save files checked, 3,000 raw `extra_holybolts`/`corruptor` properties found, plus 1,268 raw clout/`immune_stat` properties and 428 raw `mon_cooldown*` properties. All of those hidden stats produced 0 display leaks.

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
- `item_*_bytime`: audit complete and currently blocked on fixture proof. The packed layout is proven as one 22-bit value split into `center period` plus two 10-bit value slots, and affix data shows the min/max slots can be signed, but the Library still has no exact `of Dawn` / `of Sunlight` `item_armor_bytime` proof. `qualityData` now preserves magic affix ids, yet full Library sweeps still found `0` hits for suffix ids `456` / `457`, `0` magic `item_armor_bytime` examples, and `0` target packed-value hits for `1038396` / `3156008`. Parsed display names also keep only the base item name, so we still need a real affix-linked fixture, equivalent raw-byte proof, or authoritative tooltip evidence before changing formatter semantics.
- Remaining PD2 scaling stats such as `item_mindamage_energy`, `item_dmgpercent_pereth`, `item_dmgpercent_permissinghppercent`, `inc_splash_radius_permissinghp`, `lifedrain_percentcap`, and `uber_difficulty` need fixture-backed wording and scaling proof before implementation. The desc keys themselves are present in local `ItemStatCost.txt` mirrors, and clean fixture examples exist for most of the group, but the missing piece is the final tooltip payload in local string stores.
- Remaining single-value candidates: triage complete. `deep_wounds`, `eaglehorn_raven`, and `blood_warp_life_reduction` have real item evidence, and their desc keys are present in local `ItemStatCost.txt` mirrors, but the final string payloads are still absent from local `.tbl` stores, mirrored PD2 data, and checked DLL strings. Clout stats and `immune_stat` are now intentionally hidden as internal/noise leaks.

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
- Follow-up proof sweep: exact `item_armor_bytime` targets `1038396` (`of Sunlight`) and `3156008` (`of Dawn`) are absent from the Library, and no complete gear-coded `item_armor_bytime` fixture matched or came within +/-20 on the same center/min/max tuple. Clean real-gear hints exist on other bytime stats, including `_LOD_SharedStashSave.sss / RW Helms 2 / Diadem` and `Sacred Armor` with `item_tohitpercent_bytime` packed `4181061` (`center=3, min=-13, max=69`) plus `_LOD_SharedStashSave.sss / Bases 10 / Seraph Rod` with `item_resist_pois_bytime` packed `1040554` (`center=0, min=-8, max=170`), but those are not exact formatter proof for `item_armor_bytime`.
- Parser provenance update: `qualityData` now preserves `qualityId` / `qualityLabel` and family-specific ids, including `magicPrefixId` / `magicSuffixId`. Parser-edge fixtures now cover real magic, set, unique, rare, crafted, and superior samples plus a magic bytime Matriarchal Bow in `_LOD_SharedStashSave.sss / Magic +6 Bows` (`magicPrefixId` 435, `magicSuffixId` 169, `item_armorpercent_bytime=55733`).
- QualityData-enabled sweep: 134 save files, 0 parse errors, 15 magic items with any `_bytime` property (35 properties total), suffix ids limited to `0`, `120`, `169`, `298`, and `331`, `0` hits for `magicSuffixId` 456 / 457, and `0` magic `item_armor_bytime` examples. A later subagent pass found `175` parsed `item_armor_bytime` occurrences (`99` top-level), but still `0` magic `item_armor_bytime` occurrences and `0` target packed-value hits for `1038396` / `3156008` anywhere in parsed property values. The preserved affix rows on those magic bytime items resolve to non-`/time` affixes such as `Archer's`, `Witch-hunter's`, `Jeweler's`, `of Quickness`, and `of Enlightenment`.
- Recommendation: keep the current formatter unchanged and treat signed-slot bytime work as blocked until a clean fixture tied to a known bytime source row, equivalent raw-byte/affix proof, or authoritative tooltip/UI capture exists.

### single-value candidate triage

- Source set: `real-stats-compact.txt` contained 288 one-value stat rows. Comparing those rows with `property-display.mjs` and Library fixture output bucketed them as 76 explicit/labeled stats, 93 map-family stats, 36 bytime stats, 30 per-level stats, 33 no-display-metadata/internal rows, 9 scaling/design rows, 3 already-hidden rows, and 8 uncovered candidates.
- Already covered or intentionally handled by existing families: explicit labels, map stats, bytime stats, per-level stats, and hidden stats `transform_dye`, `extra_holybolts`, and `corruptor`.
- Keep no-display-metadata/internal rows out of the ready queue until item applicability and wording are proven. Examples include `passive_dodge`, `item_levelreq`, `manarecovery`, `item_lightcolor`, `velocitypercent`, and `questitemdifficulty`.
- Keep scaling/design rows grouped under STAT-004: `item_dmgpercent_pereth`, `item_mindamage_energy`, `item_dmgpercent_permissinghppercent`, `inc_splash_radius_permissinghp`, `lifedrain_percentcap`, `mon_cooldown1`, `mon_cooldown2`, `mon_cooldown3`, and `uber_difficulty`.
- `deep_wounds` has strong item evidence: `Gems.txt` Um Rune, prefix/suffix rows, Malice, and multiple unique item rows use the stat. Clean fixture examples exist in `_LOD_SharedStashSave.sss`, including amulets with `[300]`, class helms with `[350]` and `[360]`, Hellforged Plate with `[32]`, and Loricated Mail with `[70]`. A subagent fixture pass found `181` parsed occurrences and `59` clean source-backed unique-item occurrences. Do not change display until the exact text behind `OpenWoundsItem` is proven.
- `eaglehorn_raven` has strong item evidence: Eaglehorn carries `eaglehorn-raven 500 500`, and Raven skill formulas consume `stat('eaglehorn_raven'.accr)`. Clean fixture examples exist in `_LOD_SharedStashSave.sss` on Diamond Bow and Crusader Bow samples with `[500]`; a subagent fixture pass found `95` parsed occurrences and `2` clean Eaglehorn occurrences. Do not change display until the exact text behind `EaglehornRaven` is proven.
- STAT-007 proof pass: local `.tbl` sweep checked `patchstring.tbl`, `expansionstring.tbl`, and `string.tbl`, and broader scans also checked historical GoMule string stores, nearby PD2 DLLs, and mirrored PD2 data. `OpenWoundsItem` and `EaglehornRaven` are still absent. `D2Prop` formatting confirms `deep_wounds` would require the missing `OpenWoundsItem` text, and the final shape depends on whether it contains `%d`; `eaglehorn_raven` would render only the missing `EaglehornRaven` text because `descfunc=3`, `descval=0`. A vanilla open-wounds clue exists as `%d%% Chance of Open Wounds`, but it is not authoritative proof for PD2 `OpenWoundsItem`. Keep both blocked until authoritative string or captured UI proof exists.
- STAT-008 proof pass: clout stats and `immune_stat` now hide in presentation. Library sweep after the change found `dclone_clout` raw 172/displayed 0, `maxlevel_clout` raw 649/displayed 0, `dev_clout` raw 71/displayed 0, `rathma_clout` raw 266/displayed 0, and `immune_stat` raw 110/displayed 0. Inspector-model sanity on `demon-crossbow.d2s` no longer shows those fallback lines on a real `Full Rejuv Potion`.
- `blood_warp_life_reduction` has table evidence on Suicide Branch and skill formulas, and clean unique `9wn` fixture hits now confirm the stat on real Suicide Branch samples in `_LOD_SharedStashSave.sss` and `war_cryb.d2s`. A subagent fixture pass found `83` parsed occurrences and `3` clean Suicide Branch occurrences. The desc key provenance is clean; the blocker is the still-missing `bloodwarplifereduction` payload in local string stores, nearby PD2 DLLs, and mirrored PD2 data.
- STAT-004 proof pass: `mon_cooldown1/2/3` now hide in presentation. They appear only in `ItemStatCost.txt`, reuse `ModitemdamFiresk`, and leak as obvious fallback junk on potions/unrelated gear. Library sweep after the change found `mon_cooldown1` raw 11/displayed 0, `mon_cooldown2` raw 28/displayed 0, and `mon_cooldown3` raw 389/displayed 0. The remaining scaling stats stay blocked because their final tooltip payloads are absent from local string stores, even though desc keys and some raw wording clues are now proven in local data tables (`Properties.txt`, `TreasureClassEx.txt`, `Misc.txt`, tutorial filter). A subagent pass proved `ModStr1g` locally as `to Minimum Damage`, but that does not unblock `item_mindamage_energy` because `increaseswithenergy` is still missing; the same pass found clean fixture examples for every remaining scaling stat except `item_dmgpercent_permissinghppercent`.
- No implementation-ready single-value stat was promoted from this triage because the candidates with clean fixture evidence still lack exact display wording.
