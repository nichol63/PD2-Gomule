# Stable refreshed source identity: October 4, 2026

Discovery changes previously reassigned indexed source IDs during service refresh. In a disposable A/alias-B/C workspace, retargeting alias B to A deduplicated the list and changed surviving C from source 3 to source 2. The browser and bank destination then fell back to A despite C remaining loaded.

The service now binds IDs to exact requested file paths for its lifetime. Removed paths reserve their IDs for reappearance; newly discovered paths receive unused IDs. Standalone workspace loading retains its existing indexed IDs. Alias paths are not rewritten to real paths. A complete reload succeeds before the registry, workspace or preview tickets change.

Seven independent tests use copied Bases, Legacy and shared-stash saves, real alias/directory discovery and the shipped app/bank UI. They prove C's source ID, selected item and page 118 remain, along with the bank's destination and container index 117. Restored aliases regain their original ID. Newly discovered child paths cannot reuse missing-path IDs. Removed selections fall back safely and failed refreshes preserve the previous valid workspace and UI state. Existing preview invalidation and changed-save/linked-target guards remain.

Parent independently observed IDs 1/2/3 → 1/3 → 1/2/3 and selected shared-stash page index 117, without creating a bank or changing saves. All 61 focused and 355 full-suite tests pass; independent review is clean. Final corpus coverage remains 134 files, 19,778 roots, 22,072 physical records and zero incomplete records. All 134 canonical save hashes and ten table hashes match the baseline.

In-game acceptance and multi-item transfer gates remain pending.
