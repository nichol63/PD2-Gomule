import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { filterBankItems } from '../src/lib/bank-search.mjs';
import { sortBankItems } from '../src/lib/bank-sort.mjs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildInspectorView, getInspectorCatalog, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = path.join(getFixtureLibraryDir(), '_LOD_SharedStashSave.sss');
const CHARACTER = path.join(getFixtureLibraryDir(), 'Legacy.d2s');
const workspace = loadInspectorWorkspace([SHARED, CHARACTER]);
const stash = workspace.sources.find(source => source.summary.filePath === SHARED);
const character = workspace.sources.find(source => source.summary.kind === 'character');
const originalHashes = [SHARED, CHARACTER].map(file => createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
const ERROR = 'Unable to load items. Try again.';

function unchanged(t) {
  t.after(() => assert.deepEqual([SHARED, CHARACTER].map(file =>
    createHash('sha256').update(fs.readFileSync(file)).digest('hex')), originalHashes));
}

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

async function harness() {
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; },
    querySelector(selector) { return this.getElementById(selector.slice(1)); } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, attributes, id] of shell.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]*)"[^>]*)>/g)) {
    const element = new Element(document, tag); element.id = id;
    element.disabled = /\bdisabled\b/.test(attributes); element.hidden = /\bhidden\b/.test(attributes);
    document.ids.set(id, element);
  }
  document.getElementById('bank-sort').innerHTML = shell.match(/<select id="bank-sort">([\s\S]*?)<\/select>/)[1];
  const bankPanel = document.getElementById('bank-panel');
  bankPanel.children = [...document.ids.values()].filter(element => element.id.startsWith('bank-') && element !== bankPanel);
  const pending = [], previews = [], requests = [], timers = new Map();
  let initial = true, holdPreview = false, timerId = 0;
  const catalog = { ...getInspectorCatalog(workspace), defaultSourceId: stash.id };
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems,
    window: { innerWidth: 1280, innerHeight: 800,
      clearTimeout: id => timers.delete(id), setTimeout: callback => { timers.set(++timerId, callback); return timerId; } },
    async fetch(url, options) {
      requests.push({ url, options });
      if (url === '/api/catalog') return { ok: true, async json() { return catalog; } };
      if (url === '/api/bank') return { ok: true, async json() { return {
        configured: true, enabled: true, sessionToken: 'test-token', bankName: 'copies.json', bank: { items: [] }
      }; } };
      if (url === '/api/bank/preview') {
        const input = JSON.parse(options.body);
        if (holdPreview) { const request = deferred(url, input); previews.push(request); return request.promise; }
        return previewResponse(input);
      }
      assert.ok(url.startsWith('/api/view?'), `unexpected request: ${url}`);
      if (initial) {
        initial = false;
        return { ok: true, async json() { return buildInspectorView(workspace, { sourceId: stash.id, page: '31' }); } };
      }
      const request = deferred(url); pending.push(request); return request.promise;
    }
  });
  function previewResponse(input) {
    return { ok: true, async json() { return { ticket: 'old-preview', canCommit: true, label: `Deposit ${input.itemKey}`,
      result: { bankItemCountBefore: 0, bankItemCountAfter: 1, stashItemCountBefore: 15, stashItemCountAfter: 14 } }; } };
  }
  const bankScript = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8').replace("import { filterBankItems } from './bank-search.mjs';", '').replace("import { sortBankItems } from './bank-sort.mjs';", '').replace('export function createBankUi', 'function createBankUi');
  vm.runInContext(`globalThis.createBankUi = (() => { ${bankScript}\nreturn createBankUi; })();`, context);
  const app = fs.readFileSync(path.join(REPO, 'src/ui/app.js'), 'utf8').replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  vm.runInContext(app, context, { filename: 'app.js' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('state.view.summary.matchedItemCount', context), 15);
  assert.equal(document.getElementById('bank-deposit').disabled, false,
    `actual bank UI must initialize: ${document.getElementById('grid-panels').textContent}`);
  return {
    document, context, requests, pending, previews,
    state: expression => vm.runInContext(`state.${expression}`, context),
    element: id => document.getElementById(id),
    page: number => document.getElementById('page-list').querySelectorAll('[data-page-index]')
      .find(button => button.dataset.pageIndex === String(number - 1)),
    source: id => document.getElementById('source-list').querySelectorAll('[data-source-id]')
      .find(button => button.dataset.sourceId === id),
    success(request) {
      const body = buildInspectorView(workspace, Object.fromEntries(request.params));
      request.resolve({ ok: true, async json() { return body; } });
    },
    failure(request, type = 'http') {
      if (type === 'network') request.reject(new Error('Connection lost'));
      else request.resolve({ ok: type === 'json', status: 503, async json() { throw new Error('Malformed JSON'); } });
    },
    holdPreview() { holdPreview = true; },
    finishPreview(request) { request.resolve(previewResponse(request.input)); },
    async search(text) {
      document.getElementById('query-input').value = text;
      await document.getElementById('query-input').dispatch('input');
      const callback = [...timers.values()].at(-1); timers.clear();
      assert.equal(typeof callback, 'function');
      return callback();
    }
  };
}

function assertCleared(h, error = false) {
  assert.equal(h.state('view'), null);
  assert.equal(h.state('selectedItemKey'), null);
  assert.equal(h.element('grid-panels').querySelectorAll('[data-item-key]').length, 0);
  assert.equal(h.element('match-list').querySelectorAll('[data-item-key]').length, 0);
  assert.equal(h.element('match-count').textContent, '0');
  assert.equal(h.element('selected-path').textContent, '');
  assert.equal(h.element('detail-status').textContent, 'None');
  assert.match(h.element('item-details').textContent, /Select an item/);
  assert.equal(h.element('item-tooltip').classList.contains('is-visible'), false);
  assert.equal(h.element('bank-deposit').disabled, true);
  assert.equal(h.document.getElementById('bank-commit'), null);
  assert.equal(h.element('bank-preview').hidden, true);
  assert.ok(h.page(118), 'navigation must remain usable while results are cleared');
  if (error) assert.equal(h.element('grid-panels').textContent, ERROR);
}

function assertPage(h, number, roots) {
  assert.equal(h.state('page'), String(number));
  assert.equal(h.state('view.summary.selectedPage.index'), number - 1);
  assert.equal(h.state('view.summary.matchedItemCount'), roots);
  assert.equal(h.element('grid-panels').querySelectorAll('[data-item-key]').length, roots);
  assert.equal(h.element('match-list').querySelectorAll('[data-item-key]').length, roots);
  assert.equal(h.element('match-count').textContent, String(roots));
  assert.equal(h.element('bank-deposit').disabled, false);
}

function rendered(h) {
  return ['grid-panels', 'match-list', 'item-details', 'summary-card', 'page-list', 'source-list']
    .map(id => [id, h.element(id).innerHTML, h.element(id).textContent]);
}

test('reversed page responses keep the latest page 118 state, selection, and rendered items', async t => {
  unchanged(t);
  const h = await harness();
  h.element('item-tooltip').classList.add('is-visible');
  const old = h.page(31).dispatch('click');
  assertCleared(h);
  const newest = h.page(118).dispatch('click');
  assertCleared(h);
  assert.equal(h.pending[0].params.get('page'), '31');
  assert.equal(h.pending[1].params.get('page'), '118');
  h.success(h.pending[1]); await newest; assertPage(h, 118, 57);
  const retained = rendered(h), key = h.state('selectedItemKey');
  h.success(h.pending[0]); await old;
  assertPage(h, 118, 57);
  assert.equal(h.state('selectedItemKey'), key);
  assert.deepEqual(rendered(h), retained);
});

test('an obsolete failure cannot replace a newer successful page with an error', async t => {
  unchanged(t);
  const h = await harness();
  const old = h.page(31).dispatch('click');
  const newest = h.page(118).dispatch('click');
  h.success(h.pending[1]); await newest;
  const retained = rendered(h);
  h.failure(h.pending[0], 'network'); await old;
  assertPage(h, 118, 57);
  assert.deepEqual(rendered(h), retained);
});

test('a latest failure stays cleared when an older success arrives and preserves page intent for retry', async t => {
  unchanged(t);
  const h = await harness();
  const old = h.page(31).dispatch('click');
  const newest = h.page(118).dispatch('click');
  h.failure(h.pending[1]); await newest;
  assertCleared(h, true); assert.equal(h.state('page'), '118');
  const retained = rendered(h);
  h.success(h.pending[0]); await old;
  assertCleared(h, true); assert.deepEqual(rendered(h), retained);
  const retry = h.page(118).dispatch('click');
  assert.equal(h.pending[2].params.get('page'), '118');
  h.success(h.pending[2]); await retry; assertPage(h, 118, 57);
});

test('HTTP, network, and JSON failures clear stale actions internally and retry without losing source intent', async t => {
  unchanged(t);
  for (const type of ['http', 'network', 'json']) {
    const h = await harness();
    const selectedKey = h.state('selectedItemKey');
    const request = vm.runInContext('loadView()', h.context);
    assert.equal(h.pending[0].params.get('selectedItemKey'), selectedKey, 'params must capture selection before clearing');
    assertCleared(h);
    h.failure(h.pending[0], type); await request;
    assertCleared(h, true);
    assert.equal(h.state('sourceId'), stash.id);
    assert.equal(h.state('page'), '31');
    const retry = vm.runInContext('loadView()', h.context);
    assert.equal(h.pending[1].params.get('page'), '31');
    assert.equal(h.pending[1].params.get('selectedItemKey'), null);
    h.success(h.pending[1]); await retry; assertPage(h, 31, 15);
  }
});

test('source changes supersede pending page loads without restoring the previous source', async t => {
  unchanged(t);
  const h = await harness();
  const old = h.page(118).dispatch('click');
  const newest = h.source(character.id).dispatch('click');
  assert.equal(h.pending[1].params.get('sourceId'), character.id);
  assert.equal(h.pending[1].params.get('page'), null);
  h.success(h.pending[1]); await newest;
  assert.equal(h.state('view.source.kind'), 'character');
  assert.equal(h.state('page'), null);
  const retained = rendered(h);
  h.success(h.pending[0]); await old;
  assert.equal(h.state('sourceId'), character.id);
  assert.equal(h.state('view.source.kind'), 'character');
  assert.deepEqual(rendered(h), retained);
});

test('actual bank UI invalidates an existing deposit preview at request start and disables deposits through failure', async t => {
  unchanged(t);
  const h = await harness();
  await h.element('bank-deposit').dispatch('click');
  assert.equal(h.element('bank-preview').hidden, false);
  assert.ok(h.element('bank-commit'));
  const previewsBefore = h.requests.filter(request => request.url === '/api/bank/preview').length;
  const navigation = h.page(118).dispatch('click');
  assertCleared(h);
  await h.element('bank-deposit').dispatch('click');
  assert.equal(h.requests.filter(request => request.url === '/api/bank/preview').length, previewsBefore);
  h.failure(h.pending[0]); await navigation; assertCleared(h, true);
  await h.element('bank-deposit').dispatch('click');
  assert.equal(h.requests.filter(request => request.url === '/api/bank/preview').length, previewsBefore);
  assert.equal(h.requests.some(request => request.url === '/api/bank/commit'), false);
});

test('a late bank preview cannot restore an old deposit after a different page or no matching item loads', async t => {
  unchanged(t);
  for (const empty of [false, true]) {
    const h = await harness();
    h.holdPreview();
    const deposit = h.element('bank-deposit').dispatch('click');
    assert.equal(h.previews.length, 1);
    const navigation = h.page(118).dispatch('click');
    assertCleared(h);
    if (empty) {
      const search = h.search('no-such-item-on-this-page');
      for (let count = 0; count < 3; count += 1) await Promise.resolve();
      assert.equal(h.pending.length, 2);
      h.success(h.pending[1]); await search;
      assert.equal(h.state('view.selectedItem'), null);
      h.success(h.pending[0]); await navigation;
    } else { h.success(h.pending[0]); await navigation; }
    h.finishPreview(h.previews[0]); await deposit;
    assert.equal(h.element('bank-preview').hidden, true);
    assert.equal(h.element('bank-commit'), null);
    assert.equal(h.element('bank-deposit').disabled, empty);
    assert.equal(h.state('page'), '118');
    assert.equal(h.requests.some(request => request.url === '/api/bank/commit'), false);
  }
});
