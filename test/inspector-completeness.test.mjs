import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';

import { buildInspectorView, getItemKey, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { collectBrowseEntries } from '../src/lib/browser-index.mjs';
import { startInspectorServer } from '../src/lib/inspector-server.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const BASES = path.join(getFixtureLibraryDir(), 'Bases.d2x');
const hashFile = () => createHash('sha256').update(fs.readFileSync(BASES)).digest('hex');
const originalHash = hashFile();
const WORKSPACE = 'workspace-library';

function unchanged(t) { t.after(() => assert.equal(hashFile(), originalHash)); }

function markPartial(workspace) {
  const source = workspace.sources[0], page = source.summary.pages[1];
  assert.equal(source.summary.totalItems, 2586);
  assert.equal(page.topLevelItems.length, 28);
  const item = page.topLevelItems[0];
  assert.equal(item.code, 'ci3');
  assert.equal(item.propertiesComplete, true);
  item.propertiesComplete = false;
  const entry = collectBrowseEntries(source.summary).find(entry => entry.item === item);
  assert.ok(entry);
  return { source, item, key: getItemKey(entry) };
}

function setup(t) {
  unchanged(t);
  const workspace = loadInspectorWorkspace([BASES]);
  return { workspace, ...markPartial(workspace) };
}

function excludes(view, key) {
  assert.ok(!view.matches.some(item => item.itemKey === key));
  assert.notEqual(view.selectedItem?.itemKey, key);
  assert.ok(!view.panels.some(panel => panel.items.some(item => item.itemKey === key)));
}

function noResults(view) {
  assert.equal(view.summary.matchedItemCount, 0);
  assert.deepEqual(view.matches, []);
  assert.equal(view.selectedItem, null);
  assert.deepEqual(view.panels, []);
}

test('workspace and source completeness use the existing exact boolean normalization consistently', t => {
  const { workspace, source, key } = setup(t);
  for (const [value, enabled] of [[true, true], ['true', true], ['1', true],
    [' TRUE ', false], [false, false], ['false', false], [undefined, false]]) {
    const options = { sourceId: WORKSPACE, completeOnly: value };
    const view = buildInspectorView(workspace, options);
    assert.equal(options.completeOnly, value, 'caller options must remain untouched');
    assert.equal(view.filters.completeOnly, enabled, String(value));
    assert.equal(view.summary.visibleItemCount, 2586);
    assert.equal(view.summary.matchedItemCount, enabled ? 2585 : 0);
    if (enabled) {
      assert.equal(view.matches.length, 2585);
      excludes(view, key);
    } else {
      noResults(view); // An unfiltered workspace remains an inactive search.
    }

    const page = buildInspectorView(workspace, { sourceId: source.id, page: '2', completeOnly: value });
    assert.equal(page.filters.completeOnly, enabled);
    assert.equal(page.summary.visibleItemCount, 28);
    assert.equal(page.summary.matchedItemCount, enabled ? 27 : 28);
    if (enabled) excludes(page, key);
    else assert.ok(page.matches.some(item => item.itemKey === key));
  }
});

test('an explicitly selected partial root is excluded from matches, details, and rendered panels', t => {
  const { workspace, source, key } = setup(t);
  for (const sourceId of [WORKSPACE, source.id]) {
    const options = { sourceId, page: '2', query: 'ci3', selectedItemKey: key };
    const all = buildInspectorView(workspace, { ...options, completeOnly: 'false' });
    assert.equal(all.selectedItem.itemKey, key);
    assert.equal(all.selectedItem.propertyStatus, 'partial');
    assert.equal(all.matches.length, sourceId === WORKSPACE ? 6 : 1);
    const complete = buildInspectorView(workspace, { ...options, completeOnly: 'true' });
    assert.equal(complete.filters.completeOnly, true);
    excludes(complete, key);
    if (sourceId === WORKSPACE) {
      assert.equal(complete.matches.length, 5);
      assert.equal(complete.selectedItem.propertyStatus, 'complete');
    } else noResults(complete);
  }
});

test('query, quality, sort, and socket combinations apply the same normalized completeness predicate', t => {
  const { workspace, source, key } = setup(t);
  const socketEntry = collectBrowseEntries(source.summary).find(entry => entry.item.totalSockets > 0);
  assert.ok(socketEntry);
  assert.equal(socketEntry.item.code, 'hla');
  socketEntry.item.propertiesComplete = false;
  const socketKey = getItemKey(socketEntry);
  const combinations = [
    { query: 'ci3', quality: 'normal', sort: 'code', key },
    { query: 'diadem', quality: 'normal', sort: 'quality', key },
    { query: 'hla', quality: 'magic', sort: 'name', socketFilter: 'has-sockets', key: socketKey }
  ];
  for (const { key: excludedKey, ...filters } of combinations) {
    const options = { sourceId: WORKSPACE, ...filters, selectedItemKey: excludedKey };
    const unfiltered = buildInspectorView(workspace, { ...options, completeOnly: 'false' });
    assert.equal(unfiltered.selectedItem.itemKey, excludedKey);
    const stringView = buildInspectorView(workspace, { ...options, completeOnly: 'true' });
    const booleanView = buildInspectorView(workspace, { ...options, completeOnly: true });
    assert.deepEqual(stringView, booleanView);
    assert.equal(stringView.summary.matchedItemCount, unfiltered.summary.matchedItemCount - 1);
    assert.equal(stringView.filters.completeOnly, true);
    assert.equal(stringView.filters.query, filters.query);
    assert.equal(stringView.filters.quality, filters.quality);
    assert.equal(stringView.filters.sort, filters.sort);
    excludes(stringView, excludedKey);
  }
});

test('when every matching real root is partial, workspace and source views have no fallback selection', t => {
  const { workspace, source, key } = setup(t);
  const entries = collectBrowseEntries(source.summary).filter(entry => entry.item.code === 'ci3');
  assert.equal(entries.length, 6);
  for (const entry of entries) entry.item.propertiesComplete = false;
  for (const sourceId of [WORKSPACE, source.id]) {
    const view = buildInspectorView(workspace, { sourceId, page: '2', query: 'ci3',
      selectedItemKey: key, completeOnly: 'true' });
    assert.equal(view.filters.completeOnly, true);
    noResults(view);
  }
});

function readJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try { assert.equal(response.statusCode, 200, body); resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
      response.on('error', reject);
    }).on('error', reject);
  });
}

test('HTTP string completeness filters exclude an in-memory partial root and preserve false queries', async t => {
  unchanged(t);
  const { server, url, workspace } = await startInspectorServer([BASES], { host: '127.0.0.1', port: 0 });
  try {
    const { source, key } = markPartial(workspace);
    const request = options => readJson(`${url}/api/view?${new URLSearchParams(options)}`);
    const complete = await request({ sourceId: WORKSPACE, completeOnly: 'true' });
    assert.equal(complete.filters.completeOnly, true);
    assert.equal(complete.summary.visibleItemCount, 2586);
    assert.equal(complete.summary.matchedItemCount, 2585);
    excludes(complete, key);

    const query = { sourceId: WORKSPACE, query: 'ci3', selectedItemKey: key };
    const partial = await request({ ...query, completeOnly: 'false' });
    assert.equal(partial.filters.completeOnly, false);
    assert.equal(partial.matches.length, 6);
    assert.equal(partial.selectedItem.itemKey, key);
    assert.equal(partial.selectedItem.propertyStatus, 'partial');
    const queriedComplete = await request({ ...query, completeOnly: 'true' });
    assert.equal(queriedComplete.matches.length, 5);
    excludes(queriedComplete, key);
    const uppercase = await request({ ...query, completeOnly: ' TRUE ' });
    assert.equal(uppercase.filters.completeOnly, false);
    assert.equal(uppercase.selectedItem.itemKey, key);

    const page = await request({ sourceId: source.id, page: '2', completeOnly: 'true' });
    assert.equal(page.filters.completeOnly, true);
    assert.equal(page.summary.matchedItemCount, 27);
    excludes(page, key);
    const inactive = await request({ sourceId: WORKSPACE });
    assert.equal(inactive.filters.completeOnly, false);
    noResults(inactive);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
