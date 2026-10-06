import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { filterBankItems } from '../src/lib/bank-search.mjs';
import { sortBankItems } from '../src/lib/bank-sort.mjs';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { collectBrowseEntries } from '../src/lib/browser-index.mjs';
import { buildInspectorView, getInspectorCatalog, getItemKey, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = getFixtureLibraryDir(), names = ['Bases.d2x', 'Legacy.d2s'];
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const originalHashes = names.map(name => hash(path.join(FIXTURES, name)));
const tick = () => new Promise(resolve => setImmediate(resolve));
const BLOCKED = 'Transfer saved. Refresh the library to show updated items.';
function setup(t) {
  const directory = fs.mkdtempSync(path.join(REPO, '.post-commit-ui-test-'));
  t.after(() => {
    try { assert.deepEqual(names.map(name => hash(path.join(FIXTURES, name))), originalHashes); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const [sourcePath, otherPath] = names.map(name => path.join(directory, name));
  for (const name of names) fs.copyFileSync(path.join(FIXTURES, name), path.join(directory, name));
  const bankPath = path.join(directory, 'bank.json');
  const workspace = loadInspectorWorkspace([sourcePath, otherPath]);
  const service = createMuleService(workspace, { bankPath, experimentalWrite: true });
  return { directory, sourcePath, otherPath, bankPath, workspace, service };
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


async function harness(copies) {
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
  const requests = [], pending = [], nextResponses = new Map(), timers = new Map();
  let timerId = 0;
  const response = body => ({ ok: true, status: 200, async json() { return body; } });
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems,
    window: { innerWidth: 1280, innerHeight: 800, clearTimeout(id) { timers.delete(id); },
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; } },
    async fetch(url, options) {
      requests.push({ url, options });
      const route = url.startsWith('/api/view?') ? 'view' : url;
      let body;
      try {
        if (route === '/api/catalog') body = getInspectorCatalog(copies.workspace);
        else if (route === '/api/bank') body = copies.service.status();
        else if (route === 'view') body = buildInspectorView(copies.workspace,
          Object.fromEntries(new URLSearchParams(url.slice(url.indexOf('?') + 1))));
        else if (url.startsWith('/api/bank/item?')) body = { item: copies.service.itemDetails(new URL(url, 'http://localhost').searchParams.get('itemId')) };
        else {
          assert.equal(options.method, 'POST'); assert.equal(options.headers['X-PD2-Mule-Token'], copies.service.sessionToken);
          const input = JSON.parse(options.body);
          if (route === '/api/bank/preview') body = copies.service.preview(input);
          else if (route === '/api/bank/commit') body = copies.service.commit(input.ticket);
          else { assert.equal(route, '/api/bank/refresh'); body = copies.service.refresh(); }
        }
      } catch (error) { return { ok: false, status: 400, async json() { return { error: error.message }; } }; }
      const next = nextResponses.get(route); nextResponses.delete(route);
      if (next === 'hold') {
        const record = deferred(url, options); record.body = body; pending.push(record); return record.promise;
      }
      if (next === 'network') throw new Error('Controlled network failure');
      if (next === 'http') return { ok: false, status: 500, async json() { return { error: 'Controlled HTTP failure' }; } };
      if (next === 'json') return { ok: true, status: 200, async json() { throw new Error('Controlled JSON failure'); } };
      return response(body);
    }
  });
  const bank = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8')
    .replace("import { filterBankItems } from './bank-search.mjs';", '')
    .replace("import { sortBankItems } from './bank-sort.mjs';", '')
    .replace('export function createBankUi', 'function createBankUi');
  vm.runInContext('globalThis.createBankUi = (() => { ' + bank + '\nreturn createBankUi; })();', context);
  const app = fs.readFileSync(path.join(REPO, 'src/ui/app.js'), 'utf8').replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  vm.runInContext(app, context, { filename: 'app.js' }); await tick();
  const element = id => document.getElementById(id);
  const h = { copies, requests, pending, context, element,
    state: expression => vm.runInContext('state.' + expression, context),
    next(route, outcome) { nextResponses.set(route, outcome); },
    finish(record = pending.at(-1)) { record.resolve(response(record.body)); },
    fail(record = pending.at(-1), outcome = 'network') {
      if (outcome === 'network') record.reject(new Error('Controlled late network failure'));
      else record.resolve({ ok: false, status: 500, async json() { return { error: 'Controlled late HTTP failure' }; } });
    },
    async browse(id, page) {
      await element('source-list').querySelectorAll('[data-source-id]').find(button => button.dataset.sourceId === id).dispatch('click');
      if (page) await element('page-list').querySelectorAll('[data-page-index]').find(button => button.dataset.pageIndex === String(page - 1)).dispatch('click');
    },
    async query(value) {
      element('query-input').value = value; await element('query-input').dispatch('input');
      const callback = [...timers.values()].at(-1); timers.clear(); return callback();
    },
    async preview() { await element('bank-deposit').dispatch('click'); assert.equal(element('bank-preview').hidden, false); },
    async startCommit() { const completion = element('bank-commit').dispatch('click'); await tick(); return { completion }; },
    repair() { fs.copyFileSync(path.join(FIXTURES, names[1]), copies.otherPath); }
  };
  await h.browse('source-1', 2);
  await h.query('ci3');
  assert.equal(h.state('view.source.id'), 'source-1'); assert.equal(h.state('page'), '2');
  assert.equal(h.state('view.selectedItem.code'), 'ci3');
  assert.equal(element('bank-deposit').disabled, false);
  return h;
}
function saved(h, warned = true) {
  const message = h.element('bank-message').textContent;
  assert.ok(message.startsWith('Transfer saved.'), message);
  assert.match(message, /1 backups retained\./);
  assert.match(message, /Transaction [0-9a-f-]{36}\./);
  assert.equal(message.includes('Library refresh failed:'), warned, message);
  assert.equal(h.requests.filter(request => request.url === '/api/bank/commit').length, 1);
  assert.equal(inspectSaveFile(h.copies.sourcePath).totalItems, 2585);
  assert.equal(h.copies.service.status().bank.items.length, 1);
  assert.equal(h.element('bank-preview').hidden, true);
  assert.equal(h.element('bank-commit'), null);
}
function cleared(h) {
  assert.equal(h.state('view'), null); assert.equal(h.state('selectedItemKey'), null);
  assert.equal(h.element('match-count').textContent, '0');
  assert.equal(h.element('match-list').querySelectorAll('[data-item-key]').length, 0);
  assert.equal(h.element('grid-panels').querySelectorAll('[data-item-key]').length, 0);
  assert.equal(h.element('bank-deposit').disabled, true);
  assert.equal(h.element('item-tooltip').classList.contains('is-visible'), false);
}

test('server refreshError preserves saved result, blocks cached views, ignores old responses and resumes current intent after explicit repair', async t => {
  const copies = setup(t), h = await harness(copies); await h.preview();
  fs.unlinkSync(copies.otherPath); h.next('/api/bank/commit', 'hold');
  const commit = await h.startCommit();
  h.next('view', 'hold');
  const oldCompletion = h.query('ci3'); await tick();
  const old = h.pending.at(-1); assert.ok(old.url.startsWith('/api/view?'));
  const commitRecord = h.pending.find(record => record.url === '/api/bank/commit');
  const requestBoundary = h.requests.length; h.finish(commitRecord); await commit.completion;
  saved(h); cleared(h);
  assert.match(h.element('bank-message').textContent, /Save path does not exist:/);
  assert.equal(h.element('bank-count').textContent, 'Bank items (1 of 1)');
  assert.equal(h.requests.slice(requestBoundary).filter(request => request.url === '/api/catalog' || request.url.startsWith('/api/view?')).length, 0);
  h.finish(old); await oldCompletion; cleared(h);
  const beforeBlocked = h.requests.length; await h.query('Helm');
  assert.equal(h.requests.length, beforeBlocked); assert.equal(h.element('grid-panels').textContent, BLOCKED);
  assert.equal(h.state('sourceId'), 'source-1'); assert.equal(h.state('page'), '2'); assert.equal(h.state('query'), 'Helm');
  h.repair(); h.next('/api/catalog', 'hold');
  const refreshing = h.element('bank-refresh').dispatch('click'); await tick();
  const catalog = h.pending.at(-1); assert.equal(catalog.url, '/api/catalog');
  const beforeNavigation = h.requests.length;
  await h.browse('source-2'); await h.browse('source-1', 13); await h.query('Wolf');
  assert.equal(h.requests.length, beforeNavigation, 'navigation while blocked must not query the cached workspace');
  h.finish(catalog); await refreshing;
  assert.equal(h.element('bank-message').textContent, 'Library refreshed.');
  assert.equal(h.state('view.source.id'), 'source-1'); assert.equal(h.state('page'), '13'); assert.equal(h.state('query'), 'Wolf');
  assert.equal(h.state('view.source.itemCount'), 2585);
  assert.equal(h.element('bank-deposit').disabled, false);
  assert.equal(h.requests.filter(request => request.url === '/api/bank/commit').length, 1);
});

test('a local catalog failure after real commit preserves success and clears stale controls without a second commit', async t => {
  const h = await harness(setup(t)); await h.preview(); h.next('/api/catalog', 'network');
  const { completion } = await h.startCommit(); await completion;
  saved(h); cleared(h);
  assert.match(h.element('bank-message').textContent, /Library refresh failed:.*Controlled network failure/);
  assert.equal(h.element('bank-count').textContent, 'Bank items (1 of 1)');
  await h.element('bank-refresh').dispatch('click');
  assert.equal(h.element('bank-message').textContent, 'Library refreshed.');
  await h.query('Helm'); assert.equal(h.element('bank-deposit').disabled, false);
});

test('current view HTTP, network and JSON failures after commit/catalog success produce saved-with-warning and no stale selection', async t => {
  for (const failure of ['http', 'network', 'json']) {
    const h = await harness(setup(t)); await h.preview(); h.next('view', failure);
    const { completion } = await h.startCommit(); await completion;
    saved(h); cleared(h);
    assert.equal(h.element('grid-panels').textContent, 'Unable to load items. Try again.');
    assert.equal(h.element('bank-count').textContent, 'Bank items (1 of 1)');
  }
});

test('fresh bank status failure after successful commit clears stale bank items/actions/details as unavailable and permits refresh retry', async t => {
  const copies = setup(t);
  const entry = collectBrowseEntries(copies.workspace.sources[0].summary).find(entry => entry.pageIndex === 12 && entry.itemIndex === 15);
  const initialRequest = { action: 'deposit', sourceId: 'source-1', itemKey: getItemKey(entry) };
  copies.service.commit(copies.service.preview(initialRequest).ticket);
  const h = await harness(copies); assert.ok(h.element('bank-item').value); await h.preview(); h.next('/api/bank', 'network');
  const { completion } = await h.startCommit(); await completion;
  const message = h.element('bank-message').textContent;
  assert.ok(message.startsWith('Transfer saved.')); assert.match(message, /Library refresh failed:/);
  assert.equal(h.element('bank-item').value, ''); assert.equal(h.element('bank-withdraw').disabled, true);
  assert.equal(h.element('bank-deposit').disabled, true);
  assert.match(h.element('bank-count').textContent, /unavailable/i); assert.doesNotMatch(h.element('bank-item').textContent, /Bank is empty/);
  assert.ok(!h.element('bank-details-content').innerHTML); assert.equal(h.element('bank-refresh').disabled, false);
  assert.equal(copies.service.status().bank.items.length, 2); assert.equal(inspectSaveFile(copies.sourcePath).totalItems, 2584);
  assert.equal(h.requests.filter(request => request.url === '/api/bank/commit').length, 1);
  await h.element('bank-refresh').dispatch('click');
  assert.equal(h.element('bank-message').textContent, 'Library refreshed.'); assert.equal(h.element('bank-count').textContent, 'Bank items (2 of 2)');
  await h.query('Helm');
  assert.equal(h.element('bank-deposit').disabled, false);
});

test('a newer user view supersedes failed postcommit reload without warnings or clearing the newer navigation', async t => {
  for (const route of ['/api/catalog', 'view']) {
    const h = await harness(setup(t)); await h.preview(); h.next(route, 'hold');
    const { completion } = await h.startCommit(); const old = h.pending.at(-1);
    assert.ok(route === 'view' ? old.url.startsWith('/api/view?') : old.url === '/api/catalog');
    await h.browse('source-2'); await h.query(''); assert.equal(h.state('view.source.id'), 'source-2');
    h.fail(old, 'http'); await completion;
    saved(h, false); assert.equal(h.state('view.source.id'), 'source-2');
    assert.equal(h.state('selectedItemKey'), h.state('view.selectedItem')?.itemKey ?? null);
  }
});

test('real engine rejection stays an error and never claims a successful transfer or reloads the workspace', async t => {
  const copies = setup(t), h = await harness(copies);
  fs.writeFileSync(copies.bankPath + '.lock', JSON.stringify({ pid: process.pid, bankPath: copies.bankPath, stashPath: copies.sourcePath, token: 'active' }));
  await h.preview(); const before = h.requests.length;
  const { completion } = await h.startCommit(); await completion;
  assert.match(h.element('bank-message').textContent, /locked|already exists/i);
  assert.doesNotMatch(h.element('bank-message').textContent, /Transfer saved\.|Library refresh failed:/);
  assert.equal(inspectSaveFile(copies.sourcePath).totalItems, 2586); assert.equal(fs.existsSync(copies.bankPath), false);
  assert.equal(h.requests.slice(before).filter(request => request.url === '/api/catalog' || request.url === '/api/bank' || request.url.startsWith('/api/view?')).length, 0);
});

test('normal actual service/app/bank commit retains its existing success text, backups and fresh view without warning', async t => {
  const h = await harness(setup(t)); await h.preview();
  const { completion } = await h.startCommit(); await completion;
  saved(h, false); assert.equal(h.state('view.source.itemCount'), 2585);
  assert.equal(h.element('bank-count').textContent, 'Bank items (1 of 1)');
  assert.equal(h.state('view.selectedItem'), null);
  await h.query('Helm');
  assert.equal(h.element('bank-deposit').disabled, false);
});
