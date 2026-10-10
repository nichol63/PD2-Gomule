// Pure presentation helpers for the collection report. Served unchanged to the
// browser (see inspector-server.mjs), so this module must not import anything.

export const COLLECTION_CATEGORIES = Object.freeze([
  { id: 'uniques', label: 'Uniques' },
  { id: 'sets', label: 'Set items' },
  { id: 'runewords', label: 'Runewords' }
]);

const SHOW_FILTERS = new Set(['missing', 'owned', 'all']);
// Saved item location codes and equipment body positions (checked against
// freezing-arrow.d2s equipment). Kept here because this module is import-free.
const LOCATION_STORED = 0;
const LOCATION_EQUIPPED = 1;
const LOCATION_BELT = 2;
const LOCATION_SOCKETED = 6;
const STORED_PANELS = { 1: 'inventory', 4: 'cube', 5: 'stash' };
const BODY_POSITIONS = { 1: 'head', 2: 'amulet', 3: 'body armor', 4: 'right hand', 5: 'left hand', 6: 'right ring',
  7: 'left ring', 8: 'belt', 9: 'boots', 10: 'gloves', 11: 'switch right hand', 12: 'switch left hand' };

/** Returns one progress line per category, plus the complete-set count. */
export function collectionProgress(report) {
  return COLLECTION_CATEGORIES.map(({ id, label }) => {
    const category = report[id];
    const progress = { id, label, found: category.found, total: category.total, percent: category.percent };
    return id === 'sets' ? { ...progress, completeSets: category.completeSets, setCount: category.setCount } : progress;
  });
}

function matchesQuery(entry, tokens) {
  const text = [entry.label, entry.baseName, entry.setName].filter(Boolean).join(' ').toLowerCase();
  return tokens.every(token => text.includes(token));
}

/**
 * Selects catalogue entries for one category. `show` is missing, owned or all;
 * every space-separated query term must match the name, base or set name.
 */
export function collectionRows(report, { category = 'uniques', show = 'missing', query = '' } = {}) {
  const source = report[category];
  if (!source) throw new Error(`Unknown collection category: ${category}`);
  if (!SHOW_FILTERS.has(show)) throw new Error(`Unknown collection filter: ${show}`);
  const tokens = `${query}`.toLowerCase().split(/\s+/).filter(Boolean);
  return source.entries.filter(entry => {
    const owned = entry.owned.total > 0;
    return (show === 'all' || (show === 'owned') === owned) && matchesQuery(entry, tokens);
  });
}

function describePosition(copy) {
  if (copy.location === LOCATION_SOCKETED && copy.socketParent) return `socketed in ${copy.socketParent.displayName}`;
  if (copy.location === LOCATION_EQUIPPED && BODY_POSITIONS[copy.bodyPosition]) return `equipped: ${BODY_POSITIONS[copy.bodyPosition]}`;
  if (copy.location === LOCATION_BELT) return `belt slot ${copy.column + 1}`;
  const panel = copy.sourceKind === 'character' ? STORED_PANELS[copy.panel] : null;
  if (copy.location === LOCATION_STORED && Number.isInteger(copy.column) && Number.isInteger(copy.row)) {
    return `${panel ? `${panel} ` : ''}column ${copy.column}, row ${copy.row}`;
  }
  return `byte offset ${copy.byteOffset}`;
}

/** Describes where one owned copy is, precisely enough to find it in game. */
export function describeCopyLocation(copy) {
  const source = copy.sourceKind === 'character'
    ? `${copy.fileName} (${copy.characterName})`
    : `${copy.fileName}, page ${copy.pageIndex + 1}: ${copy.pageName}`;
  const details = [describePosition(copy), copy.ethereal ? 'ethereal' : null].filter(Boolean);
  return `${source} - ${details.join(', ')}`;
}
