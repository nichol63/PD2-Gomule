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
import { parseBankArguments, runBankCli } from '../src/bank-cli.mjs';
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
  directory = fs.mkdtempSync(path.join(REPO, '.bank-sort-test-'));
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
function cli(sort, query) {
  const result = spawnSync(process.execPath, [path.join(REPO, 'src/cli.mjs'), 'bank', 'list', '--bank', bankPath,
    ...(sort === undefined ? [] : ['--sort', sort]), ...(query === undefined ? [] : ['--query', query])], { cwd: REPO, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).items;
}

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
  const requests = [], pending = []; let reloads = 0;
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
    if (url === '/api/bank/refresh') return { ok: true, async json() { return { refreshed: true }; } };
    if (url === '/api/bank/preview') return { ok: true, async json() { return { ticket: 'preview-ticket', label: 'Explicit user preview', canCommit: false, result: { status: 'Preview only' } }; } };
    assert.fail('Sorting must not issue transfer requests: ' + url);
  } });
  const source = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8')
    .replace("import { filterBankItems } from './bank-search.mjs';", '').replace("import { sortBankItems } from './bank-sort.mjs';", '')
    .replace('export function createBankUi', 'function createBankUi');
  vm.runInContext(source + '\nglobalThis.create = createBankUi;', context, { filename: 'bank.js' });
  const ui = context.create(state, async () => { reloads += 1; });
  await ui.load();
  const element = id => document.getElementById('bank-' + id);
  return { state, requests, pending, element, ui, get reloads() { return reloads; },
    ids: () => [...element('item').innerHTML.matchAll(/<option\b[^>]*value="([^"]*)"/g)].map(match => decode(match[1])).filter(Boolean),
    async sort(value) { element('sort').value = value; await element('sort').dispatch('change'); },
    async query(value) { element('query').value = value; await element('query').dispatch('input'); },
    async select(id) { element('item').value = id; await element('item').dispatch('change'); },
    async finish(record = pending.at(-1), detail = details.get(record.itemId)) { record.resolve({ ok: true, async json() { return { item: detail }; } }); await tick(); }
  };
}

const expectedOrders = { stored: [0, 1, 2, 3], name: [2, 3, 0, 1], source: [3, 0, 1, 2] };
const resultIds = values => values.map(item => item.id);

test('sorting is stable, case folded, ordinal and returns new arrays of untouched original objects', t => {
  unchanged(t);
  const first = Object.freeze({ displayName: 'ALPHA', code: 'z' });
  const second = Object.freeze({ displayName: 'alpha', code: 'A' });
  const tie = Object.freeze({ displayName: 'Alpha', code: 'a' });
  const missing = Object.freeze({});
  const base = Object.freeze({ baseName: 'Beta', code: 'b' });
  const code = Object.freeze({ code: 'Gamma' });
  const empty = Object.freeze({ displayName: '', baseName: 'Ignored fallback', code: 'x' });
  const zeta = Object.freeze({ displayName: 'Zeta' });
  const umlaut = Object.freeze({ displayName: 'Älf' });
  const input = Object.freeze([first, second, tie, missing, base, code, empty, umlaut, zeta]);
  for (const mode of [undefined, 'stored']) {
    const result = sortBankItems(input, mode); assert.notEqual(result, input); assert.deepEqual(result, input);
    for (let index = 0; index < input.length; index += 1) assert.equal(result[index], input[index]);
  }
  const ordered = sortBankItems(input, 'name');
  assert.deepEqual(ordered, [missing, empty, second, tie, first, base, code, zeta, umlaut]);
  assert.notEqual(ordered, input); assert.equal(ordered[2], second); assert.equal(ordered[3], tie);
  assert.deepEqual(sortBankItems(Object.freeze([]), 'source'), []);
});

test('source sort uses filename, character and page before name/code and ignores hidden metadata', t => {
  unchanged(t);
  const make = (fileName, characterName, pageName, displayName, code = 'x') => Object.freeze({ displayName, code,
    source: Object.freeze({ fileName, characterName, pageName }),
    get bytesBase64() { assert.fail('Sorting decoded bytes'); }, get id() { assert.fail('Sorting compared IDs'); },
    get sha256() { assert.fail('Sorting read hashes'); }, get propertyLists() { assert.fail('Sorting read properties'); } });
  const lastFile = make('B.d2x', 'A', 'A', 'A');
  const lastChar = make('a.D2X', 'B', 'A', 'A');
  const lastPage = make('A.d2x', 'a', 'B', 'A');
  const first = make('a.d2x', 'A', 'a', 'ALPHA', 'z');
  const second = make('A.D2X', 'a', 'A', 'alpha', 'A');
  const tie = make('a.d2x', 'A', 'a', 'Alpha', 'a');
  const missing = Object.freeze({ code: 'z' });
  const input = Object.freeze([lastFile, lastChar, lastPage, first, second, tie, missing]);
  const actual = sortBankItems(input, 'source');
  const expected = [missing, second, tie, first, lastPage, lastChar, lastFile];
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < expected.length; index += 1) assert.equal(actual[index], expected[index]);
});

test('invalid helper modes and CLI sort flags are rejected before reading a bank', async t => {
  unchanged(t);
  for (const mode of ['', 'NAME', 'random', null]) assert.throws(() => sortBankItems(null, mode),
    error => error.message === `Unknown bank sort: ${mode}`);
  const base = ['list', '--bank', bankPath];
  assert.equal(parseBankArguments(base).sort, 'stored');
  const invalid = [
    [[...base, '--sort', 'NAME'], /^Unknown bank sort: NAME$/],
    [[...base, '--sort'], /Missing value for --sort/],
    [[...base, '--sort', 'name', '--sort', 'source'], /Duplicate bank option: --sort/],
    [['deposit', '--bank', bankPath, '--sort', 'name'], /Unknown option for bank deposit: --sort/],
    [['withdraw', '--bank', bankPath, '--sort', 'name'], /Unknown option for bank withdraw: --sort/],
    [['recover', '--bank', bankPath, '--sort', 'name'], /Unknown option for bank recover: --sort/]
  ];
  const original = fs.readFileSync;
  fs.readFileSync = function(file, ...args) {
    if (String(file) === bankPath) assert.fail('Invalid sort read a bank before validation');
    return original.call(this, file, ...args);
  };
  try { for (const [args, message] of invalid) await assert.rejects(runBankCli(args, tables), error => message.test(error.message)); }
  finally { fs.readFileSync = original; }
});

test('real deposited Wolf/Wolf/Edge/Book metadata sorts identically in helper and executable CLI', t => {
  unchanged(t);
  assert.deepEqual(items.map(item => item.displayName), ['Wolf Head', 'Wolf Head', 'Edge', 'Town Portal Book']);
  for (const [mode, positions] of Object.entries(expectedOrders)) {
    const expected = positions.map(index => ids[index]);
    assert.deepEqual(resultIds(sortBankItems(items, mode)), expected);
    assert.deepEqual(resultIds(cli(mode)), expected);
    assert.deepEqual(resultIds(cli(mode, 'Bases.d2x Wolf Reg Druid')), ids.slice(0, 2), 'equal Wolf Head ties retain stored order');
    assert.deepEqual(resultIds(cli(mode, 'Wolf freezing-arrow')), []);
  }
  assert.deepEqual(resultIds(cli()), ids);
});

test('actual UI matches CLI sorts after filtering and retains selected ID, destination and sort through load and refresh', async t => {
  unchanged(t); const h = await harness(), selection = h.state.view.selectedItem;
  assert.equal(h.element('sort').value, 'stored'); assert.deepEqual(h.ids(), ids);
  h.element('container').value = '1'; await h.select(ids[1]);
  for (const mode of ['name', 'source', 'stored']) {
    await h.sort(mode); assert.deepEqual(h.ids(), resultIds(cli(mode)));
    assert.equal(h.element('item').value, ids[1]);
    assert.equal(h.element('destination').value, 'destination');
    assert.equal(h.element('container').value, '1'); assert.equal(h.state.view.selectedItem, selection);
    await h.query('Wolf Head Bases.d2x'); assert.deepEqual(h.ids(), ids.slice(0, 2));
    assert.deepEqual(h.ids(), resultIds(cli(mode, 'Wolf Head Bases.d2x')));
    await h.query(''); assert.deepEqual(h.ids(), expectedOrders[mode].map(index => ids[index]));
  }
  await h.sort('source'); await h.ui.load();
  assert.equal(h.element('sort').value, 'source'); assert.equal(h.element('item').value, ids[1]);
  await h.element('refresh').dispatch('click');
  assert.equal(h.reloads, 1); assert.equal(h.element('message').textContent, 'Library refreshed.');
  assert.equal(h.element('sort').value, 'source'); assert.deepEqual(h.ids(), [ids[3], ids[0], ids[1], ids[2]]);
  assert.equal(h.element('item').value, ids[1]); assert.equal(h.element('container').value, '1');
  assert.equal(h.state.view.selectedItem, selection);
  assert.deepEqual(h.requests.filter(request => request.options?.method === 'POST').map(request => request.url), ['/api/bank/refresh']);
  const empty = await harness({ bankItems: [] }); await empty.sort('name');
  assert.deepEqual(empty.ids(), []); assert.equal(empty.element('item').textContent, 'Bank is empty');
  assert.equal(empty.pending.length, 0);
});

test('changing sort invalidates a reviewed preview and same-ID obsolete detail responses without emitting transfers', async t => {
  unchanged(t); const h = await harness();
  await h.select(ids[1]); const oldSuccess = h.pending.at(-1);
  await h.element('deposit').dispatch('click');
  assert.equal(h.element('preview').hidden, false);
  const postCount = h.requests.filter(request => request.options?.method === 'POST').length;
  await h.sort('name');
  assert.equal(h.element('item').value, ids[1]); assert.equal(h.element('preview').hidden, true);
  assert.equal(h.element('preview').textContent, '');
  assert.equal(h.element('details-content').textContent, 'Loading item details…');
  await h.finish(); const rendered = h.element('details-content').innerHTML;
  await h.finish(oldSuccess, { ...details.get(oldSuccess.itemId), displayName: 'Obsolete detail response' });
  assert.equal(h.element('details-content').innerHTML, rendered);
  await h.sort('source'); const oldFailure = h.pending.at(-1);
  await h.sort('stored'); await h.finish();
  oldFailure.reject(new Error('Obsolete detail failure')); await tick();
  assert.equal(h.element('details-content').innerHTML, rendered);
  await h.query('Wolf freezing-arrow'); await h.sort('name');
  assert.equal(h.element('item').textContent, 'No matching bank items');
  assert.equal(h.element('details-content').textContent, 'Select a bank item to view its properties.');
  assert.equal(h.requests.filter(request => request.options?.method === 'POST').length, postCount);
  assert.ok(h.requests.every(request => request.url !== '/api/bank/commit'));
});

test('bank sort module is explicitly served as no-store JavaScript while bank HTTP stays read-only', async t => {
  unchanged(t);
  const { server, url } = await startInspectorServer([sourcePath], { bankPath, experimentalWrite: false,
    pd2Tables: tables, host: '127.0.0.1', port: 0 });
  try {
    const response = await fetch(url + '/bank-sort.mjs');
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const moduleText = await response.text();
    assert.equal(moduleText, fs.readFileSync(path.join(REPO, 'src/lib/bank-sort.mjs'), 'utf8'));
    const served = await import('data:text/javascript;base64,' + Buffer.from(moduleText).toString('base64'));
    assert.deepEqual(resultIds(served.sortBankItems(items, 'source')), [ids[3], ids[0], ids[1], ids[2]]);
    const status = await (await fetch(url + '/api/bank')).json();
    assert.equal(status.enabled, false); assert.deepEqual(resultIds(status.bank.items), ids);
    assert.equal((await fetch(url + '/lib/bank-sort.mjs')).status, 404);
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
