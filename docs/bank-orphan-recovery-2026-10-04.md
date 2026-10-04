# Explicit historical orphan recovery: October 4, 2026

Older lock acquisition could leave a save-only lock with no bank journal or source association. The CLI now accepts an explicit disposable save path:

```sh
node src/cli.mjs bank recover --bank <bank.json> --source <copy.d2x>
```

This previews by default. Add `--experimental-write` to perform the proposed cleanup; `--dry-run` takes precedence. Existing bank-only recovery remains compatible and does not search for orphan saves.

The selected file must be an existing independent regular save outside protected directories. Its stale lock must record exactly the selected resolved bank and save paths. Active owners, linked targets/metadata, conflicting discovered sources and changed snapshots are refused. Lock-only cleanup preserves bank/save bytes.

A durable bank/source claim is established before removing orphan metadata. This also handles an unassociated stale bank lock. Under that claim, bank/save bytes, journal state and lock ownership are rechecked. Only the unchanged owned claim may be released after an ordinary error. Interrupted claim, cleanup and reassociation remain discoverable through ordinary bank recovery.

The service API accepts an optional loaded `sourceId` for explicit recovery. Browser path parameters never select files. Preview tickets pin bank/save/lock hashes and retain the existing experimental-write requirement. The current recovery button retains its existing behavior; the explicit CLI provides the user-facing orphan selection.

## Validation

Eleven backend, six service and three CLI tests use disposable character/personal/shared-stash copies. They cover exact ownership, protected/foreign/missing/linked paths, active owners, mutation and competing claims, hash-pinned tickets, source conflicts and deterministic process interruptions. Review found and corrected an ownership bypass for unassociated stale bank locks; its regression is included. A same-token claim-byte mutation is also rejected without deleting the changed claim.

Parent independently exercised default preview, forced dry-run and authorized CLI cleanup on a copied Bases stash. Previews retained the orphan; cleanup removed only its lock. No bank file was created and save bytes remained identical. All 348 full-suite tests pass; independent review is clean; canonical Bases/Legacy/shared hashes remain unchanged.

This proves bounded process-interruption behavior. Power-loss durability and actual game acceptance remain unverified.
