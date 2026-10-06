# Source-aware bank search: October 5, 2026

Bank search previously matched item names, codes and quality, but excluded source labels shown beside those items. Both real Wolf Heads matched `Wolf Head`; their visible filename `Bases.d2x` returned no matches.

The UI and CLI now use one pure metadata filter. It searches display name, base name, code, quality label (with legacy quality fallback), source filename, character name and stash page name. Matching remains case-insensitive substring matching with all whitespace-separated terms required. Blank queries return every item. Results retain stored order and original item references. IDs, hashes, retained bytes and decoded properties are excluded.

The UI imports the shared module through an explicit `/bank-search.mjs` static route, served as JavaScript with `Cache-Control: no-store`. The field now says `Name, code, quality, or source`. Existing selected IDs survive filtering when present; removed selections fall back to the first match. A filtered bank with no results says `No matching bank items`; an actually empty bank says `Bank is empty`. Empty results clear details, and obsolete detail successes or failures cannot replace the current selection. Search preserves the destination container and workspace item selection.

Six independent tests use a bank built from disposable real saves: two Wolf Heads from Bases / Reg Druid, the socketed Edge bow and the Amazon's stack-20 Town Portal Book. They prove helper/CLI/UI ID and order parity, blank queries, legacy quality metadata, immutable input/reference behavior, excluded byte access, selection and stale-response handling, and the served module/read-only HTTP paths. Five existing VM harnesses inject the actual shared helper.

Parent independently checked `Bases.d2x` and `Wolf Head Reg Druid` (two matches each), `Edge freezing-arrow` and `tbk Amazon` (one each), conflicting source terms (zero), and blank search (four). All 15 files in the retained QA bank/save/backup directory have unchanged hashes. The local module returns HTTP 200 with the expected JavaScript/no-store headers.

Validation: 48 focused tests and all 361 full-suite tests pass, with zero failures or skips. Canonical coverage remains 134 files, 19,778 roots, 22,072 physical records and zero incomplete records. All 134 canonical save hashes and ten table hashes match the preceding baseline. Independent final review is clean.

This changes metadata browsing. In-game acceptance and multi-item transfer gates remain pending.
