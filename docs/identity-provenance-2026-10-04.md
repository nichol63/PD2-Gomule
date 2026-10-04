# Lazy naming-table provenance: October 4, 2026

Bank transfers and acceptance tooling now require both core and naming-cache provenance to remain current. Cached read-only names remain a snapshot; explicit operations require a reload after their source tables change.

## Real item evidence

The canonical `freezing-arrow.d2s` contains the socketed Grand Matron Bow with fingerprint 70879556, named `Edge`. On independent copied tables, changing its `Runes.txt` recipe name to `Edge Test Rename` leaves the old read-only cache displaying `Edge`; a fresh load displays the new name. Before this batch, depositing through the old object succeeded and persisted the old label. Stale preview and commit now fail before locks, backups, or save/bank changes. A fresh load deposits with the new label.

## Captured sources and compatibility

The lazy cache captures SHA256 from the same buffers decoded for `armor.txt`, `weapons.txt`, `Misc.txt`, `UniqueItems.txt`, `SetItems.txt`, `Runes.txt`, and `ItemTypes.txt`. Missing optional sources are recorded with a null hash. Frozen evidence is private to each proven loaded table object and binds its original directory and resolved file targets. The provenance getter exposes the historical snapshot; the explicit freshness guard checks current contents, existence, and targets.

At first cache construction, reread core item-table buffers must match the hashes captured by `loadPd2Tables()`. A different read cannot supply new family rows to old item maps, even if disk contents are restored before a later check. Unproven mock/clone objects retain existing read-only fallback behavior but cannot authorize guarded operations.

Core loading still does not require optional naming files. Six-core-file directories can use base-name fallbacks and bounded transfers. If an absent optional file appears, or a present file changes, disappears, or points elsewhere, cached guarded operations require an explicit reload. Caches and reviewed tickets are never silently reinterpreted.

The persisted four-file bank fingerprint and schema version are unchanged. Existing schema-version-1 bank entries remain usable with a fresh compatible table load. Their stored labels remain historical metadata; this batch prevents newly reviewed operations from using a stale active naming cache.

## Operation boundaries and verification

The combined guard runs at existing bank, acceptance preparation, and acceptance verification boundaries, including before locks/output creation and immediately before save replacement after durable journal preparation. Late rejection preserves journal/backups for the existing recovery path. The game acceptance gate and power-loss durability limitations are unchanged.

Ten independent real-fixture tests cover captured optional buffers, mixed first core reads, stale/fresh Edge labels, all optional file changes/deletions, absent-file appearance, identical-byte target retargeting, read-only clones, old bank withdrawal, acceptance callers, and late journal recovery. Forty-two focused tests pass. The mixed-read regression directly intercepts the identity decoder and retries the same object after rejection; an isolated in-memory mutation confirms it fails when that comparison is removed. The full reviewed suite has 288 passing tests, zero failures/skips. Canonical table and save hashes remain unchanged.
