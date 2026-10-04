# PD2 Mule Agent Instructions

This file does not create new built-in agent types. It defines how assistants and subagents should operate in this repo.

Available subagent types in this environment:

- `explorer`
- `worker`

Use the role names below as working assignments layered on top of those built-in types.

## Project Scope

On another computer, use this repository as the primary codebase, `docs/BOOTSTRAP.md` as the bootstrap, and `docs/autopilot/WORK_QUEUE.md` as the queue. Follow `docs/LAPTOP_SETUP.md` for sibling dependencies. Desktop absolute paths below are historical references and do not require the same drive or username. The portable bootstrap and committed milestone documents supersede the desktop-only root handoff for current state.

- Primary codebase: `C:\Codex\GoMuleR4.3.2_1.13\pd2-mule`
- Bootstrap: `C:\Codex\GoMuleR4.3.2_1.13\PD2_MULE_BOOTSTRAP.md`
- Work queue: `C:\Codex\GoMuleR4.3.2_1.13\pd2-mule\docs\autopilot\WORK_QUEUE.md`
- Full handoff reference: `C:\Codex\GoMuleR4.3.2_1.13\HANDOFF_PD2_MULE.md`
- Fixture pack: `C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library`
- Reference-only codebases:
  - `C:\Codex\GoMuleR4.3.2_1.13\gomule-d2r`
  - `C:\Codex\GoMuleR4.3.2_1.13\gomule-git`

## Hard Rules

- Read the bootstrap and work queue before substantial work. Use the full handoff only as a targeted reference.
- Run `node .\scripts\session-snapshot.mjs` for a compact current-state summary.
- Run `git status --short` and `git log --oneline -15` before dispatching file-owning agents.
- Follow `docs/DEVELOPMENT_WORKFLOW.md`: the user authorized bounded serialization, persistent bank, and transfer development on October 3, 2026. Keep original saves and canonical fixtures untouched; use disposable copies for write validation. The inspector remains read-only unless explicitly expanded.
- Preserve parser/presentation separation.
- Validate against real fixtures, not just synthetic tests.
- Always have at least one agent responsible for tests on any non-trivial change.
- When multiple agents edit code, use strict file ownership: one agent per file, no overlap.

## Working Roles

### Scout

- Built-in type: `explorer`
- Purpose: find files, trace code paths, identify fixture evidence, and clarify ownership.
- Edits: none

### Parser Engineer

- Built-in type: `worker`
- Purpose: parser and parsed-shape changes.
- Typical files:
  - `src/lib/legacy-item-parser.mjs`
  - parser-adjacent data loaders and helpers

### Presentation Engineer

- Built-in type: `worker`
- Purpose: property formatting, browse/index logic, inspector model/server, and UI work.
- Typical files:
  - `src/lib/property-display.mjs`
  - `src/lib/browser-index.mjs`
  - `src/lib/inspector-model.mjs`
  - `src/lib/inspector-server.mjs`
  - `src/ui/*`

### Test Engineer

- Built-in type: `worker`
- Purpose: tests only.
- Typical files:
  - `test/*.test.mjs`

### Fixture Verifier

- Built-in type: `worker`
- Purpose: prove behavior against real save files and actual item/page samples.
- Edits: none by default

### Reviewer

- Built-in type: `worker`
- Purpose: final regression review.
- Focus:
  - behavior regressions
  - missing coverage
  - read-only boundary violations
  - parser/presentation separation mistakes

## Standard Dispatch Pattern

1. Read the bootstrap and work queue; run the session snapshot script.
2. Run Scout first if the scope is not obvious.
3. Dispatch implementation and test agents in parallel with non-overlapping file ownership when the user has explicitly authorized agent delegation.
4. Run Fixture Verifier against real saves.
5. Run `npm test` in the main thread.
6. Run Reviewer for non-trivial batches before commit.

## Shared Spec Contract

Every file-owning agent prompt should include the same short contract:

```text
Task: <one-sentence change>
Files you own: <exact paths>
Do not edit: <exact paths>
Required output strings:
- "..."
Fixtures to check:
- <exact save file and item/page examples>
Validation:
- npm test
- <fixture or CLI check>
Constraints:
- read-only tool only
- no overlapping file ownership
- preserve parser/presentation separation
```

## Multi-Value Stat Rule

For any stat where `values.length >= 2`:

1. Read `src/lib/legacy-item-parser.mjs` and confirm the bit widths.
2. Cross-check `gomule-d2r\gomule\src\gomule\item\D2Prop.java` for `descFunc` semantics.
3. Verify the formatter against real fixture items before treating the work as done.

Unit tests are necessary, but they do not prove the encoding is correct by themselves.

## Prompt Starters

### Scout

```text
Read the PD2 Mule bootstrap and work queue, then inspect the codebase for this target slice: <slice>.

Return only:
1. Files that should change
2. Who should own each file
3. Relevant functions or line ranges
4. Fixture files or specific items that exercise the behavior
5. Risks or ambiguity

Do not edit files.
```

### Implementation

```text
Own only these files:
- <exact file paths>

Implement this slice: <slice>.

Shared spec:
- Required output strings: <exact strings>
- Fixtures to check: <exact files/items>
- Constraints: read-only only, no overlapping file ownership, preserve parser/presentation separation

Return a concise summary of the change and anything the verifier should check.
```

### Tests

```text
Own only these files:
- <exact test file paths>

Add or update tests for this slice: <slice>.

Shared spec:
- Required output strings: <exact strings>
- Constraints: match the implementation contract exactly

Return the cases added and what each case proves.
```

### Fixture Verification

```text
Do not edit files.

Validate this slice against real fixtures: <slice>.

Return only:
1. Fixture files checked
2. Item or page names checked
3. Raw values if relevant
4. Exact rendered output observed
5. Any mismatch against the shared spec
```
