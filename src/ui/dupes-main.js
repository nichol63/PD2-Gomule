import { createDupesUi } from '/dupes.js';

// Separate entry point: the duplicates panel is read-only and independent of
// the browser/bank state in app.js.
const dupesUi = createDupesUi();
document.getElementById('dupes-refresh').addEventListener('click', () => dupesUi.load());
dupesUi.load();
