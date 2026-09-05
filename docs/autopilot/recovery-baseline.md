# Recovery baseline

Verified 2026-09-05 against the existing workspace, Node v22.17.0.

## Tests and browser

- Initial `npm test`: 149 passing entries, 0 failures. Two entries were root scratch scripts, not assertion-based tests.
- Scoped `npm test` (`node --test "test/*.test.mjs"`): 147 passing tests, 0 failures. No test cases were removed.
- Inspector loaded all 134 files from `PD2-Singleplayer/Diablo II/Save/Library` at localhost in read-only mode.
- Browser smoke check: shared stash `Bows 2,3` showed 11 items; selecting Crusader Bow `6l7` showed its properties; searching `Crusader` reduced results to 2; Clear restored 11.
- Before further display work, the selected Crusader Bow showed the fallback `+500 to Eaglehorn Raven`; Blade Bow `8hb` showed `+50 to Deep Wounds`.
- Screenshot inspection found cramped summary text at the current approximately 1265-pixel viewport. This is a separate UI follow-up, not a parsing failure.

## Preserved work

The pre-existing modifications to `WORK_QUEUE.md` and `display-decisions.md` add historical research counts and retain all four blockers. They are preserved. Those extra counts were reviewed for consistency, not independently reproduced during baseline recovery.

The eight untracked root research scripts are also preserved. Do not treat their output as proof without reviewing their assumptions:

- `test-find.mjs` contains an incorrectly escaped Windows path and reports a nonexistent path while exiting successfully.
- `test-parse.mjs` catches errors without failing and probes an alternate fixture root.
- `analyze-fallback-stats-final.mjs` returns from a property-list callback at the first recognized stat, skipping later properties in that list.
- Other scratch coverage checks use alternate roots, hand-maintained formatter lists, or swallowed parse errors.

Use the canonical fixture library and actual formatter output for new evidence. No scratch files were deleted, adopted as tests, or committed by this recovery batch.

## Continuation

The next targeted proof is STAT-007: `OpenWoundsItem` and `EaglehornRaven`. Existing clean item provenance is sufficient to investigate wording; generic fallback text is not authoritative tooltip evidence. Check installed PD2 archives and authoritative source identity before repeating loose-table or whole-Library searches.
