# Parser Provenance Notes

The parser remains read-only. Provenance work is about proving byte coverage, not enabling writes.

## Shipped Provenance Shape

- Parsed items expose `byteOffset`, `nextOffset`, and `sourceSpan`.
- Parsed items now also expose `qualityData`: base `qualityId` / `qualityLabel`, magic `magicPrefixId` / `magicSuffixId`, set `setId`, unique `uniqueId`, rare/crafted `rareNameId1` / `rareNameId2` with `rarePrefixIds` / `rareSuffixIds`, superior `superiorTypeId`, and low-quality `lowQualityTypeId` when present.
- Character summaries expose `itemRegion`.
- Stash pages expose `pageRegion`, `itemRegion`, and `clampedItemCount`.
- Helpers:
  - `sliceBufferBySourceSpan(buffer, sourceSpan)`
  - `validateItemSourcePartition(buffer, region, items)`
  - `reconstructBoundedItemRegion(buffer, region, items)`
  - `reconstructStashPageRegion(buffer, page)`
  - `reconstructParsedSaveBuffer(buffer, parsedSave)`

## Known Boundary Caveat

`_LOD_SharedStashSave.sss` reports `totalItems = 5040`, while the bounded page-local parsed view reports `parsedItemCount = 5039`. Page `Miscellaneous` loses one item when clamped by the next discovered page boundary. Current tests lock this as known behavior.

## Round-Trip Rule

The bounded round-trip proof milestone is now shipped: generate bytes from source-backed parsed regions and assert byte-for-byte equality against the original file without adding any user-facing write/edit/transfer flows.

Current proof coverage:

- `Legacy.d2s` full buffer round-trips exactly from bounded parser spans.
- `Bases.d2x`, `Legacy.d2x`, and `_LOD_SharedStashSave.sss` full buffers round-trip exactly from page-region reconstruction.
- `_LOD_SharedStashSave.sss / Miscellaneous` keeps the known raw-count anomaly (`147` raw vs `146` bounded visible items, `clampedItemCount = 1`) while still matching the original page bytes exactly.

## Current Blocker

There is no remaining blocker for the bounded read-only proof layer. The next unsolved parser/provenance problem is a different scope: a field-backed serializer that can re-encode parsed items from model fields alone. That future work is still blocked because the current parsed model intentionally drops some raw binary distinctions.

Known caveat still carried by the current proof layer:

- `_LOD_SharedStashSave.sss` still reports `5040` raw items versus `5039` bounded parsed items because page `Miscellaneous` loses one item when clamped by the next discovered page boundary. The shipped proof preserves the original header bytes and proves bounded page/file byte equality anyway.
