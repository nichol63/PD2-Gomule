import { parseLegacyItemList } from './legacy-item-parser.mjs';

// Strict validation for bounded item records, shared by character transfers
// (which must preserve these bytes exactly) and read-only auxiliary decoding.

/** Requires a fully decoded node whose bit length exactly fills its byte span. */
export function validateNode(node, endOffset, { transferred = false } = {}) {
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

/** Requires an ear's owner-name terminator and padding to fill its span. */
export function validatePreservedEar(buffer, node, endOffset) {
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

/**
 * Decodes rootCount items that must exactly fill buffer[start, end) with
 * proven spans, root/socket-child order and no unparsed bytes. Throws with
 * the given label otherwise; returns the parseLegacyItemList result.
 */
export function validatePreservedItemRegion(buffer, start, end, rootCount, pd2Tables, label) {
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
  return parsed;
}
