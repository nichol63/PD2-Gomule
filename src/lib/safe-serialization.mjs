import { createHash } from 'node:crypto';
import { parseLegacyItemList } from './legacy-item-parser.mjs';
import { loadPd2Tables } from './pd2-data.mjs';

export const TRANSFER_STATUS = 'experimental; in-game validation required';
// Official PD2 Inventory.txt, Big Bank Page 1/2: gridX=10, gridY=15.
export const STASH_GRID = Object.freeze({ columns: 10, rows: 15 });
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
}

function assertNode(node, endOffset) {
  if (!node.itemInfo || node.isEar || !node.propertiesComplete) throw new Error('Item has unsupported or incomplete data');
  if (![100, 101].includes(node.version)) throw new Error('Unsupported item version');
  if (!Number.isInteger(node.coreBitLength) || Math.ceil(node.coreBitLength / 8) !== endOffset - node.byteOffset) {
    throw new Error('Item boundary is not proven by its decoded bit length');
  }
  if ((node.children?.length ?? 0) !== (node.socketsFilled ?? 0)) throw new Error('Socket child count is uncertain');
  if (node.children?.length && (!(node.flags & 0x800) || node.totalSockets < node.children.length)) throw new Error('Socket flags or capacity are inconsistent');
}

function validatePage(buffer, save, pageIndex) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer');
  if (typeof save.sourceSha256 !== 'string' || save.sourceSha256 !== sha256(buffer)) throw new Error('Parsed save does not match source bytes');
  if (!['plugy-personal-stash', 'plugy-shared-stash'].includes(save.kind)) throw new Error('Only PlugY stash transfers are supported');
  if (!['01', '02'].includes(save.version)) throw new Error('Unsupported stash version');
  integer(pageIndex, 0, save.pages.length - 1, 'pageIndex');
  const page = save.pages[pageIndex];
  const start = page.itemRegion.startOffset;
  const end = page.itemRegion.endOffset;
  integer(start, 4, buffer.length, 'item region start');
  integer(end, start, buffer.length, 'item region end');
  if (buffer.toString('ascii', 0, 4) !== save.signature || buffer.toString('ascii', start - 4, start - 2) !== 'JM') {
    throw new Error('Stash metadata does not match source bytes');
  }
  if (page.clampedItemCount || page.itemCount !== page.topLevelItems.length || buffer.readUInt16LE(start - 2) !== page.topLevelItems.length) {
    throw new Error('Stash page item count is uncertain');
  }
  let cursor = start;
  for (let index = 0; index < page.items.length; index += 1) {
    const item = page.items[index];
    const itemEnd = page.items[index + 1]?.byteOffset ?? end;
    if (item.byteOffset !== cursor || item.sourceSpan?.endOffset !== itemEnd) throw new Error('Stash item spans are not contiguous');
    assertNode(item, itemEnd);
    cursor = itemEnd;
  }
  if (cursor !== end) throw new Error('Stash page contains unparsed bytes');
  const occupied = new Set();
  for (const item of page.topLevelItems) {
    if (item.location !== 0 || item.panel !== 5) throw new Error('Existing stash placement is uncertain');
    integer(item.invWidth, 1, STASH_GRID.columns, 'item width');
    integer(item.invHeight, 1, STASH_GRID.rows, 'item height');
    integer(item.column, 0, STASH_GRID.columns - item.invWidth, 'item column');
    integer(item.row, 0, STASH_GRID.rows - item.invHeight, 'item row');
    for (let x = item.column; x < item.column + item.invWidth; x += 1) {
      for (let y = item.row; y < item.row + item.invHeight; y += 1) {
        const cell = `${x},${y}`;
        if (occupied.has(cell)) throw new Error('Existing stash items overlap');
        occupied.add(cell);
      }
    }
  }
  return page;
}

export function inspectTransferSupport(buffer, parsedSave) {
  return (parsedSave.pages ?? []).map((page, pageIndex) => {
    try {
      validatePage(buffer, parsedSave, pageIndex);
      return { pageIndex, name: page.name, supported: true, status: TRANSFER_STATUS };
    } catch (error) {
      return { pageIndex, name: page.name, supported: false, reason: error.message };
    }
  });
}

export function extractStashItem(buffer, parsedSave, { pageIndex, itemIndex }) {
  const page = validatePage(buffer, parsedSave, pageIndex);
  const roots = page.topLevelItems;
  integer(itemIndex, 0, roots.length - 1, 'itemIndex');
  const item = roots[itemIndex];
  const start = item.byteOffset;
  const end = roots[itemIndex + 1]?.byteOffset ?? page.itemRegion.endOffset;
  const bytes = Buffer.from(buffer.subarray(start, end));
  return { bytes, sha256: sha256(bytes), item, startOffset: start, endOffset: end, nodeCount: 1 + item.children.length };
}

export function removeStashItem(buffer, parsedSave, selection) {
  const extracted = extractStashItem(buffer, parsedSave, selection);
  const page = parsedSave.pages[selection.pageIndex];
  const bytes = Buffer.concat([buffer.subarray(0, extracted.startOffset), buffer.subarray(extracted.endOffset)]);
  bytes.writeUInt16LE(page.itemCount - 1, page.itemRegion.startOffset - 2);
  return { buffer: bytes, extracted, beforeSha256: sha256(buffer), afterSha256: sha256(bytes) };
}

function writeBits(buffer, bitOffset, width, value) {
  integer(value, 0, 2 ** width - 1, 'location value');
  for (let index = 0; index < width; index += 1) {
    const absolute = bitOffset + index;
    const mask = 1 << (absolute % 8);
    const byte = Math.floor(absolute / 8);
    buffer[byte] = (buffer[byte] & ~mask) | (((value >>> index) & 1) ? mask : 0);
  }
}

export function patchItemLocation(itemBytes, { column, row }) {
  if (!Buffer.isBuffer(itemBytes) || itemBytes.length < 14 || itemBytes.toString('ascii', 0, 2) !== 'JM') throw new Error('Invalid item bytes');
  integer(column, 0, STASH_GRID.columns - 1, 'column');
  integer(row, 0, STASH_GRID.rows - 1, 'row');
  const result = Buffer.from(itemBytes);
  writeBits(result, 58, 3, 0);
  writeBits(result, 61, 4, 0);
  writeBits(result, 65, 4, column);
  writeBits(result, 69, 4, row);
  writeBits(result, 73, 3, 5);
  return result;
}

export function insertStashItem(buffer, parsedSave, { pageIndex, itemBytes, nodeCount = 1, column, row, pd2Tables = loadPd2Tables() }) {
  const page = validatePage(buffer, parsedSave, pageIndex);
  integer(nodeCount, 1, 7, 'nodeCount');
  const patched = patchItemLocation(itemBytes, { column, row });
  const parsed = parseLegacyItemList(patched, 0, 1, patched.length, pd2Tables);
  const nodes = parsed.items;
  if (nodes.length !== nodeCount || parsed.topLevelItems.length !== 1) throw new Error('Bank item does not contain exactly one item tree');
  nodes.forEach((node, index) => assertNode(node, nodes[index + 1]?.byteOffset ?? patched.length));
  const item = parsed.topLevelItems[0];
  integer(item.invWidth, 1, STASH_GRID.columns, 'item width');
  integer(item.invHeight, 1, STASH_GRID.rows, 'item height');
  if (column + item.invWidth > STASH_GRID.columns || row + item.invHeight > STASH_GRID.rows) throw new Error('Item does not fit in the stash grid');
  for (const other of page.topLevelItems) {
    if (other.location !== 0 || other.panel !== 5 || other.invWidth < 1 || other.invHeight < 1) throw new Error('Existing stash placement is uncertain');
    if (column < other.column + other.invWidth && column + item.invWidth > other.column && row < other.row + other.invHeight && row + item.invHeight > other.row) throw new Error('Stash position is occupied');
  }
  if (page.itemCount + 1 > 5000) throw new Error('Stash page item limit exceeded');
  const offset = page.itemRegion.endOffset;
  const bytes = Buffer.concat([buffer.subarray(0, offset), patched, buffer.subarray(offset)]);
  bytes.writeUInt16LE(page.itemCount + 1, page.itemRegion.startOffset - 2);
  return { buffer: bytes, itemBytes: patched, beforeSha256: sha256(buffer), afterSha256: sha256(bytes) };
}
