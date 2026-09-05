# Deep Wounds and Eaglehorn proof

Verified 2026-09-05. Product changes are presentation-only; active parser metadata and save files remain unchanged.

## Deep Wounds

The installed `Diablo II/ProjectD2/pd2data.mpq`, entry `data/local/lng/eng/patchstring.tbl`, contains `OpenWoundsItem = Open Wounds Damage Per Second`. The complete archived `deep_wounds` ItemStatCost row matches the active reference row, including Save Bits 16, Save Add 0, descfunc 1, descval 1. GoMule `D2Prop.java` case 1 establishes signed number followed by the label.

The canonical shared stash `Bows 2,3` Blade Bow (`8hb`, unique ID 189, row 3, column 0) has complete properties with `deep_wounds=[50]` and `item_openwounds=[30]`. Expected lines are `+50 Open Wounds Damage Per Second` and the unchanged `Open Wounds +30%`. This distinguishes damage per second from chance to inflict Open Wounds.

## Eaglehorn

The [permanent November 2024 Bows revision](https://wiki.projectdiablo2.com/w/index.php?title=Bows&oldid=18870#Eaglehorn) documents exactly: `Your Ravens deal an additional 500 Cold Damage`. Revisions 14894, 16547, and 17984 also carry this sentence. [Revision 19501](https://wiki.projectdiablo2.com/w/index.php?title=Bows&oldid=19501#Eaglehorn) changes the value to 1250. This is historical wiki text evidence, not an in-game tooltip screenshot.

The explicit presentation rule supports only a single saved value `[500]`, as present on the clean shared-stash Crusader Bow (`6l7`) on `Bows 2,3`. It uses the documented historical sentence exactly. Other values and shapes retain the generic fallback; do not substitute a current-season value for saved data.

The installed archive contains `EaglehornRaven = Your Ravens Deal` and `ColdDamage = Cold Damage`. These fragments alone are insufficient to prove the full sentence. Archived versus active `eaglehorn_raven` rows differ only in display fields: descfunc 6 versus 3, descval 2 versus 0, and descstr2 `ColdDamage` versus empty. Parser encoding fields agree. The reference Java case 6 orders these fragments differently from the historical wiki sentence, so this implementation explicitly uses wiki wording and does not claim a byte-exact recreation of the game's tooltip. Parser metadata is preserved.

## Reproducible archive evidence

`mpq-string-proof.json` records archive hashes, table hashes, offsets, exact strings, and both relevant archived ItemStatCost rows. Installed and Live `pd2data.mpq` copies have SHA256 `D96CBBA912D67181DAA8906B95EC63FA2BDF017B48E85326CF33DDDFDF2B208B`; their extracted patchstring table has SHA256 `5163E7158CEE79E0939B3CCAAA7EC0D8ABA7591E888E6E56444EB838DBDD962B`.

Run `scripts/mpq-string-proof.ps1` with 32-bit Windows PowerShell (`C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/mpq-string-proof.ps1`) because the installed StormLib is x86. The execution-policy option applies only to this process and is required by this workspace's script policy. It reads archives with `MPQ_OPEN_READ_ONLY`, cross-checks TBL hash entries against null-delimited strings, and verifies archive hashes before and after. It writes only the evidence JSON in this repository. It requires this workspace's installed game archives and StormLib.

The [pinned official launcher configuration](https://github.com/Project-Diablo-2/PD2Launcher/blob/48e8cb3b9a218618403b532d88b7f0221cd132f2/PD2Shared/Models/FileUpdateModel.cs) identifies the [official asset metadata](https://pd2-client-files.projectdiablo2.com/metadata.json). Installed `pd2data.mpq` differs from the current official asset. Its release version is not asserted; archive hashes and matching local rows establish the provenance used here. CDN upload dates are not season evidence.

## Newly available follow-up evidence

The same archive supplies the previously missing Blood Warp and scaling helper strings, captured in the JSON. STAT-009 and STAT-010 should now proceed to row/version comparison and fixture-backed formatting design, rather than repeating loose-table searches. No Blood Warp or scaling formatter changes are included here. STAT-006 still needs clean bytime source/fixture proof.
