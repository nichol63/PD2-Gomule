# Parser Provenance Notes

The parser remains read-only. Provenance work is about proving byte coverage, not enabling writes.

## Shipped Provenance Shape

- Parsed items expose `byteOffset`, `nextOffset`, and `sourceSpan`.
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

At the time the autopilot queue was created, these parser/provenance files were already dirty:

- `src/lib/save-parsers.mjs`
- `test/parser-edge.test.mjs`

Treat them as owned by another in-progress batch unless the user says otherwise.
