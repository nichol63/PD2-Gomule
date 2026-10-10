import { forEachItemCopy } from './item-copies.mjs';

function isFullyDecoded(item) {
  return !item.coreParseError && !item.propertyParseError && item.propertiesComplete !== false
    && (item.propertyLists ?? []).every(list => list.complete !== false && !list.error)
    // Missing socket records would hide differences (holds for every canonical root).
    && (item.children?.length ?? 0) === (item.socketsFilled ?? 0)
    && (item.children ?? []).every(isFullyDecoded);
}

// Compares decoded content rather than raw bytes: raw records also encode
// each copy's grid position, so true copies never match byte for byte.
function contentParts(item) {
  return [
    item.code, item.quality, item.isEthereal === true, item.isRuneword === true, item.fingerprint ?? null,
    (item.propertyLists ?? []).map(list => [list.kind, (list.properties ?? []).map(property => [property.statId, property.values])]),
    (item.children ?? []).map(contentParts)
  ];
}

// Null when undecoded data could hide a difference; such copies never count as identical.
function contentSignature(item) {
  return isFullyDecoded(item) ? JSON.stringify(contentParts(item)) : null;
}

/**
 * Groups non-simple item records across the parsed saves that share a
 * fingerprint (the item's random seed), which is how GoMule detected dupes.
 * Read-only. A shared fingerprint is evidence, not proof: save editors and
 * cloned characters also produce it. `identical` marks groups whose copies
 * also share code, quality, ethereal state, decoded properties and socket
 * contents (compared recursively). Copies with incompletely decoded data are
 * never called identical. Simple items (runes, gems, potions) have no
 * fingerprint.
 */
export function findSharedFingerprints(saves) {
  const byFingerprint = new Map();
  let scanned = 0;
  let simple = 0;

  forEachItemCopy(saves, (item, copy) => {
    scanned += 1;
    if (item.isSimple || !Number.isInteger(item.fingerprint)) {
      simple += 1;
      return;
    }
    if (!byFingerprint.has(item.fingerprint)) byFingerprint.set(item.fingerprint, []);
    byFingerprint.get(item.fingerprint).push({ ...copy, displayName: item.displayName, signature: contentSignature(item) });
  });

  const groups = [...byFingerprint]
    .filter(([, copies]) => copies.length > 1)
    .map(([fingerprint, copies]) => ({
      fingerprint,
      displayNames: [...new Set(copies.map(copy => copy.displayName))],
      identical: copies.every(copy => copy.signature !== null) && new Set(copies.map(copy => copy.signature)).size === 1,
      incompleteCopies: copies.filter(copy => copy.signature === null).length,
      copies: copies.map(({ signature, ...copy }) => copy)
    }))
    .sort((left, right) => right.copies.length - left.copies.length || left.fingerprint - right.fingerprint);

  return {
    sourceCount: saves.length,
    scannedRecords: scanned,
    simpleRecords: simple,
    groupCount: groups.length,
    identicalGroupCount: groups.filter(group => group.identical).length,
    sharedRecordCount: groups.reduce((sum, group) => sum + group.copies.length, 0),
    groups
  };
}
