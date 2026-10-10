import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { Element } from './helpers/ui-element.mjs';
import { summarizeCollection } from '../src/lib/collection-tracker.mjs';
import { collectionProgress, collectionRows, describeCopyLocation } from '../src/lib/collection-view.mjs';
import { startInspectorServer } from '../src/lib/inspector-server.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();
const FREEZING_ARROW = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const LEGACY_STASH = path.join(LIBRARY, 'Legacy.d2x');
const TABLES = loadPd2Tables();
const REPORT = summarizeCollection([FREEZING_ARROW, LEGACY_STASH].map(file => inspectSaveFile(file, { pd2Tables: TABLES })), TABLES);
const tick = () => new Promise(resolve => setImmediate(resolve));
const labels = rows => rows.map(row => row.label);

test('view helpers report progress and filter missing, owned and queried entries', () => {
  const progress = collectionProgress(REPORT);
  assert.deepEqual(progress.map(line => [line.id, line.total]), [['uniques', 418], ['sets', 128], ['runewords', 94]]);
  assert.equal(progress[1].setCount, 32);
  assert.deepEqual(labels(collectionRows(REPORT, { category: 'runewords', show: 'owned', query: 'ed' })), ['Edge']);
  const missing = collectionRows(REPORT, { category: 'uniques' });
  assert.equal(missing.length, REPORT.uniques.total - REPORT.uniques.found, 'missing is the default filter');
  assert.ok(missing.every(row => row.owned.total === 0));
  assert.deepEqual(labels(collectionRows(REPORT, { category: 'sets', show: 'all', query: "m'avina tenet" })), ["M'avina's Tenet"]);
  assert.equal(collectionRows(REPORT, { category: 'uniques', show: 'all', query: 'hand axe' }).some(row => row.label === 'The Gnasher'), true,
    'queries match base names');
  assert.throws(() => collectionRows(REPORT, { category: 'charms' }), /Unknown collection category/);
  assert.throws(() => collectionRows(REPORT, { show: 'dupes' }), /Unknown collection filter/);
});

test('copy locations distinguish equipment slots, stored positions, sockets and ethereal copies', () => {
  const locations = query => collectionRows(REPORT, { show: 'all', query })[0].copies.map(describeCopyLocation);
  assert.deepEqual(locations('wisp'), ['freezing-arrow.d2s (freezing-arrow) - equipped: left ring',
    'freezing-arrow.d2s (freezing-arrow) - equipped: right ring', 'Legacy.d2x, page 2: Season 4 Armor - column 9, row 9']);
  assert.deepEqual(locations("gheed's fortune"), ['freezing-arrow.d2s (freezing-arrow) - stash column 5, row 12']);
  assert.ok(locations('rainbow facet').every(text => /^freezing-arrow\.d2s \(freezing-arrow\) - socketed in M'avina's /.test(text)));
  assert.deepEqual(locations('mindrend'), ['Legacy.d2x, page 8: Season 6 Weapons - column 0, row 12',
    'Legacy.d2x, page 8: Season 6 Weapons - column 2, row 12, ethereal']);
  const callToArms = collectionRows(REPORT, { category: 'runewords', show: 'owned', query: 'call to arms' })[0].copies[0];
  assert.equal(describeCopyLocation(callToArms), 'freezing-arrow.d2s (freezing-arrow) - equipped: switch right hand');
  assert.equal(describeCopyLocation({ ...callToArms, location: 7 }), `freezing-arrow.d2s (freezing-arrow) - byte offset ${callToArms.byteOffset}`);
});

test('collection API and browser modules are served read-only from the loaded workspace', async () => {
  const { server, url } = await startInspectorServer([FREEZING_ARROW], { pd2Tables: TABLES, host: '127.0.0.1', port: 0 });
  try {
    const before = fs.readFileSync(FREEZING_ARROW);
    const report = await (await fetch(url + '/api/collection')).json();
    assert.deepEqual([report.sourceCount, report.uniques.found, report.sets.found, report.runewords.found], [1, 9, 5, 2]);
    for (const [route, file] of [['/collection-view.mjs', 'src/lib/collection-view.mjs'], ['/collection.js', 'src/ui/collection.js'],
      ['/collection-main.js', 'src/ui/collection-main.js']]) {
      const response = await fetch(url + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /javascript/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), fs.readFileSync(path.join(REPO, file), 'utf8'));
    }
    assert.equal((await fetch(url + '/api/collection', { method: 'POST' })).status, 405);
    assert.deepEqual(fs.readFileSync(FREEZING_ARROW), before);
  } finally { await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))); }
});

function createHarness(respond) {
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, id] of shell.matchAll(/<([a-z]+)\b[^>]*\bid="(collection-[^"]*)"[^>]*>/g)) {
    const element = new Element(document, tag); element.id = id; document.ids.set(id, element);
  }
  const element = id => document.getElementById('collection-' + id);
  element('category').value = 'uniques';
  element('show').value = 'missing';
  const requests = [];
  const context = vm.createContext({ document, collectionProgress, collectionRows, describeCopyLocation,
    fetch(url) { requests.push(url); return respond(url, requests.length); } });
  const source = fs.readFileSync(path.join(REPO, 'src/ui/collection.js'), 'utf8')
    .replace("import { collectionProgress, collectionRows, describeCopyLocation } from './collection-view.mjs';", '')
    .replace('export function createCollectionUi', 'function createCollectionUi');
  vm.runInContext(source + '\nglobalThis.create = createCollectionUi;', context, { filename: 'collection.js' });
  return { ui: context.create(), element, requests };
}

const ok = body => ({ ok: true, status: 200, async json() { return body; } });

test('actual collection UI renders progress, filters lists, and escapes table text', async () => {
  const hostile = structuredClone(REPORT);
  hostile.runewords.entries.find(entry => entry.label === 'Edge').label = '<img src=x onerror=alert(1)>';
  const { ui, element, requests } = createHarness(() => ok(hostile));
  await ui.load();
  assert.deepEqual(requests, ['/api/collection']);
  assert.match(element('progress').innerHTML, /<strong>Uniques<\/strong> 73\/418 \(17\.5%\)/);
  assert.match(element('progress').innerHTML, /Set items<\/strong> 17\/128 \(13\.3%\), 2\/32 complete sets/);
  assert.equal(element('count').textContent, '345');
  assert.match(element('status').textContent, /disabled table rows/);

  element('category').value = 'runewords'; element('show').value = 'owned';
  await element('show').dispatch('change');
  assert.doesNotMatch(element('list').innerHTML, /<img/);
  assert.match(element('list').innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(element('list').innerHTML, /Call to Arms/);

  element('category').value = 'sets'; element('show').value = 'owned'; element('query').value = "m'avina";
  await element('query').dispatch('input');
  assert.match(element('list').innerHTML, /collection-set-heading">M&#39;avina&#39;s Battle Hymn<\/li>/);
  assert.equal(element('count').textContent, '5');

  let prevented = false;
  element('form').listeners.get('submit')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'Enter in Find must not submit and reload the inspector');
});

test('only the latest collection request renders, and failures replace stale results', async () => {
  const pending = [];
  const { ui, element } = createHarness(() => new Promise(resolve => pending.push(resolve)));
  const first = ui.load(); const second = ui.load();
  const newer = structuredClone(REPORT); newer.uniques.found = 1;
  pending[1](ok(newer)); await second;
  pending[0](ok(REPORT)); await first; await tick();
  assert.match(element('progress').innerHTML, /Uniques<\/strong> 1\/418/, 'an older response must not overwrite a newer one');

  const failing = createHarness(() => ({ ok: false, status: 400, async json() { return { error: 'Save path does not exist' }; } }));
  await failing.ui.load();
  assert.equal(failing.element('status').textContent, 'Collection unavailable: Save path does not exist');
  assert.equal(failing.element('list').textContent, '');
});
