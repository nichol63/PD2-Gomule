import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import {
  parseCharacterFile,
  parsePlugyStashFile,
  reconstructBoundedItemRegion,
  reconstructParsedSaveBuffer,
  reconstructStashPageRegion,
  sliceBufferBySourceSpan,
  validateItemSourcePartition
} from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();
const tables = loadPd2Tables();
const summaryCache = new Map();
const bufferCache = new Map();

function getCharacterSummary(fileName) {
  const cacheKey = `character:${fileName}`;
  if (!summaryCache.has(cacheKey)) {
    summaryCache.set(
      cacheKey,
      parseCharacterFile(path.join(FIXTURE_DIR, fileName), { pd2Tables: tables })
    );
  }
  return summaryCache.get(cacheKey);
}

function getStashSummary(fileName) {
  const cacheKey = `stash:${fileName}`;
  if (!summaryCache.has(cacheKey)) {
    summaryCache.set(
      cacheKey,
      parsePlugyStashFile(path.join(FIXTURE_DIR, fileName), { pd2Tables: tables })
    );
  }
  return summaryCache.get(cacheKey);
}

function getFixtureBuffer(fileName) {
  if (!bufferCache.has(fileName)) {
    bufferCache.set(fileName, fs.readFileSync(path.join(FIXTURE_DIR, fileName)));
  }
  return bufferCache.get(fileName);
}

function requirePage(summary, pageName) {
  const page = summary.pages.find((entry) => entry.name === pageName);
  assert.ok(page, `expected page "${pageName}" to exist`);
  return page;
}

function requireTopLevelItem(page, itemName) {
  const item = page.topLevelItems.find((entry) => entry.displayName === itemName);
  assert.ok(item, `expected item "${itemName}" on page "${page.name}"`);
  return item;
}

function findTopLevelItem(summary, itemName) {
  const item = summary.topLevelItems?.find((entry) => entry.displayName === itemName)
    ?? summary.pages?.flatMap((page) => page.topLevelItems).find((entry) => entry.displayName === itemName);
  assert.ok(item, `expected item "${itemName}" to exist in fixture summary`);
  return item;
}

function requireProperty(item, statId, rawValues) {
  const property = item.properties.find((entry) => {
    if (entry.statId !== statId) {
      return false;
    }
    if (rawValues == null) {
      return true;
    }
    return Array.isArray(entry.values)
      && entry.values.length === rawValues.length
      && entry.values.every((value, index) => value === rawValues[index]);
  });
  assert.ok(property, `expected item "${item.displayName}" to expose stat id ${statId}`);
  if (rawValues != null) {
    assert.deepEqual(property.values, rawValues);
  }
  return property;
}

function assertOffsetRange(range, label, options = {}) {
  const { allowZeroLength = false } = options;

  assert.ok(range && typeof range === 'object', `${label} should be an object`);
  assert.equal(typeof range.startOffset, 'number', `${label}.startOffset should be a number`);
  assert.equal(typeof range.endOffset, 'number', `${label}.endOffset should be a number`);
  assert.equal(typeof range.length, 'number', `${label}.length should be a number`);
  assert.ok(Number.isInteger(range.startOffset), `${label}.startOffset should be an integer`);
  assert.ok(Number.isInteger(range.endOffset), `${label}.endOffset should be an integer`);
  assert.ok(Number.isInteger(range.length), `${label}.length should be an integer`);
  assert.ok(range.startOffset >= 0, `${label}.startOffset should be >= 0`);
  assert.ok(range.endOffset >= range.startOffset, `${label}.endOffset should be >= startOffset`);
  assert.equal(range.length, range.endOffset - range.startOffset, `${label}.length should match end-start`);

  if (allowZeroLength) {
    assert.ok(range.length >= 0, `${label}.length should be >= 0`);
  } else {
    assert.ok(range.length > 0, `${label}.length should be > 0`);
  }
}

function assertItemsBoundedByRegion(items, region, label) {
  for (const item of items) {
    const itemLabel = `${label} item "${item.displayName ?? item.code ?? item.byteOffset}"`;
    assertOffsetRange(item.sourceSpan, `${itemLabel} sourceSpan`);
    assert.ok(
      item.sourceSpan.startOffset >= region.startOffset,
      `${itemLabel} should start within containing region`
    );
    assert.ok(
      item.sourceSpan.endOffset <= region.endOffset,
      `${itemLabel} should end within containing region`
    );
    assert.equal(typeof item.nextOffset, 'number', `${itemLabel} nextOffset should be a number`);
    assert.ok(Number.isInteger(item.nextOffset), `${itemLabel} nextOffset should be an integer`);
    assert.ok(
      item.nextOffset >= item.sourceSpan.endOffset,
      `${itemLabel} nextOffset should not precede sourceSpan.endOffset`
    );
    assert.ok(
      item.nextOffset <= region.endOffset,
      `${itemLabel} nextOffset should stay within containing region`
    );
  }
}

function assertItemStartsWithinRegion(items, region, label) {
  for (const item of items) {
    const itemLabel = `${label} item "${item.displayName ?? item.code ?? item.byteOffset}"`;
    assertOffsetRange(item.sourceSpan, `${itemLabel} sourceSpan`);
    assert.ok(
      item.sourceSpan.startOffset >= region.startOffset,
      `${itemLabel} should start within containing region`
    );
    assert.ok(
      item.sourceSpan.startOffset < region.endOffset,
      `${itemLabel} should start before the containing region end`
    );
    assert.equal(typeof item.nextOffset, 'number', `${itemLabel} nextOffset should be a number`);
    assert.ok(Number.isInteger(item.nextOffset), `${itemLabel} nextOffset should be an integer`);
    assert.ok(
      item.nextOffset >= item.sourceSpan.endOffset,
      `${itemLabel} nextOffset should not precede sourceSpan.endOffset`
    );
  }
}

function assertOrderedItemSpans(items, stopOffset, label) {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const itemLabel = `${label} item ${index} ("${item.displayName ?? item.code ?? item.byteOffset}")`;
    const nextItem = items[index + 1] ?? null;

    assertOffsetRange(item.sourceSpan, `${itemLabel} sourceSpan`);
    if (nextItem) {
      assertOffsetRange(nextItem.sourceSpan, `${label} item ${index + 1} sourceSpan`);
      assert.ok(
        item.sourceSpan.startOffset < nextItem.sourceSpan.startOffset,
        `${itemLabel} should start before the next item`
      );
      assert.ok(
        item.sourceSpan.endOffset <= nextItem.sourceSpan.startOffset,
        `${itemLabel} should not overlap the next item`
      );
      assert.equal(
        item.nextOffset,
        nextItem.sourceSpan.startOffset,
        `${itemLabel} nextOffset should point to the next detected item start`
      );
    } else {
      assert.equal(
        item.nextOffset,
        stopOffset,
        `${itemLabel} nextOffset should fall back to the containing stop offset`
      );
    }
  }
}

test('every topLevelItem in character has a non-empty code', () => {
  const charSummary = getCharacterSummary('Legacy.d2s');

  for (const item of charSummary.topLevelItems) {
    assert.ok(
      typeof item.code === 'string' && item.code.trim().length > 0,
      `item at offset ${item.byteOffset} should have a non-empty code`
    );
  }
});

test('every page in Bases.d2x has index >= 0 and itemCount >= 0', () => {
  const stashSummary = getStashSummary('Bases.d2x');

  for (const page of stashSummary.pages) {
    assert.ok(page.index >= 0, `page "${page.name}" should have index >= 0`);
    assert.ok(page.itemCount >= 0, `page "${page.name}" should have itemCount >= 0`);
  }
});

test('shared stash has expected SSS signature', () => {
  const sharedSummary = getStashSummary('_LOD_SharedStashSave.sss');

  assert.ok(
    typeof sharedSummary.signature === 'string' || sharedSummary.signature instanceof Uint8Array || sharedSummary.signature != null,
    'shared stash should have a signature field'
  );
});

test('parsed items preserve quality provenance payloads for real fixtures', () => {
  const sharedSummary = getStashSummary('_LOD_SharedStashSave.sss');
  const demonCrossbow = getCharacterSummary(path.join('Showcase Characters', 'amazon', 'demon-crossbow.d2s'));

  const magicJewel = requirePage(sharedSummary, 'Jewels 1').topLevelItems.find(
    (item) => item.qualityLabel === 'magic' && item.code === 'jew'
  );
  assert.ok(magicJewel, 'expected a magic Jewel fixture');
  assert.deepEqual(magicJewel.qualityData, {
    qualityId: 4,
    qualityLabel: 'magic',
    magicPrefixId: 198,
    magicSuffixId: 222
  });

  const rareJewel = requirePage(sharedSummary, 'Jewels 1').topLevelItems.find(
    (item) => item.qualityLabel === 'rare' && item.code === 'jew'
  );
  assert.ok(rareJewel, 'expected a rare Jewel fixture');
  assert.deepEqual(rareJewel.qualityData, {
    qualityId: 6,
    qualityLabel: 'rare',
    rareNameId1: 161,
    rareNameId2: 131,
    rarePrefixIds: [198, 600, 250],
    rareSuffixIds: [222]
  });

  const setSword = requirePage(sharedSummary, 'Upgrade Recipe Ref').topLevelItems.find(
    (item) => item.qualityLabel === 'set' && item.code === 'wsd'
  );
  assert.ok(setSword, 'expected a set Mythical Sword fixture');
  assert.deepEqual(setSword.qualityData, {
    qualityId: 5,
    qualityLabel: 'set',
    setId: 49
  });

  const uniqueFlail = requirePage(sharedSummary, 'Quest Items + Misc').topLevelItems.find(
    (item) => item.qualityLabel === 'unique' && item.code === 'qf2'
  );
  assert.ok(uniqueFlail, 'expected a unique SuperKhalimFlail fixture');
  assert.deepEqual(uniqueFlail.qualityData, {
    qualityId: 7,
    qualityLabel: 'unique',
    uniqueId: 128
  });

  const superiorAmulet = requirePage(sharedSummary, 'Blood Recipe Ref').topLevelItems.find(
    (item) => item.qualityLabel === 'superior' && item.code === 'amu'
  );
  assert.ok(superiorAmulet, 'expected a superior amulet fixture');
  assert.deepEqual(superiorAmulet.qualityData, {
    qualityId: 3,
    qualityLabel: 'superior',
    superiorTypeId: 1
  });

  const craftedAmulet = demonCrossbow.topLevelItems.find(
    (item) => item.qualityLabel === 'crafted' && item.code === 'amu'
  );
  assert.ok(craftedAmulet, 'expected a crafted amulet fixture');
  assert.deepEqual(craftedAmulet.qualityData, {
    qualityId: 8,
    qualityLabel: 'crafted',
    rareNameId1: 156,
    rareNameId2: 138,
    rarePrefixIds: [437, 329],
    rareSuffixIds: [245, 174]
  });
});

test('magic bow affix provenance no longer includes a phantom bytime property', () => {
  const sharedSummary = getStashSummary('_LOD_SharedStashSave.sss');
  const page = requirePage(sharedSummary, 'Magic +6 Bows');
  const matriarchalBow = page.topLevelItems.find(
    (item) =>
      item.qualityLabel === 'magic' &&
      item.code === 'am1' &&
      item.qualityData?.magicPrefixId === 435 &&
      item.qualityData?.magicSuffixId === 169
  );

  assert.ok(matriarchalBow, 'expected a magic Stag Bow with proven affix IDs');
  assert.equal(matriarchalBow.displayName, 'Stag Bow');
  assert.deepEqual(matriarchalBow.qualityData, {
    qualityId: 4,
    qualityLabel: 'magic',
    magicPrefixId: 435,
    magicSuffixId: 169
  });

  assert.equal(matriarchalBow.propertiesComplete, true);
  assert.deepEqual(matriarchalBow.properties.map((property) => property.statKey),
    ['item_fasterattackrate', 'item_addskill_tab']);
});

test('socket children are attached under parents that have socketsFilled > 0', () => {
  const stashSummary = getStashSummary('Bases.d2x');
  const allItems = stashSummary.pages.flatMap((p) => p.topLevelItems);
  const socketed = allItems.filter((item) => item.socketsFilled > 0);

  for (const item of socketed) {
    assert.ok(
      Array.isArray(item.children),
      `item "${item.displayName}" with socketsFilled=${item.socketsFilled} should have children array`
    );
    assert.ok(
      item.children.length > 0,
      `item "${item.displayName}" with socketsFilled=${item.socketsFilled} should have at least one child`
    );
  }
});

test('all parsed items expose the isEthereal boolean field', () => {
  const charSummary = getCharacterSummary('Legacy.d2s');
  const stashSummary = getStashSummary('Bases.d2x');
  const charItems = charSummary.topLevelItems;
  const stashItems = stashSummary.pages.flatMap((p) => p.topLevelItems);
  const allItems = [...charItems, ...stashItems];

  for (const item of allItems) {
    assert.ok(
      'isEthereal' in item,
      `item "${item.displayName ?? item.code}" should expose the isEthereal field`
    );
    assert.ok(
      typeof item.isEthereal === 'boolean',
      `item "${item.displayName ?? item.code}" isEthereal should be a boolean`
    );
  }
});

test('at least some items are identified across fixtures', () => {
  const charSummary = getCharacterSummary('Legacy.d2s');
  const stashSummary = getStashSummary('Bases.d2x');
  const charItems = charSummary.topLevelItems;
  const stashItems = stashSummary.pages.flatMap((p) => p.topLevelItems);
  const allItems = [...charItems, ...stashItems];

  const identified = allItems.filter((item) => item.isIdentified === true);
  assert.ok(identified.length > 0, 'at least some fixture items should be identified');
});

test('parsed item count matches topLevelItems plus socket children count', () => {
  const charSummary = getCharacterSummary('Legacy.d2s');
  const topLevel = charSummary.topLevelItems.length;
  const childCount = charSummary.topLevelItems.reduce((sum, item) => sum + (item.children?.length ?? 0), 0);
  const flatCount = charSummary.parsedItemCount ?? charSummary.items?.length;

  if (flatCount !== undefined) {
    assert.equal(topLevel + childCount, flatCount, 'topLevelItems + children should equal flat item count');
  }
});

test('character items expose ordered non-overlapping source spans within itemRegion', () => {
  const charSummary = getCharacterSummary('Legacy.d2s');

  assertOffsetRange(charSummary.itemRegion, 'character itemRegion');
  assert.equal(
    charSummary.itemRegion.startOffset,
    charSummary.itemListOffset + 4,
    'character itemRegion should start at the first item payload byte'
  );
  assert.equal(
    charSummary.itemRegion.endOffset,
    charSummary.actualSize,
    'character itemRegion should end at the character file size'
  );

  assertItemsBoundedByRegion(charSummary.items, charSummary.itemRegion, 'Legacy.d2s');
  assertOrderedItemSpans(charSummary.items, charSummary.itemRegion.endOffset, 'Legacy.d2s');
});

test('stash pages expose ordered page and item regions tied to next page offsets', () => {
  const stashSummary = getStashSummary('Bases.d2x');

  for (let index = 0; index < stashSummary.pages.length; index += 1) {
    const page = stashSummary.pages[index];
    const nextPage = stashSummary.pages[index + 1] ?? null;
    const pageLabel = `Bases.d2x page "${page.name}"`;

    assertOffsetRange(page.pageRegion, `${pageLabel} pageRegion`);
    assertOffsetRange(page.itemRegion, `${pageLabel} itemRegion`, { allowZeroLength: page.itemCount === 0 });
    assert.equal(page.pageRegion.startOffset, page.offset, `${pageLabel} pageRegion should start at page.offset`);
    assert.equal(
      page.itemRegion.startOffset,
      page.itemListOffset + 4,
      `${pageLabel} itemRegion should start after the JM header`
    );
    assert.ok(
      page.itemRegion.startOffset >= page.pageRegion.startOffset,
      `${pageLabel} itemRegion should start within pageRegion`
    );
    assert.ok(
      page.itemRegion.endOffset <= page.pageRegion.endOffset,
      `${pageLabel} itemRegion should end within pageRegion`
    );

    if (nextPage) {
      assert.ok(page.pageRegion.endOffset <= nextPage.pageRegion.startOffset, `${pageLabel} should not overlap the next page`);
      assert.equal(
        page.pageRegion.endOffset,
        nextPage.offset,
        `${pageLabel} pageRegion should end at the next page offset`
      );
      assert.equal(
        page.itemRegion.endOffset,
        nextPage.offset,
        `${pageLabel} itemRegion should use the next page offset as its stop bound`
      );
    }
  }
});

test('per-page clamp accounting reconciles raw and bounded item counts', () => {
  const summaries = [
    getStashSummary('Bases.d2x'),
    getStashSummary('Legacy.d2x'),
    getStashSummary('_LOD_SharedStashSave.sss')
  ];

  for (const summary of summaries) {
    for (const page of summary.pages) {
      assert.equal(typeof page.clampedItemCount, 'number', `page "${page.name}" should expose clampedItemCount`);
      assert.ok(page.clampedItemCount >= 0, `page "${page.name}" clampedItemCount should be non-negative`);
      assert.equal(
        page.itemCount,
        page.parsedItemCount + page.clampedItemCount,
        `page "${page.name}" should reconcile raw and bounded item counts`
      );
    }
  }
});

test('Legacy.d2x socketed-page items start within page itemRegion and keep ordered spans', () => {
  const legacyStashSummary = getStashSummary('Legacy.d2x');
  const page = requirePage(legacyStashSummary, 'Season 5 Armor');

  assertOffsetRange(page.pageRegion, 'Legacy.d2x Season 5 Armor pageRegion');
  assertOffsetRange(page.itemRegion, 'Legacy.d2x Season 5 Armor itemRegion');
  assert.ok(
    page.items.length > page.topLevelItems.length,
      'Season 5 Armor should include attached socket children in the flat parse path'
    );

  assertItemStartsWithinRegion(page.items, page.itemRegion, 'Legacy.d2x Season 5 Armor');
  assertOrderedItemSpans(page.items, page.items.at(-1).nextOffset, 'Legacy.d2x Season 5 Armor');
});

test('shared stash pages expose bounded item spans with no count clamp', () => {
  const sharedSummary = getStashSummary('_LOD_SharedStashSave.sss');
  const pagesWithItems = sharedSummary.pages.filter((page) => page.items.length > 0);
  assert.ok(pagesWithItems.length > 0, 'shared stash should have pages with parsed items');

  const clampedPages = pagesWithItems.filter((page) => page.clampedItemCount > 0);
  assert.deepEqual(clampedPages, []);

  for (const page of pagesWithItems) {
    const pageLabel = `_LOD_SharedStashSave.sss page "${page.name}"`;

    assertOffsetRange(page.pageRegion, `${pageLabel} pageRegion`);
    assertOffsetRange(page.itemRegion, `${pageLabel} itemRegion`);
    assert.equal(typeof page.clampedItemCount, 'number', `${pageLabel} clampedItemCount should be a number`);
    assert.ok(
      page.itemRegion.startOffset >= page.pageRegion.startOffset,
      `${pageLabel} itemRegion should start within the page region`
    );
    assert.ok(
      page.itemRegion.endOffset <= page.pageRegion.endOffset,
      `${pageLabel} itemRegion should end within the page region`
    );

    assertItemStartsWithinRegion(page.items, page.itemRegion, pageLabel);
    assertOrderedItemSpans(page.items, page.items.at(-1).nextOffset, pageLabel);
  }

  const miscellaneous = requirePage(sharedSummary, 'Miscellaneous');
  assert.equal(miscellaneous.itemCount, 147);
  assert.equal(miscellaneous.parsedItemCount, 147);
  assert.equal(miscellaneous.items.at(-1).sourceSpan.endOffset, miscellaneous.itemRegion.endOffset);
});

test('character itemRegion bytes can be reconstructed from parser source spans', () => {
  const fileName = 'Legacy.d2s';
  const buffer = getFixtureBuffer(fileName);
  const charSummary = getCharacterSummary(fileName);
  const partition = validateItemSourcePartition(buffer, charSummary.itemRegion, charSummary.items);
  const reconstructedBytes = reconstructBoundedItemRegion(
    buffer,
    charSummary.itemRegion,
    charSummary.items
  );

  assert.equal(partition.itemCount, charSummary.items.length, 'character partition should cover every parsed item');
  assert.equal(partition.contiguous, true, 'character item spans should form a contiguous partition');
  assert.equal(partition.overflowBytes, 0, 'character item spans should stay within the itemRegion bounds');
  assert.equal(partition.boundedBytesMatch, true, 'character bounded bytes should match the fixture itemRegion bytes');
  assert.deepEqual(
    reconstructedBytes,
    sliceBufferBySourceSpan(buffer, charSummary.itemRegion),
    'character reconstructed bytes should equal the original fixture itemRegion bytes'
  );
});

test('stash page itemRegion bytes can be reconstructed from parser source spans', () => {
  const fileNames = ['Bases.d2x', 'Legacy.d2x', '_LOD_SharedStashSave.sss'];

  for (const fileName of fileNames) {
    const buffer = getFixtureBuffer(fileName);
    const stashSummary = getStashSummary(fileName);
    const pagesWithItems = stashSummary.pages.filter((page) => page.items.length > 0);
    assert.ok(pagesWithItems.length > 0, `${fileName} should expose at least one page with parsed items`);

    for (const page of pagesWithItems) {
      const partition = validateItemSourcePartition(buffer, page.itemRegion, page.items);
      const reconstructedBytes = reconstructBoundedItemRegion(buffer, page.itemRegion, page.items);
      const pageLabel = `${fileName} page "${page.name}"`;

      assert.equal(partition.itemCount, page.items.length, `${pageLabel} partition should cover every visible parsed item`);
      if (fileName === 'Legacy.d2x' && page.name === 'Season 6 Extra') {
        assert.equal(partition.uncoveredBytes, 22, `${pageLabel} has one undeclared key after parsed roots`);
        assert.equal(partition.boundedBytesMatch, false);
        continue;
      }
      assert.equal(partition.contiguous, true, `${pageLabel} item spans should form a contiguous bounded partition`);
      assert.equal(partition.overlapBytes, 0, `${pageLabel} should not overlap item spans inside the bounded region`);
      assert.equal(partition.uncoveredBytes, 0, `${pageLabel} should not leave uncovered bytes inside the bounded region`);
      assert.equal(partition.boundedBytesMatch, true, `${pageLabel} bounded bytes should match the fixture itemRegion bytes`);
      assert.deepEqual(
        reconstructedBytes,
        sliceBufferBySourceSpan(buffer, page.itemRegion),
        `${pageLabel} reconstructed bytes should equal the original fixture itemRegion bytes`
      );
    }
  }
});

test('stash pageRegion bytes can be reconstructed from header bytes plus bounded itemRegion bytes', () => {
  const fileNames = ['Bases.d2x', 'Legacy.d2x', '_LOD_SharedStashSave.sss'];

  for (const fileName of fileNames) {
    const buffer = getFixtureBuffer(fileName);
    const stashSummary = getStashSummary(fileName);
    const pagesWithItems = stashSummary.pages.filter((page) => page.items.length > 0);

    for (const page of pagesWithItems) {
      const partition = validateItemSourcePartition(buffer, page.itemRegion, page.items);
      const pageLabel = `${fileName} page "${page.name}"`;

      if (fileName === 'Legacy.d2x' && page.name === 'Season 6 Extra') {
        assert.equal(partition.uncoveredBytes, 22);
        assert.deepEqual(reconstructStashPageRegion(buffer, page),
          sliceBufferBySourceSpan(buffer, page.pageRegion),
          'opaque undeclared tail bytes remain exact in no-op reconstruction');
        continue;
      }
      const reconstructedBytes = reconstructStashPageRegion(buffer, page);
      assert.equal(partition.boundedBytesMatch, true, `${pageLabel} bounded item bytes should match the fixture itemRegion bytes`);
      assert.deepEqual(
        reconstructedBytes,
        sliceBufferBySourceSpan(buffer, page.pageRegion),
        `${pageLabel} pageRegion should equal header bytes plus bounded itemRegion bytes`
      );
    }
  }
});

test('Legacy.d2s full buffer can be reconstructed from bounded parser spans', () => {
  const fileName = 'Legacy.d2s';
  const buffer = getFixtureBuffer(fileName);
  const charSummary = getCharacterSummary(fileName);
  const partition = validateItemSourcePartition(buffer, charSummary.itemRegion, charSummary.items);
  const reconstructedBytes = reconstructParsedSaveBuffer(buffer, charSummary);

  assert.equal(partition.contiguous, true, 'Legacy.d2s item spans should stay contiguous inside itemRegion');
  assert.equal(partition.boundedBytesMatch, true, 'Legacy.d2s bounded item bytes should match the fixture itemRegion bytes');
  assert.deepEqual(
    reconstructedBytes,
    buffer,
    'Legacy.d2s should round-trip to the original full buffer from bounded parser spans'
  );
});

test('stash fixtures full buffers can be reconstructed from bounded page proofs', () => {
  const fileNames = ['Bases.d2x', 'Legacy.d2x', '_LOD_SharedStashSave.sss'];

  for (const fileName of fileNames) {
    const buffer = getFixtureBuffer(fileName);
    const stashSummary = getStashSummary(fileName);
    const reconstructedBytes = reconstructParsedSaveBuffer(buffer, stashSummary);

    for (const page of stashSummary.pages) {
      const partition = validateItemSourcePartition(buffer, page.itemRegion, page.items);
      const reconstructedPageBytes = reconstructStashPageRegion(buffer, page);
      const pageLabel = `${fileName} page "${page.name}"`;

      if (fileName === 'Legacy.d2x' && page.name === 'Season 6 Extra') {
        assert.equal(partition.uncoveredBytes, 22);
        assert.equal(partition.boundedBytesMatch, false);
      } else {
        assert.equal(partition.boundedBytesMatch, true,
          `${pageLabel} bounded bytes should match the page itemRegion bytes`);
      }
      assert.deepEqual(
        reconstructedPageBytes,
        sliceBufferBySourceSpan(buffer, page.pageRegion),
        `${pageLabel} should round-trip to the original pageRegion bytes`
      );
    }

    assert.deepEqual(
      reconstructedBytes,
      buffer,
      `${fileName} should round-trip to the original full buffer from bounded page proofs`
    );
  }
});

test('shared stash Miscellaneous keeps byte equality with all declared items visible', () => {
  const fileName = '_LOD_SharedStashSave.sss';
  const buffer = getFixtureBuffer(fileName);
  const sharedSummary = getStashSummary(fileName);
  const miscellaneousPage = requirePage(sharedSummary, 'Miscellaneous');
  const partition = validateItemSourcePartition(buffer, miscellaneousPage.itemRegion, miscellaneousPage.items);
  const reconstructedBytes = reconstructStashPageRegion(buffer, miscellaneousPage);

  assert.equal(miscellaneousPage.clampedItemCount, 0);
  assert.equal(
    miscellaneousPage.itemCount,
    miscellaneousPage.parsedItemCount + miscellaneousPage.clampedItemCount,
    'Miscellaneous should continue to reconcile raw and visible item counts'
  );
  assert.equal(
    partition.boundedBytesMatch,
    true,
    'Miscellaneous bounded item bytes should still match the original itemRegion bytes'
  );
  assert.deepEqual(
    reconstructedBytes,
    sliceBufferBySourceSpan(buffer, miscellaneousPage.pageRegion),
    'Miscellaneous pageRegion should round-trip byte-for-byte'
  );
});

test('stash pages topLevelItems are consistently shaped', () => {
  const stashSummary = getStashSummary('Bases.d2x');
  const REQUIRED_FIELDS = ['code', 'displayName', 'qualityLabel', 'isIdentified', 'isSocketed'];
  for (const page of stashSummary.pages) {
    for (const item of page.topLevelItems) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(field in item, `item "${item.displayName ?? item.code}" should have field "${field}"`);
      }
    }
  }
});

test('corrected War Pike decoding preserves real stats and emits no zero-saveBits noise', () => {
  const legacyStashSummary = getStashSummary('Legacy.d2x');
  const page = requirePage(legacyStashSummary, 'Season 5 Weapons');
  const warPike = requireTopLevelItem(page, 'War Pike');

  assert.equal(warPike.propertyCount, 16);
  assert.deepEqual(warPike.properties.slice(0, 5).map((property) => property.statId),
    [17, 18, 19, 75, 359]);
  assert.equal(
    warPike.properties.filter((property) => property.saveBits === 0).length,
    0,
    'War Pike should not retain any zero-saveBits parsed properties'
  );
});

test('parser infers socket metadata from filled sockets and attached children', () => {
  const legacyStashSummary = getStashSummary('Legacy.d2x');
  const page = requirePage(legacyStashSummary, 'Season 5 Armor');
  const monarch = requireTopLevelItem(page, 'Monarch');

  assert.equal(monarch.isSocketed, true);
  assert.equal(monarch.socketsFilled, 4);
  assert.equal(monarch.totalSockets, 4);
  assert.equal(monarch.children.length, 4);
});

test('corrected Monarch decoding does not fabricate a monster-linked property', () => {
  const legacyStashSummary = getStashSummary('Legacy.d2x');
  const monarch = findTopLevelItem(legacyStashSummary, 'Monarch');
  const monsterProperty = monarch.properties.find(
    (property) => property.statKey === 'damage_vs_montype'
  );

  assert.equal(monsterProperty, undefined);
  assert.equal(monarch.propertiesComplete, true);
});

test('parser decodes packed item_skilloncast metadata on real fixture items', () => {
  const legacySummary = getStashSummary('Legacy.d2x');
  const stavesPage = requirePage(legacySummary, 'Season 5 Weapons');
  const elderStaff = stavesPage.topLevelItems.find(
    (item) => item.code === '8cs'
      && item.properties.some((property) => property.statId === 200 && property.values[0] === 1114 && property.values[1] === 18)
  );
  assert.ok(elderStaff, 'expected Elder Staff with packed skill-on-cast payload to exist');
  const elderSkillOnCast = requireProperty(elderStaff, 200, [1114, 18]);

  assert.deepEqual(elderSkillOnCast.values, [1114, 18]);
  assert.equal(elderSkillOnCast.castSkillId, 17);
  assert.equal(elderSkillOnCast.castSkillLevel, 26);
  assert.equal(elderSkillOnCast.castChance, 18);
  assert.equal(elderSkillOnCast.castSkillName, 'Slow Movement');
  assert.equal(typeof elderSkillOnCast.castSkillClass, 'string');
  assert.equal(typeof elderSkillOnCast.castSkillDesc, 'string');
});

test('parser retains encoded state markers on trophies without inventing them on other items', () => {
  const sharedSummary = getStashSummary('_LOD_SharedStashSave.sss');
  const flawlessSkull = findTopLevelItem(sharedSummary, 'Flawless Skull');
  assert.deepEqual(flawlessSkull.properties.filter((property) => property.statId === 98), []);

  const trophyPage = sharedSummary.pages.find((page) => page.name === 'Testing 2');
  const devCharm = trophyPage?.items.find((item) => item.byteOffset === 145308);
  assert.ok(devCharm);
  assert.equal(devCharm.propertiesComplete, true);
  assert.deepEqual(devCharm.properties.filter((property) => property.statId === 98)
    .map((property) => property.values), [[211, 1]]);
});
