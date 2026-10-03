import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { loadPd2Tables } from './pd2-data.mjs';
import { buildLegacyTopLevelItems, parseLegacyItemList } from './legacy-item-parser.mjs';
import { enrichParsedSave } from './item-identity.mjs';
import {
  findAscii,
  isPrintableAscii,
  readFixedNullTerminatedAscii,
  readNullTerminatedAscii
} from './buffer-utils.mjs';

const CLASS_NAMES = {
  0: 'Amazon',
  1: 'Sorceress',
  2: 'Necromancer',
  3: 'Paladin',
  4: 'Barbarian',
  5: 'Druid',
  6: 'Assassin'
};

function createSourceSpan(startOffset, endOffset) {
  return {
    startOffset,
    endOffset,
    length: Math.max(0, endOffset - startOffset)
  };
}

function assertIntegerOffset(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer`);
  }

  if (value < 0) {
    throw new RangeError(`${label} must be >= 0`);
  }
}

function normalizeSourceSpan(sourceSpan, label) {
  if (!sourceSpan || typeof sourceSpan !== 'object') {
    throw new TypeError(`${label} must be an object`);
  }

  const { startOffset, endOffset } = sourceSpan;
  assertIntegerOffset(startOffset, `${label}.startOffset`);
  assertIntegerOffset(endOffset, `${label}.endOffset`);

  if (endOffset < startOffset) {
    throw new RangeError(`${label}.endOffset must be >= ${label}.startOffset`);
  }

  return createSourceSpan(startOffset, endOffset);
}

function getItemPartitionSpan(item, index) {
  if (!item || typeof item !== 'object') {
    throw new TypeError(`items[${index}] must be an object`);
  }

  const sourceSpan = normalizeSourceSpan(item.sourceSpan, `items[${index}].sourceSpan`);
  const nextOffset = item.nextOffset ?? sourceSpan.endOffset;
  assertIntegerOffset(nextOffset, `items[${index}].nextOffset`);

  if (nextOffset < sourceSpan.endOffset) {
    throw new RangeError(`items[${index}].nextOffset must be >= items[${index}].sourceSpan.endOffset`);
  }

  return createSourceSpan(sourceSpan.startOffset, nextOffset);
}

export function sliceBufferBySourceSpan(buffer, sourceSpan) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('buffer must be a Buffer');
  }

  const normalizedSpan = normalizeSourceSpan(sourceSpan, 'sourceSpan');
  if (normalizedSpan.endOffset > buffer.length) {
    throw new RangeError(
      `sourceSpan.endOffset ${normalizedSpan.endOffset} exceeds buffer length ${buffer.length}`
    );
  }

  return buffer.subarray(normalizedSpan.startOffset, normalizedSpan.endOffset);
}

export function validateItemSourcePartition(buffer, region, items = []) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array');
  }

  const normalizedRegion = normalizeSourceSpan(region, 'region');
  const regionBytes = sliceBufferBySourceSpan(buffer, normalizedRegion);
  const spans = items.map((item, index) => getItemPartitionSpan(item, index));
  const boundedSlices = [];

  let boundedLength = 0;
  let totalSpanLength = 0;
  let uncoveredBytes = 0;
  let overlapBytes = 0;
  let overflowBytes = 0;
  let cursor = normalizedRegion.startOffset;

  for (const span of spans) {
    totalSpanLength += span.length;

    if (span.startOffset > cursor) {
      uncoveredBytes += span.startOffset - cursor;
    } else if (span.startOffset < cursor) {
      overlapBytes += cursor - span.startOffset;
    }

    const boundedStart = Math.min(
      normalizedRegion.endOffset,
      Math.max(normalizedRegion.startOffset, span.startOffset)
    );
    const boundedEnd = Math.min(
      normalizedRegion.endOffset,
      Math.max(normalizedRegion.startOffset, span.endOffset)
    );

    if (boundedEnd > boundedStart) {
      boundedSlices.push(buffer.subarray(boundedStart, boundedEnd));
      boundedLength += boundedEnd - boundedStart;
    }

    if (span.endOffset > normalizedRegion.endOffset) {
      overflowBytes += span.endOffset - Math.max(normalizedRegion.endOffset, span.startOffset);
    }

    cursor = Math.max(cursor, Math.min(span.endOffset, normalizedRegion.endOffset));
  }

  if (cursor < normalizedRegion.endOffset) {
    uncoveredBytes += normalizedRegion.endOffset - cursor;
  }

  const boundedBytes = Buffer.concat(boundedSlices, boundedLength);
  const startsAtRegionStart = spans.length === 0
    ? normalizedRegion.length === 0
    : spans[0].startOffset === normalizedRegion.startOffset;
  const endsAtRegionEnd = spans.length === 0
    ? normalizedRegion.length === 0
    : spans.at(-1).endOffset === normalizedRegion.endOffset;

  return {
    region: normalizedRegion,
    itemCount: spans.length,
    totalSpanLength,
    boundedLength,
    uncoveredBytes,
    overlapBytes,
    overflowBytes,
    startsAtRegionStart,
    endsAtRegionEnd,
    contiguous: startsAtRegionStart && uncoveredBytes === 0 && overlapBytes === 0,
    boundedBytesMatch: boundedBytes.equals(regionBytes),
    boundedBytes
  };
}

export function reconstructBoundedItemRegion(buffer, region, items = []) {
  return validateItemSourcePartition(buffer, region, items).boundedBytes;
}

function reconstructSourceBackedItemRegion(buffer, region, items = []) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array');
  }

  const boundedRegion = normalizeSourceSpan(region, 'region');
  sliceBufferBySourceSpan(buffer, boundedRegion);
  const parts = [];
  let cursor = boundedRegion.startOffset;

  for (let index = 0; index < items.length; index += 1) {
    const span = getItemPartitionSpan(items[index], index);
    if (span.startOffset < cursor) {
      throw new RangeError(`items[${index}] overlaps a prior source span`);
    }
    if (span.endOffset > boundedRegion.endOffset) {
      throw new RangeError(`items[${index}] exceeds itemRegion boundary`);
    }
    if (span.startOffset > cursor) {
      // These bytes are preserved as opaque source data, not claimed as parsed items.
      parts.push(buffer.subarray(cursor, span.startOffset));
    }
    parts.push(buffer.subarray(span.startOffset, span.endOffset));
    cursor = span.endOffset;
  }

  if (cursor < boundedRegion.endOffset) {
    parts.push(buffer.subarray(cursor, boundedRegion.endOffset));
  }

  return Buffer.concat(parts, boundedRegion.length);
}

function normalizeStashPageRegions(page, label = 'page') {
  if (!page || typeof page !== 'object') {
    throw new TypeError(`${label} must be an object`);
  }

  const pageRegion = normalizeSourceSpan(page.pageRegion, `${label}.pageRegion`);
  const itemRegion = normalizeSourceSpan(page.itemRegion, `${label}.itemRegion`);

  if (itemRegion.startOffset < pageRegion.startOffset) {
    throw new RangeError(`${label}.itemRegion must start within ${label}.pageRegion`);
  }

  if (itemRegion.endOffset > pageRegion.endOffset) {
    throw new RangeError(`${label}.itemRegion must end within ${label}.pageRegion`);
  }

  return {
    pageRegion,
    itemRegion,
    headerSpan: createSourceSpan(pageRegion.startOffset, itemRegion.startOffset)
  };
}

export function reconstructStashPageRegion(buffer, page) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('buffer must be a Buffer');
  }

  const { pageRegion, itemRegion, headerSpan } = normalizeStashPageRegions(page);
  const headerBytes = sliceBufferBySourceSpan(buffer, headerSpan);
  const itemRegionBytes = reconstructSourceBackedItemRegion(buffer, itemRegion, page.items ?? []);

  if (itemRegionBytes.length !== itemRegion.length) {
    throw new RangeError(
      `reconstructed itemRegion length ${itemRegionBytes.length} must equal page.itemRegion length ${itemRegion.length}`
    );
  }

  const pageBytes = Buffer.concat(
    [headerBytes, itemRegionBytes],
    headerBytes.length + itemRegionBytes.length
  );

  if (pageBytes.length !== pageRegion.length) {
    throw new RangeError(
      `reconstructed pageRegion length ${pageBytes.length} must equal page.pageRegion length ${pageRegion.length}`
    );
  }

  return pageBytes;
}

function normalizeReconstructedRegion(reconstructedRegion, index, bufferLength) {
  if (!reconstructedRegion || typeof reconstructedRegion !== 'object') {
    throw new TypeError(`reconstructedRegions[${index}] must be an object`);
  }

  if (!Buffer.isBuffer(reconstructedRegion.bytes)) {
    throw new TypeError(`reconstructedRegions[${index}].bytes must be a Buffer`);
  }

  const sourceSpan = normalizeSourceSpan(
    reconstructedRegion.sourceSpan,
    `reconstructedRegions[${index}].sourceSpan`
  );

  if (sourceSpan.endOffset > bufferLength) {
    throw new RangeError(
      `reconstructedRegions[${index}].sourceSpan.endOffset ${sourceSpan.endOffset} exceeds buffer length ${bufferLength}`
    );
  }

  if (reconstructedRegion.bytes.length !== sourceSpan.length) {
    throw new RangeError(
      `reconstructedRegions[${index}].bytes length ${reconstructedRegion.bytes.length} must equal source span length ${sourceSpan.length}`
    );
  }

  return {
    sourceSpan,
    bytes: reconstructedRegion.bytes
  };
}

function stitchReconstructedRegions(buffer, reconstructedRegions = []) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('buffer must be a Buffer');
  }

  if (!Array.isArray(reconstructedRegions)) {
    throw new TypeError('reconstructedRegions must be an array');
  }

  if (reconstructedRegions.length === 0) {
    return Buffer.from(buffer);
  }

  const normalizedRegions = reconstructedRegions
    .map((reconstructedRegion, index) =>
      normalizeReconstructedRegion(reconstructedRegion, index, buffer.length)
    )
    .sort((left, right) => left.sourceSpan.startOffset - right.sourceSpan.startOffset);

  const parts = [];
  let cursor = 0;
  let totalLength = 0;

  for (let index = 0; index < normalizedRegions.length; index += 1) {
    const reconstructedRegion = normalizedRegions[index];
    const { sourceSpan, bytes } = reconstructedRegion;

    if (sourceSpan.startOffset < cursor) {
      throw new RangeError(`reconstructedRegions[${index}] overlaps a prior source span`);
    }

    const untouchedPrefix = buffer.subarray(cursor, sourceSpan.startOffset);
    if (untouchedPrefix.length > 0) {
      parts.push(untouchedPrefix);
      totalLength += untouchedPrefix.length;
    }

    parts.push(bytes);
    totalLength += bytes.length;
    cursor = sourceSpan.endOffset;
  }

  const untouchedSuffix = buffer.subarray(cursor);
  if (untouchedSuffix.length > 0) {
    parts.push(untouchedSuffix);
    totalLength += untouchedSuffix.length;
  }

  return Buffer.concat(parts, totalLength);
}

function isPlugyStashKind(kind) {
  return kind === 'plugy-personal-stash' || kind === 'plugy-shared-stash';
}

export function reconstructParsedSaveBuffer(buffer, parsedSave) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('buffer must be a Buffer');
  }

  if (!parsedSave || typeof parsedSave !== 'object') {
    throw new TypeError('parsedSave must be an object');
  }

  if (parsedSave.kind === 'character') {
    const reconstructedRegions = parsedSave.itemRegion
      ? [{
          sourceSpan: parsedSave.itemRegion,
          bytes: reconstructBoundedItemRegion(buffer, parsedSave.itemRegion, parsedSave.items ?? [])
        }]
      : [];

    return stitchReconstructedRegions(buffer, reconstructedRegions);
  }

  if (isPlugyStashKind(parsedSave.kind)) {
    const pages = parsedSave.pages ?? [];
    if (!Array.isArray(pages)) {
      throw new TypeError('parsedSave.pages must be an array');
    }

    const reconstructedRegions = pages.map((page, index) => ({
      sourceSpan: normalizeSourceSpan(page.pageRegion, `parsedSave.pages[${index}].pageRegion`),
      bytes: reconstructStashPageRegion(buffer, page)
    }));

    return stitchReconstructedRegions(buffer, reconstructedRegions);
  }

  throw new Error(`Unsupported parsed save kind for reconstruction: ${parsedSave.kind}`);
}

function readFileBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function sourceSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function getPd2Tables(options) {
  return options?.pd2Tables ?? loadPd2Tables();
}

const CHARACTER_FOLLOWING_ITEM_SECTION = Buffer.from('4a4d00006a664a4d', 'hex');

function hasOnlyZeroPadding(buffer, startBitOffset, endBitOffset) {
  const paddingBits = endBitOffset - startBitOffset;
  if (paddingBits < 0 || paddingBits > 7) {
    return false;
  }
  for (let bitOffset = startBitOffset; bitOffset < endBitOffset; bitOffset += 1) {
    if (((buffer[bitOffset >>> 3] >>> (bitOffset & 7)) & 1) !== 0) {
      return false;
    }
  }
  return true;
}

function findCharacterPrimaryItemRegion(buffer, startOffset, itemCount, pd2Tables) {
  const candidateOffsets = [];
  for (let offset = buffer.indexOf(CHARACTER_FOLLOWING_ITEM_SECTION, startOffset);
    offset >= 0;
    offset = buffer.indexOf(CHARACTER_FOLLOWING_ITEM_SECTION, offset + 1)) {
    if (offset + 10 <= buffer.length) {
      candidateOffsets.push(offset);
    }
  }

  // The marker begins the next character item section: JM zero-count, jf,
  // then another JM count. Verify the preceding list against the declared root
  // count and its own terminator before treating those bytes as a boundary.
  for (const stopOffset of candidateOffsets.reverse()) {
    let parsed;
    try {
      parsed = parseLegacyItemList(buffer, startOffset, itemCount, stopOffset, pd2Tables);
    } catch {
      continue;
    }
    const lastItem = parsed.items.at(-1);
    const lastPropertyBitOffset = lastItem?.byteOffset * 8 + lastItem?.coreBitLength;
    if (parsed.parsedRootCount === itemCount && parsed.missingSocketChildCount === 0 &&
        parsed.sourceSpan.endOffset === stopOffset &&
        parsed.items.every((item) => item.propertiesComplete) &&
        (lastItem ? hasOnlyZeroPadding(buffer, lastPropertyBitOffset, stopOffset * 8)
          : startOffset === stopOffset)) {
      return parsed;
    }
  }

  return parseLegacyItemList(buffer, startOffset, itemCount, buffer.length, pd2Tables);
}

export function parseCharacterFile(filePath, options = {}) {
  const buffer = readFileBuffer(filePath);
  const pd2Tables = getPd2Tables(options);
  const version = buffer.readUInt32LE(4);
  const declaredSize = buffer.readUInt32LE(8);
  const name = readFixedNullTerminatedAscii(buffer, 20, 16);
  const classId = buffer[40];
  const level = buffer[43];
  const skillsBlockOffset = findAscii(buffer, 'if', 0);
  const itemListOffset = skillsBlockOffset >= 0 ? findAscii(buffer, 'JM', skillsBlockOffset) : -1;
  const itemCount = itemListOffset >= 0 ? buffer.readUInt16LE(itemListOffset + 2) : null;
  const parsedItems = itemListOffset >= 0 && itemCount !== null
    ? findCharacterPrimaryItemRegion(buffer, itemListOffset + 4, itemCount, pd2Tables)
    : { items: [], flatItems: [] };

  return {
    kind: 'character',
    filePath,
    fileName: path.basename(filePath),
    sourceSha256: sourceSha256(buffer),
    version,
    declaredSize,
    actualSize: buffer.length,
    name,
    classId,
    className: CLASS_NAMES[classId] ?? `Unknown (${classId})`,
    level,
    itemListOffset,
    itemCount,
    itemRegion: parsedItems.sourceSpan ?? null,
    items: parsedItems.items,
    topLevelItems: parsedItems.topLevelItems,
    parsedItemCount: parsedItems.topLevelItems?.length ?? 0,
    parsedNodeCount: parsedItems.flatItems.length
  };
}

function getPlugyFirstPageOffset(signature, version) {
  let firstPageOffset = 10;

  if (version === '01' && signature === 'CSTM') {
    firstPageOffset += 4;
  } else if (version === '02') {
    firstPageOffset += 4;
  }

  return firstPageOffset;
}

function parsePlugyPageCandidate(buffer, offset) {
  if (offset + 10 >= buffer.length) {
    return null;
  }

  if (buffer[offset] !== 0x53 || buffer[offset + 1] !== 0x54) {
    return null;
  }

  const flags = buffer.readUInt32LE(offset + 2);
  const { value: name, nextOffset } = readNullTerminatedAscii(buffer, offset + 6, 96);

  if (!name || !isPrintableAscii(name)) {
    return null;
  }

  if (nextOffset + 3 >= buffer.length) {
    return null;
  }

  if (buffer[nextOffset] !== 0x4A || buffer[nextOffset + 1] !== 0x4D) {
    return null;
  }

  const itemCount = buffer.readUInt16LE(nextOffset + 2);
  if (itemCount > 5000) {
    return null;
  }

  return {
    offset,
    flags,
    name,
    itemCount,
    itemListOffset: nextOffset
  };
}

function findNextPlugyPage(buffer, startOffset) {
  for (let offset = startOffset; offset <= buffer.length - 10; offset += 1) {
    const page = parsePlugyPageCandidate(buffer, offset);
    if (page) {
      return page;
    }
  }

  return null;
}

export function parsePlugyStashFile(filePath, options = {}) {
  const buffer = readFileBuffer(filePath);
  const pd2Tables = getPd2Tables(options);
  const signature = buffer.subarray(0, 4).toString('ascii');
  const version = buffer.subarray(4, 6).toString('ascii');
  const firstPageOffset = getPlugyFirstPageOffset(signature, version);
  const rawPages = [];

  let searchOffset = firstPageOffset;
  while (searchOffset < buffer.length) {
    const page = findNextPlugyPage(buffer, searchOffset);
    if (!page) {
      break;
    }

    rawPages.push({
      index: rawPages.length,
      name: page.name,
      flags: page.flags,
      itemCount: page.itemCount,
      offset: page.offset,
      itemListOffset: page.itemListOffset
    });

    searchOffset = page.itemListOffset + 4;
  }

  const pages = rawPages.map((page, index) => {
    const pageStopOffset = rawPages[index + 1]?.offset ?? buffer.length;
    const parsedItems = parseLegacyItemList(
      buffer,
      page.itemListOffset + 4,
      page.itemCount,
      pageStopOffset,
      pd2Tables
    );

    const items = parsedItems.items;
    const topLevelItems = buildLegacyTopLevelItems(items);

    return {
      ...page,
      pageRegion: createSourceSpan(page.offset, pageStopOffset),
      itemRegion: createSourceSpan(page.itemListOffset + 4, pageStopOffset),
      clampedItemCount: parsedItems.unparsedItemCount,
      missingSocketChildCount: parsedItems.missingSocketChildCount,
      items,
      topLevelItems,
      parsedItemCount: topLevelItems.length,
      parsedNodeCount: items.length
    };
  });

  return {
    kind: signature === 'CSTM' ? 'plugy-personal-stash' : 'plugy-shared-stash',
    filePath,
    fileName: path.basename(filePath),
    sourceSha256: sourceSha256(buffer),
    signature,
    version,
    firstPageOffset,
    pageCount: pages.length,
    totalItems: pages.reduce((sum, page) => sum + page.itemCount, 0),
    parsedItemCount: pages.reduce((sum, page) => sum + page.parsedItemCount, 0),
    parsedNodeCount: pages.reduce((sum, page) => sum + page.parsedNodeCount, 0),
    pages
  };
}

export function inspectSaveFile(filePath, options = {}) {
  const extension = getFileExtension(filePath);
  const pd2Tables = getPd2Tables(options);
  if (extension === '.d2s') {
    return enrichParsedSave(parseCharacterFile(filePath, { ...options, pd2Tables }), pd2Tables);
  }

  if (extension === '.d2x' || extension === '.sss') {
    return enrichParsedSave(parsePlugyStashFile(filePath, { ...options, pd2Tables }), pd2Tables);
  }

  throw new Error(`Unsupported file type: ${filePath}`);
}
