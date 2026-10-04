# Laptop continuation: October 4, 2026

The pinned public fixture repository and parser tables are restored on the laptop. In-game acceptance remains pending; the user confirmed it has not been performed. Multi-item transfer implementation remains gated on game acceptance.

## Dependency and parser evidence

- Fixture revision: `1e2fb4a7c44bdbd8f971e80cc3ff67a2da17af89`, clean checkout.
- All 134 canonical save sizes and SHA256 hashes match `parser-coverage-2026-10-03-current.md`.
- All ten runtime table sizes and SHA256 hashes match that report. Tables came from the pinned fixture repository's official modpack directory.
- macOS runtime: Node `26.3.0`. Existing baseline: 224 passing tests, zero failures. With five new acceptance preparation tests, the complete suite passes 229 tests with zero failures or skips. HTTP tests require permission to bind localhost in the execution sandbox.
- Coverage: 134 parsed files, 286 pages, 19,778 root items, 22,072 physical records, 63,497 properties, zero incomplete records, 16 historical-profile records, and one source-partition anomaly. The `Legacy.d2x / Season 6 Extra` undeclared 22-byte key remains transfer-blocked.

Reproduce parser evidence with `npm test` and `npm run coverage -- --format markdown`. The ten lowercase/case-specific runtime filenames and macOS setup commands are in `LAPTOP_SETUP.md`. Canonical fixtures and reference data were unchanged during validation.

## Corrected display research

An independent read-only sweep used the current parser on all 134 files, iterating `region.items` for every region in `save.pages ?? [save]`. Those arrays already contain physical socket-child records; no child recursion was added. The sweep checked each item's properties and preserved quality IDs.

| Check | Result |
| --- | ---: |
| Physical records checked | 22,072 |
| Magic items | 4,686 |
| Properties ending in `_bytime` | 0 |
| `item_armor_bytime` properties | 0 |
| Magic/rare suffix IDs 456 or 457 | 0 |
| Property values 1038396 or 3156008 | 0 |
| `item_dmgpercent_permissinghppercent` properties | 0 |

The pinned unique/set/runeword/affix tables contain no `dmg%/missinghp%` source item. `Properties.txt` maps that property to the stat, and `ItemStatCost.txt` defines ID 487 with Save Bits 6, op 4, op param 0, base `missing_hp`, descfunc 8. Encoding metadata and recovered strings alone do not establish an actual saved roll or tooltip.

The pre-correction bytime samples and broad noise counts in historical display notes are invalid implementation evidence. STAT-006 remains blocked on a real source-backed fixture or equivalent authoritative proof. STAT-010's proven bounded rolls already shipped; its remaining missing-health damage stat stays blocked on fixture proof. Existing real-fixture display tests pass.

## Portable acceptance preparation

The acceptance preparation command creates a new disposable pack through the existing bank engine:

```sh
npm run prepare:acceptance -- --output .game-acceptance/2026-10-04
```

It stages two independent character-to-personal-stash transfers: the level-30 Amazon's Town Portal Book and a stored socketed Grand Matron Bow from `freezing-arrow.d2s`. The original character names and matching `.d2x` filenames are retained. Each scenario has its own save directory and bank transaction backups. The manifest records source/table hashes, original and prepared counts/hashes, selected tree bytes and properties, placement, and transaction evidence. `CHECKLIST.md` describes the isolated PD2/PlugY load, save, reload, and reparse checks.

Preparation is not game acceptance. The pack is ignored by Git and must be transferred separately when switching computers. Game archives, installation settings, original saves, and canonical fixtures are not modified by preparation. Use a compatible, isolated game installation and separate save paths for the two scenarios. Record observed game results and screenshots before opening the multi-item transfer gate.

The final pack was generated at `.game-acceptance/2026-10-04` on the laptop. Tome character roots changed 3 → 2 and stash roots 2,586 → 2,587; the landing page has one physical record with stack size 20. Socketed character roots changed 60 → 59 and physical records 81 → 77; stash roots changed 2,586 → 2,587 and physical records 2,586 → 2,590; the landing page has one root plus three rune children. The selected tree bytes equal the original bytes with only the supported root location fields patched. Both banks are empty, all completed transaction backups remain, and no active locks or recovery journals remain.

Independent tests verify checksum/size fields, preserved item bits and section suffixes, canonical source hashes, manifest evidence, and rejection of existing outputs, links, protected roots, and incomplete fixture inputs. The session snapshot now surfaces acceptance gates and the next milestone as well as ready/research work.
