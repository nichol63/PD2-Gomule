# PD2 Mule

`pd2-mule` is a new PD2-native, parser-first replacement project for the legacy GoMule workflow.

Current scope:

- read-only inspection
- read-only inspector UI shell served locally from the CLI
- workspace-wide read-only library search across loaded save files
- PD2 table loading from the local workspace
- Diablo II character header parsing for `.d2s`
- PlugY stash envelope parsing for `.d2x` and `.sss`
- legacy item payload parsing for core item metadata:
  - item code and base name
  - quality tier
  - location / row / column / panel
  - ethereal / identified / runeword / socket flags
  - filled and total sockets
- read-only saved property stream decoding where the current legacy layout is covered:
  - per-item `properties`
  - per-list `propertyLists`
  - safe fallback via `propertiesComplete` / `propertyParseError` when a fixture hits an unsupported layout
- fixture-driven validation against the local PD2 singleplayer pack

Near-term roadmap:

1. Prove the remaining PD2 stat wording and encoding against authoritative sources and real save fixtures.
2. Extend property decoding and presentation only where that evidence supports it.
3. Maintain the existing stash/inventory browser, search, filters, and read-only inspection.
4. Keep write/edit/transfer/import/export support disabled. The shipped reconstruction checks preserve original source bytes; they do not establish a field-backed writer.

For the current stopping point and blockers, read `docs/autopilot/WORK_QUEUE.md` and run `node ./scripts/session-snapshot.mjs`. The older GoMule projects are references only.

## Usage

Inspect fixture files:

```powershell
node .\src\cli.mjs inspect `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library\Legacy.d2s" `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library\Bases.d2x" `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library\_LOD_SharedStashSave.sss"
```

List stash pages:

```powershell
node .\src\cli.mjs pages `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library\Bases.d2x" `
  --query paladin
```

Browse read-only items from a character or stash page:

```powershell
node .\src\cli.mjs items `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library\Bases.d2x" `
  --page "Reg Paladin" `
  --sort props `
  --limit 10
```

Search across parsed saves using top-level items:

```powershell
node .\src\cli.mjs search `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library\Legacy.d2s" `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library\Bases.d2x" `
  --query "horadric cube"
```

Launch the read-only inspector UI against the local fixture pack:

```powershell
node .\src\cli.mjs ui `
  "C:\Codex\GoMuleR4.3.2_1.13\PD2-Singleplayer\Diablo II\Save\Library" `
  --host 127.0.0.1 `
  --port 4173
```

Run the fixture tests:

```powershell
npm test
```
