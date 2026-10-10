import { createCollectionUi } from '/collection.js';

// Separate entry point: the collection panel is read-only and independent of
// the browser/bank state in app.js.
const collectionUi = createCollectionUi();
document.getElementById('collection-refresh').addEventListener('click', () => collectionUi.load());
collectionUi.load();
