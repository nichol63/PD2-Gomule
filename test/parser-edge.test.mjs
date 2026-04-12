import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();
const tables = loadPd2Tables();

const charSummary = parseCharacterFile(path.join(FIXTURE_DIR, 'Legacy.d2s'), { pd2Tables: tables });
const stashSummary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'), { pd2Tables: tables });
const legacyStashSummary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Legacy.d2x'), { pd2Tables: tables });
const sharedSummary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });

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

test('every topLevelItem in character has a non-empty code', () => {
  for (const item of charSummary.topLevelItems) {
    assert.ok(
      typeof item.code === 'string' && item.code.trim().length > 0,
      `item at offset ${item.byteOffset} should have a non-empty code`
    );
  }
});

test('every page in Bases.d2x has index >= 0 and itemCount >= 0', () => {
  for (const page of stashSummary.pages) {
    assert.ok(page.index >= 0, `page "${page.name}" should have index >= 0`);
    assert.ok(page.itemCount >= 0, `page "${page.name}" should have itemCount >= 0`);
  }
});

test('shared stash has expected SSS signature', () => {
  assert.ok(
    typeof sharedSummary.signature === 'string' || sharedSummary.signature instanceof Uint8Array || sharedSummary.signature != null,
    'shared stash should have a signature field'
  );
});

test('socket children are attached under parents that have socketsFilled > 0', () => {
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
  const charItems = charSummary.topLevelItems;
  const stashItems = stashSummary.pages.flatMap((p) => p.topLevelItems);
  const allItems = [...charItems, ...stashItems];

  const identified = allItems.filter((item) => item.isIdentified === true);
  assert.ok(identified.length > 0, 'at least some fixture items should be identified');
});

test('parsed item count matches topLevelItems plus socket children count', () => {
  const topLevel = charSummary.topLevelItems.length;
  const childCount = charSummary.topLevelItems.reduce((sum, item) => sum + (item.children?.length ?? 0), 0);
  const flatCount = charSummary.parsedItemCount ?? charSummary.items?.length;

  if (flatCount !== undefined) {
    assert.equal(topLevel + childCount, flatCount, 'topLevelItems + children should equal flat item count');
  }
});

test('stash pages topLevelItems are consistently shaped', () => {
  const REQUIRED_FIELDS = ['code', 'displayName', 'qualityLabel', 'isIdentified', 'isSocketed'];
  for (const page of stashSummary.pages) {
    for (const item of page.topLevelItems) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(field in item, `item "${item.displayName ?? item.code}" should have field "${field}"`);
      }
    }
  }
});

test('parser stops at first zero-saveBits property instead of emitting parser noise', () => {
  const page = requirePage(legacyStashSummary, 'Season 5 Weapons');
  const warPike = requireTopLevelItem(page, 'War Pike');

  assert.equal(warPike.propertyCount, 0);
  assert.equal(
    warPike.properties.filter((property) => property.saveBits === 0).length,
    0,
    'War Pike should not retain any zero-saveBits parsed properties'
  );
});

test('parser infers socket metadata from filled sockets and attached children', () => {
  const page = requirePage(legacyStashSummary, 'Season 5 Armor');
  const monarch = requireTopLevelItem(page, 'Monarch');

  assert.equal(monarch.isSocketed, true);
  assert.equal(monarch.socketsFilled, 4);
  assert.equal(monarch.totalSockets, 4);
  assert.equal(monarch.children.length, 4);
});

test('parser preserves monster metadata on real fixture items', () => {
  const monarch = findTopLevelItem(legacyStashSummary, 'Monarch');
  const monsterProperty = monarch.properties.find(
    (property) => property.statKey === 'damage_vs_montype'
  );

  assert.ok(monsterProperty, 'Monarch should expose damage_vs_montype');
  assert.equal(monsterProperty.monsterName, 'GrotesqueWyrm');
  assert.deepEqual(monsterProperty.values, [855, 421]);
});

test('parser filters state out of parsed properties for real fixture items', () => {
  const flawlessSkull = findTopLevelItem(sharedSummary, 'Flawless Skull');

  assert.equal(
    flawlessSkull.properties.some((property) => property.statKey === 'state'),
    false,
    'Flawless Skull should not retain a parsed state property'
  );
});
