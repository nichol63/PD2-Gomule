import fs from 'node:fs';
import path from 'node:path';

import { loadPd2Tables } from './pd2-data.mjs';
import { buildLegacyTopLevelItems, parseLegacyItemList } from './legacy-item-parser.mjs';
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

function readFileBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function getPd2Tables(options) {
  return options?.pd2Tables ?? loadPd2Tables();
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
    ? parseLegacyItemList(
        buffer,
        itemListOffset + 4,
        itemCount,
        buffer.length,
        pd2Tables
      )
    : { items: [], flatItems: [] };

  return {
    kind: 'character',
    filePath,
    fileName: path.basename(filePath),
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
    parsedItemCount: parsedItems.items.length,
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
      buffer.length,
      pd2Tables
    );

    // Shared-stash fixtures can contain plausible-looking later page headers inside
    // item payload bytes. Keep parsing against the full file for resilience, then
    // clamp the page-local item view by start offset while preserving the parser's
    // original per-item spans and next-offset metadata.
    const items = parsedItems.items.filter((item) => item.byteOffset < pageStopOffset);
    const topLevelItems = buildLegacyTopLevelItems(items);

    return {
      ...page,
      pageRegion: createSourceSpan(page.offset, pageStopOffset),
      itemRegion: createSourceSpan(page.itemListOffset + 4, pageStopOffset),
      clampedItemCount: parsedItems.items.length - items.length,
      items,
      topLevelItems,
      parsedItemCount: items.length,
      parsedNodeCount: items.length
    };
  });

  return {
    kind: signature === 'CSTM' ? 'plugy-personal-stash' : 'plugy-shared-stash',
    filePath,
    fileName: path.basename(filePath),
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
  if (extension === '.d2s') {
    return parseCharacterFile(filePath, options);
  }

  if (extension === '.d2x' || extension === '.sss') {
    return parsePlugyStashFile(filePath, options);
  }

  throw new Error(`Unsupported file type: ${filePath}`);
}
