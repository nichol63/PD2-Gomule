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

## Known Boundary Caveat

`_LOD_SharedStashSave.sss` reports `totalItems = 5040`, while the bounded page-local parsed view reports `parsedItemCount = 5039`. Page `Miscellaneous` loses one item when clamped by the next discovered page boundary. Current tests lock this as known behavior.

## Round-Trip Rule

The next milestone is serializer proof only: generate bytes from the parsed model and assert byte-for-byte equality against source regions. This must not add user-facing write/edit/transfer flows.

## Current Blocker

Dirty-file adoption is no longer the blocker. The remaining parser/provenance milestone is serializer proof: generate bytes from the parsed model and assert byte-for-byte equality against the source regions without enabling user-facing write/edit/transfer flows.

Known caveat to resolve or deliberately carry into that work:

- `_LOD_SharedStashSave.sss` still reports `5040` raw items versus `5039` bounded parsed items because page `Miscellaneous` loses one item when clamped by the next discovered page boundary.
