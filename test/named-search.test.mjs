import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBrowseEntries, filterBrowseEntries } from '../src/lib/browser-index.mjs';

test('named item search retains its base name alongside its resolved identity', () => {
  const item = { displayName: 'Eaglehorn', baseName: 'Crusader Bow', code: '6l7', qualityLabel: 'unique', properties: [], children: [] };
  const entries = collectBrowseEntries({ kind: 'character', fileName: 'copy.d2s', filePath: 'copy.d2s', name: 'Mule', topLevelItems: [item] });
  assert.equal(filterBrowseEntries(entries, { query: 'eaglehorn' }).length, 1);
  assert.equal(filterBrowseEntries(entries, { query: 'crusader bow' }).length, 1);
  assert.equal(filterBrowseEntries(entries, { query: 'eaglehorn crusader' }).length, 1);
  assert.equal(entries[0].baseName, 'Crusader Bow');
});
