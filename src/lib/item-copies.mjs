const SOCKETED_LOCATION = 6;

function describeCopy(item, save, region, itemsByOffset) {
  const parent = item.parentOffset === undefined ? null : itemsByOffset.get(item.parentOffset) ?? null;
  return {
    fileName: save.fileName,
    filePath: save.filePath,
    sourceKind: save.kind === 'character' ? 'character' : 'stash',
    characterName: save.kind === 'character' ? save.name : null,
    pageIndex: region === save ? null : region.index,
    pageName: region === save ? null : region.name,
    code: item.code,
    byteOffset: item.byteOffset,
    location: item.location,
    panel: item.panel,
    bodyPosition: item.bodyPosition,
    column: item.column,
    row: item.row,
    socketParent: parent ? { byteOffset: parent.byteOffset, displayName: parent.displayName } : null,
    ethereal: item.isEthereal === true,
    socketed: item.location === SOCKETED_LOCATION
  };
}

/**
 * Calls visit(item, copy) for every physical record in the parsed saves
 * (as returned by inspectSaveFile), socket children included. `copy` is a
 * plain description of where that record is. Mercenary and golem items are
 * not exposed by the save read model and are not visited.
 */
export function forEachItemCopy(saves, visit) {
  for (const save of saves) {
    for (const region of save.pages ?? [save]) {
      const items = region.items ?? [];
      const itemsByOffset = new Map(items.map(item => [item.byteOffset, item]));
      for (const item of items) visit(item, describeCopy(item, save, region, itemsByOffset));
    }
  }
}
