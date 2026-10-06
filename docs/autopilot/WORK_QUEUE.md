# PD2 Mule Work Queue

## Current development state (2026-10-05)

Laptop continuation restored the pinned fixture checkout and all ten matching parser tables. All 134 fixture hashes and ten table hashes match the committed coverage report; 229 tests pass on macOS with Node 26.3.0, including five new acceptance preparation tests. See [laptop continuation and acceptance preparation](../continuation-2026-10-04.md). In-game acceptance remains pending and still gates MULE-003.

The corrected-parser display audit found zero bytime properties and zero `item_dmgpercent_permissinghppercent` properties across all 22,072 physical records. Historical bytime/noise samples below are superseded. Blood Warp and five bounded scaling/tier displays already shipped in the October 3 recovery; missing strings are no longer their blocker.

The user started a persistent development goal on October 4 with a 300,000-token ceiling, then continued with a new 3,000,000-token goal after the first budget was reached. Continue bounded ungated work with implementation, independent fixture/tests, and review lanes. Account limits may stop the run before its goal budget. [The run record](../autonomous-run-2026-10-04.md) tracks batches and evidence. Multi-item transfers still require actual game acceptance.

Character and browser bank transfers now support disposable copies. See [character transfer evidence](../character-transfers-2026-10-03.md): 131 supported characters, 224 tests passing, 10 timing/recovery regressions, and unchanged canonical hashes. GPT-6.1 Sol high workers replace GPT-6 Sol. Game acceptance remains a separate gate; the isolated test installation is `../pd2-game-validation-2026-10-03` from the workspace root's `pd2-mule` checkout.

The user authorized the expanded Astra/Sol workflow in [DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md), including bounded copy-based writes. The inspector remains read-only and installed saves/canonical fixtures are protected.

- Inverted item flags and root-versus-socket-child counts were corrected. Higher-tier aliases no longer overwrite base item rows.
- The canonical corpus now exposes 19,778 root items and 22,072 physical records. All 134 files open with zero incomplete records after the [33-record fix](../incomplete-records-2026-10-03.md). Current coverage is in `docs/parser-coverage-2026-10-03-current.md`; 16 historical-profile items remain ineligible for transfers. Current test baseline is 386 passing.
- Older broad bytime/noise fixture counts below were produced by the inverted flag parser and are superseded. Do not use those historical counts as proof for a formatter change.
- Unique/set/runeword naming, exact source-backed Blood Warp wording, and bounded scaling displays have landed.
- Explicit bank deposit/withdraw commands default to previews and reject unsupported pages. Serialization preserves opaque bytes and patches supported location/count fields; it is not a general field-backed item writer.
- Process-interruption recovery and bounded character writes on copies are tested. In-game acceptance and power-loss durability remain unverified.

### [done] RECOVERY-001 - Parser coverage and root/flag correctness

Runnable report: `npm run coverage`. Raw byte and Java evidence established one-based flag bit numbering and root item header counts. Socket children remain attached and do not decrement/increment the PlugY root count separately. The real undeclared 22-byte key on `Legacy.d2x / Season 6 Extra` is reported and that page remains ineligible for transfers.

### [done] IDENTITY-001 - Unique, set, and runeword search

Resolve source-backed IDs and upgraded item families; resolve runewords from ordered rune recipes and compatible item types. Retain base names for search and display. Correct alias table overwrites using each item's canonical `code` row.

### [done] BANK-001 - Bounded PlugY bank and copy-based transfers

CLI previews and explicit experimental commits support eligible `.d2x`/`.sss` pages, including socketed trees. Keep hash/profile guards, backups, per-bank/per-stash locks, exact count verification, and recoverable journals. Reject ambiguous byte lengths, misplaced items, and incomplete properties.

### [done] PARSER-002 - Remaining bounded property failures

Fixed all 33 baseline failures: consume stat-98 payloads, support proven historical Deep Wounds/map layouts with strict bounded termination and provenance, and separate the last multishot item from the next character section. All 134 sources reconstruct byte-for-byte. Historical profiles remain transfer-blocked. See `docs/incomplete-records-2026-10-03.md` and pinned row evidence; never zero-pad or suppress decoding errors.

### [implemented; acceptance pending] WRITE-002 - Character transfer and game acceptance

Character primary edits now prove stats/skills and empty corpse boundaries, preserve exact mercenary and populated golem trees, recalculate size/checksum, and reject unsupported selections. All 131 fixture characters pass disposable remove/reinsert checks. Browser and CLI transfers use the same bank engine. Nonempty corpses, selected historical profiles, equipment/belt/panel-six/ear transfers, and live installed-save writes remain unsupported. In-game acceptance is pending isolated game validation.

### [done] WRITE-003 - Portable acceptance preparation

`npm run prepare:acceptance -- --output <new-directory>` prepares two independent disposable character/stash scenarios through the existing bank engine: the Amazon's Town Portal Book and a socketed Grand Matron Bow with Tir/Tal/Amn children. It retains backups and writes a hash/count/item manifest plus a game checklist. Existing output and protected fixture/reference/save directories are rejected before writes. Preparation preserves originals and does not satisfy game acceptance. See [continuation evidence](../continuation-2026-10-04.md).

### [next] MULE-003 - Multi-item transfers

After game acceptance, add multi-selection with complete placement preview and a single recoverable batch transaction. Do not implement a loop of separately committed deposits as an atomic batch.

### [done] BROWSE-001 - Preserve exact stash page identity

The canonical shared stash has two `Amazon` pages: page 31 (index 30, 15 roots) and page 118 (index 117, 57 roots). The inspector currently selects page 118 but converts it back to its label and renders page 31's items. Resolve the page once and retain its one-based numeric selector in internal model/UI state. Page cards must show numbered labels and select by index. Keep external name selectors compatible. Validate all repeated class-page labels against actual fixtures, including selected details and item keys, plus UI navigation/filter round trips. This changes browsing only.

Outcome: fixed in the inspector model and UI. All seven duplicate class-page pairs select the correct physical page; numeric identity survives item selection, reloads, quality/sort changes, and clearing filters. Legacy name selection still resolves the first matching name. Five independent real-fixture/UI tests pass; full suite: 234 passing, zero failures/skips. Review found no material issue; canonical shared-stash hash is unchanged.

### [done] WRITE-004 - Read-only acceptance result verification

Compare a retained prepared pack against independent post-game save copies. Validate manifest/table provenance, protected relative paths, checksums, sizes, counts, placement, identities, properties, and socket children; emit a diagnostic JSON report without modifying inputs. Distinguish structural verification from observed game acceptance: neither matching bytes nor changed file hashes prove the game was used. Keep the game gate pending until actual load/save/reload observations and evidence review. Provide a CLI command and tests using disposable real-fixture cases and targeted corruptions.

Outcome: read-only API and JSON CLI implemented with 15 checks per scenario. Independent real-fixture tests cover unchanged copies, valid timestamp/checksum rewrites, counts/placement/stack/property/socket/tree corruption, malformed stash signatures/versions, provenance, unsafe paths, aliases and CLI exit status. All 11 targeted tests and the full 245-test suite pass. Retained pack comparison on independent copies passes with no observed rewrite and still reports game acceptance unverified. Independent review is clean. BANK-002 now rejects supplied stale core-table objects in bank and acceptance callers.

### [done] BANK-002 - Bind transfer profiles to loaded table bytes

A disposable fixture reproduction loaded `ci3` with width 2, changed only a copied `armor.txt` row to width 3, and then committed a deposit using the old table object. The bank stored width 2 with the new disk-table fingerprint. Capture provenance from the bytes actually used by `loadPd2Tables` and refuse transfers when current tables differ from those loaded definitions. Preserve existing bank format and fingerprint compatibility deliberately. Test stale loads, changes after preview, and normal deposits/withdrawals on copies. Never modify canonical tables to reproduce this defect.

Outcome: six-core-file provenance is captured from actual parsed buffers and privately bound to each loaded table object. Bank preview/commit, acceptance preparation, and verification reject stale objects; late transaction rejection preserves recoverable journal/backups. Exact old four-file fingerprints and schema-version-1 banks remain compatible. Eight new real-fixture tests and 40 focused tests pass; full suite: 253 passing, zero failures/skips. Canonical hashes unchanged; independent review is clean. See [table provenance evidence](../table-provenance-2026-10-04.md). Optional identity cache provenance remains IDENTITY-002 research.

### [done] BROWSE-002 - Keep the latest browser request selected

A controlled execution of the shipped app requested page 31, then page 118, and resolved the newer response first. The older response subsequently restored page 31 and its item selection. Apply view state/render updates only for the latest request, and handle current-request errors without allowing old responses to restore stale results. Test deferred response ordering through actual UI handlers.

Outcome: only the newest view request may apply success or failure. Pending/error views clear old item controls, details, tooltip and selection immediately, invalidating existing bank deposit previews while retaining navigation/filter intent. Current failures are handled internally with a retryable message. Seven independent tests execute the shipped app and bank UI with real fixture responses, including reversed page 31/118 completion, HTTP/network/JSON errors, source switches, and late bank previews. Twelve focused and all 260 full-suite tests pass; canonical hashes unchanged; final review clean. The separate catalog refresh race is BROWSE-003.

### [done] DISCOVER-001 - Deduplicate filesystem aliases and avoid cycles

A temporary directory self-symlink caused discovery to fail with `ELOOP`; an explicit save plus a symlink alias loaded the same physical save twice. Track visited real directories and deduplicate real file identities, retaining useful display paths and deterministic ordering. Validate temporary directory/file aliases and cycles, overlapping inputs, and the unchanged canonical 134-file discovery result. Do not expand transfer support for linked targets.

Outcome: discovery now tracks visited directory identities and deduplicates saves by bigint device/inode identity. Requested paths and stable result slots remain; directly encountered leaves replace their leaf symlink representatives. Independent copies remain distinct, alias-only paths remain aliases, and existing link transfer guards and missing/broken-path errors remain. Nine new tests and 47 focused tests pass; full suite: 269 passing, zero failures/skips; final review clean. Canonical discovery remains 134 files / 19,778 roots / 22,072 nodes, with all fixture hashes unchanged.

### [done] BROWSE-003 - Preserve navigation during catalog refresh

Executing the updated app with controlled responses reproduced a separate refresh race: start bank catalog reload while viewing source A, navigate to B and resolve its view, then resolve the old catalog. The reload restores captured A and requests its view, ending on A despite the user's newer navigation. Coordinate catalog/reload completion with current navigation intent and view generations. Preserve later source/page/filter/item requests during refresh, keep initial default selection and fallback behavior, and retain bank preview invalidation. Add actual UI deferred-response tests; this is separate from BROWSE-002 view-response ordering.

Outcome: catalog refresh preserves completion-time valid navigation, skips refresh-owned view requests after newer navigation, retains matching already-pending item keys, and explicitly falls back when the source disappears. Obsolete responses cannot restore removed or earlier selections. Nine independent actual app/bank UI tests and 21 focused tests pass; full suite: 278 passing, zero failures/skips; canonical hashes unchanged; review clean. Refresh/catalog/bank status still run without extra transfer commits.

### [done] IDENTITY-002 - Bind optional naming-cache provenance

On independent copied tables, parsing the real socketed Grand Matron Bow (fingerprint 70879556) cached the runeword name `Edge`. Changing only the copied `Runes.txt` name to `Edge Test Rename` left the cached object displaying `Edge`, while a freshly loaded table object displayed the new name. The six-core-table provenance guard remained current, as intended for BANK-002. Trace the lazy identity cache and define a bounded policy for optional UniqueItems/SetItems/Runes/ItemTypes bytes, including absent files. Before implementation, prove a user-visible stale bank-label or mixed-load case and choose consistent loaded snapshots or explicit reload rejection. Preserve optional read-only loading and the existing bank fingerprint format; do not claim optional identity data is pinned by the core-table fix.

Additional disposable evidence: after that naming-table edit, a character-to-bank deposit succeeds using the cached object and stores `Edge`, while fresh inspection of the selected real bow displays `Edge Test Rename`. Canonical tables and saves remain unchanged. This establishes a user-visible bank-label case; loaded optional snapshots versus explicit stale-cache rejection still needs a bounded policy.

Bounded policy after source review: capture private immutable provenance from the seven buffers actually decoded by the lazy naming cache (three core item tables plus four optional naming tables), recording absent optional files explicitly. Compare reread core hashes to their loader provenance to reject mixed first loads. A combined core/identity freshness guard must reject stale cached labels at the existing bank and acceptance boundaries without silently rebuilding reviewed intent. Preserve read-only mock/optional fallbacks and exact legacy bank fingerprints. Test old versus fresh Edge labels, optional appearance/removal/retargeting, actual decoded-buffer hashes, no-write entry rejection and late journal recovery. Core loading must not make optional naming files required.


Outcome: lazy naming-cache provenance records seven actual decoded-buffer hashes, including absent optional files. Combined core/identity guards reject stale cached labels at all bank/acceptance boundaries; first-load core reread mismatches fail before caching. Read-only mocks and missing-optional fallbacks remain; legacy fingerprints/schema-version-1 banks stay compatible. Ten independent tests and 42 focused tests pass. Review corrected the mixed-read regression to exercise the identity decoder; isolated mutation proof confirms its effectiveness. Full suite: 288 passing, zero failures/skips; final review clean; canonical hashes unchanged. See [identity provenance evidence](../identity-provenance-2026-10-04.md).

### [done] BROWSE-004 - Apply normalized workspace completeness filters

The HTTP route supplies `completeOnly` as the string `true`. The model normalizes it for reported filters and source-specific browsing, but forwards raw options to workspace filtering, which requires boolean true. On a real parsed Bases workspace with one root marked incomplete in memory, workspace string `true` returns 2,586 items including that root while reporting the filter enabled; boolean true correctly returns 2,585, excluding it. Normalize once and use the same filter options in workspace and source browsing. Add independent model and HTTP tests with controlled parsed partial records; retain canonical fixture bytes and existing default behavior. The canonical corpus currently has no incomplete records, so pristine fixtures alone cannot exercise this defect.

Outcome: workspace filtering uses one normalized completeness flag for activation, results and reported state. Exact existing true/string true/string 1 semantics remain. Five independent real-fixture model/HTTP tests and 30 focused tests pass, including excluded partial selections, combined filters and empty filtered results. Full suite: 293 passing, zero failures/skips; review clean; fixture bytes unchanged. Recursive socket-child filtering semantics were not established and are unchanged.

### [done] WRITE-005 - Check selected absence in all character item sections

Read-only verifier audit on disposable results found that `source-absence` scans only primary character roots. Adding the selected prepared Grand Matron Bow (fingerprint 70879556, Tir/Tal/Amn children) to the socketed result's validated mercenary section still passes all 15 checks while its destination copy remains. A same-root-count substitution also passes: six mercenary roots remain, with the selected bow replacing a book. Extend absence checks to all validated primary, mercenary and golem item records. Reuse existing bounded section evidence; do not enable new writing or transfer paths. Add real disposable duplicate-section regressions, retain existing game-unverified status and untouched inputs, and refuse to claim absence when section parsing cannot be established.

Outcome: selected identity is checked once per physical record across all validated primary, mercenary and golem sections. Unsupported boundaries report unknown absence and fail completeness rather than claiming zero. Six independent disposable-fixture tests and 35 focused tests pass, covering added and substituted mercenary duplicates, populated golem duplicates, legitimate auxiliary items and unsupported boundaries. All 15 diagnostics and game-unverified status remain; input hashes are unchanged. Full suite: 299 passing, zero failures/skips; final review clean.

### [done] BANK-003 - Read-only selected bank item details

The bank dropdown shows name/code/source but cannot distinguish two Wolf Heads from Bases.d2x page index 12, items 12 and 15: their existing property displays are `+2 to Hunger` versus `+2 to Oak Sage` and `+2 to Summon Spirit Wolf`. Add a configured-bank-only read-only details endpoint and separate presentation model, decoding and validating the stored single tree under current table provenance. Show actual properties and socket children without exposing raw bytes or enabling writes. Clear stale details immediately and ignore obsolete responses. Verify these two real items, the socketed Edge bow and the stack-20 Town Portal Book on disposable copies; retain existing previews and transfer guards.

Outcome: validated read-only inspection decodes stored trees directly; the configured-bank GET and separate presentation model expose actual properties, stack and socket children. Latest-generation/selected-ID guards clear and prevent stale details. Nine backend/API and seven actual-UI tests pass, including rehashed capacity corruption concealed by parser normalization. Parent independently checked all four fixtures and the Safari interface; QA/canonical bytes unchanged. Full suite: 315 passing, zero failures/skips; final review clean. See [bank details evidence](../bank-details-2026-10-04.md).

### [done] BANK-004 - Preserve destination container during refresh

Executing the shipped app and bank UI with real catalogs reproduces a destination reset: select shared-stash page index 117, refresh the unchanged library, and the source remains selected but its container becomes page index 0. A character's personal stash similarly resets to inventory. Preserve valid container identity when the same destination survives reload; retain numeric stash page identity, and fall back only when the source/container disappears or the user explicitly chooses a different destination source. Add independent actual-UI regressions for refresh and post-transfer reloads. This bank.js slice follows BANK-003 to avoid overlapping implementation ownership.

Outcome: valid containers survive refresh, bank loads and post-commit reloads when destination ID, file path and kind match. Reused IDs, missing sources/pages, changed kinds and explicit destination changes fall back safely. Seven independent actual-UI tests pass, including numeric page 117 versus duplicate-label page 30 and pending status selections. Parent reproduced corrected page/character behavior; final review clean.

### [done] BANK-005 - Keep interrupted lock acquisition discoverable

A disposable process-interruption reproduction exits after acquiring `a-copy.d2x.pd2-mule.lock`, before opening the lexically later `z-bank.json.lock`. Sorted acquisition leaves a save-only lock; bank recovery reports no interrupted transaction, leaves it behind and the next deposit refuses the lock. Acquire the bank discovery lock before the associated save lock and retain it until the save lock is removed, including stale-lock recovery cleanup. Prove interruption boundaries in independent child-process tests for both lexical path orders, preserving hashes, active-owner refusal and recovery guards. Define the existing orphan-lock limitation explicitly; do not infer a save path or silently remove unrelated locks.

Outcome: bank discovery locks are acquired first and removed last during acquisition cleanup, ordinary release and stale recovery cleanup. Six deterministic child-process tests cover real fsync/unlink boundaries in both lexical orders, unchanged early bank/save bytes, recovery then retry, and active/hash/link guards. Historical save-only orphans remain untouched. Both bank fixes pass 62 focused and all 328 full-suite tests, zero failures/skips; canonical hashes unchanged; final review clean. See [navigation and lock evidence](../bank-navigation-locks-2026-10-04.md).

### [done] BANK-006 - Recover explicitly selected historical orphan locks

The CLI rejects `recover --source`; the API ignores `sourcePath`. A historical save-only lock therefore remains undiscoverable when no bank lock or journal survives. Add optional explicit-source recovery with exact resolved bank/save ownership, stale PID, protected-path/link checks and pinned preview hashes. Claim the bank discovery lock before removing the orphan save lock. Never scan unrelated saves. CLI selection is an explicit copy path; browser API selection must resolve a loaded source ID. Conflicting discovered/explicit sources must reject. Prove unchanged bank/save bytes, refusal of foreign or changed locks, interrupted rescue discoverability and retained default behavior.

Outcome: optional explicit copy selection is supported by API and preview-first CLI; service requests resolve loaded source IDs and pin recovery tickets. Exact bank/save ownership is required for every explicit lock, including stale bank locks lacking an association. Durable reassociation precedes cleanup; ordinary errors release only unchanged own claims. Eleven backend, six service and three CLI tests pass, including interruption/race/foreign-owner regressions. Parent independently verified CLI flags and unchanged bytes. All 348 tests pass, zero failures/skips; canonical hashes unchanged; final review clean. See [explicit recovery evidence](../bank-orphan-recovery-2026-10-04.md).

### [done] BROWSE-005 - Retain surviving source IDs across refresh discovery

A disposable real-service/actual-UI reproduction starts with A, alias B and C as source IDs 1/2/3. Retargeting alias B to A deduplicates discovery to A/C and reassigns C to ID 2. Both browser and bank fall back to A even though selected C remains loaded. Preserve lifetime source IDs for surviving requested file paths during service refresh, with collision-free IDs for new paths. Keep initial standalone model IDs and alias display semantics compatible. Test real disposable discovery changes, restoration of a previously deduplicated path and actual UI navigation/destination retention. This service slice follows BANK-006 to avoid overlapping ownership.

Outcome: exact-path lifetime IDs preserve surviving C at source 3 and restore alias B at source 2 when it reappears. New child paths receive unreserved IDs; standalone model IDs remain indexed and failed reloads leave the workspace unchanged. Seven independent real service/actual-UI tests and 61 focused tests pass, covering selection/container retention, removed-source fallback, tickets and hash/link guards. Full suite: 355 passing, zero failures/skips; final review clean. Canonical coverage/hashes remain unchanged. See [source identity evidence](../source-identity-2026-10-04.md).

### [done] BANK-007 - Search bank items by visible source metadata

Read-only UI/CLI checks find both real Wolf Heads for `Wolf Head` but zero for their visible source filename `Bases.d2x`. Extend metadata search to source filenames, character names and page names alongside existing name/base/code/quality fields. Use one shared pure predicate across UI and CLI, retaining whitespace token-AND matching, blank-query behavior, input order and selected IDs. Preserve detail/preview invalidation and read-only behavior. This is a usability extension; decoded-property search and sorting are separate scope. Test the real Wolf Heads, Edge and tome plus legacy quality metadata and actual UI/CLI parity.

Outcome: one pure metadata helper now powers UI and CLI search by name/base/code/quality and source filename, character and page labels. Six independent real-fixture/helper/CLI/actual-UI/HTTP tests pass, with existing VM harnesses using the shipped helper. Selection and detail generations remain correct; no-match and truly empty states have distinct labels. Bank/save/backup metadata and bytes are unchanged. All 48 focused and 361 full-suite tests pass, zero failures/skips; independent final review is clean. Canonical coverage and all save/table hashes remain unchanged. See [bank search evidence](../bank-search-2026-10-05.md).

### [done] BANK-008 - Sort bank metadata while retaining selected IDs

The real QA bank retains deposit order (Wolf Head, Wolf Head, Town Portal Book, Edge); bank list rejects `--sort` and the bank UI has no ordering control. Add shared pure metadata sorting for `stored` (default), `name` and `source`, with corresponding UI labels `Stored order`, `Item name` and `Source`. Name order uses case-folded display/base/code labels, then code; source order uses filename, character name, page name, then item name/code. Use deterministic text comparison and stable input order for equal keys. Return new arrays containing original objects, without decoding retained bytes or changing bank order on disk. Filter before sorting and preserve selected IDs, detail generations, preview invalidation and destination containers across sorting/refresh. Invalid CLI modes must reject. Prove real four-item UI/CLI ordering, duplicate ties, legacy missing labels and unchanged save/bank bytes. This is a browsing capability, separate from the game-gated transfer work.

Outcome: UI and CLI share deterministic metadata sorting with stored order as default, stable ties and original object references. Selected IDs and sort mode survive loads/refreshes; changing sort clears previews and obsolete details while retaining destination/workspace selections. Seven independent real-fixture/CLI/actual-UI/HTTP tests and 55 focused checks pass. Full suite: 368 passing, zero failures/skips; independent final review is clean. Canonical coverage and all save/table hashes remain unchanged. See [bank sorting evidence](../bank-sort-2026-10-05.md).

### [done] BANK-009 - Preserve committed results when post-transfer refresh fails

A disposable Bases/Legacy service reproduction removes the unrelated Legacy copy after previewing a Bases `ci3` deposit. Commit writes the bank and Bases successfully, then throws while refreshing the missing Legacy source. Bases has 2,585 roots and the bank one item, but the caller sees failure and the cached workspace remains stale. Separate successful transaction results from subsequent refresh errors. Consume/invalidate previews, retain the original committed result with an explicit refresh diagnostic, and preserve actual transaction errors. The UI must retain the saved-transfer message even if subsequent reloads fail, clear stale workspace selection/details without accepting obsolete responses, and require a successful refresh before showing updated workspace items. Prove real copy counts, backups, consumed tickets, service/HTTP success responses and actual UI failure handling. This changes reporting and refresh state, not the journaled writer or supported save profiles.

Outcome: successful operations return their original result with an optional refresh error; all preview tickets expire before the reload. UI saved acknowledgements survive server/local refresh failures, stale cached views are suspended, and unavailable banks retain explicit retry credentials. Five backend/HTTP and seven actual-service/app/bank tests pass, plus existing UI regressions. Full suite: 380 passing, zero failures/skips; all 75 focused tests pass and final review is clean. Parent independently proved exact before-images, single mutation, consumed tickets, stale-source guards and resumed counts after repair. Canonical coverage and all save/table hashes remain unchanged. See [committed refresh evidence](../committed-refresh-2026-10-05.md).

### [done] BROWSE-006 - Count page matches before limiting displayed rows

The real shared stash has two Amazon pages, but `pages <shared.sss> --query Amazon --limit 1` prints `MATCHED 1`; unlimited output prints `MATCHED 2`. Retain the full filtered match count and limit only displayed page rows, consistent with item/search summaries. Verify duplicate Amazon pages, unmatched filters and unlimited output against the real shared stash. This is a small read-only CLI reporting correction, following BANK-009.

Outcome: full filtered match counts are retained before output limits. Six manual real-fixture checks prove duplicate Amazon 2/1 and unlimited 2/2, no-match 0/0 and blank/default 144/25 versus unlimited 144/144. Rendered rows and fixture bytes remain unchanged. Independent review is clean; the full 380-test suite also passes on this code. See [page count evidence](../page-match-count-2026-10-05.md).

### [done] BROWSE-007 - Keep healthy workspace browsing when bank startup fails

Executing the actual app with a healthy real shared-stash page 31 view and selected Bloodraven item, then failing only the initial bank GET, replaces the grid with `Failed to load inspector data: Bank status unavailable` while old item details remain. Keep optional bank startup errors local to the bank panel instead of overwriting healthy workspace browsing. Failed workspace loads must still clear stale workspace state. Validate the actual app failure ordering, selected-item/deposit state and continued read-only browsing. This follows the committed-transfer reporting fix and CLI page-count correction.

Outcome: workspace and optional bank startup now have separate failure boundaries. Healthy browsing survives unavailable banks, unknown-token guidance offers page reload and known-token refresh retry remains usable. Missing catalog/source/container state cannot enable transfers. Six actual-module/real-shared-stash cases and 55 related UI checks pass. Full suite: 386 passing, zero failures/skips; final review clean. Canonical coverage and all save/table hashes remain unchanged. See [bank startup evidence](../bank-startup-2026-10-05.md).

### [done] TEST-001 - Share identical bank UI DOM test boundaries

The details, search and sorting tests contain a byte-identical 61-line `Element` class, including child/ID removal and select-value behavior. Extract this unchanged class and its decoding dependencies into a test-only helper; use it in those three files. Keep each test's fixture setup, actual production-helper injection, fetch sequencing and assertions intact. This reduces repeated maintenance when UI controls change. Do not generalize the other differing app harnesses or add tests that mirror the helper. Independent validation should run the existing meaningful real-fixture suites and confirm unchanged case counts, behavior and input hashes. Production files remain untouched.

Outcome: the three bank suites import one test-only Element/decoding helper. Independent comparison proves exact class/dependency and complete assertion-tail bytes unchanged; case counts remain 7/6/7. All 20 existing focused tests and the full 386-test suite pass, zero failures/skips; final review clean. Fixture/table hashes and metadata remain unchanged, as does full canonical coverage.

## Historical recovery result (2026-09-05)

- STAT-007 is complete for Deep Wounds and the proven single-value Eaglehorn [500] case. See [the proof and limitations](stat-007-proof.md). Other Eaglehorn values retain their fallback.
- STAT-009 and STAT-010 now need row/version comparison and fixture validation: their formerly missing strings were recovered from installed pd2data.mpq. The historical outcomes below describe the earlier loose-table searches and are superseded on string availability by [archive evidence](mpq-string-proof.json).
- STAT-006 remains blocked on bytime fixture/source proof.
- Current test baseline: 151 passing, 0 failing, with four new display tests. See [baseline recovery](recovery-baseline.md) for the corrected test discovery and preserved scratch work.

Use this queue for hands-off, context-light sessions. Each item is intended to be small enough for one coherent commit. A session may complete multiple ready items, committing after each batch.

## Queue Rules

- Prefer `ready` items in order.
- If no `ready` items exist, pick the highest `needs-research` item and try to prove it.
- A proven `needs-research` item may be promoted into an implementation batch in the same session when fixture evidence and exact wording/encoding are both available.
- If proof fails, update the item with the exact blocker and continue to the next `needs-research` item.
- Read only the reference docs named by the selected item.
- If an item discovers ambiguity, update it to `blocked` or `needs-research` with the specific reason.
- Keep parser, presentation, UI, and tests in separate file-ownership lanes.
- Preserve the copy-based write boundary in `docs/DEVELOPMENT_WORKFLOW.md`; the inspector remains read-only.

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

Current evidence (October 4, 2026): the corrected parser finds zero `_bytime` properties across all 134 canonical files / 22,072 physical records. It also finds zero magic/rare suffix-456/457 matches and zero target packed values. Historical supposed clean bytime items below came from the inverted flag parser and cannot support formatter changes. The remaining blocker is real fixture or equivalent authoritative proof, not parser provenance.

Goal: find or create fixture-backed proof before changing `item_*_bytime` min/max display to signed 10-bit subslots.

Candidate expected strings once fixture evidence exists:

- `of Sunlight` / `item_armor_bytime` with `center=0`, `min=-10`, `max=60` should render a Day-peaking defense line with `min -10, max +60`.
- `of Dawn` / `item_armor_bytime` with `center=3`, `min=10`, `max=40` should render a Dawn-peaking defense line with `min +10, max +40`.

Outcome: follow-up proof sweeps still did not produce an implementation-safe example. Exact `item_armor_bytime` packed targets for `of Sunlight` (`1038396`) and `of Dawn` (`3156008`) are absent from the Library, and no complete gear-coded `item_armor_bytime` fixture came close enough to stand in as proof. After parser provenance landed, a qualityData-enabled sweep across all 134 Library fixtures still found `0` hits for `magicSuffixId` 456 / 457, `15` magic items with any `_bytime` property (`35` properties total), suffix ids limited to `0`, `120`, `169`, `298`, and `331`, and `0` magic `item_armor_bytime` examples. A later subagent proof pass rechecked all 134 Library saves and found `175` parsed `item_armor_bytime` occurrences (`99` top-level), `0` magic `item_armor_bytime` occurrences, `0` suffix 456 / 457 hits, and `0` occurrences of target packed values `1038396` / `3156008` anywhere in parsed property values. Clean real-gear bytime samples do exist for other stats, including `_LOD_SharedStashSave.sss / RW Helms 2 / Diadem` and `Sacred Armor` with `item_tohitpercent_bytime` packed `4181061` (`center=3, min=-13, max=69`) plus `_LOD_SharedStashSave.sss / Bases 10 / Seraph Rod` with `item_resist_pois_bytime` packed `1040554` (`center=0, min=-8, max=170`), which supports the signed-slot hypothesis in general. Visible magic bytime examples such as `_LOD_SharedStashSave.sss / Magic +6 Bows / Matriarchal Bow` (`magicPrefixId` 435, `magicSuffixId` 169, `item_armorpercent_bytime=55733`) resolve to non-`/time` affixes, so they do not unlock formatter work.

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

### [done] STAT-007 - Deep Wounds and Eaglehorn Raven exact display strings

Current outcome: archive-backed Deep Wounds wording and the historical Eaglehorn `[500]` sentence shipped; see [STAT-007 proof](stat-007-proof.md). The missing-string investigation below is historical and superseded.

Goal: prove exact user-facing wording for `deep_wounds` and `eaglehorn_raven` before replacing the generic fallback lines.

Evidence already found:

- `deep_wounds`: `Gems.txt` Um Rune, prefix/suffix rows, Malice, and multiple unique item rows use the stat. Clean `_LOD_SharedStashSave.sss` fixture examples include amulets with `[300]`, class helms with `[350]` and `[360]`, Hellforged Plate with `[32]`, and Loricated Mail with `[70]`.
- `eaglehorn_raven`: Eaglehorn carries `eaglehorn-raven 500 500`, Raven skill formulas consume `stat('eaglehorn_raven'.accr)`, and clean `_LOD_SharedStashSave.sss` fixture examples exist on Diamond Bow and Crusader Bow samples with `[500]`.

Outcome: fixture evidence is strong, but exact wording is not proven. `ItemStatCost.txt` points `deep_wounds` at `OpenWoundsItem` with `descfunc=1`, `descval=1`, and points `eaglehorn_raven` at `EaglehornRaven` with `descfunc=3`, `descval=0`; those desc keys are mirrored across local PD2 data roots, so the blocker is not table provenance. A subagent fixture pass found `181` parsed `deep_wounds` occurrences with `59` clean source-backed unique-item occurrences, plus `95` parsed `eaglehorn_raven` occurrences with `2` clean Eaglehorn `[500]` occurrences. The actual missing piece remains the payload string: local scans of `patchstring.tbl`, `expansionstring.tbl`, `string.tbl`, historical GoMule string stores, nearby PD2 DLLs, and mirrored PD2 data still found neither `OpenWoundsItem` nor `EaglehornRaven`. GoMule `D2Prop` proves the formatting shape depends on those missing strings: `deep_wounds` would be `+N <string>` unless the missing string contains `%d`; `eaglehorn_raven` would render the missing string only, with no value. A vanilla clue exists for open wounds (`%d%% Chance of Open Wounds` in GoMule translations / string stores), but it is not authoritative proof for PD2 `OpenWoundsItem`. Do not implement until the exact strings are found in an authoritative source or captured in-game tooltip/UI proof.

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

### [done] STAT-009 - Blood Warp exact display string

Current outcome: the source-backed saved value `[2]` renders exactly `Bloodwarp Costs 2% Less Health`, with real Suicide Branch fixture coverage. Other rolls/shapes retain fallbacks. Archive strings and the October 3 implementation supersede the historical blocker below.

Goal: prove exact user-facing wording for `blood_warp_life_reduction` before replacing the generic fallback line on Suicide Branch.

Evidence already found:

- `ItemStatCost.txt` row 468 uses `descfunc=3`, `descval=0`, `descstrpos=bloodwarplifereduction`.
- `UniqueItems.txt` row `Suicide Branch` uses `blood-warp-life-reduction 2 2`.
- `Skills.txt` / `SkillDesc.txt` Blood Warp formulas consume `stat('blood_warp_life_reduction'.accr)`.
- Clean unique `9wn` fixture hits exist in `_LOD_SharedStashSave.sss / Wands 1,2,3` and `war_cryb.d2s`.

Blocked because the desc key provenance is clean but the payload string is still missing. `bloodwarplifereduction` exists in local `ItemStatCost.txt` mirrors, and a subagent fixture pass found `83` parsed occurrences with `3` clean Suicide Branch occurrences, but local scans of `patchstring.tbl`, `expansionstring.tbl`, `string.tbl`, historical GoMule string stores, nearby PD2 DLLs, and mirrored PD2 data still found no `bloodwarplifereduction` string payload. Do not implement until the exact string is proven from an authoritative source or captured UI tooltip.

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

### [blocked] STAT-010 - Remaining scaling stat fixture proof

Current outcome (October 4, 2026): bounded displays already ship for `item_mindamage_energy=[4]`, `item_dmgpercent_pereth=[60]`, `inc_splash_radius_permissinghp=[1]`, `lifedrain_percentcap=[35]`, and `uber_difficulty=[1]` / `[2]`. Their exact outputs and real-fixture tests are in `test/property-display.test.mjs`; other rolls retain fallbacks. Archive strings are available in `mpq-string-proof.json`.

The remaining `item_dmgpercent_permissinghppercent` has **zero** properties in the corrected 134-file canonical sweep, and no source item was found in the pinned unique/set/runeword/affix tables. Keep its fallback until a real source-backed item or equivalent authoritative evidence proves the saved coefficient and presentation. The older missing-string notes below are historical research, superseded by the archive and October 3 implementation.

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
- A subagent fixture pass found clean source-backed examples for `item_mindamage_energy` (`2` Uldyssian's Awakening occurrences), `item_dmgpercent_pereth` (`2` Purgatory occurrences), `inc_splash_radius_permissinghp` and `lifedrain_percentcap` (`2` Nightmare's Feast occurrences each), and `uber_difficulty` (`5` clean map occurrences). It found parsed hits but `0` clean source-backed examples for `item_dmgpercent_permissinghppercent`.
- `item_mindamage_energy`: `ModStr1g` is proven locally as `to Minimum Damage`, but `descstr2=increaseswithenergy` payload is still absent from local string stores.
- `item_dmgpercent_pereth`: `ModStrEnhancedDamage` / `increaseswithequippedeth` payloads are absent from local string stores.
- `item_dmgpercent_permissinghppercent`: `ModStrEnhancedDamage` / `increaseswithmissinghp` payloads are absent from local string stores.
- `inc_splash_radius_permissinghp`: `ModStrIncSplashRadius` / `incsplashwithmissinghp` payloads are absent from local string stores.
- `lifedrain_percentcap`: `ModStrLifeStealCap` / `ofmaximumhp` payloads are absent from local string stores.
- `uber_difficulty`: real uber maps exist in fixtures and `CubeMain.txt` mutates the stat. `MapTier` is present as a desc key in local `ItemStatCost.txt` mirrors, and local clues exist in `TreasureClassEx.txt`, `Misc.txt`, and the modpack tutorial filter (`Map Tier N`, `T1/T2`), but the exact tooltip payload still does not exist in local string stores or the checked `BH.dll` strings.
