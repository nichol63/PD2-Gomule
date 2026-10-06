# Optional bank startup failures: October 5, 2026

The app previously handled workspace and bank startup in one catch. A failed bank request replaced a healthy workspace grid with a failure message while leaving its selected item/details intact. Bank startup now has its own error boundary. Workspace startup failures clear current stale state; obsolete failures leave newer navigation alone.

An unavailable bank shows its own panel, disabled actions and `Bank unavailable` mode. Without a known session token, the guidance is `Unable to load the bank. Reload the page to try again.` A retained token keeps the existing library-refresh retry. Healthy workspace browsing, selection and filters remain available. Missing catalog/source/container data cannot enable deposit or withdrawal. Successful configured and unconfigured bank startup retain their existing behavior.

Six independent tests execute the actual app, bank UI and shared helpers against the real shared stash. HTTP, network and JSON bank failures preserve the page-31 Bloodraven view and its 15 matches, filtering to one item and navigation to page 118's 57 items. Further cases prove structured bank errors, known-token retry, hidden unconfigured banks, current workspace error clearing and obsolete startup catalog/view handling. The canonical shared-stash hash stays unchanged; these cases perform no writes.

All 55 related UI tests and 386 full-suite tests pass, with zero failures or skips. Independent final review is clean. Canonical coverage remains 134 files, 19,778 roots, 22,072 physical records and zero incomplete records; all save/table hashes remain unchanged.

In-game acceptance remains pending.
