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
// These rows are from PD2's historical tables. They are considered only after
// the current table fails on a bounded item, then checked against its terminator.
const HISTORICAL_DEEP_WOUNDS_BITS = 11; // Season 7 ItemStatCost.txt, 7cf86adb
const HISTORICAL_NONSTACKABLE_MAP_CODES = new Set(['t32', 't37', 't39']);
const HISTORICAL_DEEP_WOUNDS_COMMIT = '7cf86adb4167c4302c6326ea8c1df5d6ad8126c0';
const HISTORICAL_DEEP_WOUNDS_TABLE_SHA256 = '7e8dfedc00ae0502e5afabd11b3866ce1da1678ca7d94a9c30cbb46df409bd9c';
const HISTORICAL_NONSTACKABLE_MAP_COMMIT = '4b1f140491a69d4104b27bbdab14c44b519ff9e0';
const HISTORICAL_NONSTACKABLE_MAP_TABLE_SHA256 = '7a6f0687c2ee289f3950bc0fc06ea3ceee829239a1f82a45e0812593e52b3d95';

function createSourceSpan(startOffset, endOffset) {
  return {
    startOffset,
    endOffset,
    length: Math.max(0, endOffset - startOffset)
  };
}

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
  constructor(buffer, bitOffset = 0, endBitOffset = buffer.length * 8) {
    this.buffer = buffer;
    this.bitOffset = bitOffset;
    this.endBitOffset = endBitOffset;
  }

  read(bits) {
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
      throw new RangeError(`Invalid bit read width ${bits}`);
    }
    if (this.bitOffset + bits > this.endBitOffset) {
      throw new RangeError(
        `Item read exceeds byte boundary at bit ${this.bitOffset} (${bits} bits requested, end ${this.endBitOffset})`
      );
    }
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
    if (!Number.isInteger(bits) || bits < 0 || this.bitOffset + bits > this.endBitOffset) {
      throw new RangeError(`Item skip exceeds byte boundary at bit ${this.bitOffset}`);
    }
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
  // LegacyBitReader.read() has already restored the bit order. GoMule's
  // one-based flag numbers refer to bits of the raw little-endian word.
  return ((flags >>> (bit - 1)) & 1) === 1;
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
      // Some saved ears end immediately after the terminator; the legacy
      // reader consumed seven more zero-padded bits from the following item.
      if (reader.bitOffset + 7 <= reader.endBitOffset) {
        reader.read(7);
      }
      terminated = true;
      break;
    }

    ownerName += String.fromCharCode(value);
  }

  if (!terminated) {
    if (reader.bitOffset + 7 <= reader.endBitOffset) {
      reader.read(7);
    }
  }

  return {
    ...baseSummary,
    isEar: true,
    code: 'ear',
    displayName: ownerName ? `${ownerName}'s Ear` : 'Ear',
    qualityLabel: 'ear',
    qualityData: null,
    coreBitLength: reader.bitOffset - (baseSummary.byteOffset * 8),
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

function readQualityData(reader, summary) {
  switch (summary.quality) {
    case 1:
      return {
        lowQualityTypeId: reader.read(3)
      };
    case 3:
      return {
        superiorTypeId: reader.read(3)
      };
    case 2:
      return null;
    case 4:
      return {
        magicPrefixId: reader.read(11),
        magicSuffixId: reader.read(11)
      };
    case 5:
      return {
        setId: reader.read(12)
      };
    case 7:
      return {
        uniqueId: reader.read(12)
      };
    case 6:
    case 8:
      {
        const rarePrefixIds = [];
        const rareSuffixIds = [];
        const rareNameId1 = reader.read(8);
        const rareNameId2 = reader.read(8);

        for (let index = 0; index < 3; index += 1) {
          if (reader.read(1) === 1) {
            rarePrefixIds.push(reader.read(11));
          }
          if (reader.read(1) === 1) {
            rareSuffixIds.push(reader.read(11));
          }
        }

        return {
          rareNameId1,
          rareNameId2,
          rarePrefixIds,
          rareSuffixIds
        };
      }
    default:
      return null;
  }
}

function cloneQualityData(qualityData) {
  if (!qualityData) {
    return null;
  }

  const cloned = { ...qualityData };
  if (Array.isArray(qualityData.rarePrefixIds)) {
    cloned.rarePrefixIds = [...qualityData.rarePrefixIds];
  }
  if (Array.isArray(qualityData.rareSuffixIds)) {
    cloned.rareSuffixIds = [...qualityData.rareSuffixIds];
  }
  return cloned;
}

function createBaseQualityData(summary) {
  return {
    qualityId: summary.quality,
    qualityLabel: summary.qualityLabel
  };
}

function assignQualityData(summary, qualityData) {
  summary.qualityData = qualityData
    ? { ...createBaseQualityData(summary), ...cloneQualityData(qualityData) }
    : createBaseQualityData(summary);
}

function readQualityPayload(reader, summary) {
  const qualityData = readQualityData(reader, summary);
  assignQualityData(summary, qualityData);
}

function skipQualityData(reader, summary) {
  readQualityPayload(reader, summary);
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

function parseLegacyProperty(reader, statId, pd2Tables, qFlag, listKind, profile) {
  const currentStat = requireItemStat(pd2Tables, statId);
  const stat = profile?.deepWounds && statId === 501
    ? { ...currentStat, saveBits: HISTORICAL_DEEP_WOUNDS_BITS }
    : currentStat;
  if (stat.saveBits === 0) {
    return null;
  }
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

  const property = {
    statId,
    statKey: stat.stat,
    qFlag,
    listKind,
    saveBits: stat.saveBits,
    saveAdd: stat.saveAdd,
    saveParamBits: stat.saveParamBits,
    descFunc: stat.descFunc,
    descVal: stat.descVal,
    descPriority: stat.descPriority,
    descStringKey: stat.descStringKey,
    descStringNegKey: stat.descStringNegKey,
    descString2Key: stat.descString2Key,
    values
  };

  if (statId === 200) {
    const [packedValue, chance] = values;
    const castSkillId = packedValue >> 6;
    const castSkillLevel = packedValue & 63;

    property.castSkillId = castSkillId;
    property.castSkillLevel = castSkillLevel;
    property.castChance = chance;

    const skill = pd2Tables.resolveSkill(castSkillId);
    if (skill) {
      property.castSkillName = skill.name;
      property.castSkillClass = skill.charClass;
      property.castSkillDesc = skill.skillDesc;
    }
  }

  if (statId === 155 || statId === 179 || statId === 180) {
    property.monsterId = values[0];

    const monster = pd2Tables.resolveMonster(values[0]);
    if (monster) {
      property.monsterCode = monster.code;
      property.monsterName = monster.name;
      property.monsterNameKey = monster.nameKey;
    }
  }

  return property;
}

function parseLegacyPropertyList(reader, pd2Tables, qFlag, listKind, profile) {
  const properties = [];
  let rootProp = null;
  let readingStatId = true;
  const startBitOffset = reader.bitOffset;

  try {
    rootProp = reader.read(9);
    readingStatId = false;

    while (rootProp !== 511) {
      if (properties.length >= MAX_PROPERTY_COUNT) {
        throw new Error(`Property list exceeded ${MAX_PROPERTY_COUNT} entries`);
      }

      if (reader.bitOffset - startBitOffset > MAX_PROPERTY_BITS) {
        throw new Error(`Property list exceeded ${MAX_PROPERTY_BITS} bits`);
      }

      const property = parseLegacyProperty(reader, rootProp, pd2Tables, qFlag, listKind, profile);
      if (property !== null) {
        properties.push(property);
      }

      if (rootProp === 17) {
        const expandedProperty = parseLegacyProperty(reader, 18, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty !== null) {
          properties.push(expandedProperty);
        }
      } else if (rootProp === 48) {
        const expandedProperty = parseLegacyProperty(reader, 49, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty !== null) {
          properties.push(expandedProperty);
        }
      } else if (rootProp === 50) {
        const expandedProperty = parseLegacyProperty(reader, 51, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty !== null) {
          properties.push(expandedProperty);
        }
      } else if (rootProp === 52) {
        const expandedProperty = parseLegacyProperty(reader, 53, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty !== null) {
          properties.push(expandedProperty);
        }
      } else if (rootProp === 54) {
        const expandedProperty55 = parseLegacyProperty(reader, 55, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty55 !== null) {
          properties.push(expandedProperty55);
        }
        const expandedProperty56 = parseLegacyProperty(reader, 56, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty56 !== null) {
          properties.push(expandedProperty56);
        }
      } else if (rootProp === 57) {
        const expandedProperty58 = parseLegacyProperty(reader, 58, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty58 !== null) {
          properties.push(expandedProperty58);
        }
        const expandedProperty59 = parseLegacyProperty(reader, 59, pd2Tables, qFlag, listKind, profile);
        if (expandedProperty59 !== null) {
          properties.push(expandedProperty59);
        }
      }

      readingStatId = true;
      rootProp = reader.read(9);
      readingStatId = false;
    }

    return {
      kind: listKind,
      qFlag,
      complete: true,
      error: null,
      startBitOffset,
      endBitOffset: reader.bitOffset,
      properties
    };
  } catch (error) {
    return {
      kind: listKind,
      qFlag,
      complete: false,
      error: error.message,
      startBitOffset,
      endBitOffset: reader.bitOffset,
      failedStatId: readingStatId ? null : rootProp,
      failedBitOffset: reader.bitOffset,
      properties
    };
  }
}

function isJewelItem(summary) {
  return summary.itemInfo?.namestr === 'jew' || summary.code === 'jew';
}

function parseExtendedCore(reader, summary, pd2Tables, profile = null) {
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
    summary.runewordId = reader.read(12);
    summary.runewordExtraBits = reader.read(4);
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
  } else if (summary.itemInfo?.section === 'Misc.txt' && summary.itemInfo.stackable &&
      !profile?.nonStackableMap) {
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
  const basePropertyList = parseLegacyPropertyList(reader, pd2Tables, baseQFlag, 'base', profile);
  summary.propertyLists.push(basePropertyList);

  if (summary.quality === 5 && basePropertyList.complete) {
    for (let index = 0; index < summary.setPropertyMasks.length; index += 1) {
      if (summary.setPropertyMasks[index] !== 1) {
        continue;
      }

      const setPropertyList = parseLegacyPropertyList(reader, pd2Tables, index + 2, 'set', profile);
      summary.propertyLists.push(setPropertyList);
      if (!setPropertyList.complete) {
        break;
      }
    }
  }

  if (summary.isRuneword && summary.propertyLists.every((entry) => entry.complete)) {
    summary.propertyLists.push(parseLegacyPropertyList(reader, pd2Tables, 0, 'runeword', profile));
  }

  summary.properties = summary.propertyLists.flatMap((entry) => entry.properties);
  summary.propertyCount = summary.properties.length;
  summary.propertiesComplete = summary.propertyLists.every((entry) => entry.complete);
  summary.propertyParseError = summary.propertyLists.find((entry) => !entry.complete)?.error ?? null;
  normalizeSocketMetadata(summary);
}

function hasOnlyItemPadding(reader) {
  const trailingBitCount = reader.endBitOffset - reader.bitOffset;
  if (trailingBitCount < 0 || trailingBitCount > 7) {
    return false;
  }

  for (let bitOffset = reader.bitOffset; bitOffset < reader.endBitOffset; bitOffset += 1) {
    if (((reader.buffer[bitOffset >>> 3] >>> (bitOffset & 7)) & 1) !== 0) {
      return false;
    }
  }

  return true;
}

function historicalPropertyProfiles(summary, pd2Tables) {
  const profiles = [];
  const deepWoundsRow = pd2Tables.resolveItemStat(501);
  const hasDeepWounds = summary.propertyLists.some((list) =>
    list.failedStatId === 501 || list.properties.some((property) => property.statId === 501)
  ) && deepWoundsRow?.stat === 'deep_wounds' && deepWoundsRow.saveBits === 16 &&
    deepWoundsRow.saveAdd === 0 && deepWoundsRow.saveParamBits === null;
  const hasInvalidMapStack = HISTORICAL_NONSTACKABLE_MAP_CODES.has(summary.code) &&
    summary.itemInfo?.section === 'Misc.txt' && summary.itemInfo.stackable &&
    summary.itemInfo.maxStack === 50 &&
    summary.stackSize > summary.itemInfo.maxStack;

  if (hasDeepWounds) {
    profiles.push({ name: 'pd2-s7-deep-wounds', deepWounds: true });
  }
  if (hasInvalidMapStack) {
    profiles.push({ name: 'pd2-pre-s7-map', nonStackableMap: true });
  }
  return profiles;
}

function isPlausibleLegacyItemSummary(summary, options = {}) {
  if (!summary) {
    return false;
  }

  if (summary.version !== 100 && summary.version !== 101) {
    return false;
  }

  if (summary.isEar) {
    return true;
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

function normalizeSocketMetadata(summary) {
  const inferredSockets = Math.max(
    summary.socketsFilled ?? 0,
    summary.children?.length ?? 0,
    summary.totalSockets ?? 0
  );

  if (inferredSockets > 0) {
    summary.isSocketed = true;
    summary.totalSockets = inferredSockets;
  }
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

    normalizeSocketMetadata(item);
  }

  return topLevelItems;
}

export function buildLegacyTopLevelItems(items) {
  return attachSocketChildren(items);
}

export function parseLegacyItemSummary(buffer, offset, pd2Tables, options = {}) {
  if (!hasLegacyHeader(buffer, offset)) {
    return null;
  }

  const endOffset = options.stopOffset ?? buffer.length;
  if (!Number.isInteger(endOffset) || endOffset > buffer.length || endOffset <= offset) {
    throw new RangeError(`Invalid item stop offset ${endOffset} for item at ${offset}`);
  }
  const reader = new LegacyBitReader(buffer, offset * 8, endOffset * 8);
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
  summary.qualityData = null;
  summary.socketsFilled = 0;
  summary.totalSockets = 0;
  summary.children = [];
  summary.properties = [];
  summary.propertyLists = [];
  summary.propertyCount = 0;
  summary.setPropertyMasks = [];
  summary.propertiesComplete = true;
  summary.propertyParseError = null;
  summary.coreParseError = null;

  if (!summary.isSimple) {
    const extendedStartBitOffset = reader.bitOffset;
    const unparsedSummary = { ...summary };
    try {
      parseExtendedCore(reader, summary, pd2Tables);
      if (!summary.propertiesComplete) {
        const originalError = summary.propertyParseError;
        const validCandidates = [];
        for (const profile of historicalPropertyProfiles(summary, pd2Tables)) {
          const candidateReader = new LegacyBitReader(buffer, extendedStartBitOffset, endOffset * 8);
          const candidateSummary = { ...unparsedSummary };
          try {
            parseExtendedCore(candidateReader, candidateSummary, pd2Tables, profile);
          } catch {
            continue;
          }
          if (!candidateSummary.propertiesComplete || !hasOnlyItemPadding(candidateReader)) {
            continue;
          }
          validCandidates.push({ profile, reader: candidateReader, summary: candidateSummary });
        }
        // A failed current decode can support at most one historical layout.
        // Keep ambiguous source bytes incomplete rather than choosing an order.
        if (validCandidates.length === 1) {
          const { profile, reader: candidateReader, summary: candidateSummary } = validCandidates[0];
          Object.assign(summary, candidateSummary);
          reader.bitOffset = candidateReader.bitOffset;
          summary.parseProfile = profile.name;
          summary.parseRecovery = {
            originalError,
            historicalTable: profile.nonStackableMap ? 'Misc.txt' : 'ItemStatCost.txt',
            historicalRow: profile.nonStackableMap ? summary.code : 501,
            sourceCommit: profile.nonStackableMap
              ? HISTORICAL_NONSTACKABLE_MAP_COMMIT
              : HISTORICAL_DEEP_WOUNDS_COMMIT,
            historicalTableSha256: profile.nonStackableMap
              ? HISTORICAL_NONSTACKABLE_MAP_TABLE_SHA256
              : HISTORICAL_DEEP_WOUNDS_TABLE_SHA256,
            propertyEndBitOffset: reader.bitOffset,
            itemEndBitOffset: reader.endBitOffset,
            trailingBitCount: reader.endBitOffset - reader.bitOffset
          };
        }
      }
    } catch (error) {
      summary.coreParseError = error.message;
      summary.propertiesComplete = false;
      summary.propertyParseError = error.message;
      summary.propertyLists.push({
        kind: 'core',
        qFlag: null,
        complete: false,
        error: error.message,
        startBitOffset: offset * 8,
        endBitOffset: reader.bitOffset,
        failedStatId: null,
        failedBitOffset: reader.bitOffset,
        properties: []
      });
    }
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
        requireKnownCode: true,
        stopOffset: searchLimit
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
    requireKnownCode: false,
    stopOffset
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

  normalizeSocketMetadata(summary);
  summary.nextOffset = nextCandidate?.byteOffset ?? stopOffset;
  summary.sourceSpan = createSourceSpan(offset, summary.nextOffset);
  return summary;
}

export function parseLegacyItemList(buffer, startOffset, itemCount, stopOffset, pd2Tables) {
  if (!Number.isInteger(itemCount) || itemCount < 0) {
    throw new RangeError(`Invalid item count ${itemCount}`);
  }
  if (!Number.isInteger(stopOffset) || stopOffset < startOffset || stopOffset > buffer.length) {
    throw new RangeError(`Invalid item region ${startOffset}..${stopOffset}`);
  }
  const items = [];
  let itemOffset = startOffset;
  let nextOffset = startOffset;
  let parsedRootCount = 0;
  let pendingSocketChildren = 0;

  // The JM count names top-level items. Socket contents are serialized as
  // additional physical JM records immediately after their parent item.
  while (parsedRootCount < itemCount || pendingSocketChildren > 0) {
    if (itemOffset >= stopOffset) {
      break;
    }

    const nextItem = findNextLegacyItemStart(
      buffer,
      itemOffset + 2,
      stopOffset,
      pd2Tables
    );
    nextOffset = nextItem?.byteOffset ?? stopOffset;

    let item;
    try {
      item = parseLegacyItemSummary(buffer, itemOffset, pd2Tables, {
        requireKnownCode: false,
        stopOffset: nextOffset
      });
    } catch (error) {
      throw new Error(`Could not parse legacy item at byte offset ${itemOffset}: ${error.message}`);
    }
    if (!isPlausibleLegacyItemSummary(item)) {
      throw new Error(`Could not parse legacy item at byte offset ${itemOffset}`);
    }

    item.nextOffset = nextOffset;
    item.sourceSpan = createSourceSpan(itemOffset, item.nextOffset);
    items.push(item);
    if (pendingSocketChildren > 0) {
      pendingSocketChildren -= 1;
    } else {
      parsedRootCount += 1;
      pendingSocketChildren = item.socketsFilled ?? 0;
    }
    itemOffset = nextOffset;
  }

  return {
    items,
    parsedRootCount,
    unparsedItemCount: itemCount - parsedRootCount,
    missingSocketChildCount: pendingSocketChildren,
    topLevelItems: attachSocketChildren(items),
    nextOffset,
    sourceSpan: createSourceSpan(startOffset, nextOffset),
    flatItems: items
  };
}
