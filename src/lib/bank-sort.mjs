const fold = value => String(value ?? '').toLowerCase();

export function sortBankItems(items, sort = 'stored') {
  if (!['stored', 'name', 'source'].includes(sort)) throw new Error(`Unknown bank sort: ${sort}`);
  if (sort === 'stored') return items.slice();
  return items.map((item, index) => {
    const name = [fold(item.displayName ?? item.baseName ?? item.code), fold(item.code)];
    const keys = sort === 'source'
      ? [fold(item.source?.fileName), fold(item.source?.characterName), fold(item.source?.pageName), ...name]
      : name;
    return { item, index, keys };
  }).sort((a, b) => {
    for (let index = 0; index < a.keys.length; index += 1) {
      if (a.keys[index] < b.keys[index]) return -1;
      if (a.keys[index] > b.keys[index]) return 1;
    }
    return a.index - b.index;
  }).map(entry => entry.item);
}
