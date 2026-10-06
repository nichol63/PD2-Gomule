# Page match counts: October 5, 2026

Page listings now count all filtered matches before limiting displayed rows, consistent with item/search summaries. Previously the real shared stash's two Amazon pages were reported as one match when `--limit 1` was used.

Six read-only checks against `_LOD_SharedStashSave.sss` prove total matches/displayed rows: Amazon with limit 1 is 2/1; Amazon unlimited and default are 2/2; an unmatched query is 0/0; blank/default listing is 144/25; unlimited listing is 144/144. All commands exit successfully and the fixture hash is unchanged.

Only the count calculation changed. Page filtering, ordering, row contents and limiting remain the same. Independent review is clean. The full 380-test suite also passes on the current code.
