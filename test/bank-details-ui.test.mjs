import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { filterBankItems } from '../src/lib/bank-search.mjs';
import { sortBankItems } from '../src/lib/bank-sort.mjs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { extractStashItem } from '../src/lib/safe-serialization.mjs';
import { extractCharacterItem } from '../src/lib/character-serialization.mjs';
import { parseLegacyItemList } from '../src/lib/legacy-item-parser.mjs';
import { enrichParsedSave } from '../src/lib/item-identity.mjs';
import { buildBankItemDetails } from '../src/lib/bank-detail-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = getFixtureLibraryDir(), TABLES = loadPd2Tables();
const FILE = path.join(FIXTURES, 'Bases.d2x');
const BOW = path.join(FIXTURES, 'Showcase Characters/amazon/freezing-arrow.d2s');
const TOME = path.join(FIXTURES, 'Blank Characters/Level 30s/Amazon.d2s');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const originalHashes = [FILE, BOW, TOME].map(hash);
const LOADING = 'Loading item details…';
const EMPTY = 'Select a bank item to view its properties.';
const ERROR = 'Unable to load item details.';
const tick = () => new Promise(resolve => setImmediate(resolve));

function unchanged(t) { t.after(() => assert.deepEqual([FILE, BOW, TOME].map(hash), originalHashes)); }

function realDetail(id, file, selection) {
  const bytes = fs.readFileSync(file), save = inspectSaveFile(file, { pd2Tables: TABLES });
  const extracted = save.pages ? extractStashItem(bytes, save, selection)
    : extractCharacterItem(bytes, save, { ...selection, pd2Tables: TABLES });
  const parsed = parseLegacyItemList(extracted.bytes, 0, 1, extracted.bytes.length, TABLES);
  enrichParsedSave({ items: parsed.items }, TABLES);
  return buildBankItemDetails({ metadata: { id, source: { fileName: path.basename(file), pageName: 'Reg Druid' },
    depositedAt: '2026-10-04T00:00:00.000Z' }, item: parsed.topLevelItems[0] }, TABLES);
}
const realDetails = {
  a: realDetail('a', FILE, { pageIndex: 12, itemIndex: 15 }),
  b: realDetail('b', FILE, { pageIndex: 12, itemIndex: 12 })
};
const bowSave = inspectSaveFile(BOW, { pd2Tables: TABLES });
realDetails.bow = realDetail('bow', BOW, { itemIndex: bowSave.topLevelItems.findIndex(item => item.fingerprint === 70879556) });

const decode = text => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const dataKey = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

// A DOM boundary with browser-like child removal: setting textContent or
// replaceChildren removes old buttons and their IDs, which matters for stale
// grid actions and the dynamically created bank commit control.
class Element {
  constructor(document, tagName = 'div') {
    this.document = document;
    this.tagName = tagName;
    this.dataset = {};
    this.listeners = new Map();
    this.children = [];
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.style = {};
    this.isConnected = true;
    this.classList = {
      add: name => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), name])].join(' '); },
      remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); },
      contains: name => this.className.split(/\s+/).includes(name)
    };
  }
  detach() {
    this.isConnected = false;
    for (const child of this.children) child.detach();
    if (this.id && this.document.ids.get(this.id) === this) this.document.ids.delete(this.id);
  }
  clearChildren() { for (const child of this.children) child.detach(); this.children = []; }
  set textContent(text) { this.clearChildren(); this.html = ''; this.text = String(text); }
  get textContent() { return this.html ? decode(this.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()) : this.text ?? ''; }
  set innerHTML(html) {
    this.clearChildren(); this.html = html; this.text = '';
    for (const [, attributes, body] of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const button = new Element(this.document, 'button');
      button.textContent = decode(body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
      button.className = attributes.match(/class="([^"]*)"/)?.[1] ?? '';
      button.id = attributes.match(/id="([^"]*)"/)?.[1];
      if (button.id) this.document.ids.set(button.id, button);
      for (const [, name, value] of attributes.matchAll(/data-([a-z-]+)="([^"]*)"/g)) button.dataset[dataKey(name)] = decode(value);
      this.children.push(button);
    }
    if (this.tagName === 'select') this.value = decode(html.match(/<option\b[^>]*value="([^"]*)"/)?.[1] ?? '');
  }
  get innerHTML() { return this.html ?? ''; }
  replaceChildren() { this.clearChildren(); this.html = ''; this.text = ''; }
  setAttribute(name, value) { this[name] = String(value); }
  removeAttribute(name) { delete this[name]; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
  querySelectorAll(selector) {
    if (selector === 'button, input, select') return this.descendants().filter(child => ['button', 'input', 'select'].includes(child.tagName));
    const name = selector.match(/^\[data-([a-z-]+)\]$/)?.[1];
    assert.ok(name, `supported DOM selector ${selector}`);
    return this.descendants().filter(child => dataKey(name) in child.dataset);
  }
  async dispatch(name) {
    if (!this.isConnected || this.disabled) return;
    const callback = this.listeners.get(name) ?? this[`on${name}`];
    assert.equal(typeof callback, 'function', `${name} handler must exist`);
    return callback({ preventDefault() {} });
  }
}

function deferred(url, input) {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { url, input, promise, resolve, reject, params: new URL(url, 'http://localhost').searchParams };
}


async function harness({ items, configured = true } = {}) {
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, attributes, id] of shell.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]*)"[^>]*)>/g)) {
    const element = new Element(document, tag); element.id = id;
    element.disabled = /\bdisabled\b/.test(attributes); element.hidden = /\bhidden\b/.test(attributes);
    document.ids.set(id, element);
  }
  assert.ok(document.getElementById('bank-details'));
  assert.ok(document.getElementById('bank-details-content'));
  document.getElementById('bank-sort').innerHTML = shell.match(/<select id="bank-sort">([\s\S]*?)<\/select>/)[1];
  const panel = document.getElementById('bank-panel');
  panel.children = [...document.ids.values()].filter(element => element.id.startsWith('bank-') && element !== panel);
  const state = { catalog: { sources: [{ id: 'destination', kind: 'plugy-personal-stash', label: 'Destination',
    fileName: 'copy.d2x', filePath: '/disposable/copy.d2x', pages: [{ index: 0, name: 'Landing' }, { index: 1, name: 'Other' }] }] },
    view: { selectedItem: { itemKey: 'workspace-item', displayName: 'Workspace selection',
      sourceLabel: 'Workspace file', filePath: '/disposable/copy.d2x' } } };
  const defaultItems = [
    { id: 'a', displayName: 'Oak Sage Wolf Head', baseName: 'Wolf Head', code: 'dr1', quality: 'normal', source: { fileName: 'Bases.d2x' } },
    { id: 'b', displayName: 'Hunger Wolf Head', baseName: 'Wolf Head', code: 'dr1', quality: 'normal', source: { fileName: 'Bases.d2x' } }
  ];
  let status = { configured, enabled: false, bankName: 'bank.json', sessionToken: 'token',
    bank: { items: items ?? defaultItems } }, heldStatus = null;
  const requests = [], details = [];
  let reloadCount = 0;
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems, async fetch(url, options) {
    requests.push({ url, options });
    if (url === '/api/bank') {
      if (heldStatus) { const held = heldStatus; heldStatus = null; return held.promise; }
      return { ok: true, async json() { return status; } };
    }
    if (url.startsWith('/api/bank/item?')) { const pending = deferred(url); details.push(pending); return pending.promise; }
    if (url === '/api/bank/preview') return { ok: true, async json() { return {
      ticket: 'ticket', label: 'Explicit user preview', canCommit: true,
      result: { bankItemCountBefore: 2, bankItemCountAfter: 3, stashItemCountBefore: 1, stashItemCountAfter: 0 }
    }; } };
    assert.fail('unexpected route: ' + url);
  } });
  const source = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8').replace("import { filterBankItems } from './bank-search.mjs';", '').replace("import { sortBankItems } from './bank-sort.mjs';", '').replace('export function createBankUi', 'function createBankUi');
  vm.runInContext(source + '\nglobalThis.create = createBankUi;', context, { filename: 'bank.js' });
  const ui = context.create(state, async () => { reloadCount += 1; });
  await ui.load();
  return {
    ui, state, requests, details, shell,
    element: id => document.getElementById('bank-' + id),
    get reloadCount() { return reloadCount; },
    resolve(pending, detail = realDetails[pending.params.get('itemId')]) {
      pending.resolve({ ok: true, async json() { return { item: detail }; } });
    },
    fail(pending, kind = 'http') {
      if (kind === 'network') pending.reject(new Error('Connection lost'));
      else pending.resolve({ ok: kind !== 'http', async json() {
        if (kind === 'json') throw new Error('Invalid JSON');
        return { error: 'Internal detail failure' };
      } });
    },
    async select(id) { document.getElementById('bank-item').value = id; await document.getElementById('bank-item').dispatch('change'); },
    async filter(query) { document.getElementById('bank-query').value = query; await document.getElementById('bank-query').dispatch('input'); },
    holdLoad(next) {
      const pending = deferred('/api/bank'); heldStatus = pending;
      const completion = ui.load();
      return { completion, finish() { status = { ...status, ...next };
        pending.resolve({ ok: true, async json() { return status; } }); }, fail() { pending.reject(new Error('Status unavailable')); } };
    }
  };
}

function content(h) { return h.element('details-content').textContent; }
function assertLoading(h) {
  assert.equal(content(h), LOADING);
  assert.ok(!h.element('details-content').innerHTML.includes('Oak Sage'));
  assert.ok(!h.element('details-content').innerHTML.includes('Hunger'));
}
function noTransfers(h) {
  assert.ok(h.requests.every(request => request.url === '/api/bank' || request.url.startsWith('/api/bank/item?')));
  assert.ok(h.requests.every(request => !request.options?.method || request.options.method === 'GET'));
  assert.equal(h.reloadCount, 0);
}

test('loading real bank details clears immediately and preserves workspace selection and destination controls', async t => {
  unchanged(t);
  const h = await harness();
  assert.match(h.shell, /Bank item details/);
  assertLoading(h);
  h.element('destination').value = 'destination';
  h.element('container').value = '1'; h.element('column').value = '4'; h.element('row').value = '7';
  const selection = JSON.stringify(h.state.view);
  h.resolve(h.details[0]); await tick();
  assert.match(content(h), /Wolf Head/);
  assert.match(content(h), /\+2 to Oak Sage/);
  assert.match(content(h), /\+2 to Summon Spirit Wolf/);
  assert.ok(!content(h).includes('+2 to Hunger'));
  assert.equal(JSON.stringify(h.state.view), selection);
  assert.equal(h.element('container').value, '1');
  assert.equal(h.element('column').value, '4'); assert.equal(h.element('row').value, '7');
  noTransfers(h);
});

test('dropdown generations ignore old successes and failures after the new Wolf Head details render', async t => {
  unchanged(t);
  for (const obsolete of ['success', 'failure']) {
    const h = await harness(), old = h.details[0];
    await h.select('b'); assertLoading(h);
    h.resolve(h.details.at(-1)); await tick();
    assert.match(content(h), /\+2 to Hunger/);
    const retained = h.element('details-content').innerHTML;
    if (obsolete === 'success') h.resolve(old); else h.fail(old, 'network');
    await tick();
    assert.equal(h.element('details-content').innerHTML, retained);
    assert.equal(h.element('item').value, 'b');
    noTransfers(h);
  }
});

test('current HTTP, network, JSON, and mismatched-ID errors clear old properties and retry the selected bank ID', async t => {
  unchanged(t);
  for (const kind of ['http', 'network', 'json', 'wrong-id']) {
    const h = await harness(); h.resolve(h.details[0]); await tick();
    await h.select('b'); assertLoading(h);
    if (kind === 'wrong-id') h.resolve(h.details.at(-1), realDetails.a);
    else h.fail(h.details.at(-1), kind);
    await tick();
    assert.equal(content(h), ERROR);
    assert.ok(!content(h).includes('Internal detail failure'));
    assert.equal(h.element('item').value, 'b');
    await h.select('b'); assertLoading(h);
    h.resolve(h.details.at(-1)); await tick();
    assert.match(content(h), /\+2 to Hunger/);
    noTransfers(h);
  }
});

test('filtering and empty selections invalidate late details and automatically load the surviving item', async t => {
  unchanged(t);
  const h = await harness(), old = h.details[0];
  await h.filter('hunger'); assertLoading(h);
  assert.equal(h.element('item').value, 'b');
  const filtered = h.details.at(-1);
  h.resolve(old); await tick(); assertLoading(h);
  await h.filter('nothing matches');
  assert.equal(h.element('item').value, '');
  assert.equal(content(h), EMPTY);
  h.resolve(filtered); await tick(); assert.equal(content(h), EMPTY);
  await h.filter(''); assertLoading(h);
  assert.equal(h.element('item').value, 'a');
  h.resolve(h.details.at(-1)); await tick(); assert.match(content(h), /\+2 to Oak Sage/);
  noTransfers(h);
});

test('bank reload, removal, unconfigured status, and status errors invalidate pending item details', async t => {
  unchanged(t);
  const h = await harness(), old = h.details[0];
  const reload = h.holdLoad({ bank: { items: [{ id: 'b', displayName: 'Hunger Wolf Head', code: 'dr1' }] } });
  assert.ok(!content(h).includes('Oak Sage'));
  h.resolve(old); await tick(); assert.ok(!content(h).includes('Oak Sage'));
  reload.finish(); await reload.completion;
  assert.equal(h.element('item').value, 'b'); assertLoading(h);
  const removed = h.details.at(-1), empty = h.holdLoad({ bank: { items: [] } });
  empty.finish(); await empty.completion;
  assert.equal(content(h), EMPTY);
  h.resolve(removed); await tick(); assert.equal(content(h), EMPTY);
  const unconfigured = h.holdLoad({ configured: false }); unconfigured.finish(); await unconfigured.completion;
  assert.equal(h.element('panel').hidden, true);
  assert.equal(content(h), EMPTY);
  const failing = h.holdLoad({}); failing.fail(); await assert.rejects(failing.completion, /Status unavailable/);
  assert.ok(!content(h).includes('Hunger'));
  noTransfers(h);
});

test('names, properties, socket children, and provenance are escaped in the details renderer', async t => {
  unchanged(t);
  const h = await harness(), unsafe = structuredClone(realDetails.bow);
  unsafe.itemId = 'a';
  unsafe.displayName = '<img src=x onerror=attack()>';
  unsafe.source.fileName = '<svg onload=attack()>';
  unsafe.propertyLists[0].displayLines[0].text = '<script>attack()</script>';
  unsafe.children[0].displayName = '<img src=child onerror=attack()>';
  h.resolve(h.details[0], unsafe); await tick();
  const html = h.element('details-content').innerHTML;
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;svg'));
  assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script')); assert.ok(!html.includes('<svg'));
  noTransfers(h);
});

test('details remain independent of workspace selection while existing preview invalidation still works', async t => {
  unchanged(t);
  const h = await harness(); h.resolve(h.details[0]); await tick();
  await h.element('deposit').dispatch('click');
  assert.equal(h.element('preview').hidden, false);
  assert.ok(h.element('commit'));
  const details = h.element('details-content').innerHTML, count = h.details.length;
  h.state.view.selectedItem.itemKey = 'another-workspace-item';
  h.ui.selectionChanged();
  assert.equal(h.element('preview').hidden, true);
  assert.equal(h.element('commit'), null);
  assert.equal(h.element('details-content').innerHTML, details);
  assert.equal(h.details.length, count);
  const previews = h.requests.filter(request => request.url === '/api/bank/preview');
  assert.equal(previews.length, 1);
  assert.equal(JSON.parse(previews[0].options.body).action, 'deposit');
  await h.select('b'); assertLoading(h);
  h.resolve(h.details.at(-1)); await tick();
  assert.match(content(h), /\+2 to Hunger/);
  assert.equal(h.requests.filter(request => request.url === '/api/bank/preview').length, 1);
  assert.equal(h.requests.some(request => request.url === '/api/bank/commit'), false);
  assert.equal(h.reloadCount, 0);
});
