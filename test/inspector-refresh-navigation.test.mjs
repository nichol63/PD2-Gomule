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
  const panel = document.getElementById('bank-panel');
  panel.children = [...document.ids.values()].filter(element => element.id.startsWith('bank-') && element !== panel);
  const views = [], catalogs = [], requests = [], timers = new Map();
  const initialCatalog = { ...getInspectorCatalog(workspace), defaultSourceId: stash.id };
  let initialView = true, initialCatalogRequest = true, timerId = 0;
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems,
    window: { innerWidth: 1280, innerHeight: 800,
      clearTimeout: id => timers.delete(id), setTimeout: callback => { timers.set(++timerId, callback); return timerId; } },
    async fetch(url, options) {
      requests.push({ url, options });
      if (url === '/api/catalog') {
        if (initialCatalogRequest) {
          initialCatalogRequest = false;
          return { ok: true, async json() { return initialCatalog; } };
        }
        const request = deferred(url); catalogs.push(request); return request.promise;
      }
      if (url === '/api/bank') return { ok: true, async json() { return {
        configured: true, enabled: true, sessionToken: 'test-token', bankName: 'copies.json', bank: { items: [] }
      }; } };
      if (url === '/api/bank/refresh') {
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['X-PD2-Mule-Token'], 'test-token');
        assert.deepEqual(JSON.parse(options.body), {});
        return { ok: true, async json() { return {}; } };
      }
      assert.ok(url.startsWith('/api/view?'), 'unexpected route: ' + url);
      const request = deferred(url); views.push(request);
      if (initialView) {
        initialView = false;
        return { ok: true, async json() { return buildInspectorView(workspace, Object.fromEntries(request.params)); } };
      }
      return request.promise;
    }
  });
  const bankScript = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8').replace("import { filterBankItems } from './bank-search.mjs';", '').replace("import { sortBankItems } from './bank-sort.mjs';", '').replace('export function createBankUi', 'function createBankUi');
  vm.runInContext('globalThis.createBankUi = (() => { ' + bankScript + '\nreturn createBankUi; })();', context);
  const app = fs.readFileSync(path.join(REPO, 'src/ui/app.js'), 'utf8').replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  vm.runInContext(app, context, { filename: 'app.js' });
  await tick();
  assert.equal(vm.runInContext('state.sourceId', context), stash.id);
  assert.equal(vm.runInContext('state.page', context), '1');
  assert.equal(document.getElementById('bank-deposit').disabled, true, 'the default landing page is empty');
  return {
    document, context, requests, views, catalogs, initialCatalog,
    state: expression => vm.runInContext('state.' + expression, context),
    element: id => document.getElementById(id),
    page: number => document.getElementById('page-list').querySelectorAll('[data-page-index]')
      .find(button => button.dataset.pageIndex === String(number - 1)),
    source: id => document.getElementById('source-list').querySelectorAll('[data-source-id]')
      .find(button => button.dataset.sourceId === id),
    success(request, subtitle) {
      const body = buildInspectorView(workspace, Object.fromEntries(request.params));
      if (subtitle !== undefined) body.summary.subtitle = subtitle;
      request.resolve({ ok: true, async json() { return body; } });
    },
    failure(request) { request.reject(new Error('Connection lost')); },
    finishCatalog(value = initialCatalog) {
      catalogs.at(-1).resolve({ ok: true, async json() { return value; } });
    },
    async search(text) {
      document.getElementById('query-input').value = text;
      await document.getElementById('query-input').dispatch('input');
      const callback = [...timers.values()].at(-1); timers.clear();
      assert.equal(typeof callback, 'function');
      return callback();
    }
  };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

async function startRefresh(h) {
  const completion = h.element('bank-refresh').dispatch('click');
  await tick();
  assert.ok(h.catalogs.at(-1), 'actual bank refresh must reach catalog request');
  return { completion };
}

async function navigatePage(h, page) {
  const completion = h.page(page).dispatch('click');
  h.success(h.views.at(-1));
  await completion;
}

function assertRefreshFinished(h) {
  assert.equal(h.requests.filter(request => request.url === '/api/bank/refresh').length, 1);
  assert.equal(h.requests.filter(request => request.url === '/api/catalog').length, 2);
  assert.equal(h.requests.filter(request => request.url === '/api/bank').length, 2);
  assert.equal(h.requests.some(request => request.url === '/api/bank/commit'), false);
}

function rendered(h) {
  return ['grid-panels', 'match-list', 'item-details', 'summary-card', 'page-list']
    .map(id => [id, h.element(id).innerHTML, h.element(id).textContent]);
}

function assertCleared(h, failed = false) {
  assert.equal(h.state('view'), null);
  assert.equal(h.state('selectedItemKey'), null);
  assert.equal(h.element('grid-panels').querySelectorAll('[data-item-key]').length, 0);
  assert.equal(h.element('match-list').querySelectorAll('[data-item-key]').length, 0);
  assert.equal(h.element('detail-status').textContent, 'None');
  assert.match(h.element('item-details').textContent, /Select an item.*read-only/);
  assert.equal(h.element('bank-deposit').disabled, true);
  if (failed) assert.equal(h.element('grid-panels').textContent, ERROR);
}

test('startup still loads the default source and its first physical page', async t => {
  unchanged(t);
  const h = await harness();
  assert.equal(h.views.length, 1);
  assert.equal(h.views[0].params.get('sourceId'), stash.id);
  assert.equal(h.views[0].params.get('page'), null);
  assert.equal(h.state('view.summary.selectedPage.index'), 0);
  assert.equal(h.state('view.summary.matchedItemCount'), stash.summary.pages[0].topLevelItems.length);
  assert.equal(h.requests.filter(request => request.url === '/api/catalog').length, 1);
  assert.equal(h.requests.filter(request => request.url === '/api/bank').length, 1);
});

test('a refresh catalog arriving after navigation to another source preserves the newer successful view', async t => {
  unchanged(t);
  const h = await harness();
  const refresh = await startRefresh(h);
  const navigation = h.source(character.id).dispatch('click');
  const request = h.views.at(-1);
  h.success(request); await navigation;
  const count = h.views.length, retained = rendered(h), key = h.state('selectedItemKey');
  h.finishCatalog({ ...h.initialCatalog, loadedFrom: ['refreshed catalog'] });
  await refresh.completion;
  assert.equal(h.views.length, count, 'refresh must not issue its captured old-source view');
  assert.equal(h.state('sourceId'), character.id);
  assert.equal(h.state('selectedItemKey'), key);
  assert.deepEqual(rendered(h), retained);
  assert.equal(h.element('workspace-meta').textContent, 'refreshed catalog');
  assertRefreshFinished(h);
});

test('a newer pending non-first item selection survives catalog completion without an extra refresh request', async t => {
  unchanged(t);
  const h = await harness();
  const refresh = await startRefresh(h);
  const navigation = h.source(character.id).dispatch('click');
  h.success(h.views.at(-1)); await navigation;
  const button = h.element('grid-panels').querySelectorAll('[data-item-key]')
    .find(button => button.dataset.itemKey !== h.state('selectedItemKey'));
  const itemKey = button.dataset.itemKey;
  assert.notEqual(itemKey, h.state('selectedItemKey'));
  const selection = button.dispatch('click');
  const pending = h.views.at(-1), count = h.views.length;
  assert.equal(pending.params.get('selectedItemKey'), itemKey);
  assertCleared(h);
  h.finishCatalog(); await refresh.completion;
  assert.equal(h.views.length, count);
  assertCleared(h);
  assert.equal(h.state('sourceId'), character.id);
  h.success(pending); await selection;
  assert.equal(h.state('selectedItemKey'), itemKey);
  assert.equal(h.state('view.selectedItem.itemKey'), itemKey);
  assertRefreshFinished(h);
});

test('page, query, quality, and sort changes during refresh keep the newest exact request intent', async t => {
  unchanged(t);
  const h = await harness();
  await navigatePage(h, 31);
  assert.equal(h.state('view.summary.matchedItemCount'), 15);
  const refresh = await startRefresh(h);
  const navigation = h.page(118).dispatch('click'), pageRequest = h.views.at(-1);
  h.success(pageRequest); await navigation;
  assert.equal(h.state('view.summary.matchedItemCount'), 57);
  const search = h.search('cm3'); await tick();
  const searchRequest = h.views.at(-1);
  h.element('quality-select').value = 'magic';
  const quality = h.element('quality-select').dispatch('change'), qualityRequest = h.views.at(-1);
  h.element('sort-select').value = 'code';
  const sort = h.element('sort-select').dispatch('change'), latest = h.views.at(-1);
  const count = h.views.length;
  assert.equal(latest.params.get('page'), '118');
  assert.equal(latest.params.get('query'), 'cm3');
  assert.equal(latest.params.get('quality'), 'magic');
  assert.equal(latest.params.get('sort'), 'code');
  h.finishCatalog(); await refresh.completion;
  assert.equal(h.views.length, count);
  assertCleared(h);
  h.success(latest); await sort;
  const key = h.state('selectedItemKey'), retained = rendered(h);
  h.success(qualityRequest); h.success(searchRequest); await quality; await search;
  assert.equal(h.state('page'), '118');
  assert.equal(h.state('query'), 'cm3');
  assert.equal(h.state('quality'), 'magic');
  assert.equal(h.state('sort'), 'code');
  assert.equal(h.state('selectedItemKey'), key);
  assert.deepEqual(rendered(h), retained);
  assert.ok(h.state('view.matches.length') > 0);
  assert.ok(h.state('view.matches').every(item => item.code === 'cm3' && item.qualityLabel === 'magic'));
  assertRefreshFinished(h);
});

test('catalog completion does not revive a newer failed view or its selected item', async t => {
  unchanged(t);
  const h = await harness();
  const refresh = await startRefresh(h);
  const navigation = h.page(118).dispatch('click');
  h.failure(h.views.at(-1)); await navigation;
  assertCleared(h, true);
  const count = h.views.length;
  h.finishCatalog(); await refresh.completion;
  assert.equal(h.views.length, count);
  assertCleared(h, true);
  assert.equal(h.state('page'), '118');
  assertRefreshFinished(h);
});

test('an item request already pending before refresh is reissued with its exact key and supersedes the older result', async t => {
  unchanged(t);
  const h = await harness();
  await navigatePage(h, 31);
  const button = h.element('grid-panels').querySelectorAll('[data-item-key]')[1];
  const itemKey = button.dataset.itemKey;
  assert.notEqual(itemKey, h.state('selectedItemKey'));
  const selection = button.dispatch('click');
  const old = h.views.at(-1), count = h.views.length;
  assert.equal(old.params.get('selectedItemKey'), itemKey);
  assertCleared(h);
  const refresh = await startRefresh(h);
  h.finishCatalog(); await tick();
  assert.equal(h.views.length, count + 1);
  const fresh = h.views.at(-1);
  assert.equal(fresh.params.toString(), old.params.toString(), 'requery must preserve the complete pending intent');
  // A refreshed response can have new presentation metadata while the same
  // requested physical item remains selected. Make stale replacement visible.
  h.success(fresh, 'Freshly reloaded fixture metadata'); await refresh.completion;
  assert.equal(h.state('selectedItemKey'), itemKey);
  const retained = rendered(h);
  h.success(old); await selection;
  assert.equal(h.state('selectedItemKey'), itemKey);
  assert.deepEqual(rendered(h), retained);
  assertRefreshFinished(h);
});

test('an item request that fails during refresh is reissued without reviving its failed key', async t => {
  unchanged(t);
  const h = await harness();
  await navigatePage(h, 31);
  const button = h.element('grid-panels').querySelectorAll('[data-item-key]')[1], failedKey = button.dataset.itemKey;
  const selection = button.dispatch('click'), old = h.views.at(-1);
  const refresh = await startRefresh(h);
  h.failure(old); await selection; assertCleared(h, true);
  h.finishCatalog(); await tick();
  const fresh = h.views.at(-1);
  assert.notEqual(fresh, old);
  assert.equal(fresh.params.get('page'), '31');
  assert.equal(fresh.params.get('selectedItemKey'), null);
  h.success(fresh); await refresh.completion;
  assert.notEqual(h.state('selectedItemKey'), failedKey);
  assertRefreshFinished(h);
});

test('an uncontested refresh retains the current key, page, filters, and sort while updating catalog and bank status', async t => {
  unchanged(t);
  const h = await harness();
  await navigatePage(h, 118);
  h.element('quality-select').value = 'superior';
  const filter = h.element('quality-select').dispatch('change'); h.success(h.views.at(-1)); await filter;
  h.element('sort-select').value = 'code';
  const sorting = h.element('sort-select').dispatch('change'); h.success(h.views.at(-1)); await sorting;
  h.element('complete-only-input').checked = true;
  const complete = h.element('complete-only-input').dispatch('change'); h.success(h.views.at(-1)); await complete;
  const search = h.search('amazon'); await tick(); h.success(h.views.at(-1)); await search;
  const button = h.element('grid-panels').querySelectorAll('[data-item-key]').at(-1), key = button.dataset.itemKey;
  const selection = button.dispatch('click'); h.success(h.views.at(-1)); await selection;
  const count = h.views.length;
  const refresh = await startRefresh(h);
  h.finishCatalog({ ...h.initialCatalog, defaultSourceId: character.id, loadedFrom: ['new catalog path'] });
  await tick();
  assert.equal(h.views.length, count + 1);
  const request = h.views.at(-1);
  assert.equal(request.params.get('sourceId'), stash.id);
  assert.equal(request.params.get('page'), '118');
  assert.equal(request.params.get('quality'), 'superior');
  assert.equal(request.params.get('sort'), 'code');
  assert.equal(request.params.get('completeOnly'), 'true');
  assert.equal(request.params.get('query'), 'amazon');
  assert.equal(request.params.get('selectedItemKey'), key);
  h.success(request); await refresh.completion;
  assert.equal(h.state('selectedItemKey'), key);
  assert.equal(h.state('view.summary.matchedItemCount'), 12);
  assert.equal(h.element('workspace-meta').textContent, 'new catalog path');
  assertRefreshFinished(h);
});

test('removing the newly selected source falls back to the catalog default and supersedes its pending response', async t => {
  unchanged(t);
  const h = await harness();
  const refresh = await startRefresh(h);
  const navigation = h.source(character.id).dispatch('click'), old = h.views.at(-1);
  const onlyStash = { ...h.initialCatalog, sources: h.initialCatalog.sources.filter(source => source.id !== character.id),
    sourceCount: 1, defaultSourceId: stash.id };
  h.finishCatalog(onlyStash); await tick();
  const fallback = h.views.at(-1);
  assert.notEqual(fallback, old);
  assert.equal(fallback.params.get('sourceId'), stash.id);
  assert.equal(fallback.params.get('page'), null);
  assert.equal(fallback.params.get('selectedItemKey'), null);
  h.success(fallback); await refresh.completion;
  const retained = rendered(h);
  h.success(old); await navigation;
  assert.equal(h.state('sourceId'), stash.id);
  assert.equal(h.state('page'), '1');
  assert.deepEqual(rendered(h), retained);
  assert.equal(h.element('source-count').textContent, '1');
  assertRefreshFinished(h);
});
