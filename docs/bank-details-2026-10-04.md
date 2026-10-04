# Read-only bank item details: October 4, 2026

Selecting a bank item now displays its actual decoded properties, base name, relevant defense/durability/stack fields, socket children and deposit source. Two identical dropdown labels can be distinguished by their saved rolls. Inspection is available with `--bank` without enabling experimental writes.

`inspectBankItem` reads the retained tree directly. It validates bank checksums, current loaded table provenance, the compatible existing four-file table fingerprint, exactly one root, physical node counts, contiguous decoded byte boundaries, supported complete profiles and ordered socket children. A declared socket capacity below the filled count is rejected even when the parser normalizes its display. Pending transactions or operation locks refuse inspection. No save wrapper, temporary file, transfer preview, lock or write is created.

The separate bank detail model uses the existing property formatter. Names, dimensions and properties come from decoded bytes; persisted metadata supplies the bank ID, source and deposit date. The configured-bank-only `GET /api/bank/item?itemId=<id>` returns safe presentation data. Browser requests cannot choose a file path. Existing loopback host/origin restrictions remain.

The UI clears old details immediately on selection, filtering and reload. Only the latest request for the still-selected bank ID may render success or failure. Bank selection remains independent of the browser's deposit selection and destination controls.

## Fixture evidence

- Disposable `Bases.d2x`, page index 12: Wolf Head fingerprint 491820749 displays `+2 to Oak Sage` and `+2 to Summon Spirit Wolf`; fingerprint 2598800324 displays `+2 to Hunger`.
- Town Portal Book fingerprint 28610618 retains stack 20.
- Edge Grand Matron Bow fingerprint 70879556 displays its saved base/runeword properties and ordered Tir, Tal and Amn children.

Parent checks decoded all four items independently and observed the shipped interface in Safari, including clearing details when filters exclude every bank item. Fifteen disposable QA files remained byte-identical. Nine backend/API and seven actual-UI tests cover valid fixtures, forged summary metadata, rehashed malformed trees, stale tables, pending recovery, request ordering/errors, escaping and existing transfer controls. Independent review is clean. Canonical coverage remains 134 files, 19,778 roots, 22,072 physical records and zero incomplete records; all 134 save and ten table hashes match the baseline.

Full suite on the final reviewed implementation: 315 passing, zero failures or skips. This adds read-only inspection. Actual PD2/PlugY game acceptance remains pending.
