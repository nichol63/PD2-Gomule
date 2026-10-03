# Incomplete item record repair proof: October 3, 2026

This report tracks the 33 incomplete records at baseline commit `14b1640`. Evidence is from the unchanged canonical Library, local reference tables, and pinned historical table revisions. Bit positions below are relative to the beginning of each item, and terminator candidates mean raw nine-bit values equal to 511, not automatically valid parse boundaries.

## Verified result

All 33 original failures are resolved. Independent coverage reads 134 of 134 files, 19,778 roots, 22,072 physical records, 63,497 properties, and zero incomplete records. Seventeen trophy records use corrected current-table decoding; 16 records carry explicit historical recovery metadata (13 Deep Wounds and three maps). All 134 parsed saves reconstruct byte-for-byte to their original source buffers.

The one source-partition anomaly remains `Legacy.d2x / Season 6 Extra`, with its undeclared 22-byte key. This repair does not change that save or claim that page is transferable. Historical recoveries remain ineligible for transfers. Character-region writes and in-game acceptance remain separate gates.

## Baseline classification

| Group | Records | Observed mismatch |
| --- | ---: | --- |
| Trophy charms | 17 | The reader skipped stat 98 without consuming its eight-bit parameter and one-bit value; the packed payload was mistaken for stat IDs 465, 466, and 467. |
| Deep Wounds | 13 | Stat 501 uses the present table's 16-bit payload, then consumes part or all of the raw terminator. |
| Maps | 3 | Present table stackability adds nine core bits absent from the two normal map records; rare map properties also become misaligned. |

Every failed list is a base list. None of these 33 records has a runeword or set-list flag. Flags are `0x800010`, `0x8800010`, or `0x800810`. Thus conditional additional property lists do not explain these failures.

All 134 save files open. Baseline root count is 19,778 and physical item count is 22,072. The separately recorded undeclared 22-byte key on `Legacy.d2x / Season 6 Extra` is outside this failure set.

## Encoding proof

### State markers on trophy charms

The active `ItemStatCost.txt` defines stat 98 (`state`) with `Save Param Bits = 8` and `Save Bits = 1`. The old reader returned immediately for stat 98, advancing neither field. The correction is ordinary table-backed decoding, without a historical override.

All 17 affected charms begin their base list at relative bit 172. After maximum life 20, their stat-98 ID begins at bit 190, its parameter at 199, and its value at 207. The parameter is 209 for Dclone, 210 for Maxlevel, or 211 for Dev/Rathma; every value is 1. Their correct clout IDs are 472, 473, or 474 at bit 208, with value 1 at bit 217 and the 511 terminator at bit 220.

Rathma charms have a second stat 98 at bit 208, parameter 218 at bit 217, and value 1 at bit 225. Stat 480 (`rathma_clout`) then begins at 226, has value 1 at 235, and ends with 511 at 238. This explains the longer 31-byte records. State payloads packed as 465/466/467 are not historical stat IDs. Treating those bits as a fabricated 12-bit trophy payload would have produced incorrect values 984/985/986.

### Historical Deep Wounds width

The [pinned historical row evidence](parser-historical-row-proof.json) contains Season 7 `ItemStatCost.txt` from commit `7cf86adb4167c4302c6326ea8c1df5d6ad8126c0`, SHA256 `7e8dfedc00ae0502e5afabd11b3866ce1da1678ca7d94a9c30cbb46df409bd9c`. Its stat 501 has 11 save bits; later tables have 16. The source-backed fallback uses this known width, not a search for any width that reaches a terminator.

For example, `cold_arrow.d2s` Arrows at 3086 contain value 228 with 511 at relative bit 456. `dragon_tailc.d2s` Gorerider at 1780 contains value 151 with 511 at 398. Reading 16 bits instead fabricates 63716 and 63639 by consuming five terminator bits.

### Historical unstackable maps

Season 6 `Misc.txt` at commit `4b1f140491a69d4104b27bbdab14c44b519ff9e0`, SHA256 `7a6f0687c2ee289f3950bc0fc06ea3ceee829239a1f82a45e0812593e52b3d95`, marks `t32`, `t37`, and `t39` unstackable. The Season 7 rows mark them stackable with maximum quantity 50. Both layouts exist in the Library, so changing the active table globally would break newer records.

The normal Desert and Pandemonium maps contain their 511 terminator at bit 157 and finish at 166; reading a quantity first mistakes 511 for a stack count. The rare Throne Map at `werewolf-fury2.d2s` offset 2552 starts properties at bit 245 and ends at 515. Its real first stat is 360 (`corrupted`), not a quantity of 360. Omitting the historical absent quantity restores corruption `[0,1]`, corruptor 1032, magic/gold bonus 133, density 313, experience 32, fire mastery 11, regeneration 1972, maximum life 39, hit recovery -31, block -31, deadly strike 20, and souls 918. Its terminator begins at 506.

### Character primary-list boundary

`sorceress/multishot.d2s` has its final primary item at 5893. The real item ends at 5957, after a stat-501 value of 309, a 511 terminator at relative bit 501, and two zero padding bits. The following bytes are `JM` with count zero, `jf`, and a new `JM` list with count six. Its first item starts at 5967. The previous reader assigned the ten section-header bytes to the last primary item, producing a 74-byte span and phantom properties after Deep Wounds. The corrected item span is 64 bytes.

The reader accepts this empty-corpse/mercenary section marker only when a bounded primary parse reaches the declared root count, has no missing socket children, completes every property list, and ends at the candidate boundary with at most seven zero padding bits. The suffix stays opaque for reconstruction. This is a bounded primary-list reader correction, not support for writing corpse, mercenary, or golem regions.

## Historical recovery constraints

Current-table decoding runs first. The reader considers the 11-bit Deep Wounds candidate only when the failed item encountered stat 501 and the active definition is `deep_wounds` with 16 save bits, zero addition, and no parameter bits. The unstackable-map candidate applies only to the three table-proven map codes when the active row has maximum stack 50 and the failed decode produced a larger quantity. Current valid 16-bit rolls and stacked maps keep their existing interpretation.

A historical candidate must decode its complete property list inside the item's byte bound and leave at most seven zero padding bits. Exactly one candidate must qualify; ambiguous successful layouts retain the original failure. Recovery metadata retains the original failure, profile, historical row, full source commit, historical table SHA256, and final bit boundaries. Missing terminators and nonzero trailing bits do not qualify. No save bytes are padded or rewritten, and the historical definitions do not replace active tables.

## Regression verification

The independent test worker's focused parser-incomplete and parser-edge run passed 33 tests; both parser-coverage tests also passed. Coverage now requires exactly zero incomplete records. New real-fixture checks assert old 11-bit rolls, a current 16-bit roll, old and stacked map properties, all four trophy variants, and the final multishot primary-list boundary. A truncated old item remains incomplete. A forged section marker inside a disposable copy's mercenary item does not displace the true primary boundary, and full-buffer reconstruction remains exact. Canonical saves and reference tables were read only.

## Raw baseline trace

| File | Item offset | Code | Bytes | Base-list start | Failure cursor | Decoded IDs before failure | Raw 511 positions |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| _LOD_SharedStashSave.sss | 145189 | cm1 | 31 | 172 | 248 | 7, 467, 415 | 159, 160, 161, 162, 238 |
| _LOD_SharedStashSave.sss | 145220 | cm1 | 29 | 172 | 230 | 7, 466, 414 | 220 |
| _LOD_SharedStashSave.sss | 145249 | cm1 | 29 | 172 | 228 | 7, 465, 463 | 220 |
| _LOD_SharedStashSave.sss | 145308 | cm1 | 29 | 172 | 231 | 7, 467 (failed 127) | 220 |
| _LOD_SharedStashSave.sss | 145337 | cm1 | 29 | 172 | 228 | 7, 465, 463 | 220 |
| _LOD_SharedStashSave.sss | 145366 | cm1 | 29 | 172 | 230 | 7, 466, 414 | 220 |
| Showcase Characters/amazon/cold_arrow.d2s | 3086 | aqv | 59 | 254 | 470 | 17, 18, 19, 79, 80, 93, 135, 335, 360, 361, 501 | 456 |
| Showcase Characters/amazon/uber-stoneraven.d2s | 2833 | cm1 | 31 | 172 | 248 | 7, 467, 415 | 238 |
| Showcase Characters/assassin/dragon_tailc.d2s | 1780 | uhb | 51 | 197 | 403 | 16, 20, 73, 91, 96, 135, 136, 141, 360, 361, 501 | 398 |
| Showcase Characters/assassin/whirlwindb.d2s | 1510 | xhb | 52 | 197 | 415 | 7, 16, 73, 91, 96, 135, 136, 141, 360, 361, 501 | 401 |
| Showcase Characters/barbarian/leap_attackb.d2s | 1688 | amu | 48 | 172 | 384 | 45, 78, 89, 119, 127, 135, 198, 360, 361, 501 | 370 |
| Showcase Characters/barbarian/leap_attackb.d2s | 3112 | xhb | 52 | 197 | 415 | 7, 16, 73, 91, 96, 135, 136, 141, 360, 361, 501 | 401 |
| Showcase Characters/barbarian/uber-berserk.d2s | 1976 | cm1 | 29 | 172 | 228 | 7, 465, 463 | 220 |
| Showcase Characters/barbarian/war_cryb.d2s | 2944 | jew | 47 | 226 | 374 | 1, 17, 18, 21, 23, 135, 159, 501 | 360 |
| Showcase Characters/barbarian/werewolf-fury.d2s | 3882 | t39 | 21 | 166 | 166 |  | 157 |
| Showcase Characters/barbarian/werewolf-fury2.d2s | 2552 | t32 | 65 | 254 | 514 | 0, 144, 500, 467, 275, 476, 201, 222, 3, 476, 16, 344, 462 | 506 |
| Showcase Characters/barbarian/x2flame-whirlw.d2s | 1344 | cm1 | 31 | 172 | 248 | 7, 467, 415 | 130, 131, 132, 238 |
| Showcase Characters/druid/fury_rathma.d2s | 3674 | drb | 54 | 201 | 426 | 16, 107, 107, 119, 127, 135, 141, 188, 360, 361, 501 | 421 |
| Showcase Characters/druid/summoner-raven.d2s | 1803 | cm1 | 29 | 172 | 230 | 7, 466, 414 | 220 |
| Showcase Characters/druid/summoner-raven.d2s | 3716 | t37 | 21 | 166 | 166 |  | 157 |
| Showcase Characters/druid/wolf-fury.d2s | 1910 | cm1 | 31 | 172 | 248 | 7, 467, 415 | 238 |
| Showcase Characters/druid/wolf-fury.d2s | 1941 | cm1 | 29 | 172 | 228 | 7, 465, 463 | 220 |
| Showcase Characters/necromancer/explosn-poison.d2s | 2833 | cm1 | 31 | 172 | 248 | 7, 467, 415 | 238 |
| Showcase Characters/necromancer/poison-nova.d2s | 1936 | cm1 | 31 | 172 | 248 | 7, 467, 415 | 238 |
| Showcase Characters/necromancer/summoner-curse.d2s | 1410 | cm1 | 29 | 172 | 230 | 7, 466, 414 | 220 |
| Showcase Characters/sorceress/combustion4.d2s | 2261 | cm1 | 29 | 172 | 228 | 7, 465, 463 | 220 |
| Showcase Characters/sorceress/frost-nova3.d2s | 2589 | cm1 | 31 | 172 | 248 | 7, 467, 415 | 238 |
| Showcase Characters/sorceress/multishot.d2s | 2735 | aqv | 49 | 254 | 388 | 2, 17, 18, 93, 96, 135, 138, 501 | 383 |
| Showcase Characters/sorceress/multishot.d2s | 2784 | aqv | 49 | 254 | 387 | 2, 17, 18, 34, 62, 135, 156, 501 | 382 |
| Showcase Characters/sorceress/multishot.d2s | 3276 | aqv | 62 | 254 | 492 | 7, 17, 18, 19, 57, 58, 59, 79, 110, 135, 360, 361, 501 | 487 |
| Showcase Characters/sorceress/multishot.d2s | 4974 | aqv | 50 | 254 | 399 | 17, 18, 39, 60, 93, 110, 135, 501 | 385 |
| Showcase Characters/sorceress/multishot.d2s | 5107 | aqv | 58 | 254 | 463 | 50, 51, 60, 93, 116, 135, 138, 141, 360, 361, 501 | 449 |
| Showcase Characters/sorceress/multishot.d2s | 5893 | aqv | 74 | 254 | 589 | 39, 41, 43, 45, 48, 49, 62, 93, 96, 135, 138, 360, 361, 501, 143, 19, 336, 297 | 501 |
