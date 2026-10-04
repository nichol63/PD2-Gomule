# Isolated game acceptance: October 3, 2026

Status: prepared and launched, but **no character has been loaded and game acceptance is unverified**.

October 4 laptop continuation: the user confirmed the desktop game checks have not been performed. A portable acceptance pack can now be generated with `npm run prepare:acceptance -- --output .game-acceptance/2026-10-04`. Its `CHECKLIST.md` covers both the Town Portal Book and a three-rune socketed Grand Matron Bow in independent save directories. Its manifest records prepared hashes, counts, properties, and bank backups. See [continuation evidence](continuation-2026-10-04.md). The desktop installation and staged files described below are historical; the portable pack must be copied separately to an isolated compatible installation. In-game acceptance remains unverified.

The browser successfully moved the Town Portal Book from a disposable level-30 Amazon into the item bank, then into the landing page of a disposable Bases stash. The original fixtures are unchanged. The browser displayed the transferred book in `Bases.d2x / Landing Page` at column 0, row 0, with stack size 20 and fingerprint 28610618. See [the saved interface](character-bank-transfer-2026-10-03.png).

## Prepared installation

An independent copy of the existing installed game files is under:

`C:\Codex\GoMuleR4.3.2_1.13\pd2-game-validation-2026-10-03`

Only that copy's configuration was changed. `ProjectD2/PlugY.ini` enables an isolated save path, windowed mode, logging, and disabled mouse locking. Battle.net remains disabled. Its optional `ActiveNewStatsInterface` was changed to 0 after PlugY reported a stats-interface compatibility conflict with the installed PD2 build. Memory checks remain enabled. The installed configuration and archives were not edited.

Launching the copied `ProjectD2/PlugY.exe` with its own directory as the working directory reached the log message `ENTERING DIABLO II` with version-1.13c modules. A separate native launch reached vanilla 1.14d instead and was closed from its main menu without entering Single Player. Launch context therefore matters.

PlugY's runtime log resolved the save directory to:

`C:\Codex\GoMuleR4.3.2_1.13\pd2-game-validation-2026-10-03\Save\Save`

The transferred `Amazon.d2s` and the transferred stash renamed to `Amazon.d2x` are staged there. Independent copies also remain one level above, with pre-game hashes in `before-game-hashes.json`. The character has two inventory roots after the book deposit; the personal stash has 2,587 roots across 133 pages, including the book on the landing page.

## Required acceptance check

Computer Use could not obtain a targetable window for the running copied PD2 process. The user was asked to bring the game forward. Do not infer acceptance from a running process or successful parser tests.

1. Confirm the visible game is PD2 with PlugY and uses the isolated save path above. Do not load through the vanilla 1.14d launch.
2. Load the staged Amazon in Single Player. Confirm the character loads without a bad-inventory or bad-generic-file error.
3. Open the personal stash landing page and verify the Town Portal Book, stack size 20. Confirm the cube and Identify Book remain in inventory.
4. Save and exit, then re-open the character. Confirm the book remains in the stash and is absent from inventory.
5. Reparse the game-saved character and stash, record checksums, counts, item identity, and screenshots. Repeat with a socketed item before broadening transfer availability.

This is the remaining game acceptance gate. Live installed-save writes, selected historical-profile transfers, and broader write support stay disabled until their own evidence is established.

## Read-only result comparison

Keep the prepared pack and its manifest unchanged. Copy both game-written cases into an independent results directory that mirrors the manifest paths (`tome/Amazon.d2s`, `tome/Amazon.d2x`, `socketed/freezing-arrow.d2s`, `socketed/freezing-arrow.d2x`). Run:

```sh
node scripts/verify-game-acceptance.mjs --pack <retained-pack> --results <post-game-results>
```

This emits JSON with per-case checks, prepared/result hashes, and whether each file changed. It validates provenance and structural preservation without writing inputs. It exits 1 for structural failures or invalid inputs. Exact selected tree changes require review even when decoded properties match. A checksum-correct character timestamp rewrite can pass; identical independent copies can also pass. Neither establishes game use. Every report leaves `gameAcceptance` unverified and the acceptance gate pending until actual game observations and evidence review.

Selected-item absence includes validated primary, mercenary and golem records, including socket children. Unsupported section boundaries yield unknown absence and a failed completeness check; they cannot establish that the transferred item is absent.
