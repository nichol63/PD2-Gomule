# Isolated game acceptance: October 3, 2026

Status: prepared and launched, but **no character has been loaded and game acceptance is unverified**.

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
