# PD2 Mule

`pd2-mule` is a new PD2-native, parser-first replacement project for the legacy GoMule workflow.

**New computer:** follow [Laptop setup](docs/LAPTOP_SETUP.md) for the matching data tables, pinned fixtures, and launch commands. Continue development from [the portable bootstrap](docs/BOOTSTRAP.md).

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
- persistent item bank and experimental copy-based transfers between characters and PlugY stashes
- optional browser bank controls with previews, automatic placement, backups, and recovery

The October 3, 2026 development request expands the prior read-only milestone. Follow [the Astra/Sol workflow](docs/DEVELOPMENT_WORKFLOW.md) for ownership, evidence, and acceptance gates. See [the verified recovery result](docs/recovery-2026-10-03.md) for the current baseline and remaining work.

The inspector opens read-only by default. Explicit bank commands default to previews. Transfer mode supports proven character inventory, cube, personal stash, and PlugY pages. It preserves item bytes, updates location and count fields, and recalculates character size and checksum. A general property editor is not implemented. Game acceptance remains unverified, so copy-based writes require `--experimental-write`. Known game-save directories and the canonical fixture library are protected.

The canonical Library now has zero incomplete records across 134 files. Older Deep Wounds and map layouts are decoded only after the current layout fails and the proven historical layout reaches the item's terminator with valid padding. Those 16 historical-profile items retain provenance in coverage reports and remain read-only for transfers. The separate undeclared-key anomaly remains transfer-blocked.

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

Choose disposable `.d2s`, `.d2x`, or `.sss` copies outside the game Save directories. List their pages and items first using the commands above. Page and item numbers in the CLI start at 1; column and row positions start at 0. PD2 inventory is 10 by 8, cube is 4 by 4, and stash is 10 by 15. Items must fit without overlaps.

To use the browser controls, load the copy directory and select a bank file:

```powershell
node .\src\cli.mjs ui "C:\path\save-copies" --bank "C:\path\bank.json" --experimental-write
```

Select an item in the browser, choose **Preview deposit**, review it, then **Commit transfer**. To withdraw, choose a bank item and destination. Automatic placement finds available space; turn it off to choose a position. Each move saves immediately and retains backups. A preview expires after five minutes and is refused if its files change. The server binds to loopback and accepts transfers only for loaded sources. Omit `--experimental-write` to preview only.

Bank search matches item names, codes, quality and source filenames, character names or page names. All space-separated terms must match. UI and CLI use the same metadata filter; see [bank search evidence](docs/bank-search-2026-10-05.md).

Selecting a bank item also shows its decoded properties, socket contents and stack count. This inspection works with `--bank` alone and leaves the bank and saves unchanged. See [bank details evidence](docs/bank-details-2026-10-04.md).

Characters use the same bank commands without `--page`; withdrawals specify a container:

```powershell
npm run bank -- deposit --bank "C:\path\bank.json" --source "C:\path\copy.d2s" --item 1
npm run bank -- withdraw --bank "C:\path\bank.json" --item-id "<id>" --destination "C:\path\copy.d2s" --panel inventory --column 4 --row 0
```

`--panel` accepts `inventory`, `cube`, or `stash`. Socket children move with their parent. Equipped items, belt items, panel-six items, PvP ears, and historical-profile items cannot be selected for transfer. Existing records in those locations, mercenary equipment, and iron golems are preserved. Characters with nonempty corpse sections remain unsupported. See [character transfer evidence](docs/character-transfers-2026-10-03.md).

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

For a stale save-only lock left by an older version, explicitly select the known disposable save:

```sh
npm run bank -- recover --bank "C:\path\bank.json" --source "C:\path\copy.d2x"
```

Review the preview, then add `--experimental-write` to clear the matching stale lock. Lock-only recovery preserves bank and save bytes and requires the recorded bank/save ownership to match. See [explicit orphan recovery evidence](docs/bank-orphan-recovery-2026-10-04.md).
