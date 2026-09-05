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

STAT-007 is now complete for Deep Wounds and the proven Eaglehorn `[500]` case; see [proof and limits](stat-007-proof.md). Four added tests bring the final suite to 151 passing, 0 failing. After restarting the inspector, both new lines were confirmed in the browser on the same real stash items.

Installed archive extraction recovered the previously missing strings. The next bounded batch is STAT-009 (Blood Warp), followed by STAT-010 scaling rows: compare archive and active metadata, then validate wording against clean source-backed fixtures. STAT-006 remains blocked on bytime fixture evidence. Preserve generic fallback for unsupported Eaglehorn values.
