# Bank navigation and lock discovery: October 4, 2026

Refreshing the library previously reset the selected withdrawal container even when its destination remained selected. Shared-stash page index 117 became 0; a character's personal stash became inventory. The UI now preserves a valid numeric page/container when destination ID, file path and kind match. Changed destinations, missing pages and reused source IDs fall back to the first valid container. Refresh, bank reload and post-commit navigation use the same rule.

Seven independent tests execute the actual app and bank UI with real shared-stash/Legacy catalogs. They cover repeated Amazon page labels, character containers, in-flight choices, commit reloads, removed sources/pages and file/kind changes. Parent independently reproduced page 117 and character stash retention after refresh.

## Process-interruption recovery

Sorted lock acquisition could create a save lock before the bank discovery lock. Exiting before the second acquisition left an orphan that bank recovery could not find. Acquisition now takes the bank lock first, then the save lock. Reverse release and stale-lock cleanup remove the save lock before the bank association disappears.

Six independent child-process tests stop after actual durable acquisition and unlink boundaries in both lexical path orders. Preview remains read-only; committed recovery clears valid stale locks and a subsequent deposit succeeds. Early save/bank bytes remain unchanged. Existing active-owner, expected-hash and linked-metadata guards refuse unsafe cleanup. Parent independently checked exits before each acquisition and successful recovery on disposable Bases copies.

Historical save-only locks without a bank lock or journal remain undiscoverable by bank path alone and are left untouched. Explicit-source recovery is queued separately. This evidence covers process interruption; power-loss durability and in-game acceptance remain unverified.

The 13 new tests, 62 focused tests and full 328-test suite pass. Independent review is clean; canonical fixture hashes are unchanged.
