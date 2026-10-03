# PD2 Mule

`pd2-mule` is a new PD2-native, parser-first replacement project for the legacy GoMule workflow.

Current scope:

- read-only inspection
- read-only inspector UI shell served locally from the CLI
- workspace-wide read-only library search across loaded save files
- unique/set/runeword identities with base names retained for search
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
- reproducible parser coverage with source/table hashes and precise failure offsets
- experimental persistent item bank and bounded PlugY stash deposit/withdraw commands

The October 3, 2026 development request expands the prior read-only milestone. Follow [the Astra/Sol workflow](docs/DEVELOPMENT_WORKFLOW.md) for ownership, evidence, and acceptance gates. See [the verified recovery result](docs/recovery-2026-10-03.md) for the current baseline and remaining work.

The inspector remains read-only. Explicit bank commands default to previews. Committed transfers are limited to supported PlugY pages whose item lengths, socket trees, counts, and placement can be validated. They preserve opaque item bytes and patch only location fields and page counts. Character writes and a general property serializer are not implemented. Game acceptance remains unverified, so copy-based writes require `--experimental-write`. Known game-save directories and the canonical fixture library are protected.

For the current stopping point and blockers, read `docs/autopilot/WORK_QUEUE.md` and run `node ./scripts/session-snapshot.mjs`. The older GoMule projects are references only.

## Usage

Generate a parser coverage report without modifying saves:

```powershell
npm run coverage -- --format markdown
```

JSON output includes per-save versions and SHA256 hashes, table hashes, incomplete item/property lists, bit offsets, and source-partition anomalies. `--output <new-report-file>` writes a report outside protected source directories. Existing output files are not overwritten.

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

## Experimental item bank

Choose disposable `.d2x` or `.sss` copies outside the game Save directories. List their pages and items first using the commands above. Page and item numbers in the CLI start at 1; column and row positions start at 0. The supported PD2 stash grid is 10 columns by 15 rows, and an item must fit entirely inside it without overlaps.

Preview a deposit, with no bank or save changes:

```powershell
npm run bank -- deposit --bank "C:\path\bank.json" --source "C:\path\copy.d2x" --page 2 --item 1
```

Add `--experimental-write` to commit the selected operation. `--dry-run` always takes precedence. A committed deposit removes the selected item and its socket children from the stash and stores their original bytes in the bank. Each bank item includes a checksum, source identity, and parser-table fingerprint. Withdrawal refuses a changed table profile.

```powershell
npm run bank -- list --bank "C:\path\bank.json" --query "Eaglehorn"
npm run bank -- withdraw --bank "C:\path\bank.json" --item-id "<id from list>" --destination "C:\path\copy.sss" --page 1 --column 0 --row 0
```

Withdrawal also previews by default. Committed changes retain before-images under `<bank.json>.transactions`, use bank and stash locks, and journal the transaction before changing either file. Recovery covers process interruptions; power-loss durability and in-game loading have not been validated. If an operation is interrupted, preview recovery first:

```powershell
npm run bank -- recover --bank "C:\path\bank.json"
```

Add `--experimental-write` to perform the proposed rollback or finalization. Recovery refuses externally modified files or damaged backups. It does not silently choose which copy to keep.
