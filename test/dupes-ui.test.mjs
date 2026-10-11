import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { Element } from './helpers/ui-element.mjs';
import { describeCopyLocation } from '../src/lib/collection-view.mjs';
import { findSharedFingerprints } from '../src/lib/duplicate-report.mjs';
import { describeGroupVerdict, sharedFingerprintGroups } from '../src/lib/dupes-view.mjs';
import { startInspectorServer } from '../src/lib/inspector-server.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();
const SHARED_STASH = path.join(LIBRARY, '_LOD_SharedStashSave.sss');
const BARBARIAN = path.join(LIBRARY, 'Showcase Characters', 'barbarian', 'x2flame-whirlw.d2s');
const TABLES = loadPd2Tables();
const REPORT = findSharedFingerprints([SHARED_STASH, BARBARIAN].map(file => inspectSaveFile(file, { pd2Tables: TABLES })));
const tick = () => new Promise(resolve => setImmediate(resolve));

test('view helpers filter groups by verdict, item name and fingerprint', () => {
  assert.deepEqual([REPORT.groupCount, REPORT.identicalGroupCount], [408, 190]);
  assert.equal(sharedFingerprintGroups(REPORT).length, 408, 'all groups by default');
  assert.equal(sharedFingerprintGroups(REPORT, { show: 'identical' }).length, 190);
  assert.equal(sharedFingerprintGroups(REPORT, { show: 'differing' }).length, 218);
  const [charm] = sharedFingerprintGroups(REPORT, { query: '25822651' });
  assert.deepEqual(charm.copies.map(copy => copy.fileName).sort(), ['_LOD_SharedStashSave.sss', 'x2flame-whirlw.d2s']);
  assert.deepEqual(sharedFingerprintGroups(REPORT, { query: 'HORADRIC' }).map(group => group.fingerprint), [3176652144]);
  assert.deepEqual(sharedFingerprintGroups(REPORT, { show: 'differing', query: 'horadric' }), []);
  assert.throws(() => sharedFingerprintGroups(REPORT, { show: 'owned' }), /Unknown duplicate filter/);

  assert.equal(describeGroupVerdict({ identical: true, incompleteCopies: 0 }), 'identical copies');
  assert.equal(describeGroupVerdict({ identical: false, incompleteCopies: 0 }), 'copies differ');
  assert.equal(describeGroupVerdict({ identical: false, incompleteCopies: 2 }), 'differs or not comparable (2 not fully decoded)');
});

test('dupes API and browser modules are served read-only from the loaded workspace', async () => {
  const { server, url } = await startInspectorServer([SHARED_STASH, BARBARIAN], { pd2Tables: TABLES, host: '127.0.0.1', port: 0 });
  try {
    const before = fs.readFileSync(SHARED_STASH);
    const report = await (await fetch(url + '/api/dupes')).json();
    assert.deepEqual([report.sourceCount, report.groupCount, report.identicalGroupCount], [2, 408, 190]);
    for (const [route, file] of [['/dupes-view.mjs', 'src/lib/dupes-view.mjs'], ['/dupes.js', 'src/ui/dupes.js'],
      ['/dupes-main.js', 'src/ui/dupes-main.js']]) {
      const response = await fetch(url + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /javascript/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), fs.readFileSync(path.join(REPO, file), 'utf8'));
    }
    assert.equal((await fetch(url + '/api/dupes', { method: 'POST' })).status, 405);
    assert.deepEqual(fs.readFileSync(SHARED_STASH), before);
  } finally { await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))); }
});

function createHarness(respond) {
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, id] of shell.matchAll(/<([a-z]+)\b[^>]*\bid="(dupes-[^"]*)"[^>]*>/g)) {
    const element = new Element(document, tag); element.id = id; document.ids.set(id, element);
  }
  const element = id => document.getElementById('dupes-' + id);
  element('show').value = 'all';
  const requests = [];
  const context = vm.createContext({ document, describeCopyLocation, describeGroupVerdict, sharedFingerprintGroups,
    fetch(url) { requests.push(url); return respond(url, requests.length); } });
  const source = fs.readFileSync(path.join(REPO, 'src/ui/dupes.js'), 'utf8')
    .replace("import { describeCopyLocation } from './collection-view.mjs';", '')
    .replace("import { describeGroupVerdict, sharedFingerprintGroups } from './dupes-view.mjs';", '')
    .replace('export function createDupesUi', 'function createDupesUi');
  vm.runInContext(source + '\nglobalThis.create = createDupesUi;', context, { filename: 'dupes.js' });
  return { ui: context.create(), element, requests };
}

const ok = body => ({ ok: true, status: 200, async json() { return body; } });
const renderedGroups = html => html.match(/<li class="collection-row">/g)?.length ?? 0;

test('actual dupes UI renders a bounded list, filters live, and escapes item text', async () => {
  const hostile = structuredClone(REPORT);
  hostile.groups.find(group => group.fingerprint === 25822651).displayNames = ['<img src=x onerror=alert(1)>'];
  const { ui, element, requests } = createHarness(() => ok(hostile));
  await ui.load();
  assert.deepEqual(requests, ['/api/dupes']);
  assert.equal(element('summary').textContent, '408 shared fingerprints across 1797 records; 190 groups have identical copies.');
  assert.equal(element('count').textContent, '408');
  assert.equal(renderedGroups(element('list').innerHTML), 200);
  assert.match(element('list').innerHTML, /208 more groups\. Use Find to narrow the list\./);

  element('query').value = '25822651';
  await element('query').dispatch('input');
  assert.equal(element('count').textContent, '1');
  assert.doesNotMatch(element('list').innerHTML, /<img/);
  assert.match(element('list').innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(element('list').innerHTML, /dupes-verdict is-identical">identical copies/);
  assert.match(element('list').innerHTML, /<li>x2flame-whirlw\.d2s \(/, 'single-name groups list bare locations');

  element('query').value = '1555796171';
  await element('query').dispatch('input');
  const mixed = REPORT.groups.find(group => group.fingerprint === 1555796171);
  assert.ok(mixed.displayNames.length > 1, 'fixture group with differently named copies');
  const copyRows = [...element('list').innerHTML.matchAll(/<ul class="collection-copies">([\s\S]*?)<\/ul>/g)][0][1]
    .match(/<li>[^<]*<\/li>/g);
  assert.equal(copyRows.length, mixed.copies.length);
  mixed.copies.forEach((copy, index) => assert.ok(copyRows[index].startsWith(`<li>${copy.displayName.replaceAll("'", '&#39;')}: `),
    `copy ${index} names its item`));

  element('query').value = ''; element('show').value = 'differing';
  await element('show').dispatch('change');
  assert.equal(element('count').textContent, '218');
  assert.doesNotMatch(element('list').innerHTML, /is-identical/);

  let prevented = false;
  element('form').listeners.get('submit')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'Enter in Find must not submit and reload the inspector');
});

test('only the latest dupes request renders, and failures replace stale results', async () => {
  const pending = [];
  const { ui, element } = createHarness(() => new Promise(resolve => pending.push(resolve)));
  const first = ui.load(); const second = ui.load();
  const newer = structuredClone(REPORT); newer.groupCount = 1;
  pending[1](ok(newer)); await second;
  pending[0](ok(REPORT)); await first; await tick();
  assert.match(element('summary').textContent, /^1 shared fingerprints/, 'an older response must not overwrite a newer one');

  const failing = createHarness(() => ({ ok: false, status: 400, async json() { return { error: 'Save path does not exist' }; } }));
  await failing.ui.load();
  assert.equal(failing.element('status').textContent, 'Duplicates unavailable: Save path does not exist');
  assert.deepEqual([failing.element('list').textContent, failing.element('summary').textContent], ['', '']);
});
