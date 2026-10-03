import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { findNextLegacyItemStart } from '../src/lib/legacy-item-parser.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const LIBRARY = getFixtureLibraryDir();
const SHARED_NAME = '_LOD_SharedStashSave.sss';
const SHARED_HASH = 'b8f6a79e9a800c085bd63f092559057294addd404bb7e67afc3ed97252e2b5ed';

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readLittleEndianBits(buffer, bitOffset, width) {
  let value = 0;
  for (let bit = 0; bit < width; bit += 1) {
    const offset = bitOffset + bit;
    value |= ((buffer[offset >>> 3] >>> (offset & 7)) & 1) << bit;
  }
  return value;
}

test('real superior Thresher has a shifted property terminator inside its item bytes', () => {
  const filePath = path.join(LIBRARY, SHARED_NAME);
  const bytes = fs.readFileSync(filePath);
  assert.equal(hash(bytes), SHARED_HASH, 'fixture changed; recheck the raw bit evidence');

  const summary = parsePlugyStashFile(filePath);
  const page = summary.pages.find((entry) => entry.name === 'Bases 3');
  assert.ok(page);
  const thresher = page.items.find((item) =>
    item.code === '7s8' && item.qualityLabel === 'superior' && item.sourceSpan.length === 35
  );
  assert.ok(thresher);

  const startBit = thresher.byteOffset * 8;
  const rawFlags = bytes.readUInt32LE(thresher.byteOffset + 2);
  assert.equal(rawFlags & 0x10, 0x10, 'identified flag is set in the source bytes');
  assert.equal(rawFlags & 0x800, 0x800, 'socketed flag is set in the source bytes');
  assert.equal(thresher.isIdentified, true);
  assert.equal(thresher.isSocketed, true);
  assert.equal(readLittleEndianBits(bytes, startBit + 266, 9), 510);
  assert.equal(readLittleEndianBits(bytes, startBit + 267, 9), 511);
  assert.ok(startBit + 267 + 9 <= thresher.sourceSpan.endOffset * 8);
  assert.equal(thresher.propertiesComplete, true);
  assert.deepEqual(thresher.properties.map((property) => property.statId), [17, 18, 75, 359]);
  assert.deepEqual(thresher.properties.map((property) => property.values),
    [[15], [15], [15], [22913, 100]]);
  assert.equal(hash(fs.readFileSync(filePath)), SHARED_HASH);
});

test('shared stash Miscellaneous count and item spans agree with the next page boundary', () => {
  const filePath = path.join(LIBRARY, SHARED_NAME);
  const summary = parsePlugyStashFile(filePath);
  const pageIndex = summary.pages.findIndex((page) => page.name === 'Miscellaneous');
  assert.ok(pageIndex >= 0);
  const page = summary.pages[pageIndex];
  const nextPage = summary.pages[pageIndex + 1];
  assert.equal(page.itemCount, 147);
  assert.equal(page.parsedItemCount, 147);
  assert.equal(page.clampedItemCount, 0);
  assert.equal(nextPage.name, 'Jewels 1');
  assert.equal(page.pageRegion.endOffset, nextPage.pageRegion.startOffset);

  for (const item of page.items) {
    assert.ok(item.sourceSpan.endOffset <= page.itemRegion.endOffset,
      `${item.code} at ${item.byteOffset} crosses the page boundary`);
  }
});

test('decoded item and property reads stay inside source item boundaries', () => {
  const fixtureNames = [
    'Bases.d2x',
    SHARED_NAME,
    path.join('Showcase Characters', 'amazon', 'cold_arrow.d2s')
  ];

  for (const fixtureName of fixtureNames) {
    const filePath = path.join(LIBRARY, fixtureName);
    const summary = fixtureName.endsWith('.d2s')
      ? parseCharacterFile(filePath)
      : parsePlugyStashFile(filePath);
    const items = summary.pages?.flatMap((page) => page.items) ?? summary.items;

    for (const item of items) {
      const label = `${fixtureName} ${item.code} at ${item.byteOffset}`;
      if (item.isEar) {
        assert.deepEqual(item.propertyLists, [], `${label} has no property payload`);
        continue;
      }
      assert.ok(item.coreBitLength <= item.sourceSpan.length * 8,
        `${label} decoded ${item.coreBitLength} bits from ${item.sourceSpan.length} bytes`);
      for (const list of item.propertyLists ?? []) {
        if (list.complete) continue;
        assert.ok(list.failedBitOffset <= item.sourceSpan.endOffset * 8,
          `${label} failure cursor ${list.failedBitOffset} crosses item end`);
      }
    }
  }
});

test('a JM byte sequence with version 148 inside a Jewel is not an item boundary', () => {
  const filePath = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'uber-stoneraven.d2s');
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.toString('ascii', 1940, 1942), 'JM');
  assert.equal(bytes[1942], 148);
  const next = findNextLegacyItemStart(bytes, 1927, bytes.length, loadPd2Tables());
  assert.equal(next.byteOffset, 1970);
  assert.equal(next.code, 'jew');

  const summary = parseCharacterFile(filePath);
  const jewel = summary.items.find((item) => item.byteOffset === 1925);
  assert.ok(jewel);
  assert.equal(jewel.sourceSpan.endOffset, 1970);
  assert.equal(jewel.propertiesComplete, true);
});

test('PlugY JM counts root items while socket children remain additional nodes', () => {
  const cases = [
    ['Legacy.d2x', 'Season 5 Armor', 13, 21],
    [SHARED_NAME, 'RW Shields 2', 33, 51]
  ];
  for (const [fileName, pageName, roots, nodes] of cases) {
    const summary = parsePlugyStashFile(path.join(LIBRARY, fileName));
    const page = summary.pages.find((entry) => entry.name === pageName);
    assert.ok(page);
    assert.equal(page.itemCount, roots);
    assert.equal(page.parsedItemCount, roots);
    assert.equal(page.topLevelItems.length, roots);
    assert.equal(page.parsedNodeCount, nodes);
    assert.equal(page.items.length, nodes);
    assert.equal(page.items.at(-1).sourceSpan.endOffset, page.itemRegion.endOffset);
    assert.equal(page.topLevelItems.reduce((sum, item) => sum + item.children.length, 0), nodes - roots);
  }
});
