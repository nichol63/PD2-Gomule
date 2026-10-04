import { formatPropertyListForDisplay } from './property-display.mjs';

function presentItem(item, pd2Tables) {
  return {
    displayName: item.displayName,
    baseName: item.baseName ?? item.itemInfo?.name ?? item.displayName,
    code: item.code,
    qualityLabel: item.qualityLabel,
    dimensions: `${item.invWidth} x ${item.invHeight}`,
    flags: [
      item.isIdentified ? 'Identified' : null,
      item.isEthereal ? 'Ethereal' : null,
      item.isRuneword ? 'Runeword' : null,
      item.isSocketed ? 'Socketed' : null,
      item.isPersonalized ? 'Personalized' : null
    ].filter(Boolean),
    itemLevel: item.itemLevel ?? null,
    defense: item.defense ?? null,
    durability: item.maxDurability ? `${item.currentDurability}/${item.maxDurability}` : null,
    stackSize: item.stackSize ?? null,
    socketsFilled: item.socketsFilled ?? 0,
    totalSockets: item.totalSockets ?? 0,
    propertyLists: (item.propertyLists ?? []).map(list => formatPropertyListForDisplay(list, pd2Tables))
  };
}

export function buildBankItemDetails({ metadata, item }, pd2Tables) {
  const source = metadata.source;
  return {
    itemId: metadata.id,
    ...presentItem(item, pd2Tables),
    children: (item.children ?? []).map(child => presentItem(child, pd2Tables)),
    source: source ? {
      fileName: source.fileName,
      kind: source.kind,
      ...(source.characterName !== undefined ? { characterName: source.characterName } : {}),
      ...(source.panel !== undefined ? { panel: source.panel } : {}),
      ...(source.pageName !== undefined ? { pageName: source.pageName } : {}),
      ...(source.pageIndex !== undefined ? { pageIndex: source.pageIndex } : {}),
      itemIndex: source.itemIndex
    } : null,
    depositedAt: metadata.depositedAt ?? null
  };
}
