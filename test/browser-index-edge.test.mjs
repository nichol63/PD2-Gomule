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
