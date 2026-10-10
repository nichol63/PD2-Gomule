import { loadItemIdentityTables } from './item-identity.mjs';
import { forEachItemCopy } from './item-copies.mjs';

const UNIQUE_QUALITY = 7;
const SET_QUALITY = 5;

const percentOf = (found, total) => (total === 0 ? 0 : Math.round((found / total) * 1000) / 10);

function labelDuplicateNames(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  for (const entry of entries) entry.label = counts.get(entry.name) > 1 ? `${entry.name} #${entry.id}` : entry.name;
  return entries;
}

function emptyOwnership() {
  return { total: 0, character: 0, stash: 0, ethereal: 0, socketed: 0 };
}

function catalogueEntry(kind, id, name, extra = {}) {
  return { key: `${kind}:${id}`, kind, id, name, available: true, ...extra, owned: emptyOwnership(), copies: [] };
}

/**
 * Builds the trackable catalogue from the same table rows that item identity
 * resolves against, so owned items and catalogue entries share keys. Uniques
 * and sets are keyed by row (names repeat, e.g. Magefist and Rainbow Facet);
 * runewords are keyed by display name because variant rows share one name.
 * Disabled unique rows are kept but marked unavailable.
 */
export function buildCollectionCatalogue(pd2Tables) {
  const tables = loadItemIdentityTables(pd2Tables);
  const baseName = code => pd2Tables.resolveItemCode(code)?.name ?? code;

  const uniques = labelDuplicateNames(tables.uniques.flatMap((row, id) => (row.index && row.code
    ? [catalogueEntry('unique', id, row.index, { baseName: baseName(row.code), available: row.enabled === '1' })]
    : [])));

  const sets = labelDuplicateNames(tables.sets.flatMap((row, id) => (row.index && row.item
    ? [catalogueEntry('set', id, row.index, { baseName: baseName(row.item), setName: row.set })]
    : [])));

  const runewords = [];
  const runewordsByName = new Map();
  for (const row of tables.runewords) {
    const name = row['Rune Name'];
    if (!name || runewordsByName.has(name)) continue;
    const entry = catalogueEntry('runeword', name, name);
    entry.label = name;
    runewordsByName.set(name, entry);
    runewords.push(entry);
  }

  return { uniques, sets, runewords };
}

function ownershipKey(item) {
  const named = item.namedItem;
  if (!named) return null;
  return named.kind === 'runeword' ? `runeword:${named.name}` : `${named.kind}:${named.id}`;
}

function addCopy(entry, copy) {
  entry.copies.push(copy);
  entry.owned.total += 1;
  entry.owned[copy.sourceKind] += 1;
  if (copy.ethereal) entry.owned.ethereal += 1;
  if (copy.socketed) entry.owned.socketed += 1;
}

function categorySummary(entries) {
  const tracked = entries.filter(entry => entry.available);
  const found = tracked.filter(entry => entry.owned.total > 0).length;
  return { total: tracked.length, found, percent: percentOf(found, tracked.length), entries: tracked };
}

function setSummaries(entries) {
  const bySet = new Map();
  for (const entry of entries) {
    if (!bySet.has(entry.setName)) bySet.set(entry.setName, []);
    bySet.get(entry.setName).push(entry);
  }
  return [...bySet].map(([name, members]) => {
    const found = members.filter(entry => entry.owned.total > 0).length;
    return { name, total: members.length, found, complete: found === members.length, entries: members };
  });
}

/**
 * Summarizes which catalogue uniques, set items and runewords appear in the
 * given parsed saves (as returned by inspectSaveFile). Every physical record is
 * counted, including socketed children such as unique jewels. Read-only:
 * saves are not modified. Mercenary and golem items are not exposed by the
 * save read model and are therefore not counted.
 */
export function summarizeCollection(saves, pd2Tables) {
  const catalogue = buildCollectionCatalogue(pd2Tables);
  const byKey = new Map([...catalogue.uniques, ...catalogue.sets, ...catalogue.runewords].map(entry => [entry.key, entry]));
  const unresolved = [];

  forEachItemCopy(saves, (item, copy) => {
    const entry = byKey.get(ownershipKey(item));
    if (entry) {
      addCopy(entry, copy);
    } else if (item.quality === UNIQUE_QUALITY || item.quality === SET_QUALITY) {
      unresolved.push({ ...copy, displayName: item.displayName, qualityLabel: item.qualityLabel,
        rowId: item.qualityData?.uniqueId ?? item.qualityData?.setId ?? null });
    }
  });

  const sets = categorySummary(catalogue.sets);
  const setGroups = setSummaries(sets.entries);
  return {
    sourceCount: saves.length,
    uniques: categorySummary(catalogue.uniques),
    sets: { ...sets, completeSets: setGroups.filter(group => group.complete).length, setCount: setGroups.length, groups: setGroups },
    runewords: categorySummary(catalogue.runewords),
    unavailableOwned: catalogue.uniques.filter(entry => !entry.available && entry.owned.total > 0),
    unresolved
  };
}
