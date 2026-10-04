# Loaded table provenance: October 4, 2026

Single-item transfers and acceptance preparation/comparison now reject stale loaded PD2 core tables. The table fingerprint stored in an existing bank keeps its schema and exact four-file hash representation.

## Reproduction and correction

An independent copy of `Bases.d2x` selects the Diadem (`ci3`) on page index 1, item index 0. Loading copied tables gives width 2. Editing only the copied `armor.txt` row to width 3 previously allowed a deposit with width 2 while stamping the bank entry with the changed disk profile. The corrected preview and explicit commit both reject that stale object with a reload error, before acquiring locks or creating metadata. The save stays byte-identical and no bank is created. A fresh load reads width 3.

`loadPd2Tables()` captures SHA256 from the same buffers it parses for `armor.txt`, `weapons.txt`, `Misc.txt`, `ItemStatCost.txt`, `Skills.txt`, and `MonStats.txt`. Immutable records are held privately against the returned object. The freshness check binds the original requested directory, resolved directory/file targets, and hashes. Reassigned directories, changed symlink targets, missing files, and changed bytes require an explicit reload. Shape-compatible table clones remain usable by read-only inspection but cannot authorize transfers or acceptance evidence.

Bank fingerprints still hash the exact existing JSON sequence of `{file, sha256}` entries for `ItemStatCost.txt`, `Misc.txt`, `armor.txt`, and `weapons.txt`. Unchanged schema-version-1 banks remain usable, including with freshly loaded identical tables at a different location. No migration is required. A preview does not silently reload its interpretation when committing.

## Mutation and evidence boundaries

Bank operations check freshness before locks, after planning, at transaction entry, before journal publication, and immediately before replacing the save. If a change is discovered after a durable journal exists, the save and bank remain unchanged and the journal/backups remain available to existing recovery. Recovery uses retained byte snapshots and does not require the changed tables to match. Directory and power-loss durability remain unverified.

Acceptance preparation checks freshness before creating output and before publishing its manifest. Acceptance verification checks before comparisons and before returning a report. Neither operation infers actual game acceptance.

Eight independent real-fixture tests cover actual loaded-buffer hashing, immutable/private provenance, stale core files, mutable paths and symlinks, read-only clones, old bank compatibility, browser preview/commit staleness, acceptance callers, and post-journal rejection/recovery. Forty focused tests and the full 253-test suite pass, with zero failures or skips. Canonical fixture and table hashes remain unchanged.

The optional identity tables (`UniqueItems.txt`, `SetItems.txt`, `Runes.txt`, `ItemTypes.txt`) use a separate lazy naming cache. This batch pins the six core files only; optional naming-cache provenance is recorded as IDENTITY-002 research. Multi-item transfers still require actual game acceptance.
