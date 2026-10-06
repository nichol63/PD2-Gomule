import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { filterBankItems } from '../src/lib/bank-search.mjs';
import { sortBankItems } from '../src/lib/bank-sort.mjs';
import { buildInspectorView, getInspectorCatalog, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(getFixtureLibraryDir(), '_LOD_SharedStashSave.sss');
const hash = () => createHash('sha256').update(fs.readFileSync(FILE)).digest('hex');
const originalHash = hash(), workspace = loadInspectorWorkspace([FILE]);
const source = workspace.sources[0], catalog = getInspectorCatalog(workspace);
const tick = () => new Promise(resolve => setImmediate(resolve));
const initialView = buildInspectorView(workspace, { sourceId: source.id, page: '31' });
assert.equal(initialView.selectedItem.displayName, "Bloodraven's Charge");
function unchanged(t) { t.after(() => assert.equal(hash(), originalHash)); }
const normalBank = { configured: true, enabled: false, sessionToken: 'known-token', bankName: 'read-only.json', bank: { items: [] }, error: null };
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

async function harness({ firstBank = 'normal', firstCatalog, firstView } = {}) {
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
  const requests = [], pending = [], timers = new Map(), next = new Map();
  let timerId = 0, initial = true, initialBank = true;
  if (firstCatalog) next.set('/api/catalog', firstCatalog);
  if (firstView) next.set('view', firstView);
  const response = body => ({ ok: true, status: 200, async json() { return body; } });
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems,
    window: { innerWidth: 1280, innerHeight: 800, clearTimeout(id) { timers.delete(id); },
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; } },
    async fetch(url, options) {
      requests.push({ url, options });
      const route = url.startsWith('/api/view?') ? 'view' : url;
      let body, outcome = next.get(route); next.delete(route);
      if (route === '/api/catalog') body = catalog;
      else if (route === 'view') {
        body = initial ? initialView : buildInspectorView(workspace, Object.fromEntries(new URL(url, 'http://localhost').searchParams));
        initial = false;
      } else if (route === '/api/bank') {
        body = normalBank;
        if (initialBank) {
          initialBank = false;
          if (firstBank === 'unconfigured') body = { configured: false, enabled: false, sessionToken: null, bankName: null, bank: { items: [] }, error: null };
          else if (firstBank === 'status-error') body = { ...normalBank, error: 'Bank requires recovery' };
          else if (firstBank !== 'normal') outcome = 'hold';
        }
      } else {
        assert.equal(route, '/api/bank/refresh', 'No preview/commit request is allowed in startup tests');
        assert.equal(options.method, 'POST'); assert.equal(options.headers['X-PD2-Mule-Token'], 'known-token');
        assert.deepEqual(JSON.parse(options.body), {}); body = normalBank;
      }
      if (outcome === 'hold') {
        const record = deferred(url, options); record.body = body; pending.push(record); return record.promise;
      }
      if (outcome === 'network') throw new Error('Startup network unavailable');
      if (outcome === 'http') return { ok: false, status: 503, async json() { return { error: 'Startup HTTP unavailable' }; } };
      if (outcome === 'json') return { ok: true, status: 200, async json() { throw new Error('Startup JSON unavailable'); } };
      return response(body);
    }
  });
  const bank = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8')
    .replace("import { filterBankItems } from './bank-search.mjs';", '')
    .replace("import { sortBankItems } from './bank-sort.mjs';", '')
    .replace('export function createBankUi', 'function createBankUi');
  vm.runInContext('globalThis.createBankUi = (() => { ' + bank + '\nreturn createBankUi; })();', context);
  const app = fs.readFileSync(path.join(REPO, 'src/ui/app.js'), 'utf8').replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  const startup = vm.runInContext(app, context, { filename: 'app.js' }); await tick();
  const element = id => document.getElementById(id);
  return { startup, context, requests, pending, element,
    state: expression => vm.runInContext('state.' + expression, context),
    next(route, outcome) { next.set(route, outcome); },
    finish(record = pending.at(-1)) { record.resolve(response(record.body)); },
    fail(record = pending.at(-1), kind = 'network') {
      if (kind === 'network') record.reject(new Error('Bank status unavailable'));
      else record.resolve({ ok: kind === 'json', status: 503, async json() {
        if (kind === 'json') throw new Error('Bank JSON unavailable');
        return { error: 'Bank HTTP unavailable' };
      } });
    },
    page(number) { return element('page-list').querySelectorAll('[data-page-index]').find(button => button.dataset.pageIndex === String(number - 1)); },
    async query(value) {
      element('query-input').value = value; await element('query-input').dispatch('input');
      const callback = [...timers.values()].at(-1); timers.clear(); return callback();
    },
    restart() { return vm.runInContext('main()', context); }
  };
}
function rendered(h) {
  return Object.fromEntries(['grid-panels', 'match-list', 'summary-card', 'item-details', 'detail-status', 'match-count', 'selected-path']
    .map(id => [id, { html: h.element(id).innerHTML, text: h.element(id).textContent }]));
}
function healthy(h, page = '31', count = 15) {
  assert.equal(h.state('view.source.id'), source.id); assert.equal(h.state('sourceId'), source.id);
  assert.equal(h.state('page'), page); assert.equal(h.state('view.filters.page'), page);
  assert.equal(h.state('view.summary.matchedItemCount'), count); assert.equal(h.element('match-count').textContent, String(count));
  assert.equal(h.state('selectedItemKey'), h.state('view.selectedItem.itemKey'));
  assert.ok(h.element('grid-panels').querySelectorAll('[data-item-key]').length > 0);
  assert.ok(h.element('match-list').querySelectorAll('[data-item-key]').length > 0);
  assert.ok(!h.element('grid-panels').textContent.includes('Failed to load inspector data:'));
}
function unavailable(h, token = false) {
  assert.equal(h.element('bank-panel').hidden, false);
  assert.equal(h.element('bank-mode').textContent, 'Bank unavailable');
  assert.equal(h.element('bank-description').textContent, token
    ? 'Unable to load the bank. Refresh the library to try again.'
    : 'Unable to load the bank. Reload the page to try again.');
  for (const id of ['deposit', 'withdraw', 'item', 'query', 'sort']) assert.equal(h.element('bank-' + id).disabled, true, id);
  assert.equal(h.element('bank-refresh').disabled, !token);
  assert.equal(h.element('bank-recover').disabled, !token);
  assert.equal(h.element('bank-item').value, '');
  assert.match(h.element('bank-count').textContent, /unavailable/i);
  assert.ok(h.element('bank-message').textContent);
}
function cleared(h) {
  assert.equal(h.state('view'), null); assert.equal(h.state('selectedItemKey'), null);
  assert.equal(h.element('match-count').textContent, '0'); assert.equal(h.element('selected-path').textContent, '');
  for (const id of ['grid-panels', 'match-list']) assert.equal(h.element(id).querySelectorAll('[data-item-key]').length, 0);
  assert.doesNotMatch(h.element('item-details').textContent, /Bloodraven/);
  assert.doesNotMatch(h.element('summary-card').textContent, /15.*items/);
  assert.equal(h.element('bank-deposit').disabled, true);
}

test('first bank HTTP, network and JSON failures preserve the real Bloodraven view and continued page/filter browsing', async t => {
  unchanged(t);
  for (const failure of ['http', 'network', 'json']) {
    const h = await harness({ firstBank: failure }); healthy(h);
    const before = rendered(h), view = h.state('view'), key = h.state('selectedItemKey');
    assert.match(h.element('item-details').textContent, /Bloodraven/);
    h.fail(h.pending[0], failure); await h.startup;
    healthy(h); assert.deepEqual(rendered(h), before); assert.equal(h.state('view'), view);
    assert.equal(h.state('selectedItemKey'), key); assert.equal(h.state('query'), ''); unavailable(h);
    const beforeRetry = h.requests.length;
    await h.element('bank-refresh').dispatch('click'); await h.element('bank-recover').dispatch('click');
    assert.equal(h.requests.length, beforeRetry, 'unavailable token must not emit authenticated bank requests');
    await h.query('Bloodraven'); healthy(h, '31', 1);
    assert.equal(h.state('query'), 'Bloodraven'); assert.match(h.element('item-details').textContent, /Bloodraven/);
    await h.query(''); await h.page(118).dispatch('click'); healthy(h, '118', 57); unavailable(h);
    assert.ok(h.state('view.matches').every(item => item.itemKey.includes('|117|')));
    assert.ok(h.requests.every(request => !request.options?.method || request.options.method === 'GET'));
  }
});

test('structured first bank error remains local and offers only the existing known-token library refresh', async t => {
  unchanged(t); const h = await harness({ firstBank: 'status-error' }); await h.startup;
  healthy(h); unavailable(h, true); assert.equal(h.element('bank-message').textContent, 'Bank requires recovery');
  await h.element('bank-refresh').dispatch('click');
  assert.equal(h.element('bank-message').textContent, 'Library refreshed.'); healthy(h);
  assert.equal(h.element('bank-mode').textContent, 'Preview only'); assert.equal(h.element('bank-deposit').disabled, false);
  assert.deepEqual(h.requests.filter(request => request.options?.method === 'POST').map(request => request.url), ['/api/bank/refresh']);
});

test('normal configured startup and hidden unconfigured bank remain compatible with the same read-only workspace', async t => {
  unchanged(t);
  for (const firstBank of ['normal', 'unconfigured']) {
    const h = await harness({ firstBank }); await h.startup; healthy(h);
    assert.equal(h.element('bank-panel').hidden, firstBank === 'unconfigured');
    if (firstBank === 'normal') { assert.equal(h.element('bank-mode').textContent, 'Preview only'); assert.equal(h.element('bank-deposit').disabled, false); }
    assert.match(h.element('item-details').textContent, /Bloodraven/);
    assert.ok(h.requests.every(request => !request.options?.method || request.options.method === 'GET'));
  }
});

test('current workspace catalog startup failure clears rendered stale state instead of retaining healthy-looking old controls', async t => {
  unchanged(t);
  const initial = await harness({ firstCatalog: 'network', firstBank: 'unconfigured' }); await initial.startup;
  cleared(initial); assert.match(initial.element('grid-panels').textContent, /Failed to load inspector data:/);
  const h = await harness(); await h.startup; healthy(h);
  h.element('item-tooltip').classList.add('is-visible'); h.next('/api/catalog', 'http'); await h.restart();
  cleared(h); assert.equal(h.element('item-tooltip').classList.contains('is-visible'), false);
  assert.match(h.element('grid-panels').textContent, /Failed to load inspector data: Request failed: 503/);
});

test('obsolete startup catalog failure cannot overwrite a newer real page 118 view', async t => {
  unchanged(t); const h = await harness(); await h.startup; healthy(h);
  h.next('/api/catalog', 'hold'); const olderStartup = h.restart(); await tick();
  const old = h.pending.at(-1); assert.equal(old.url, '/api/catalog');
  await h.page(118).dispatch('click'); healthy(h, '118', 57);
  const latest = rendered(h), key = h.state('selectedItemKey');
  h.fail(old, 'network'); await olderStartup;
  healthy(h, '118', 57); assert.deepEqual(rendered(h), latest); assert.equal(h.state('selectedItemKey'), key);
});

test('current initial view failure clears workspace state while an obsolete initial view failure leaves the newer selection intact', async t => {
  unchanged(t);
  const current = await harness({ firstView: 'network', firstBank: 'unconfigured' }); await current.startup;
  cleared(current); assert.match(current.element('grid-panels').textContent, /Unable to load items|Failed to load inspector/);
  const h = await harness({ firstView: 'hold', firstBank: 'unconfigured' });
  const old = h.pending[0];
  await h.element('source-list').querySelectorAll('[data-source-id]').find(button => button.dataset.sourceId === source.id).dispatch('click');
  await h.page(118).dispatch('click'); healthy(h, '118', 57);
  const latest = rendered(h); h.fail(old, 'http'); await h.startup;
  healthy(h, '118', 57); assert.deepEqual(rendered(h), latest);
});
