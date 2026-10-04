# PD2 Mule bootstrap

This is the portable continuation entry point. Start with [laptop setup](LAPTOP_SETUP.md) on a fresh machine, then read [the work queue](autopilot/WORK_QUEUE.md) and [the development workflow](DEVELOPMENT_WORKFLOW.md).

Latest known full test baseline: `260` passing, `0` failing.

The user started an autonomous development run, continued with a new 3,000,000-token goal on October 4. [The run record](autonomous-run-2026-10-04.md) tracks ungated batches and evidence. Duplicate stash page labels now retain their exact numeric identity in the inspector and UI; all seven repeated class-page pairs and real UI navigation are tested. Read-only post-game comparison is available with `npm run verify:acceptance -- --pack <retained-pack> --results <post-game-results>`; every report retains unverified game acceptance. In-game acceptance still gates multi-item transfers.

October 4 laptop continuation restored the pinned fixtures/tables and added portable acceptance preparation. The prepared pack contains independent Town Portal Book and socketed-bow transfers, retained backups, and a game checklist. See [continuation evidence](continuation-2026-10-04.md); regenerate with `npm run prepare:acceptance -- --output <new-directory>`. In-game acceptance remains pending.

Verified October 3, 2026: all 134 canonical files parse, with 19,778 roots, 22,072 physical records, and zero incomplete records. All 131 characters support bounded stored-item edits on disposable copies. Sixteen historical-profile items remain read-only for transfers. An undeclared-key source-partition anomaly remains blocked.

The browser opens read-only by default. Explicit bank mode supports reviewed deposits and withdrawals, placement previews, backups, and process-interruption recovery. Read [character transfer evidence](character-transfers-2026-10-03.md) before changing serialization or transfer behavior.

In-game acceptance remains pending. See [the game acceptance record](game-acceptance-2026-10-03.md). Multi-item transfers come after that gate and must use a recoverable batch transaction. Power-loss durability is not established.

## Startup

1. Run `git status --short --branch`, `git log --oneline -15`, and `node scripts/session-snapshot.mjs` from this repository.
2. Preserve existing work, including research scripts. Keep parser, presentation, UI, and tests in separate ownership lanes when delegating.
3. Use Astra high as coordinator and GPT-6.1 Sol high as workers where available.
4. Validate against the pinned Library and tables, run the relevant checks and full suite, and update the queue with evidence.
5. Never modify canonical fixtures, original saves, or reference repositories during validation. Use disposable copies for transfers.

Paths in older evidence refer to the desktop workspace. The current repository and its sibling dependency directories are authoritative on another machine. The desktop-only root handoff is historical background; this file and committed milestone documents contain the current continuation state.

Single-item bank transfers and acceptance tooling reject stale loaded core tables before writes. Existing bank fingerprints remain compatible; see [loaded-table provenance evidence](table-provenance-2026-10-04.md). Optional naming-cache provenance remains a separate research item.

The browser now ignores obsolete view responses and clears stale item selection, details, and deposit previews while loading or after errors. Catalog-refresh navigation is a separately reproduced ready item.
