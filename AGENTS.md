# PD2 Mule Agent Instructions

This file does not create new built-in agent types. It defines how assistants and subagents should operate in this repo.

Available subagent types in this environment:

- `explore`
- `general`

Use the role names below as working assignments layered on top of those built-in types.

## Project Scope

- Primary codebase: `C:\Codex\GoMuleR4.3.2_1.13\pd2-mule`
- Active handoff: `C:\Codex\GoMuleR4.3.2_1.13\HANDOFF_PD2_MULE.md`
- Fixture pack: `C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library`
- Reference-only codebases:
  - `C:\Codex\GoMuleR4.3.2_1.13\gomule-d2r`
  - `C:\Codex\GoMuleR4.3.2_1.13\gomule-git`

## Hard Rules

- Read the handoff in full before substantial work.
- Run `git status --short` and `git log --oneline -15` before dispatching file-owning agents.
- Keep the tool read-only. Do not add write, edit, move, import, export, or transfer flows.
- Preserve parser/presentation separation.
- Validate against real fixtures, not just synthetic tests.
- Always have at least one agent responsible for tests on any non-trivial change.
- When multiple agents edit code, use strict file ownership: one agent per file, no overlap.

## Working Roles

### Scout

- Built-in type: `explore`
- Purpose: find files, trace code paths, identify fixture evidence, and clarify ownership.
- Edits: none

### Parser Engineer

- Built-in type: `general`
- Purpose: parser and parsed-shape changes.
- Typical files:
  - `src/lib/legacy-item-parser.mjs`
  - parser-adjacent data loaders and helpers

### Presentation Engineer

- Built-in type: `general`
- Purpose: property formatting, browse/index logic, inspector model/server, and UI work.
- Typical files:
  - `src/lib/property-display.mjs`
  - `src/lib/browser-index.mjs`
  - `src/lib/inspector-model.mjs`
  - `src/lib/inspector-server.mjs`
  - `src/ui/*`

### Test Engineer

- Built-in type: `general`
- Purpose: tests only.
- Typical files:
  - `test/*.test.mjs`

### Fixture Verifier

- Built-in type: `general`
- Purpose: prove behavior against real save files and actual item/page samples.
- Edits: none by default

### Reviewer

- Built-in type: `general`
- Purpose: final regression review.
- Focus:
  - behavior regressions
  - missing coverage
  - read-only boundary violations
  - parser/presentation separation mistakes

## Standard Dispatch Pattern

1. Run Scout first if the scope is not obvious.
2. Dispatch implementation and test agents in parallel with non-overlapping file ownership.
3. Run Fixture Verifier against real saves.
4. Run `npm test` in the main thread.
5. Run Reviewer for non-trivial batches before commit.

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
Read the PD2 Mule handoff in full, then inspect the codebase for this target slice: <slice>.

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
