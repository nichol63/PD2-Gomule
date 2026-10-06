// Search persisted labels and provenance only; retained item bytes are never
// decoded or inspected by this shared browser/CLI filter.
export function filterBankItems(items, query = '') {
  const terms = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items.slice();
  return items.filter(item => {
    const text = [
      item.displayName, item.baseName, item.code, item.qualityLabel ?? item.quality,
      item.source?.fileName, item.source?.characterName, item.source?.pageName
    ].join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  });
}
