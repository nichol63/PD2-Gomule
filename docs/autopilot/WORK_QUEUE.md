# PD2 Mule Work Queue

Use this queue for hands-off, context-light sessions. Each item is intended to be small enough for one coherent commit. A session may complete multiple ready items, committing after each batch.

## Queue Rules

- Prefer `ready` items in order.
- If no `ready` items exist, pick the highest `needs-research` item and try to prove it.
- A proven `needs-research` item may be promoted into an implementation batch in the same session when fixture evidence and exact wording/encoding are both available.
- If proof fails, update the item with the exact blocker and continue to the next `needs-research` item.
- Read only the reference docs named by the selected item.
- If an item discovers ambiguity, update it to `blocked` or `needs-research` with the specific reason.
- Keep parser, presentation, UI, and tests in separate file-ownership lanes.
- Preserve read-only product behavior.

## Items

### [done] AUTO-001 - Build context-light autopilot scaffolding

Create the compact bootstrap, canonical queue, focused reference docs, session snapshot script, and local `pd2-mule-autopilot` skill. Validate the snapshot script and skill metadata.

### [done] AUTO-002 - Extend autopilot past empty ready queue

Teach future hands-off sessions to continue when the ready queue is empty by selecting the highest `needs-research` item, gathering proof, and either promoting it into a same-session implementation batch or documenting the exact blocker before moving on.

Run depth defaults to until blocked. Proof remains strict: display/formatter implementation requires fixture evidence plus exact local string/reference proof. Subagents may be used only with strict file ownership and shared literal-string specs. Parser/provenance work is allowed when it has an explicit queue item and stays inside its ownership lane.

### [done] STAT-001 - Research-only map_mon_splash encoding audit

Goal: decide whether `map_mon_splash` can safely show a value or should remain value-suppressed.

Allowed writes:

- `docs/autopilot/display-decisions.md`
- `docs/autopilot/WORK_QUEUE.md`

Read as needed:

- `docs/autopilot/stat-encoding-playbook.md`
- `src/lib/legacy-item-parser.mjs`
- `src/lib/property-display.mjs`
- `gomule-d2r\gomule\src\gomule\item\D2Prop.java`
- `gomule-d2r\gomule\pd2\ItemStatCost.txt`
- Library fixtures

Exit criteria:

- Document bit widths, D2Prop behavior, fixture spread, and a recommendation.
- Do not implement formatter changes unless the evidence is unambiguous; if it is unambiguous, add a new ready implementation item instead.

Outcome: audit documented in `docs/autopilot/display-decisions.md`. True map items use canonical `[22913,100]` (`proc_SplashDamage`, level 1, chance 100) and should remain value-suppressed as `Monsters Melee Splash`. Noncanonical fixture hits appear only on non-map items and should be hidden by a separate implementation batch.

### [done] STAT-005 - Hide noncanonical map_mon_splash display leaks

Goal: keep canonical map splash wording while suppressing noncanonical parser/display leaks on non-map items.

Allowed writes:

- `src/lib/property-display.mjs`
- `test/property-display.test.mjs`
- `docs/autopilot/display-decisions.md`
- `docs/autopilot/WORK_QUEUE.md`

Shared literal-string spec:

- Canonical `map_mon_splash` with `values=[22913,100]`, `descFunc=9`, `descVal=0`, `descStringKey=MapMon`, `descString2Key=MapMonSplash` renders exactly `Monsters Melee Splash`.
- Noncanonical examples such as `values=[32896,82]`, `values=[33189,0]`, and `values=[45166,6]` render no display line.
- Do not show `100%`, skill id, or level for canonical map splash.

Read as needed:

- `docs/autopilot/display-decisions.md`
- `src/lib/property-display.mjs`
- `_LOD_SharedStashSave.sss` map pages and non-map false-positive samples from Showcase fixtures

Exit criteria:

- Unit tests cover canonical rendering and noncanonical suppression.
- Fixture sanity check confirms canonical maps still render and non-map false positives no longer display `Monsters Melee Splash`.
- Run `npm test`.

Outcome: shipped in presentation. Canonical `[22913,100]` still renders exactly `Monsters Melee Splash`; noncanonical examples such as `[32896,82]`, `[33189,0]`, and `[45166,6]` produce no display line. Fixture sanity checked 134 save files: 45 canonical displays, 111 noncanonical hidden, 0 noncanonical display leaks.

### [done] STAT-002 - Research-only bytime signedness/scaling audit

Goal: tighten provenance for `item_*_bytime` min/max values without changing formatter behavior.

Allowed writes:

- `docs/autopilot/display-decisions.md`
- `docs/autopilot/WORK_QUEUE.md`

Read as needed:

- `docs/autopilot/stat-encoding-playbook.md`
- `src/lib/property-display.mjs`
- `src/lib/legacy-item-parser.mjs`
- Library fixtures
- `gomule-d2r` references

Exit criteria:

- Document whether observed ranges support unsigned 10-bit slots, signed slots, hidden scaling, or fixture outliers.
- If formatter changes are justified, add a separate ready implementation item with exact expected output strings.

Outcome: audit documented in `docs/autopilot/display-decisions.md`. The 22-bit packed layout is proven as `center period` plus two 10-bit value slots. Data-table evidence supports signed min/max subslots (`MagicSuffix.txt` has `of Sunlight` with `ac/time`, center 0, min -10, max 60), and no hidden scaling beyond linear interpolation was found. Current fixtures are too noisy for a behavior change: 134 save files produced 9,433 displayed bytime properties, including many suspicious potion/non-gear hits, and no exact Dawn/Sunlight fixture sample. Formatter behavior remains unchanged.

### [blocked] STAT-006 - Bytime signed-slot formatter proof

Goal: find or create fixture-backed proof before changing `item_*_bytime` min/max display to signed 10-bit subslots.

Candidate expected strings once fixture evidence exists:

- `of Sunlight` / `item_armor_bytime` with `center=0`, `min=-10`, `max=60` should render a Day-peaking defense line with `min -10, max +60`.
- `of Dawn` / `item_armor_bytime` with `center=3`, `min=10`, `max=40` should render a Dawn-peaking defense line with `min +10, max +40`.

Outcome: follow-up proof sweeps still did not produce an implementation-safe example. Exact `item_armor_bytime` packed targets for `of Sunlight` (`1038396`) and `of Dawn` (`3156008`) are absent from the Library, and no complete gear-coded `item_armor_bytime` fixture came close enough to stand in as proof. After parser provenance landed, a qualityData-enabled sweep across all 134 Library fixtures still found `0` hits for `magicSuffixId` 456 / 457, `15` magic items with any `_bytime` property (`35` properties total), suffix ids limited to `0`, `120`, `169`, `298`, and `331`, and `0` magic `item_armor_bytime` examples. Clean real-gear bytime samples do exist for other stats, including `_LOD_SharedStashSave.sss / RW Helms 2 / Diadem` and `Sacred Armor` with `item_tohitpercent_bytime` packed `4181061` (`center=3, min=-13, max=69`) plus `_LOD_SharedStashSave.sss / Bases 10 / Seraph Rod` with `item_resist_pois_bytime` packed `1040554` (`center=0, min=-8, max=170`), which supports the signed-slot hypothesis in general. Visible magic bytime examples such as `_LOD_SharedStashSave.sss / Magic +6 Bows / Matriarchal Bow` (`magicPrefixId` 435, `magicSuffixId` 169, `item_armorpercent_bytime=55733`) resolve to non-`/time` affixes, so they do not unlock formatter work.

Blocked because no real Library fixture has yet been proven to carry `MagicSuffix.txt` row 456 or 457 on `item_armor_bytime`; `qualityData` now exposes magic affix ids, so the remaining blocker is fixture proof, not parser provenance. Do not implement from synthetic values alone. Unblock only with a clean fixture item tied to a known bytime source row, equivalent raw-byte/affix proof, or authoritative tooltip/UI capture.

### [done] STAT-003 - Remaining single-value candidate triage

Goal: refresh the list of PD2 single-value stats not currently covered by fixture-backed display rules.

Allowed writes:

- `docs/autopilot/display-decisions.md`
- `docs/autopilot/WORK_QUEUE.md`

Read as needed:

- `C:\Users\nicho\AppData\Local\Temp\real-stats-compact.txt`
- `C:\Users\nicho\AppData\Local\Temp\real-stats-full.md`
- `src/lib/property-display.mjs`
- Library fixtures

Exit criteria:

- Update the display decision doc with which candidates are absent from current fixtures, internal/hidden, ready to implement, or blocked on design.
- Add ready implementation items only for stats with fixture evidence and clear wording.

Outcome: audit documented in `docs/autopilot/display-decisions.md`. The 288-row one-value source set is mostly covered by existing explicit labels, map, bytime, per-level, hidden, internal, or scaling/design buckets. The uncovered candidates with the best evidence are `deep_wounds` and `eaglehorn_raven`, both with clean `_LOD_SharedStashSave.sss` fixture examples and data-table support, but exact string-table wording is still unresolved. Clout stats, `blood_warp_life_reduction`, and `immune_stat` remain blocked on cleaner fixture identity or display policy. No ready implementation item was added because no remaining candidate has both clean fixture evidence and exact wording.

### [blocked] STAT-007 - Deep Wounds and Eaglehorn Raven exact display strings

Goal: prove exact user-facing wording for `deep_wounds` and `eaglehorn_raven` before replacing the generic fallback lines.

Evidence already found:

- `deep_wounds`: `Gems.txt` Um Rune, prefix/suffix rows, Malice, and multiple unique item rows use the stat. Clean `_LOD_SharedStashSave.sss` fixture examples include amulets with `[300]`, class helms with `[350]` and `[360]`, Hellforged Plate with `[32]`, and Loricated Mail with `[70]`.
- `eaglehorn_raven`: Eaglehorn carries `eaglehorn-raven 500 500`, Raven skill formulas consume `stat('eaglehorn_raven'.accr)`, and clean `_LOD_SharedStashSave.sss` fixture examples exist on Diamond Bow and Crusader Bow samples with `[500]`.

Outcome: fixture evidence is strong, but exact wording is not proven. `ItemStatCost.txt` points `deep_wounds` at `OpenWoundsItem` with `descfunc=1`, `descval=1`, and points `eaglehorn_raven` at `EaglehornRaven` with `descfunc=3`, `descval=0`; those desc keys are mirrored across local PD2 data roots, so the blocker is not table provenance. The actual missing piece is the payload string: local scans of `patchstring.tbl`, `expansionstring.tbl`, `string.tbl`, historical GoMule string stores, and nearby PD2 DLLs still found neither `OpenWoundsItem` nor `EaglehornRaven`. GoMule `D2Prop` proves the formatting shape depends on those missing strings: `deep_wounds` would be `+N <string>` unless the missing string contains `%d`; `eaglehorn_raven` would render the missing string only, with no value. A vanilla clue exists for open wounds (`%d%% Chance of Open Wounds` in GoMule translations / string stores), but it is not authoritative proof for PD2 `OpenWoundsItem`. Do not implement until the exact strings are found in an authoritative source or captured in-game tooltip/UI proof.

### [done] STAT-008 - Clout, blood-warp, and immune stat display policy

Goal: decide whether these remaining uncovered single-value stats should be hidden, formatted, or left as generic fallback.

Candidate stats:

- `dclone_clout`
- `maxlevel_clout`
- `dev_clout`
- `rathma_clout`
- `blood_warp_life_reduction`
- `immune_stat`

Outcome: the item split cleanly. Clout stats (`dclone_clout`, `maxlevel_clout`, `dev_clout`, `rathma_clout`) and `immune_stat` are now hidden in presentation as internal/noise leaks. Proof: clout rows point to disabled trophy/charm entries with missing local `.tbl` strings, `immune_stat` is driven by `Immune Aura` / `Immune Passive`, and a Library sweep after implementation found raw/displayed counts of `172/0`, `649/0`, `71/0`, `266/0`, and `110/0` respectively. Real fixture tests cover each hidden stat on character items, and inspector-model sanity on `demon-crossbow.d2s` shows the fallback lines no longer surface on a `Full Rejuv Potion`.

`blood_warp_life_reduction` stays blocked. Clean unique `9wn` fixture hits now confirm real Suicide Branch samples in `_LOD_SharedStashSave.sss` and `war_cryb.d2s`, but the `bloodwarplifereduction` desc key is absent from local PD2 `.tbl` files, so exact wording remains unproven.

### [blocked] STAT-009 - Blood Warp exact display string

Goal: prove exact user-facing wording for `blood_warp_life_reduction` before replacing the generic fallback line on Suicide Branch.

Evidence already found:

- `ItemStatCost.txt` row 468 uses `descfunc=3`, `descval=0`, `descstrpos=bloodwarplifereduction`.
- `UniqueItems.txt` row `Suicide Branch` uses `blood-warp-life-reduction 2 2`.
- `Skills.txt` / `SkillDesc.txt` Blood Warp formulas consume `stat('blood_warp_life_reduction'.accr)`.
- Clean unique `9wn` fixture hits exist in `_LOD_SharedStashSave.sss / Wands 1,2,3` and `war_cryb.d2s`.

Blocked because the desc key provenance is clean but the payload string is still missing. `bloodwarplifereduction` exists in local `ItemStatCost.txt` mirrors, yet local scans of `patchstring.tbl`, `expansionstring.tbl`, `string.tbl`, historical GoMule string stores, and nearby PD2 DLLs still found no `bloodwarplifereduction` string payload. Do not implement until the exact string is proven from an authoritative source or captured UI tooltip.

### [done] PARSER-001 - Round-trip serializer proof milestone

Goal: serialize parsed save regions back to bytes and prove byte-for-byte equality without enabling write support.

Outcome: shipped as a bounded source-backed proof layer, not a field-backed writer. `save-parsers.mjs` now exports `reconstructBoundedItemRegion()`, `reconstructStashPageRegion()`, and `reconstructParsedSaveBuffer()`, all of which rebuild bytes from original source regions plus parser-derived spans while preserving untouched header bytes and product read-only behavior. `parser-edge.test.mjs` now proves full-buffer byte equality for `Legacy.d2s`, `Bases.d2x`, `Legacy.d2x`, and `_LOD_SharedStashSave.sss`, and keeps the shared-stash `Miscellaneous` anomaly explicit: raw header count `147`, bounded visible items `146`, `clampedItemCount = 1`, page bytes still exact.

Follow-up note: this closes the bounded round-trip proof milestone only. A true field-backed serializer remains future work because the current parsed model still drops raw bits such as runeword skipped fields, short-guid distinctions, normal-type extras, personalization payload details, and some presence-bit structure. Do not treat this as permission to add product write/edit/transfer behavior.

### [done] STAT-004 - PD2 scaling stat formatter design

Candidate stats:

- `item_mindamage_energy`
- `item_dmgpercent_pereth`
- `item_dmgpercent_permissinghppercent`
- `inc_splash_radius_permissinghp`
- `lifedrain_percentcap`
- `mon_cooldown1`
- `mon_cooldown2`
- `mon_cooldown3`
- `uber_difficulty`

Outcome: the candidate set split cleanly. `mon_cooldown1/2/3` are now hidden in presentation as internal monster-cooldown leaks. Proof: they appear only in `ItemStatCost.txt`, reuse the unrelated `ModitemdamFiresk` desc key, have no clean item-facing provenance, and leaked obvious fallback junk on potions/unrelated gear. Library sweep after implementation found raw/displayed counts of `11/0`, `28/0`, and `389/0`, and real fixture tests cover each hidden stat.

The remaining scaling stats stay blocked. Real fixture evidence exists for several of them, but local PD2 `.tbl` files do not contain the PD2-specific desc helper keys needed to prove exact wording or scaling presentation.

### [blocked] STAT-010 - Remaining scaling stat wording proof

Goal: prove exact user-facing wording and scaling semantics for the remaining scaling stats before replacing their generic fallback lines.

Candidate stats:

- `item_mindamage_energy`
- `item_dmgpercent_pereth`
- `item_dmgpercent_permissinghppercent`
- `inc_splash_radius_permissinghp`
- `lifedrain_percentcap`
- `uber_difficulty`

Known blockers:

- Table provenance is now proven: the relevant desc keys are present in local `ItemStatCost.txt` mirrors, and save-editor `Properties.txt` carries raw wording clues for several scaling rows (`mindmg/energy`, `dmg%/eth`, `dmg%/missinghp%`, `lifesteal-cap`, `splash%/missinghp%`). Those clues are not final tooltip proof.
- `item_mindamage_energy`: `descstr2=increaseswithenergy` payload is absent from local string stores.
- `item_dmgpercent_pereth`: `ModStrEnhancedDamage` / `increaseswithequippedeth` payloads are absent from local string stores.
- `item_dmgpercent_permissinghppercent`: `ModStrEnhancedDamage` / `increaseswithmissinghp` payloads are absent from local string stores.
- `inc_splash_radius_permissinghp`: `ModStrIncSplashRadius` / `incsplashwithmissinghp` payloads are absent from local string stores.
- `lifedrain_percentcap`: `ModStrLifeStealCap` / `ofmaximumhp` payloads are absent from local string stores.
- `uber_difficulty`: real uber maps exist in fixtures and `CubeMain.txt` mutates the stat. `MapTier` is present as a desc key in local `ItemStatCost.txt` mirrors, and local clues exist in `TreasureClassEx.txt`, `Misc.txt`, and the modpack tutorial filter (`Map Tier N`, `T1/T2`), but the exact tooltip payload still does not exist in local string stores.
