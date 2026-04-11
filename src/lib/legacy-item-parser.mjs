const QUALITY_LABELS = {
  1: 'low',
  2: 'normal',
  3: 'superior',
  4: 'magic',
  5: 'set',
  6: 'rare',
  7: 'unique',
  8: 'crafted'
};

const CHARM_NAMESTRS = new Set(['cm1', 'cm2', 'cm3']);
const LONG_GUID_TYPE_PREFIXES = ['amu', 'gem', 'rin', 'rune'];
const THROWABLE_WEAPON_CODES = new Set(['ajav', 'jave', 'taxe', 'tkni']);
const MAX_PROPERTY_COUNT = 256;
const MAX_PROPERTY_BITS = 8192;

function flipByte(value) {
  let flipped = 0;

  for (let bit = 0; bit < 8; bit += 1) {
    flipped = (flipped << 1) | ((value >> bit) & 1);
  }

  return flipped;
}

function unflipBits(value, bits) {
  let unflipped = 0n;

  for (let bit = 0; bit < bits; bit += 1) {
    unflipped = (unflipped << 1n) | ((value >> BigInt(bit)) & 1n);
  }

  return Number(unflipped);
}

class LegacyBitReader {
  constructor(buffer, bitOffset = 0) {
    this.buffer = buffer;
    this.bitOffset = bitOffset;
  }

  read(bits) {
    const byteOffset = Math.floor(this.bitOffset / 8);
    const bitsPast = this.bitOffset % 8;
    let window = 0n;

    for (let index = 0; index < 8; index += 1) {
      window <<= 8n;
      const byte = byteOffset + index < this.buffer.length
        ? flipByte(this.buffer[byteOffset + index])
        : 0;
      window += BigInt(byte);
    }

    window <<= BigInt(bitsPast);
    window >>= BigInt(64 - bits);
    this.bitOffset += bits;
    return unflipBits(window, bits);
  }

  skipBits(bits) {
    this.bitOffset += bits;
  }

  skipBytes(bytes) {
    this.bitOffset += bytes * 8;
  }
}

function hasLegacyHeader(buffer, offset) {
  return buffer[offset] === 0x4a && buffer[offset + 1] === 0x4d;
}

function hasFlag(flags, bit) {
  return ((flags >>> (32 - bit)) & 1) === 1;
}

function readLegacyItemCode(reader) {
  let code = '';

  for (let index = 0; index < 4; index += 1) {
    const value = reader.read(8);
    if (value !== 0x20) {
      code += String.fromCharCode(value);
    }
  }

  return code;
}

function parseLegacyEar(reader, baseSummary) {
  const classId = reader.read(3);
  const level = reader.read(7);
  let ownerName = '';
  let terminated = false;

  for (let index = 0; index < 18; index += 1) {
    const value = reader.read(7);
    if (value === 0) {
      reader.read(7);
      terminated = true;
      break;
    }

    ownerName += String.fromCharCode(value);
  }

  if (!terminated) {
    reader.read(7);
  }

  return {
    ...baseSummary,
    isEar: true,
    code: 'ear',
    displayName: ownerName ? `${ownerName}'s Ear` : 'Ear',
    qualityLabel: 'ear',
    ownerClassId: classId,
    ownerLevel: level,
    socketsFilled: 0,
    totalSockets: 0,
    children: [],
    properties: [],
    propertyLists: [],
    propertyCount: 0,
    propertiesComplete: true,
    propertyParseError: null
  };
}

function skipQualityData(reader, summary) {
  switch (summary.quality) {
    case 1:
    case 3:
      reader.read(3);
      break;
    case 2:
      break;
    case 4:
      reader.read(11);
      reader.read(11);
      break;
    case 5:
    case 7:
      reader.read(12);
      break;
    case 6:
    case 8:
      reader.read(8);
      reader.read(8);
      for (let index = 0; index < 3; index += 1) {
        if (reader.read(1) === 1) {
          reader.read(11);
        }
        if (reader.read(1) === 1) {
          reader.read(11);
        }
      }
      break;
    default:
      break;
  }
}

function readNormalTypeData(reader, summary) {
  if (summary.quality !== 2) {
    return;
  }

  if (CHARM_NAMESTRS.has(summary.itemInfo?.namestr ?? '')) {
    reader.read(1);
    reader.read(11);
  }

  if (summary.code === 'tbk' || summary.code === 'ibk') {
    reader.read(5);
  }

  if (summary.code === 'tsc' || summary.code === 'isc') {
    reader.read(5);
  }

  if (summary.code === 'body') {
    reader.read(10);
  }
}

function isLongGuidItem(summary) {
  if (!summary.itemInfo) {
    return false;
  }

  if (summary.itemInfo.section !== 'Misc.txt') {
    return true;
  }

  if (CHARM_NAMESTRS.has(summary.itemInfo.namestr)) {
    return true;
  }

  return LONG_GUID_TYPE_PREFIXES.some((prefix) =>
    summary.itemInfo.type.startsWith(prefix)
  );
}

function skipPersonalization(reader) {
  let ended = false;

  for (let index = 0; index < 15 && !ended; index += 1) {
    if (reader.read(7) === 0) {
      ended = true;
    }
  }

  if (!ended) {
    reader.read(7);
  }
}

function requireItemStat(pd2Tables, statId) {
  const stat = pd2Tables.resolveItemStat(statId);
  if (!stat) {
    throw new Error(`Missing ItemStatCost definition for stat id ${statId}`);
  }

  return stat;
}

function parseLegacyProperty(reader, statId, pd2Tables, qFlag, listKind) {
  const stat = requireItemStat(pd2Tables, statId);
  const values = [];

  if (statId === 201 || statId === 197 || statId === 199 ||
      statId === 195 || statId === 198 || statId === 196) {
    values.push(
      reader.read(6) - stat.saveAdd,
      reader.read(10) - stat.saveAdd,
      reader.read(stat.saveBits) - stat.saveAdd
    );
  } else if (statId === 204) {
    values.push(
      reader.read(6) - stat.saveAdd,
      reader.read(10) - stat.saveAdd,
      reader.read(8) - stat.saveAdd,
      reader.read(8) - stat.saveAdd
    );
  } else if (stat.saveParamBits !== null) {
    values.push(
      reader.read(stat.saveParamBits) - stat.saveAdd,
      reader.read(stat.saveBits) - stat.saveAdd
    );
  } else {
    values.push(reader.read(stat.saveBits) - stat.saveAdd);
  }

  return {
    statId,
    statKey: stat.stat,
    qFlag,
    listKind,
    saveBits: stat.saveBits,
    saveAdd: stat.saveAdd,
    saveParamBits: stat.saveParamBits,
    descFunc: stat.descFunc,
    descPriority: stat.descPriority,
    descStringKey: stat.descStringKey,
    descStringNegKey: stat.descStringNegKey,
    values
  };
}

function parseLegacyPropertyList(reader, pd2Tables, qFlag, listKind) {
  const properties = [];
  let rootProp = null;
  const startBitOffset = reader.bitOffset;

  try {
    rootProp = reader.read(9);

    while (rootProp !== 511) {
      if (properties.length >= MAX_PROPERTY_COUNT) {
        throw new Error(`Property list exceeded ${MAX_PROPERTY_COUNT} entries`);
      }

      if (reader.bitOffset - startBitOffset > MAX_PROPERTY_BITS) {
        throw new Error(`Property list exceeded ${MAX_PROPERTY_BITS} bits`);
      }

      properties.push(parseLegacyProperty(reader, rootProp, pd2Tables, qFlag, listKind));

      if (rootProp === 17) {
        properties.push(parseLegacyProperty(reader, 18, pd2Tables, qFlag, listKind));
      } else if (rootProp === 48) {
        properties.push(parseLegacyProperty(reader, 49, pd2Tables, qFlag, listKind));
      } else if (rootProp === 50) {
        properties.push(parseLegacyProperty(reader, 51, pd2Tables, qFlag, listKind));
      } else if (rootProp === 52) {
        properties.push(parseLegacyProperty(reader, 53, pd2Tables, qFlag, listKind));
      } else if (rootProp === 54) {
        properties.push(parseLegacyProperty(reader, 55, pd2Tables, qFlag, listKind));
        properties.push(parseLegacyProperty(reader, 56, pd2Tables, qFlag, listKind));
      } else if (rootProp === 57) {
        properties.push(parseLegacyProperty(reader, 58, pd2Tables, qFlag, listKind));
        properties.push(parseLegacyProperty(reader, 59, pd2Tables, qFlag, listKind));
      }

      rootProp = reader.read(9);
    }

    return {
      kind: listKind,
      qFlag,
      complete: true,
      error: null,
      properties
    };
  } catch (error) {
    return {
      kind: listKind,
      qFlag,
      complete: false,
      error: error.message,
      failedStatId: rootProp,
      failedBitOffset: reader.bitOffset,
      properties
    };
  }
}

function isJewelItem(summary) {
  return summary.itemInfo?.namestr === 'jew' || summary.code === 'jew';
}

function parseExtendedCore(reader, summary, pd2Tables) {
  summary.socketsFilled = reader.read(3);
  summary.fingerprint = reader.read(32);
  summary.itemLevel = reader.read(7);
  summary.quality = reader.read(4);
  summary.qualityLabel = QUALITY_LABELS[summary.quality] ?? `quality-${summary.quality}`;
  summary.gfxId = null;
  summary.autoModId = null;

  if (reader.read(1) === 1) {
    summary.gfxId = reader.read(3);
  }

  if (reader.read(1) === 1) {
    summary.autoModId = reader.read(11) - 1;
  }

  skipQualityData(reader, summary);
  readNormalTypeData(reader, summary);

  if (summary.isRuneword) {
    reader.skipBits(12);
    reader.skipBits(4);
  }

  if (summary.isPersonalized) {
    skipPersonalization(reader);
  }

  if (summary.code === 'gold' || summary.code === 'gld') {
    if (reader.read(1) === 0) {
      summary.goldAmount = reader.read(12);
    } else {
      summary.goldAmount = reader.read(32);
    }
  }

  const hasGuid = reader.read(1) === 1;
  summary.hasGuid = hasGuid;
  if (hasGuid) {
    if (isLongGuidItem(summary)) {
      summary.guidWords = [reader.read(32), reader.read(32), reader.read(32)];
    } else {
      reader.read(3);
    }
  }

  summary.defense = null;
  summary.maxDurability = null;
  summary.currentDurability = null;
  summary.stackSize = null;

  if (summary.itemInfo?.section === 'armor.txt') {
    summary.defense = reader.read(11) - 10;
    summary.maxDurability = reader.read(8);
    if (summary.maxDurability !== 0) {
      summary.currentDurability = reader.read(9);
    }
  } else if (summary.itemInfo?.section === 'weapons.txt') {
    summary.isThrowable = THROWABLE_WEAPON_CODES.has(summary.code);
    summary.maxDurability = reader.read(8);
    if (summary.maxDurability !== 0) {
      summary.currentDurability = reader.read(9);
    }

    if (summary.itemInfo.stackable) {
      summary.stackSize = reader.read(9);
    }
  } else if (summary.itemInfo?.section === 'Misc.txt' && summary.itemInfo.stackable) {
    summary.stackSize = reader.read(9);
  }

  if (summary.isSocketed) {
    summary.totalSockets = reader.read(4);
  } else {
    summary.totalSockets = 0;
  }

  summary.setPropertyMasks = [];
  if (summary.quality === 5) {
    for (let index = 0; index < 5; index += 1) {
      summary.setPropertyMasks.push(reader.read(1));
    }
  }

  summary.propertyLists = [];
  summary.propertiesComplete = true;
  summary.propertyParseError = null;

  const baseQFlag = isJewelItem(summary) ? 1 : 0;
  const basePropertyList = parseLegacyPropertyList(reader, pd2Tables, baseQFlag, 'base');
  summary.propertyLists.push(basePropertyList);

  if (summary.quality === 5 && basePropertyList.complete) {
    for (let index = 0; index < summary.setPropertyMasks.length; index += 1) {
      if (summary.setPropertyMasks[index] !== 1) {
        continue;
      }

      const setPropertyList = parseLegacyPropertyList(reader, pd2Tables, index + 2, 'set');
      summary.propertyLists.push(setPropertyList);
      if (!setPropertyList.complete) {
        break;
      }
    }
  }

  if (summary.isRuneword && summary.propertyLists.every((entry) => entry.complete)) {
    summary.propertyLists.push(parseLegacyPropertyList(reader, pd2Tables, 0, 'runeword'));
  }

  summary.properties = summary.propertyLists.flatMap((entry) => entry.properties);
  summary.propertyCount = summary.properties.length;
  summary.propertiesComplete = summary.propertyLists.every((entry) => entry.complete);
  summary.propertyParseError = summary.propertyLists.find((entry) => !entry.complete)?.error ?? null;
}

function isPlausibleLegacyItemSummary(summary, options = {}) {
  if (!summary) {
    return false;
  }

  if (summary.isEar) {
    return true;
  }

  if (summary.version !== 100 && summary.version !== 101) {
    return false;
  }

  if (options.requireKnownCode && !summary.itemInfo) {
    return false;
  }

  if (!summary.isSimple) {
    const minQuality = summary.itemInfo?.section === 'Misc.txt' ? 0 : 1;
    if (summary.quality < minQuality || summary.quality > 8) {
      return false;
    }
  }

  return true;
}

function canHaveSocketChildren(summary) {
  return (
    summary.socketsFilled > 0 &&
    summary.itemInfo?.section !== 'Misc.txt'
  );
}

function attachSocketChildren(items) {
  const topLevelItems = [];

  for (const item of items) {
    item.children = [];
    delete item.parentOffset;
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.parentOffset !== undefined) {
      continue;
    }

    topLevelItems.push(item);
    if (!canHaveSocketChildren(item)) {
      continue;
    }

    let childIndex = index + 1;
    while (childIndex < items.length && items[childIndex].location === 6) {
      const child = items[childIndex];
      child.parentOffset = item.byteOffset;
      item.children.push(child);
      childIndex += 1;
    }
  }

  return topLevelItems;
}

export function parseLegacyItemSummary(buffer, offset, pd2Tables, options = {}) {
  if (!hasLegacyHeader(buffer, offset)) {
    return null;
  }

  const reader = new LegacyBitReader(buffer, offset * 8);
  reader.skipBytes(2);

  const flags = reader.read(32);
  const summary = {
    byteOffset: offset,
    version: reader.read(8),
    flags,
    isSocketed: hasFlag(flags, 12),
    isEar: hasFlag(flags, 17),
    isSimple: hasFlag(flags, 22),
    isPersonalized: hasFlag(flags, 25),
    isRuneword: hasFlag(flags, 27),
    isIdentified: hasFlag(flags, 5),
    isEthereal: hasFlag(flags, 23)
  };

  reader.skipBits(2);
  summary.location = reader.read(3);
  summary.bodyPosition = reader.read(4);
  summary.column = reader.read(4);
  summary.row = reader.read(4);
  summary.panel = reader.read(3);

  if (summary.isEar) {
    return parseLegacyEar(reader, summary);
  }

  summary.code = readLegacyItemCode(reader);
  summary.itemInfo = pd2Tables.resolveItemCode(summary.code);
  if (options.requireKnownCode && !summary.itemInfo) {
    return null;
  }

  summary.displayName = summary.itemInfo?.name ?? summary.code;
  summary.section = summary.itemInfo?.section ?? null;
  summary.type = summary.itemInfo?.type ?? '';
  summary.type2 = summary.itemInfo?.type2 ?? '';
  summary.invWidth = summary.itemInfo?.invWidth ?? 0;
  summary.invHeight = summary.itemInfo?.invHeight ?? 0;
  summary.quality = null;
  summary.qualityLabel = summary.isSimple ? 'simple' : 'unknown';
  summary.socketsFilled = 0;
  summary.totalSockets = 0;
  summary.children = [];
  summary.properties = [];
  summary.propertyLists = [];
  summary.propertyCount = 0;
  summary.setPropertyMasks = [];
  summary.propertiesComplete = true;
  summary.propertyParseError = null;

  if (!summary.isSimple) {
    parseExtendedCore(reader, summary, pd2Tables);
  }

  summary.coreBitLength = reader.bitOffset - (offset * 8);
  return summary;
}

export function findNextLegacyItemStart(buffer, startOffset, stopOffset, pd2Tables) {
  const searchLimit = Math.min(stopOffset, buffer.length);

  for (let offset = startOffset; offset <= searchLimit - 2; offset += 1) {
    if (!hasLegacyHeader(buffer, offset)) {
      continue;
    }

    let candidate = null;
    try {
      candidate = parseLegacyItemSummary(buffer, offset, pd2Tables, {
        requireKnownCode: true
      });
    } catch {
      continue;
    }

    if (isPlausibleLegacyItemSummary(candidate, { requireKnownCode: true })) {
      return candidate;
    }
  }

  return null;
}

function flattenChildren(items, output) {
  for (const item of items) {
    output.push(item);
    flattenChildren(item.children, output);
  }

  return output;
}

export function flattenLegacyItems(items) {
  return flattenChildren(items, []);
}

export function parseLegacyItemTree(buffer, offset, stopOffset, pd2Tables) {
  const summary = parseLegacyItemSummary(buffer, offset, pd2Tables, {
    requireKnownCode: false
  });
  if (!isPlausibleLegacyItemSummary(summary)) {
    throw new Error(`Could not parse legacy item at byte offset ${offset}`);
  }

  let nextCandidate = findNextLegacyItemStart(
    buffer,
    offset + 2,
    stopOffset,
    pd2Tables
  );

  if (canHaveSocketChildren(summary)) {
    const children = [];
    while (nextCandidate && nextCandidate.location === 6) {
      const child = parseLegacyItemTree(
        buffer,
        nextCandidate.byteOffset,
        stopOffset,
        pd2Tables
      );
      children.push(child);
      nextCandidate = findNextLegacyItemStart(
        buffer,
        child.nextOffset,
        stopOffset,
        pd2Tables
      );
    }

    summary.children = children;
  }

  summary.nextOffset = nextCandidate?.byteOffset ?? stopOffset;
  return summary;
}

export function parseLegacyItemList(buffer, startOffset, itemCount, stopOffset, pd2Tables) {
  const items = [];
  let nextOffset = startOffset;

  for (let index = 0; index < itemCount; index += 1) {
    const item = parseLegacyItemSummary(buffer, nextOffset, pd2Tables, {
      requireKnownCode: false
    });
    if (!isPlausibleLegacyItemSummary(item)) {
      throw new Error(`Could not parse legacy item at byte offset ${nextOffset}`);
    }

    items.push(item);
    if (index < itemCount - 1) {
      const nextItem = findNextLegacyItemStart(
        buffer,
        nextOffset + 2,
        stopOffset,
        pd2Tables
      );
      if (!nextItem) {
        throw new Error(`Could not find next legacy item after byte offset ${nextOffset}`);
      }
      nextOffset = nextItem.byteOffset;
    }
  }

  return {
    items,
    topLevelItems: attachSocketChildren(items),
    nextOffset,
    flatItems: items
  };
}
