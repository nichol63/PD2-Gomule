import { createHash } from 'node:crypto';
import { parseLegacyItemList } from './legacy-item-parser.mjs';
import { loadPd2Tables } from './pd2-data.mjs';
import { TRANSFER_STATUS } from './safe-serialization.mjs';
import { findCharacterSkillsBlockOffset } from './save-parsers.mjs';

// The panel numbers and grids are from the installed PD2 Inventory.txt.
export const CHARACTER_PANELS = Object.freeze({
  inventory: Object.freeze({ id: 'inventory', number: 1, columns: 10, rows: 8 }),
  cube: Object.freeze({ id: 'cube', number: 4, columns: 4, rows: 4 }),
  stash: Object.freeze({ id: 'stash', number: 5, columns: 10, rows: 15 })
});
const PANELS_BY_NUMBER = new Map(Object.values(CHARACTER_PANELS).map((panel) => [panel.number, panel]));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
}

export function calculateCharacterChecksum(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) throw new Error('Invalid character bytes');
  let checksum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = index >= 12 && index < 16 ? 0 : buffer[index];
    checksum = (((checksum << 1) | (checksum >>> 31)) + byte) >>> 0;
  }
  return checksum;
}

function validateNode(node, endOffset, { transferred = false } = {}) {
  if (!node || (!node.itemInfo && !node.isEar) || (transferred && node.isEar) || !node.propertiesComplete) {
    throw new Error('Item has unsupported or incomplete data');
  }
  if (transferred && node.parseRecovery) throw new Error('Historical item profiles are read-only until transfer compatibility is verified');
  if (![100, 101].includes(node.version)) throw new Error('Unsupported item version');
  if (!Number.isInteger(node.coreBitLength) || Math.ceil(node.coreBitLength / 8) !== endOffset - node.byteOffset) {
    throw new Error('Item boundary is not proven by its decoded bit length');
  }
  if ((node.children?.length ?? 0) !== (node.socketsFilled ?? 0)) throw new Error('Socket child count is uncertain');
  if (node.children?.length && (!(node.flags & 0x800) || node.totalSockets < node.children.length)) {
    throw new Error('Socket flags or capacity are inconsistent');
  }
}

function validatePreservedEar(buffer, node, endOffset) {
  // Ears omit the ordinary item-code payload. Preserve their bounded bytes,
  // but require the owner name terminator rather than trusting the reader's
  // permissive display summary. The reference reader permits seven extra zero
  // bits after that terminator, followed by byte-alignment padding.
  if (!node.isEar) return;
  if (node.code !== 'ear' || node.children.length || node.socketsFilled || node.totalSockets ||
      node.ownerClassId > 6 || node.ownerLevel < 1 || node.ownerLevel > 99) {
    throw new Error('Ear item data is uncertain');
  }
  const endBitOffset = endOffset * 8;
  let bitOffset = node.byteOffset * 8 + 86;
  let terminated = false;
  for (let count = 0; count < 18 && bitOffset + 7 <= endBitOffset; count += 1) {
    let value = 0;
    for (let index = 0; index < 7; index += 1) {
      value |= ((buffer[(bitOffset + index) >>> 3] >>> ((bitOffset + index) & 7)) & 1) << index;
    }
    bitOffset += 7;
    if (value === 0) { terminated = true; break; }
    if (value < 32 || value > 126) throw new Error('Ear owner name is uncertain');
  }
  if (!terminated || endBitOffset - bitOffset > 14) throw new Error('Ear item boundary is uncertain');
  for (; bitOffset < endBitOffset; bitOffset += 1) {
    if ((buffer[bitOffset >>> 3] >>> (bitOffset & 7)) & 1) throw new Error('Ear item padding is uncertain');
  }
}

function assertGridItem(item, grid, occupied) {
  integer(item.invWidth, 1, grid.columns, 'item width');
  integer(item.invHeight, 1, grid.rows, 'item height');
  integer(item.column, 0, grid.columns - item.invWidth, 'item column');
  integer(item.row, 0, grid.rows - item.invHeight, 'item row');
  for (let x = item.column; x < item.column + item.invWidth; x += 1) {
    for (let y = item.row; y < item.row + item.invHeight; y += 1) {
      const cell = `${x},${y}`;
      if (occupied.has(cell)) throw new Error(`Existing ${grid.id} items overlap`);
      occupied.add(cell);
    }
  }
}

function validatePreservedItemRegion(buffer, start, end, rootCount, pd2Tables, label) {
  const parsed = parseLegacyItemList(buffer, start, rootCount, end, pd2Tables);
  if (parsed.parsedRootCount !== rootCount || parsed.topLevelItems.length !== rootCount ||
      parsed.missingSocketChildCount || parsed.sourceSpan.endOffset !== end) {
    throw new Error(`${label} item boundary is uncertain`);
  }
  let cursor = start;
  parsed.items.forEach((item, index) => {
    const itemEnd = parsed.items[index + 1]?.byteOffset ?? end;
    if (item.byteOffset !== cursor || item.nextOffset !== itemEnd) throw new Error(`${label} item spans are uncertain`);
    validateNode(item, itemEnd);
    validatePreservedEar(buffer, item, itemEnd);
    cursor = itemEnd;
  });
  let nodeIndex = 0;
  for (const root of parsed.topLevelItems) {
    if (parsed.items[nodeIndex++] !== root || root.location === 6) throw new Error(`${label} root order is uncertain`);
    for (const child of root.children) {
      if (parsed.items[nodeIndex++] !== child || child.location !== 6 || child.parentOffset !== root.byteOffset) {
        throw new Error(`${label} socket child order is uncertain`);
      }
    }
  }
  if (cursor !== end || nodeIndex !== parsed.items.length) throw new Error(`${label} item region contains unparsed bytes`);
}

function validateCharacter(buffer, save, pd2Tables = loadPd2Tables()) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer must be a Buffer');
  if (save?.kind !== 'character' || save.sourceSha256 !== sha256(buffer)) throw new Error('Parsed character does not match source bytes');
  if (buffer.length < 32 || buffer.readUInt32LE(0) !== 0xaa55aa55 || buffer.readUInt32LE(4) !== 96) throw new Error('Unsupported character signature or version');
  if (buffer.readUInt32LE(8) !== buffer.length || save.declaredSize !== buffer.length) throw new Error('Character declared size does not match source bytes');
  if (buffer.readUInt32LE(12) !== calculateCharacterChecksum(buffer)) throw new Error('Character checksum does not match source bytes');
  const start = save.itemRegion?.startOffset;
  const end = save.itemRegion?.endOffset;
  integer(start, 36, buffer.length, 'character item region start');
  integer(end, start, buffer.length, 'character item region end');
  const listOffset = start - 4;
  if (save.itemListOffset !== listOffset || buffer.toString('ascii', listOffset, listOffset + 2) !== 'JM' ||
      buffer.readUInt16LE(listOffset + 2) !== save.itemCount) throw new Error('Character item header does not match source bytes');
  // Both 32- and 35-byte skill-block forms occur in the canonical v96 saves.
  const skillsOffset = findCharacterSkillsBlockOffset(buffer, pd2Tables);
  if (skillsOffset < 0 || ![32, 35].includes(listOffset - skillsOffset) ||
      save.skillsBlockOffset !== skillsOffset ||
      [32, 35].filter((distance) => buffer.toString('ascii', skillsOffset + distance, skillsOffset + distance + 2) === 'JM').length !== 1) {
    throw new Error('Character skills boundary is uncertain');
  }
  const sections = save.characterSections;
  if (!sections || sections.corpse.markerOffset !== end || buffer.toString('hex', end, end + 6) !== '4a4d00006a66') {
    throw new Error('Character corpse boundary is uncertain');
  }
  if (sections.corpse.itemCount !== 0 || buffer.readUInt16LE(end + 2) !== 0) throw new Error('Nonempty corpse section is unsupported');
  const merc = sections.mercenary;
  const golem = sections.golem;
  if (merc.markerOffset !== end + 4 || buffer.toString('ascii', merc.markerOffset, merc.markerOffset + 2) !== 'jf') {
    throw new Error('Character mercenary boundary is uncertain');
  }
  const mercStart = merc.itemListOffset === null ? merc.markerOffset + 2 : merc.itemListOffset + 4;
  if (merc.itemListOffset !== null && (merc.itemListOffset !== merc.markerOffset + 2 ||
      buffer.toString('ascii', merc.itemListOffset, merc.itemListOffset + 2) !== 'JM' ||
      buffer.readUInt16LE(merc.itemListOffset + 2) !== merc.itemCount)) throw new Error('Character mercenary header is uncertain');
  if (merc.itemListOffset === null && merc.itemCount !== 0) throw new Error('Character mercenary count is uncertain');
  if (merc.itemRegion.startOffset !== mercStart || merc.itemRegion.endOffset !== golem.markerOffset ||
      buffer.toString('ascii', golem.markerOffset, golem.markerOffset + 2) !== 'kf' ||
      golem.markerOffset + 3 > buffer.length) throw new Error('Character golem boundary is uncertain');
  const golemPresence = buffer[golem.markerOffset + 2];
  if (![0, 1].includes(golemPresence) || golem.present !== (golemPresence === 1) ||
      golem.itemRegion?.startOffset !== golem.markerOffset + 3 || golem.itemRegion?.endOffset !== buffer.length) {
    throw new Error('Character golem item region is uncertain');
  }
  if (golemPresence === 1) {
    validatePreservedItemRegion(buffer, golem.markerOffset + 3, buffer.length, 1, pd2Tables, 'Golem');
  } else if (golem.markerOffset + 3 !== buffer.length) {
    throw new Error('Empty golem section has extra bytes');
  }
  if (merc.itemCount > 0) {
    validatePreservedItemRegion(buffer, mercStart, golem.markerOffset, merc.itemCount, pd2Tables, 'Mercenary');
  } else if (mercStart !== golem.markerOffset) throw new Error('Empty mercenary section has extra bytes');

  const nodes = save.items;
  const roots = save.topLevelItems;
  if (!Array.isArray(nodes) || !Array.isArray(roots) || roots.length !== save.itemCount ||
      save.parsedItemCount !== roots.length || save.parsedNodeCount !== nodes.length) throw new Error('Character item count is uncertain');
  let cursor = start;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const itemEnd = nodes[index + 1]?.byteOffset ?? end;
    if (node.byteOffset !== cursor || node.nextOffset !== itemEnd || node.sourceSpan?.startOffset !== cursor ||
        node.sourceSpan?.endOffset !== itemEnd || node.sourceSpan?.length !== itemEnd - cursor) {
      throw new Error('Character item spans are not contiguous');
    }
    validateNode(node, itemEnd);
    validatePreservedEar(buffer, node, itemEnd);
    cursor = itemEnd;
  }
  let nodeIndex = 0;
  for (const root of roots) {
    if (nodes[nodeIndex++] !== root || root.location === 6) throw new Error('Character root item order is uncertain');
    for (const child of root.children) {
      if (nodes[nodeIndex++] !== child || child.location !== 6 || child.parentOffset !== root.byteOffset) {
        throw new Error('Character socket child order is uncertain');
      }
    }
  }
  if (cursor !== end || nodeIndex !== nodes.length) {
    throw new Error('Character item region contains unparsed bytes or detached socket children');
  }
  const occupied = new Map(Object.values(CHARACTER_PANELS).map((panel) => [panel.id, new Set()]));
  for (const item of roots) {
    if (item.location !== 0) continue;
    const panel = PANELS_BY_NUMBER.get(item.panel);
    if (panel) {
      const earInfo = item.isEar ? pd2Tables.resolveItemCode('ear') : null;
      const gridItem = item.isEar ? { ...item, invWidth: earInfo?.invWidth, invHeight: earInfo?.invHeight } : item;
      assertGridItem(gridItem, panel, occupied.get(panel.id));
    }
  }
  return { roots, occupied, start, end };
}

export function inspectCharacterTransferSupport(buffer, save, { pd2Tables = loadPd2Tables() } = {}) {
  try {
    validateCharacter(buffer, save, pd2Tables);
    return { supported: true, status: TRANSFER_STATUS,
      containers: Object.values(CHARACTER_PANELS).map(({ id, columns, rows }) => ({ id, columns, rows })) };
  } catch (error) {
    return { supported: false, reason: error.message, containers: [] };
  }
}

export function extractCharacterItem(buffer, save, { itemIndex, pd2Tables = loadPd2Tables() }) {
  const { roots, end } = validateCharacter(buffer, save, pd2Tables);
  integer(itemIndex, 0, roots.length - 1, 'itemIndex');
  const item = roots[itemIndex];
  if (item.location !== 0 || !PANELS_BY_NUMBER.has(item.panel)) throw new Error('Unsupported item location: only stored inventory, cube, or stash items can be transferred');
  const startOffset = item.byteOffset;
  const endOffset = roots[itemIndex + 1]?.byteOffset ?? end;
  const firstNodeIndex = save.items.findIndex((node) => node.byteOffset === startOffset);
  const nodes = save.items.slice(firstNodeIndex, firstNodeIndex + 1 + item.children.length);
  nodes.forEach((node, index) => validateNode(node, nodes[index + 1]?.byteOffset ?? endOffset, { transferred: true }));
  if (item.code === 'box' && roots.some((other) => other.location === 0 && other.panel === CHARACTER_PANELS.cube.number)) {
    throw new Error('Cannot transfer a cube that contains items');
  }
  const bytes = Buffer.from(buffer.subarray(startOffset, endOffset));
  return { bytes, sha256: sha256(bytes), item, startOffset, endOffset, nodeCount: nodes.length };
}

function finishCharacterEdit(bytes) {
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(0, 12);
  bytes.writeUInt32LE(calculateCharacterChecksum(bytes), 12);
  return bytes;
}

export function removeCharacterItem(buffer, save, selection) {
  const extracted = extractCharacterItem(buffer, save, selection);
  const bytes = Buffer.concat([buffer.subarray(0, extracted.startOffset), buffer.subarray(extracted.endOffset)]);
  bytes.writeUInt16LE(save.itemCount - 1, save.itemListOffset + 2);
  finishCharacterEdit(bytes);
  return { buffer: bytes, extracted, beforeSha256: sha256(buffer), afterSha256: sha256(bytes) };
}

function writeBits(buffer, bitOffset, width, value) {
  integer(value, 0, 2 ** width - 1, 'location value');
  for (let index = 0; index < width; index += 1) {
    const absolute = bitOffset + index;
    const byte = absolute >>> 3;
    const mask = 1 << (absolute & 7);
    buffer[byte] = (buffer[byte] & ~mask) | (((value >>> index) & 1) ? mask : 0);
  }
}

export function patchCharacterItemLocation(itemBytes, { panel, column, row }) {
  const grid = CHARACTER_PANELS[panel];
  if (!grid) throw new Error('Unsupported character panel');
  if (!Buffer.isBuffer(itemBytes) || itemBytes.length < 14 || itemBytes.toString('ascii', 0, 2) !== 'JM') throw new Error('Invalid item bytes');
  integer(column, 0, grid.columns - 1, 'column');
  integer(row, 0, grid.rows - 1, 'row');
  const result = Buffer.from(itemBytes);
  writeBits(result, 58, 3, 0);
  writeBits(result, 61, 4, 0);
  writeBits(result, 65, 4, column);
  writeBits(result, 69, 4, row);
  writeBits(result, 73, 3, grid.number);
  return result;
}

export function insertCharacterItem(buffer, save, { itemBytes, nodeCount = 1, panel, column, row, pd2Tables = loadPd2Tables() }) {
  const { roots, end, occupied } = validateCharacter(buffer, save, pd2Tables);
  const grid = CHARACTER_PANELS[panel];
  if (!grid) throw new Error('Unsupported character panel');
  integer(nodeCount, 1, 7, 'nodeCount');
  if (panel === 'cube') {
    const cubes = roots.filter((item) => item.code === 'box');
    if (cubes.length !== 1 || cubes[0].location !== 0 || ![1, 5].includes(cubes[0].panel)) {
      throw new Error('Character has no single cube in inventory or stash');
    }
  }
  if (save.itemCount >= 0xffff) throw new Error('Character item limit exceeded');
  const patched = patchCharacterItemLocation(itemBytes, { panel, column, row });
  const parsed = parseLegacyItemList(patched, 0, 1, patched.length, pd2Tables);
  if (parsed.parsedRootCount !== 1 || parsed.items.length !== nodeCount || parsed.topLevelItems.length !== 1 ||
      parsed.sourceSpan.endOffset !== patched.length || parsed.missingSocketChildCount) {
    throw new Error('Bank item does not contain exactly one item tree');
  }
  parsed.items.forEach((node, index) => validateNode(node, parsed.items[index + 1]?.byteOffset ?? patched.length, { transferred: true }));
  const item = parsed.topLevelItems[0];
  if (item.code === 'box' && roots.some((other) => other.code === 'box')) throw new Error('Character already has a cube');
  integer(item.invWidth, 1, grid.columns, 'item width');
  integer(item.invHeight, 1, grid.rows, 'item height');
  if (column + item.invWidth > grid.columns || row + item.invHeight > grid.rows) throw new Error('Item does not fit in the character panel');
  for (let x = column; x < column + item.invWidth; x += 1) {
    for (let y = row; y < row + item.invHeight; y += 1) {
      if (occupied.get(grid.id).has(`${x},${y}`)) throw new Error('Character position is occupied');
    }
  }
  const bytes = Buffer.concat([buffer.subarray(0, end), patched, buffer.subarray(end)]);
  bytes.writeUInt16LE(save.itemCount + 1, save.itemListOffset + 2);
  finishCharacterEdit(bytes);
  return { buffer: bytes, itemBytes: patched, beforeSha256: sha256(buffer), afterSha256: sha256(bytes) };
}
