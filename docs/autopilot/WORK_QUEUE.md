# PD2 Mule Work Queue

Use this queue for hands-off, context-light sessions. Each item is intended to be small enough for one coherent commit. A session may complete multiple ready items, committing after each batch.

## Queue Rules

- Prefer `ready` items in order.
- Read only the reference docs named by the selected item.
- If an item discovers ambiguity, update it to `blocked` or `needs-research` with the specific reason.
- Keep parser, presentation, UI, and tests in separate file-ownership lanes.
- Preserve read-only product behavior.

## Items

### [done] AUTO-001 - Build context-light autopilot scaffolding

Create the compact bootstrap, canonical queue, focused reference docs, session snapshot script, and local `pd2-mule-autopilot` skill. Validate the snapshot script and skill metadata.

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

### [ready] STAT-005 - Hide noncanonical map_mon_splash display leaks

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

### [ready] STAT-002 - Research-only bytime signedness/scaling audit

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

### [ready] STAT-003 - Remaining single-value candidate triage

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

### [blocked] PARSER-001 - Round-trip serializer proof milestone

Goal: serialize parsed save regions back to bytes and prove byte-for-byte equality without enabling write support.

Blocked because the current worktree contains pre-existing parser/provenance changes in:

- `src/lib/save-parsers.mjs`
- `test/parser-edge.test.mjs`

Unblock when those changes are committed, intentionally adopted, or cleared by their owner. Do not overwrite them.

### [needs-research] STAT-004 - PD2 scaling stat formatter design

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

Do not implement until fixture examples and wording/scaling evidence are available.
