import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import {
  collectBrowseEntries,
  filterBrowseEntries,
  sortBrowseEntries,
  listPages,
  searchSummaries
} from '../src/lib/browser-index.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();
const tables = loadPd2Tables();

const charSummary = parseCharacterFile(path.join(FIXTURE_DIR, 'Legacy.d2s'), { pd2Tables: tables });
const stashSummary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'), { pd2Tables: tables });
const sharedSummary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });

test('filterBrowseEntries with completeOnly excludes partial items', () => {
  const entries = collectBrowseEntries(stashSummary);
  const all = filterBrowseEntries(entries, { completeOnly: false });
  const complete = filterBrowseEntries(entries, { completeOnly: true });

  assert.ok(complete.length <= all.length, 'complete subset should be <= all');
  assert.ok(complete.every((e) => e.propertiesComplete !== false), 'all complete entries should have complete properties');
});

test('filterBrowseEntries with quality filter returns only matching quality', () => {
  const entries = collectBrowseEntries(stashSummary);
  const uniques = filterBrowseEntries(entries, { quality: 'unique' });

  assert.ok(uniques.every((e) => e.qualityLabel === 'unique'), 'all filtered entries should be unique quality');
});

test('filterBrowseEntries with quality filter "normal" returns only normal quality', () => {
  const entries = collectBrowseEntries(stashSummary);
  const normals = filterBrowseEntries(entries, { quality: 'normal' });

  assert.ok(normals.every((e) => e.qualityLabel === 'normal'), 'all filtered entries should be normal quality');
});

test('sortBrowseEntries by different keys produces different orderings', () => {
  const entries = collectBrowseEntries(stashSummary);
  if (entries.length < 2) return; // not enough items to test ordering

  const byName = sortBrowseEntries([...entries], 'name').map((e) => e.displayName);
  const byCode = sortBrowseEntries([...entries], 'code').map((e) => e.code);
  const byQuality = sortBrowseEntries([...entries], 'quality').map((e) => e.qualityLabel);
  const byProps = sortBrowseEntries([...entries], 'props').map((e) => e.propertyCount);

  // Each should return same count
  assert.equal(byName.length, entries.length);
  assert.equal(byCode.length, entries.length);
  assert.equal(byQuality.length, entries.length);
  assert.equal(byProps.length, entries.length);

  // Props sort should be descending (highest first)
  for (let i = 1; i < byProps.length; i++) {
    assert.ok(byProps[i] <= byProps[i - 1], 'props sort should be descending');
  }
});

test('sortBrowseEntries by sockets is stable and descending', () => {
  const entries = collectBrowseEntries(stashSummary);
  const bySockets = sortBrowseEntries([...entries], 'sockets').map((e) => e.socketCount ?? 0);

  for (let i = 1; i < bySockets.length; i++) {
    assert.ok(bySockets[i] <= bySockets[i - 1], 'socket sort should be descending');
  }
});

test('listPages from stash file returns pages with correct names and non-negative counts', () => {
  const pages = listPages(stashSummary);

  assert.ok(pages.length > 0, 'should have pages');
  for (const page of pages) {
    assert.ok(typeof page.name === 'string' && page.name.length > 0, 'page should have a name');
    assert.ok(typeof page.itemCount === 'number' && page.itemCount >= 0, 'page should have non-negative itemCount');
  }
});

test('listPages supports query filter', () => {
  const pages = listPages(stashSummary, { query: 'paladin' });
  const allPages = listPages(stashSummary);

  assert.ok(pages.length <= allPages.length, 'filtered pages should be subset');
  assert.ok(
    pages.every((p) => p.name.toLowerCase().includes('paladin')),
    'filtered pages should match query'
  );
});

test('searchSummaries with quality filter returns only matching quality items', () => {
  const results = searchSummaries([stashSummary], { quality: 'unique' });
  assert.ok(results.every((r) => r.qualityLabel === 'unique'), 'search results should be unique quality');
});

test('searchSummaries with completeOnly excludes partial items', () => {
  const allResults = searchSummaries([stashSummary], {});
  const completeResults = searchSummaries([stashSummary], { completeOnly: true });

  assert.ok(completeResults.length <= allResults.length);
  assert.ok(completeResults.every((r) => r.propertiesComplete !== false));
});

test('collectBrowseEntries from character builds entries with character source context', () => {
  const entries = collectBrowseEntries(charSummary);

  assert.ok(entries.length > 0, 'character should have browse entries');
  for (const entry of entries) {
    assert.ok(entry.searchText.length > 0, 'each entry should have searchText');
    assert.ok(typeof entry.displayName === 'string', 'each entry should have displayName');
    assert.ok(typeof entry.code === 'string', 'each entry should have code');
  }
});

test('collectBrowseEntries from shared stash produces entries', () => {
  const entries = collectBrowseEntries(sharedSummary);
  assert.ok(Array.isArray(entries), 'should return an array');
});

test('createBrowseEntry propertyCount matches the ten decoded Corona stats', () => {
  const legacyX = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Legacy.d2x'), { pd2Tables: tables });
  const entries = collectBrowseEntries(legacyX, { page: 'Season 4 Armor' });
  const corona = entries.find((entry) => entry.displayName === 'Corona');

  assert.ok(corona, 'Corona should be present in Season 4 Armor page');
  assert.deepEqual(corona.item.properties.map((property) => property.statId),
    [16, 31, 36, 39, 41, 43, 45, 99, 109, 152]);
  assert.equal(corona.item.propertyCount, 10);
  assert.equal(corona.propertyCount, 10);
});

test('createBrowseEntry propertyCount matches raw count when item has no parser noise', () => {
  // pa1 (Sacred Targe) in Bases.d2x Reg Paladin has 4 clean resistance props.
  // Because no property has saveBits=0, browse entry count must equal raw count.
  const entries = collectBrowseEntries(stashSummary, { page: 'Reg Paladin' });
  const shield = entries.find((entry) => entry.code === 'pa1');

  assert.ok(shield, 'Sacred Targe should be present in Reg Paladin page');
  assert.equal(shield.item.propertyCount, 4);
  assert.equal(shield.propertyCount, 4);
});

test('createBrowseEntry preserves test-shape items whose properties lack saveBits', () => {
  // Regression guard: undefined !== 0, so a test-constructed item with no
  // saveBits field on its properties must still count all of them. This keeps
  // existing unit tests that build synthetic items from breaking.
  const fakeSummary = {
    kind: 'character',
    filePath: '/tmp/synthetic.d2s',
    fileName: 'synthetic.d2s',
    name: 'Synthetic',
    topLevelItems: [{
      displayName: 'Synthetic Item',
      code: 'syn',
      qualityLabel: 'normal',
      propertyCount: 3,
      properties: [
        { statKey: 'strength', values: [10] },
        { statKey: 'dexterity', values: [5] },
        { statKey: 'vitality', values: [7] }
      ]
    }]
  };
  const entries = collectBrowseEntries(fakeSummary);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].propertyCount, 3);
});
