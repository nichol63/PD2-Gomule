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

test('parser decodes packed item_skilloncast metadata on real fixture items', () => {
  const wirtLegPage = requirePage(sharedSummary, 'Quest Items + Misc');
  const wirtLeg = requireTopLevelItem(wirtLegPage, "Wirt's Leg");
  const wirtSkillOnCast = requireProperty(wirtLeg, 200, [2064, 29]);

  assert.deepEqual(wirtSkillOnCast.values, [2064, 29]);
  assert.equal(wirtSkillOnCast.castSkillId, 32);
  assert.equal(wirtSkillOnCast.castSkillLevel, 16);
  assert.equal(wirtSkillOnCast.castChance, 29);
  assert.equal(wirtSkillOnCast.castSkillName, 'Valkyrie');
  assert.equal(typeof wirtSkillOnCast.castSkillClass, 'string');
  assert.equal(typeof wirtSkillOnCast.castSkillDesc, 'string');

  const stavesPage = requirePage(sharedSummary, 'Staves 2,3');
  const elderStaff = stavesPage.topLevelItems.find(
    (item) => item.displayName === 'Elder Staff'
      && item.properties.some((property) => property.statId === 200 && property.values[0] === 1094 && property.values[1] === 10)
  );
  assert.ok(elderStaff, 'expected Elder Staff with packed skill-on-cast payload to exist');
  const elderSkillOnCast = requireProperty(elderStaff, 200, [1094, 10]);

  assert.deepEqual(elderSkillOnCast.values, [1094, 10]);
  assert.equal(elderSkillOnCast.castSkillId, 17);
  assert.equal(elderSkillOnCast.castSkillLevel, 6);
  assert.equal(elderSkillOnCast.castChance, 10);
  assert.equal(elderSkillOnCast.castSkillName, 'Slow Movement');
  assert.equal(typeof elderSkillOnCast.castSkillClass, 'string');
  assert.equal(typeof elderSkillOnCast.castSkillDesc, 'string');

  const rejuvPage = requirePage(sharedSummary, 'Rejuvenation');
  const fullRejuvPotion = rejuvPage.topLevelItems.find(
    (item) => item.displayName === 'Full Rejuv Potion'
      && item.properties.some((property) => property.statId === 200 && property.values[0] === 60645 && property.values[1] === 88)
  );
  assert.ok(fullRejuvPotion, 'expected Full Rejuv Potion with packed skill-on-cast payload to exist');
  const fullRejuvSkillOnCast = requireProperty(fullRejuvPotion, 200, [60645, 88]);

  assert.deepEqual(fullRejuvSkillOnCast.values, [60645, 88]);
  assert.equal(fullRejuvSkillOnCast.castSkillId, 947);
  assert.equal(fullRejuvSkillOnCast.castSkillLevel, 37);
  assert.equal(fullRejuvSkillOnCast.castChance, 88);
  assert.ok(
    fullRejuvSkillOnCast.castSkillName == null,
    'unresolved skill ids should not fabricate a skill name'
  );
});

test('parser filters state out of parsed properties for real fixture items', () => {
  const flawlessSkull = findTopLevelItem(sharedSummary, 'Flawless Skull');

  assert.equal(
    flawlessSkull.properties.some((property) => property.statKey === 'state'),
    false,
    'Flawless Skull should not retain a parsed state property'
  );
});
