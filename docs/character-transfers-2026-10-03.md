# Character transfer evidence: October 3, 2026

Bounded character inventory, cube, and personal-stash transfers are implemented through the persistent bank and opt-in browser controls. Final validation passed **224 tests, zero failures**, including ten deterministic preview/recovery race regressions. Astra reviewed the implementation and GPT-6.1 Sol workers at high effort independently implemented and tested the character path.

This is source-backed serialization: it preserves existing item records and patches supported location fields, counts, file size, and checksum. It is not a general writer for arbitrary item properties. The transfer status remains `experimental; in-game validation required`.

## Corpus and unchanged originals

Canonical source: `PD2-Singleplayer/Diablo II/Save/Library`, relative to the workspace root. The [current parser coverage report](parser-coverage-2026-10-03-current.md) records every source hash and the broader 134-file corpus. All 131 character SHA256 hashes were compared again with that prior report after this work: **zero mismatches**.

| Character measure | Result |
| --- | ---: |
| Canonical `.d2s` files | 131 |
| Version 96, signature `0xAA55AA55`, valid size and checksum | 131 |
| Supported bounded primary-list edits | 131 |
| Byte-identical no-op reconstructions | 131 |
| Disposable removal/reinsertion validations | 131 |
| Empty corpse sections | 131 |
| Files omitting the mercenary `JM` list | 3 |
| Populated golem sections preserved | 2 |
| PvP ears preserved | 4 in 4 files |
| Panel-six roots preserved | 482 in 10 files |
| Skills-to-item-header distance of 32 bytes | 28 |
| Skills-to-item-header distance of 35 bytes | 103 |

The character manifest SHA256 is `cbf0d9cff66b938825f1db1bdadb8ef25a2852d8b8a88b45806193e371921978`. Its input is UTF-8 text containing one `relative/path.d2s<TAB>lowercase-sha256<LF>` line per character, with forward slashes and paths sorted using JavaScript's default string sort. The final line also ends with LF. Individual hashes remain available in the linked coverage report.

The disposable sweep reparsed each removal and reinsertion, verified primary root and physical-node counts, checked the new header size/checksum, and compared the entire trailing character section. Item bits outside the allowed location range remained unchanged. Four inserted roots normalized stale body-position bits inside that allowed range. Therefore a changed-file remove/reinsert operation is not claimed to reproduce every original byte; the separate no-op reconstruction does.

## Binary-layout proof

The fixed version-96 statistics marker is `gf` at offset 765. The parser reads nine-bit statistic IDs and their table-defined `CSvBits` values through the 511 terminator. The following byte-aligned `if` marker anchors the skills block. Exactly one `JM` header at a distance of 32 or 35 bytes is required. This prevents character names or unrelated bytes containing `if` or `JM` from selecting the primary list. Invalid or truncated version-96 boundaries produce explicit errors.

The primary header counts root items, not socket children. Each root travels with its complete contiguous socket tree. Source offsets, decoded bit lengths, physical order, socket counts, and child ownership must agree before mutation. Selection uses the original `topLevelItems` index, not a filtered browser index.

The primary list ends at the independently bounded empty-corpse `JM 00 00` followed by `jf`. Mercenary items, when present, have their own `JM` count and must consume their complete region before `kf`. The golem presence byte must be zero or one; a populated golem must contain exactly one bounded root tree. These sections are preserved, not edited.

`Bases.d2s`, `Legacy.d2s`, and `Showcase Characters/assassin/fire-trap-uber.d2s` omit the mercenary `JM` list. For example, `Legacy.d2s` has primary end 1066, corpse marker 1066, mercenary marker 1070, golem marker 1072, and total size 1075. Its nine-byte suffix is exactly `4a4d00006a666b6600`.

| Populated golem fixture | `kf` offset | Item region | Physical nodes |
| --- | ---: | --- | ---: |
| `Showcase Characters/necromancer/explosn-poison.d2s` | 3634 | 3637..3749, 112 bytes | 5 |
| `Showcase Characters/paladin/return-damage.d2s` | 4631 | 4634..4675, 41 bytes | 1 |

The four ear fixtures are `necromancer/summoner-skele2.d2s` (Chotown), `sorceress/combustion3.d2s` (BDC_NOLAG), `sorceress/frost-nova.d2s` (Daarmy), and `sorceress/zeal-enchanter.d2s` (burp), all under `Showcase Characters`. Their complete source spans are 18, 20, 17, and 16 bytes respectively. Preservation independently verifies the seven-bit owner-name terminator and bounded zero padding. The `Misc.txt` ear row supplies their 1x1 occupancy, so retained ears block conflicting placements. Ear transfers remain disabled.

Panel six contains mixed equipment, potions, maps, and other items. Its semantic name is not established by this work. All 482 records fit within an observed 10x15 extent without overlap. Tests preserve every record byte-for-byte when another supported item is removed; panel six is not offered as a transfer location.

## Supported edits and table provenance

| Container | Serialized panel | Columns | Rows |
| --- | ---: | ---: | ---: |
| Inventory | 1 | 10 | 8 |
| Cube | 4 | 4 | 4 |
| Personal stash | 5 | 10 | 15 |

Dimensions come from the installed official PD2 `Inventory.txt`: class inventory rows, `Transmogrify Box Page 1`, and `Big Bank Page 1`. Its path is `PD2-Singleplayer/Diablo II/ProjectD2/data/global/excel/modpacks/official/Inventory.txt` relative to the workspace root. The four core decoding tables below are under `gomule-d2r/gomule/pd2`.

| File | SHA256 |
| --- | --- |
| `ItemStatCost.txt` | `6f9e4be187af784a1772cc61a705e98fbbd3674ae2dde87673cdc392f8d2d7d2` |
| `Misc.txt` | `5c0435dcb9fced2f983f7eb7e571ab10cca0979ca472749a8e50cd9355a30d6f` |
| `armor.txt` | `213a27fe8f59cb4627d4650453611cc70df3f1411d0325bee4e256b60fdd22a6` |
| `weapons.txt` | `1a860a15b024228a84558dab2c8cde045e20c5cb535aa3c979acb77764130f65` |
| Official `Inventory.txt` | `1a8cab92b75b3b0094219143d32fdd69347d8e21c1fca16d5dd384f76bcb9a87` |

The bank's four-table profile fingerprint is `d95891a4f55e981123aea1a9758ac722e2e94d7b4e34bd00f3438440b2e0fd3d`. It hashes the ordered JSON array of `{file, sha256}` records for ItemStatCost, Misc, armor, and weapons. Withdrawal refuses a different active profile. Custom decoding tables propagate consistently through parsing, support inspection, extraction, removal, insertion, and output verification.

Insertion changes only root location bits 58..75: location, body position, column, row, and panel. Socket-child bytes remain unchanged. The primary root count is updated, the little-endian size at offset 8 is rewritten, and the checksum at offset 12 is recalculated by rotating left one bit and adding each byte modulo 2^32, treating bytes 12..15 as zero. This matches the local GoMule `D2Character.calculateCheckSum` reference and all canonical headers.

Cube insertion requires one cube stored in inventory or stash. A cube with contents cannot be removed; duplicate cubes and placement of a cube inside itself are refused. Occupied cells, invalid coordinates, and oversized item footprints are refused.

## Bank, browser, and recovery checks

Character and PlugY transfers share the existing bank journal, backups, table profile checks, and per-bank/per-save locks. A real socketed bow completed character to bank to PlugY stash to bank to character transfers with its complete raw tree preserved. Bank entries now include item dimensions for automatic placement. Character operations omit `pageIndex`; withdrawal specifies `panel: inventory`, `cube`, or `stash`. PlugY operations continue using `pageIndex`.

The browser remains read-only unless explicitly launched with a bank and experimental write mode. Write mode binds to loopback, validates Host and Origin, and requires the app session token for POST requests. The browser selects loaded sources and item keys; it cannot supply arbitrary save paths. Commit accepts a short-lived, one-use preview ticket. Changing the selected deposit item invalidates its visible preview.

The independent review found and fixed races at the preview and recovery boundaries. Baseline source/bank hashes are captured before planning, checked after preview, and passed into the bank engine so a later read cannot silently select another item. Withdrawal names and placement metadata come from bank bytes checked against that same expected hash. Recovery parses the exact journal/lock bytes checked against its snapshot, pins stale-lock bytes before clearing them, and requires the recovery source to be loaded in the browser. All restoration buffers are captured and validated before either target changes; rollback uses those exact buffers rather than rereading them later.

Ten deterministic regression tests cover these boundaries, including a Diadem/Tiara index-shift race, bank changes, stale-lock redirection, transient metadata, and replacement of the second backup after the first restoration buffer has been validated. The existing process-interruption rollback tests also pass. Power-loss durability and directory metadata flushing remain unverified.

## Limits and next gate

All development writes used disposable copies. Core path guards reject the configured installed Save directories and canonical Library, reject final-component symbolic links and hardlinked write targets, and check resolved paths. The originals and reference tables were not edited.

Nonempty corpse sections remain unsupported because this corpus has no real example. Selected historical-profile items, ears, equipped items, belt items, and panel-six items remain ineligible. Complete bounded historical records can remain untouched while another supported item moves. Unknown or incomplete data, malformed headers/checksums, uncertain spans, inconsistent socket trees, and illegal placement block a transfer. The undeclared trailing key on `Legacy.d2x / Season 6 Extra` still keeps that PlugY page ineligible.

The browser transfer workflow was exercised on copies, but game acceptance has not been established. An isolated game and modified save set were prepared under `pd2-game-validation-2026-10-03` at the workspace root. Native launch approval timed out before acceptance could be demonstrated. Reparse success and a prepared game directory are not evidence of an in-game load.

The immediate acceptance step is to load only the isolated modified character and companion stash, inspect the moved item and socket contents, save and exit, then reparse the game-written files and compare identities/counts. After that gate, the next concrete GoMule feature is multi-item selection with a complete placement preview and one recoverable batch transaction. It should plan every destination before writing and reuse the current source hashes, collision checks, socket-tree preservation, backups, and recovery guarantees. Equipment and corpse editing need separate layout and game-state proof.

## Verification entry points

- `npm test`: final result 224 passed, zero failed.
- `test/character-serialization.test.mjs`: bit masks, headers, sections, preserved items, custom tables, placement, and refusal gates.
- `test/character-bank.test.mjs`: cross-format transfers, socket trees, metadata, and character rollback.
- `test/parser-edge.test.mjs`: corrected primary/secondary boundary assertions.
- `test/mule-preview-race.test.mjs`: ten deterministic concurrency regressions.
- `test/mule-service.test.mjs`: service and HTTP selection, preview, placement, replay, and origin/host guards.

The final read-only review found no unresolved actionable issue in the supported subset. Game acceptance and the explicitly unsupported paths remain separate gates.
