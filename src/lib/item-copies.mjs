const SOCKETED_LOCATION = 6;

// Mercenary gear is owned and retrievable; iron golem items are consumed, so
// they stay visible in the parsed save but are not reported as copies.
const REPORTED_AUXILIARY_REGIONS = new Set(['mercenary']);

function describeCopy(item, save, region, itemsByOffset, section) {
  const parent = item.parentOffset === undefined ? null : itemsByOffset.get(item.parentOffset) ?? null;
  return {
    fileName: save.fileName,
    section,
    filePath: save.filePath,
    sourceKind: save.kind === 'character' ? 'character' : 'stash',
    characterName: save.kind === 'character' ? save.name : null,
    pageIndex: save.pages ? region.index : null,
    pageName: save.pages ? region.name : null,
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
 * (as returned by inspectSaveFile), socket children included: stash pages,
 * a character's primary items, and its mercenary's equipment (section
 * "mercenary"). `copy` is a plain description of where that record is.
 */
export function forEachItemCopy(saves, visit) {
  for (const save of saves) {
    const auxiliary = (save.auxiliaryRegions ?? []).filter(region => REPORTED_AUXILIARY_REGIONS.has(region.id));
    const regions = [...(save.pages ?? [save]).map(region => [region, null]), ...auxiliary.map(region => [region, region.id])];
    for (const [region, section] of regions) {
      const items = region.items ?? [];
      const itemsByOffset = new Map(items.map(item => [item.byteOffset, item]));
      for (const item of items) visit(item, describeCopy(item, save, region, itemsByOffset, section));
    }
  }
}
