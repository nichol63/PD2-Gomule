# Continue on another computer

Use Git and Node.js 22 (the verified desktop runtime is 22.17.0). There are no npm package dependencies to install. The code, tests, research scripts, queue, and development evidence are in this repository. Data tables and canonical saves are external dependencies.

## Clone the code and fixtures

Run these PowerShell commands from a new workspace directory of your choice:

```powershell
git clone https://github.com/nichol63/PD2-Gomule.git pd2-mule
git clone https://github.com/BetweenWalls/PD2-Singleplayer.git PD2-Singleplayer
git -C PD2-Singleplayer checkout 1e2fb4a7c44bdbd8f971e80cc3ff67a2da17af89
```

The fixture revision is pinned to the clean desktop checkout used for the current tests. Keep it unchanged. A newer fixture pack may have different counts and layouts.

## Set up the matching tables

The pinned fixture repository includes all ten matching tables. From the workspace directory, copy them into the location expected by the parser:

```powershell
$tableSource = '.\PD2-Singleplayer\Diablo II\ProjectD2\data\global\excel\modpacks\official'
$tableDestination = '.\gomule-d2r\gomule\pd2'
$tableNames = @('armor.txt', 'weapons.txt', 'Misc.txt', 'ItemStatCost.txt', 'Skills.txt', 'MonStats.txt', 'UniqueItems.txt', 'SetItems.txt', 'Runes.txt', 'ItemTypes.txt')
New-Item -ItemType Directory -Path $tableDestination -Force | Out-Null
foreach ($tableName in $tableNames) {
    Copy-Item -LiteralPath (Join-Path $tableSource $tableName) -Destination $tableDestination
}
```

All ten files in that pinned checkout were verified to match the desktop parser's tables byte for byte. Their expected hashes are recorded in [the coverage report](parser-coverage-2026-10-03-current.md). No manual file transfer from the desktop is required.

```text
workspace/
  pd2-mule/                         # this repository
  gomule-d2r/gomule/pd2/            # ten matching .txt tables
  PD2-Singleplayer/Diablo II/Save/Library/
```

The `gomule-d2r` directory is just the expected table location for runtime and tests; a GoMule checkout is not required. Cloning upstream `gomule-d2r` alone does not provide this local PD2 table directory. Do not substitute newer tables when reproducing this baseline. The workspace can live anywhere; the main application resolves these paths relative to its repository. Some historical scratch scripts and evidence documents retain desktop paths.

## Verify and launch

On macOS or Linux, the same sibling layout applies. From the workspace directory:

```sh
git clone https://github.com/BetweenWalls/PD2-Singleplayer.git PD2-Singleplayer
git -C PD2-Singleplayer checkout --detach 1e2fb4a7c44bdbd8f971e80cc3ff67a2da17af89
mkdir -p gomule-d2r/gomule/pd2
table_source='PD2-Singleplayer/Diablo II/ProjectD2/data/global/excel/modpacks/official'
table_destination='gomule-d2r/gomule/pd2'
cp "$table_source/Armor.txt" "$table_destination/armor.txt"
cp "$table_source/Weapons.txt" "$table_destination/weapons.txt"
for table_name in Misc.txt ItemStatCost.txt Skills.txt MonStats.txt UniqueItems.txt SetItems.txt Runes.txt ItemTypes.txt; do
  cp "$table_source/$table_name" "$table_destination/$table_name"
done
```

Use this copying step only for a new table directory. Preserve an existing dependency setup and compare hashes before replacing it. The explicit lowercase destination names for armor and weapons also work on case-sensitive filesystems. October 4 laptop validation passed on macOS with Node 26.3.0; Node 22 remains the documented desktop reference runtime.

```powershell
Set-Location .\pd2-mule
node .\scripts\session-snapshot.mjs
npm test
npm run coverage -- --format markdown
node .\src\cli.mjs ui "..\PD2-Singleplayer\Diablo II\Save\Library" --port 4175
```

Open http://127.0.0.1:4175. Expected baseline: 299 tests passing, 134 parsed files, 19,778 root items, 22,072 physical records, and zero incomplete records. The 16 historical-profile items remain transfer-blocked; one undeclared-key anomaly is reported separately.

For transfer development, prepare disposable copies outside any game Save directory and run:

```powershell
node .\src\cli.mjs ui "..\save-copies" --bank "..\save-copies\bank.json" --experimental-write --port 4175
```

Never use original saves for write validation. In-game acceptance is still pending and requires a separately installed, compatible PD2/PlugY setup. The desktop's disposable validation installation and active bank are not part of this repository.

## Prepare portable game acceptance copies

From the repository, create a new acceptance pack:

```sh
npm run prepare:acceptance -- --output .game-acceptance/2026-10-04
```

The command refuses an existing output directory and keeps canonical sources unchanged. It uses the existing bank engine to move a Town Portal Book and a socketed bow in two independent scenarios. Each has a character, a matching personal stash filename, retained bank transaction backups, and pre-game evidence in `manifest.json`. Follow the generated `CHECKLIST.md` in a separate compatible PD2/PlugY installation. The pack does not install or launch the game, and preparation does not satisfy game acceptance. Keep the two scenario save directories separate.

After the game checks, keep the retained pack unchanged and place independent game-written save copies in a results directory with the same `tome/` and `socketed/` paths. Verify both cases without modifying inputs:

```sh
npm run verify:acceptance -- --pack .game-acceptance/2026-10-04 --results <post-game-results>
```

The report checks prepared provenance, headers/checksums, counts, selected-item placement, properties, stack and sockets, and exact selected tree bytes. Exit code 1 means a structural mismatch or invalid input; diagnostics identify the failed checks. Whole-file rewrites alone do not fail, but changes to the selected item bytes require review. Matching independent copies can pass without ever entering the game. Every report keeps `gameAcceptance: "unverified"`; actual load/save/reload observations and screenshots remain required. Use the script directly, or `npm run --silent verify:acceptance`, when redirecting pure JSON to a separate report file.

The `.game-acceptance/` directory is ignored by Git. Copy the pack to the desktop for game validation if necessary, preserving the manifest and backups. After saving, exiting, and reloading in PD2, reparse the game-saved files and record the results in the [acceptance record](game-acceptance-2026-10-03.md). Multi-item development remains gated on that evidence.

## Resume development

Read [BOOTSTRAP.md](BOOTSTRAP.md), [the work queue](autopilot/WORK_QUEUE.md), and [the development workflow](DEVELOPMENT_WORKFLOW.md). The next acceptance gate is loading transferred copies in PD2, followed by atomic multi-item transfers. Use Astra high for coordination and GPT-6.1 Sol high for workers where available.

Commit and push laptop work before switching computers. On a clean checkout, use `git pull --ff-only` before resuming. Do not force-push to reconcile changes made on both machines.
