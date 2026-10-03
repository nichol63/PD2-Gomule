# PD2 Mule development workflow

Authorized October 3, 2026. The user requested Astra as orchestrator and Sol or Sonnet workers at high effort, with implementation of the parser, naming, serialization, and mule milestones. This expands the previous read-only development scope. It does not authorize modifying the user's installed game saves during development.

## Team

| Role | Model | Effort | Responsibility |
| --- | --- | --- | --- |
| Orchestrator | gpt-6-astra | high | Evidence review, contracts, ownership, integration decisions |
| Implementation worker | gpt-6-sol | high | Parser, names, display, serializer, bank implementation |
| Test and fixture worker | gpt-6-sol | high | Independent tests, fixture proof, regression review |
| Parent integration | Current chat | Current setting | CLI, documentation, full validation, user updates |

Sonnet is not exposed by this session's agent tool. Sol workers are used without claiming to run Sonnet. The maximum active team is the parent, Astra, and two workers. Reuse workers between phases. Do not create additional sidebar chats for internal work.

## Working loop

1. Inspect the current Git status, queue, and session snapshot. Preserve pre-existing changes and scratch research.
2. Define a bounded implementation contract: owned files, public API, exact displayed strings, relevant fixture examples, rejection conditions, and acceptance checks.
3. Assign implementation and tests to separate workers with no shared file ownership.
4. Verify decoded values and item identity against actual fixtures and matching tables. Synthetic tests alone are insufficient evidence.
5. Run the complete test suite and fixture coverage. Review safety and regression risks before committing a coherent batch.
6. Update milestone evidence and remaining blockers, then continue to the next phase. Never report an unverified gate as completed.

## Milestones and acceptance gates

October 3 implementation and validation results are recorded in [recovery-2026-10-03.md](recovery-2026-10-03.md). Baseline figures below describe the initial broken reader and are superseded by that report.

### 1. Parser coverage

Produce a runnable report for the canonical Library. Include save and table SHA256 hashes, file versions, item/page counts, incomplete property counts, concrete failure locations, and source-partition anomalies. Default reporting must not modify saves. Report output is explicit.

Initial October 3 baseline: 134 files; 286 stash pages; 18,394 visible top-level items; 19,777 parsed records; 1,254 incomplete property records across 100 files. Error totals: stat 510 = 561; stat 508 = 391; stat 509 = 161; property count limit = 141. Shared stash declares 5,040 items and exposes 5,039, with one item clamped on Miscellaneous.

### 2. Parser correctness

Trace property failure bit positions, compare matching tables and the Java reference, and repair proven alignment/boundary errors. IDs 508-510 are not defined by the checked tables; do not invent stat definitions. Reject truncated input rather than silently treating missing bytes as zeros. Recover the shared-stash item only with structural and fixture evidence. Assert real property values and identities, not just byte preservation.

### 3. Naming and presentation

Resolve unique, set, and runeword identities while retaining base names for display and search. Use exact IDs and recipe evidence; uncertain names retain explicit fallbacks. Finish Blood Warp and scaling displays only when archive strings, row compatibility, and real item evidence agree. Historical values must not be replaced by current-season rolls.

### 4. Serialization

Define the supported editable fields and preserve every untouched/unknown bit. No-op serialization must equal original bytes. Changed-field tests must prove that only authorized fields change, source/destination counts and checksums agree, socket children remain attached, and the resulting files reparse correctly. Refuse ambiguous item spans, unsupported shapes, or incomplete parsing. Do not describe a source-backed slice reconstruction as a fully field-backed serializer.

### 5. Persistent bank and transfers

Provide explicit item selection, a persistent bank, dry-run previews, conflict checks, backups, and recoverable transactions. Do not overwrite an existing output unintentionally. Detect external file changes before commit. Interrupted multi-file operations must be recoverable without duplicating or losing items. The browser can remain read-only while explicit CLI operations implement the bounded transfer workflow.

In-game loading of disposable output saves is a separate acceptance gate. Reparse tests do not establish game acceptance. If a game cannot be exercised in this environment, record that limitation and keep unsupported transfer paths disabled.

The implemented journal is tested for process-interruption recovery. Directory metadata flushes and power-loss recovery are not established. Atomic replacement may inherit directory permissions rather than retain every original file attribute; writes are restricted to explicitly selected disposable copies.

## Evidence sources

- Canonical saves: `PD2-Singleplayer/Diablo II/Save/Library`.
- Active local PD2 tables and Java references: `gomule-d2r/gomule/pd2` and `gomule-d2r/gomule/src`.
- Installed archive proof: `docs/autopilot/mpq-string-proof.json` and `stat-007-proof.md`.
- PD2 wiki: https://wiki.projectdiablo2.com/wiki/Main_Page . Use permanent revisions where seasonal changes matter.
- Public developer announcements: https://www.reddit.com/r/ProjectDiablo2/ . Community reports are leads, not binary-layout proof.
- Discord announcements supplied by the user: Season 11-13 notes. Track reverts; test quiver personalization/socketing, map ear modifiers, alternate skins, and old/new item rolls. Invite URLs do not expose channel history to the agent.

## Safety boundaries

- Game archives, reference repositories, original saves, and canonical fixtures stay unchanged.
- Tests use temporary directories or disposable copies inside the workspace.
- Never suppress parsing errors to unlock writes.
- Never test by overwriting an installed character.
- Do not publish, push, or message community members as part of this workflow.
- Preserve pre-existing dirty queue/research changes; do not stage them into unrelated commits.
