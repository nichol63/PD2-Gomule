import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Element, decode } from './helpers/ui-element.mjs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { filterBankItems } from '../src/lib/bank-search.mjs';
import { sortBankItems } from '../src/lib/bank-sort.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { depositItem, listBank, inspectBankItem } from '../src/lib/item-bank.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { buildBankItemDetails } from '../src/lib/bank-detail-model.mjs';
import { startInspectorServer } from '../src/lib/inspector-server.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = getFixtureLibraryDir();
const fixtureNames = ['Bases.d2x', 'Showcase Characters/amazon/freezing-arrow.d2s', 'Blank Characters/Level 30s/Amazon.d2s'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureHashes = () => fixtureNames.map(name => hash(fs.readFileSync(path.join(FIXTURES, name))));
const originalHashes = fixtureHashes();
const tick = () => new Promise(resolve => setImmediate(resolve));
let directory, bankPath, sourcePath, tables, ids, items, details;
function snapshot(root) {
  const stat = fs.statSync(root);
  return [[root, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs,
    stat.isFile() ? hash(fs.readFileSync(root)) : null],
    ...(stat.isDirectory() ? fs.readdirSync(root).sort().flatMap(name => snapshot(path.join(root, name))) : [])];
}
function unchanged(t) {
  const captured = snapshot(directory);
  t.after(() => { assert.deepEqual(snapshot(directory), captured); assert.deepEqual(fixtureHashes(), originalHashes); });
}
before(() => {
  directory = fs.mkdtempSync(path.join(REPO, '.bank-search-test-'));
  tables = loadPd2Tables(); bankPath = path.join(directory, 'bank.json');
  sourcePath = path.join(directory, 'Bases.d2x'); fs.copyFileSync(path.join(FIXTURES, fixtureNames[0]), sourcePath);
  ids = [15, 12].map(itemIndex => depositItem({ bankPath, sourcePath, pageIndex: 12, itemIndex,
    dryRun: false, pd2Tables: tables }).itemId);
  for (const [name, fingerprint] of [[fixtureNames[1], 70879556], [fixtureNames[2], 28610618]]) {
    const copy = path.join(directory, path.basename(name)); fs.copyFileSync(path.join(FIXTURES, name), copy);
    const save = inspectSaveFile(copy, { pd2Tables: tables });
    const itemIndex = save.topLevelItems.findIndex(item => item.fingerprint === fingerprint);
    assert.ok(itemIndex >= 0);
    ids.push(depositItem({ bankPath, sourcePath: copy, itemIndex, dryRun: false, pd2Tables: tables }).itemId);
  }
  items = listBank(bankPath).items;
  assert.deepEqual(items.map(item => item.id), ids);
  details = new Map(ids.map(id => [id, buildBankItemDetails(inspectBankItem(bankPath, id, { pd2Tables: tables }), tables)]));
});
after(() => {
  try { assert.deepEqual(fixtureHashes(), originalHashes); }
  finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
});
function cli(query) {
  const result = spawnSync(process.execPath, [path.join(REPO, 'src/cli.mjs'), 'bank', 'list', '--bank', bankPath,
    ...(query === undefined ? [] : ['--query', query])], { cwd: REPO, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).items;
}
const queries = [['Bases.d2x', [0, 1]], ['Wolf Head Reg Druid', [0, 1]], ['Edge freezing-arrow', [2]],
  ['tbk Amazon', [3]], ['Wolf freezing-arrow', []], [' \t\n ', [0, 1, 2, 3]]];



async function harness({ bankItems = items } = {}) {
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, attributes, id] of shell.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]*)"[^>]*)>/g)) {
    const element = new Element(document, tag); element.id = id;
    element.disabled = /\bdisabled\b/.test(attributes); element.hidden = /\bhidden\b/.test(attributes);
    document.ids.set(id, element);
  }
  document.getElementById('bank-sort').innerHTML = shell.match(/<select id="bank-sort">([\s\S]*?)<\/select>/)[1];
  const panel = document.getElementById('bank-panel');
  panel.children = [...document.ids.values()].filter(element => element.id.startsWith('bank-') && element !== panel);
  const state = { catalog: { sources: [{ id: 'destination', kind: 'plugy-personal-stash', label: 'Destination',
    fileName: 'copy.d2x', filePath: '/disposable/copy.d2x', pages: [{ index: 0, name: 'Landing' }, { index: 1, name: 'Other' }] }] },
    view: { selectedItem: { itemKey: 'workspace-item', displayName: 'Workspace selection', filePath: '/disposable/copy.d2x' } } };
  const requests = [], pending = [];
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems, async fetch(url, options) {
    requests.push({ url, options });
    if (url === '/api/bank') return { ok: true, async json() { return {
      configured: true, enabled: false, bankName: 'bank.json', sessionToken: 'token', bank: { items: bankItems }
    }; } };
    if (url.startsWith('/api/bank/item?')) {
      let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      pending.push({ itemId: new URL(url, 'http://localhost').searchParams.get('itemId'), resolve, reject });
      return promise;
    }
    assert.fail('Search must not issue transfer requests: ' + url);
  } });
  const source = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8')
    .replace("import { filterBankItems } from './bank-search.mjs';", '').replace("import { sortBankItems } from './bank-sort.mjs';", '')
    .replace('export function createBankUi', 'function createBankUi');
  vm.runInContext(source + '\nglobalThis.create = createBankUi;', context, { filename: 'bank.js' });
  const ui = context.create(state, () => assert.fail('Search must not reload workspace'));
  await ui.load();
  const element = id => document.getElementById('bank-' + id);
  return { state, requests, pending, element,
    ids: () => [...element('item').innerHTML.matchAll(/<option\b[^>]*value="([^"]*)"/g)].map(match => decode(match[1])).filter(Boolean),
    async query(value) { element('query').value = value; await element('query').dispatch('input'); },
    async select(id) { element('item').value = id; await element('item').dispatch('change'); },
    async finish(record = pending.at(-1)) { record.resolve({ ok: true, async json() { return { item: details.get(record.itemId) }; } }); await tick(); }
  };
}

test('shared filter applies case-insensitive AND substrings to metadata and preserves references/order', t => {
  unchanged(t);
  const source = Object.freeze({ fileName: 'Bases.d2x', characterName: 'Amazon', pageName: 'Reg Druid' });
  const first = Object.freeze({ id: 'a', displayName: 'Wolf Head', baseName: 'Pelt', code: 'dr1', quality: 'normal', qualityLabel: 'Magic', source });
  const second = Object.freeze({ id: 'b', displayName: 'Wolf Head', code: 'dr1', quality: 'Rare', source });
  const input = Object.freeze([first, second]);
  for (const query of [undefined, '', ' \t\n ']) {
    const result = filterBankItems(input, query);
    assert.notEqual(result, input); assert.deepEqual(result, input);
    assert.equal(result[0], first); assert.equal(result[1], second);
  }
  assert.deepEqual(filterBankItems(input, '  WOLF\tDR1 Amazon Reg '), input);
  assert.deepEqual(filterBankItems(input, 'pelt magic bases'), [first]);
  assert.deepEqual(filterBankItems(input, 'rare bases'), [second]);
  assert.deepEqual(filterBankItems(input, 'normal'), [], 'qualityLabel overrides legacy quality when present');
  assert.deepEqual(filterBankItems(input, 'wolf unknown'), []);
});

test('search excludes item IDs, hashes, bytes and properties without decoding retained data', t => {
  unchanged(t);
  const item = { id: 'hidden-id', sha256: 'hidden-hash', displayName: 'Known', code: 'abc',
    properties: ['hidden-property'], bytesBase64: 'hidden-bytes' };
  for (const query of ['hidden-id', 'hidden-hash', 'hidden-property', 'hidden-bytes']) assert.deepEqual(filterBankItems([item], query), []);
  Object.defineProperty(item, 'bytesBase64', { get() { assert.fail('Search read retained bytes'); } });
  assert.deepEqual(filterBankItems([item], 'known abc'), [item]);
});

test('real four-item bank CLI and helper agree on provenance, names, codes, blank query and order', t => {
  unchanged(t);
  for (const [query, positions] of queries) {
    const expected = positions.map(index => ids[index]);
    assert.deepEqual(filterBankItems(items, query).map(item => item.id), expected, query);
    assert.deepEqual(cli(query).map(item => item.id), expected, query);
  }
  assert.deepEqual(cli().map(item => item.id), ids);
});

test('actual bank UI matches CLI results and preserves surviving selection or selects first match', async t => {
  unchanged(t); const h = await harness();
  const workspaceSelection = h.state.view.selectedItem;
  h.element('container').value = 'stash:1';
  await h.select(ids[1]);
  for (const [query, positions] of queries) {
    await h.query(query);
    const expected = positions.map(index => ids[index]);
    assert.deepEqual(h.ids(), expected, query);
    assert.deepEqual(h.ids(), cli(query).map(item => item.id), query);
    if (query === 'Bases.d2x' || query === 'Wolf Head Reg Druid') assert.equal(h.element('item').value, ids[1]);
    else assert.equal(h.element('item').value, expected[0] ?? '');
    assert.equal(h.element('withdraw').disabled, expected.length === 0);
    assert.equal(h.element('container').value, 'stash:1');
    assert.equal(h.state.view.selectedItem, workspaceSelection);
  }
  assert.ok(h.requests.every(request => !request.options?.method || request.options.method === 'GET'));
});

test('metadata filtering invalidates details immediately and ignores old success/failure after new selection or empty results', async t => {
  unchanged(t); const h = await harness(), old = h.pending[0];
  await h.query('Edge freezing-arrow');
  assert.equal(h.element('details-content').textContent, 'Loading item details…');
  await h.finish();
  assert.match(h.element('details-content').textContent, /Edge/);
  await h.finish(old);
  assert.match(h.element('details-content').textContent, /Edge/);
  await h.query('Bases.d2x'); const oldFailure = h.pending.at(-1);
  await h.query('tbk Amazon'); await h.finish();
  oldFailure.reject(new Error('late detail failure')); await tick();
  assert.match(h.element('details-content').textContent, /Stack 20/);
  await h.query('Bases.d2x'); const pending = h.pending.at(-1);
  await h.query('Wolf freezing-arrow');
  assert.equal(h.element('item').textContent, 'No matching bank items');
  assert.equal(h.element('details-content').textContent, 'Select a bank item to view its properties.');
  await h.finish(pending);
  assert.equal(h.element('details-content').textContent, 'Select a bank item to view its properties.');
  assert.equal(h.element('item').textContent, 'No matching bank items');
  await h.query('');
  assert.deepEqual(h.ids(), ids);
  assert.equal(h.element('item').value, ids[0]);
  assert.equal(h.element('withdraw').disabled, false);
  assert.equal(h.element('details-content').textContent, 'Loading item details…');
  const empty = await harness({ bankItems: [] });
  assert.equal(empty.element('item').textContent, 'Bank is empty');
  await empty.query('Wolf');
  assert.equal(empty.element('item').textContent, 'Bank is empty');
  assert.equal(empty.element('details-content').textContent, 'Select a bank item to view its properties.');
  assert.equal(empty.pending.length, 0);
  assert.equal(empty.element('withdraw').disabled, true);
  assert.ok(h.requests.every(request => !request.options?.method || request.options.method === 'GET'));
});

test('shared module is explicitly served as no-store JavaScript and read-only bank HTTP preserves all files', async t => {
  unchanged(t);
  const { server, url } = await startInspectorServer([sourcePath], { bankPath, experimentalWrite: false,
    pd2Tables: tables, host: '127.0.0.1', port: 0 });
  try {
    const response = await fetch(url + '/bank-search.mjs');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const moduleText = await response.text();
    assert.equal(moduleText, fs.readFileSync(path.join(REPO, 'src/lib/bank-search.mjs'), 'utf8'));
    const served = await import('data:text/javascript;base64,' + Buffer.from(moduleText).toString('base64'));
    assert.deepEqual(served.filterBankItems(items, 'Wolf Head Reg Druid').map(item => item.id), ids.slice(0, 2));
    const status = await (await fetch(url + '/api/bank')).json();
    assert.equal(status.enabled, false);
    assert.deepEqual(status.bank.items.map(item => item.id), ids);
    const detail = await (await fetch(url + '/api/bank/item?' + new URLSearchParams({ itemId: ids[2] }))).json();
    assert.equal(detail.item.displayName, 'Edge');
    assert.equal((await fetch(url + '/bank-search.mjs?query=ignored')).status, 200);
    assert.equal((await fetch(url + '/lib/bank-search.mjs')).status, 404);
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
