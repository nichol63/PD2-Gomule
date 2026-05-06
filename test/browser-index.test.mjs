import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  collectBrowseEntries,
  filterBrowseEntries,
  listPages,
  resolvePage,
  searchSummaries,
  sortBrowseEntries
} from '../src/lib/browser-index.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();

test('resolves stash pages by index and name', () => {
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'));
  const byIndex = resolvePage(summary, '2');
  const byName = resolvePage(summary, 'Reg Paladin');
  const filteredPages = listPages(summary, { query: 'paladin' });

  assert.equal(byIndex?.name, 'Reg Helm');
  assert.equal(byName?.name, 'Reg Paladin');
  assert.deepEqual(filteredPages.map((page) => page.name), [
    'Reg Paladin',
    'Reg Paladin Eth',
    'Sup Paladin',
    'Sup Paladin Eth',
    'Mag Paladin',
    'Mag Paladin Eth'
  ]);
});

test('builds browse entries from top-level page items', () => {
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'));
  const page = summary.pages.find((entry) => entry.name === 'Reg Paladin');
  const entries = collectBrowseEntries(summary, { page: 'Reg Paladin' });
  const filtered = filterBrowseEntries(entries, { query: 'pa1 sacred targe' });

  assert.ok(page);
  assert.equal(entries.length, page.topLevelItems.length);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].code, 'pa1');
  assert.equal(filtered[0].propertyCount, 4);
  assert.equal(filtered[0].propertiesComplete, true);
});

test('surfaces incomplete property decoding without breaking browse results', () => {
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'));
  const entries = collectBrowseEntries(summary, { page: 'Mag Chest 2' });
  const filtered = filterBrowseEntries(entries, { query: 'uul shadow plate' });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].code, 'uul');
  assert.equal(filtered[0].propertiesComplete, false);
  assert.match(filtered[0].item.propertyParseError, /stat id 508/);
});

test('sorts browse entries and searches across summaries', () => {
  const stashSummary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'));
  const characterSummary = parseCharacterFile(path.join(FIXTURE_DIR, 'Legacy.d2s'));
  const sortedCodes = sortBrowseEntries(
    collectBrowseEntries(stashSummary, { page: 'Reg Helm' }),
    'code'
  ).map((entry) => entry.code);
  const searchResults = searchSummaries(
    [stashSummary, characterSummary],
    { query: 'horadric cube', limit: 5 }
  );

  assert.deepEqual(sortedCodes.slice(0, 4), ['bhm', 'cap', 'ci0', 'ci1']);
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].code, 'box');
  assert.equal(searchResults[0].displayName, 'Horadric Cube');
});
