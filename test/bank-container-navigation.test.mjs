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
const FILES = ['_LOD_SharedStashSave.sss', 'Legacy.d2s'].map(name => path.join(getFixtureLibraryDir(), name));
const hashes = () => FILES.map(file => createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
const originals = hashes();
const workspace = loadInspectorWorkspace(FILES);
const catalog = getInspectorCatalog(workspace);
const stash = catalog.sources.find(source => source.kind === 'plugy-shared-stash');
const character = catalog.sources.find(source => source.kind === 'character');
const tick = () => new Promise(resolve => setImmediate(resolve));
function unchanged(t) { t.after(() => assert.deepEqual(hashes(), originals)); }

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
  let initialCatalog = true, heldStatus = null;
  const requests = [], catalogs = [];
  const status = { configured: true, enabled: true, sessionToken: 'token', bankName: 'test-bank.json',
    bank: { items: [{ id: 'bank-item', displayName: 'Diadem', code: 'ci3', quality: 'normal' }] } };
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems,
    window: { innerWidth: 1280, innerHeight: 800, setTimeout() {}, clearTimeout() {} },
    async fetch(url, options) {
      requests.push({ url, options });
      if (url === '/api/catalog') {
        if (initialCatalog) { initialCatalog = false; return { ok: true, async json() { return catalog; } }; }
        const pending = deferred(url); catalogs.push(pending); return pending.promise;
      }
      if (url === '/api/bank') {
        if (heldStatus) { const pending = heldStatus; heldStatus = null; return pending.promise; }
        return { ok: true, async json() { return status; } };
      }
      if (url.startsWith('/api/bank/item?')) return { ok: true, async json() { return { item: {
        itemId: 'bank-item', displayName: 'Diadem', baseName: 'Diadem', code: 'ci3', qualityLabel: 'normal',
        dimensions: '2 x 2', flags: [], propertyLists: [], children: [], source: null, depositedAt: null
      } }; } };
      if (url.startsWith('/api/view?')) return { ok: true, async json() {
        return buildInspectorView(workspace, Object.fromEntries(new URLSearchParams(url.slice(url.indexOf('?') + 1))));
      } };
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-PD2-Mule-Token'], 'token');
      const input = JSON.parse(options.body);
      if (url === '/api/bank/refresh') { assert.deepEqual(input, {}); return { ok: true, async json() { return {}; } }; }
      if (url === '/api/bank/preview') return { ok: true, async json() { return {
        ticket: 'reviewed-ticket', canCommit: true, label: 'Withdraw Diadem', placement: { column: 0, row: 0 },
        result: { bankItemCountBefore: 1, bankItemCountAfter: 0, stashItemCountBefore: 57, stashItemCountAfter: 58 }
      }; } };
      assert.equal(url, '/api/bank/commit');
      assert.deepEqual(input, { ticket: 'reviewed-ticket' });
      return { ok: true, async json() { return { backupPaths: [] }; } };
    }
  });
  const bank = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8').replace("import { filterBankItems } from './bank-search.mjs';", '').replace("import { sortBankItems } from './bank-sort.mjs';", '').replace('export function createBankUi', 'function createBankUi');
  vm.runInContext('globalThis.createBankUi = (() => { ' + bank + '\nreturn createBankUi; })();', context);
  const app = fs.readFileSync(path.join(REPO, 'src/ui/app.js'), 'utf8').replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  vm.runInContext(app, context, { filename: 'app.js' }); await tick();
  return {
    requests, catalogs, context,
    element: id => document.getElementById('bank-' + id),
    async destination(id) { const el = document.getElementById('bank-destination'); el.value = id; await el.dispatch('change'); },
    async container(value) { const el = document.getElementById('bank-container'); el.value = value; await el.dispatch('change'); },
    load() { return vm.runInContext('bankUi.load()', context); },
    finishCatalog(next = catalog) { catalogs.at(-1).resolve({ ok: true, async json() { return next; } }); },
    holdStatus() {
      const pending = deferred('/api/bank'); heldStatus = pending;
      const completion = vm.runInContext('bankUi.load()', context);
      return { completion, finish() { pending.resolve({ ok: true, async json() { return status; } }); } };
    }
  };
}

async function refresh(h, next = catalog) {
  const completion = h.element('refresh').dispatch('click'); await tick();
  h.finishCatalog(next); await completion;
  assert.equal(h.element('message').textContent, 'Library refreshed.');
}

async function commit(h) {
  await h.element('withdraw-form').dispatch('submit'); await tick();
  assert.equal(h.element('preview').hidden, false);
  const completion = h.element('commit').dispatch('click'); await tick();
  h.finishCatalog(); await completion;
  assert.match(h.element('message').textContent, /Transfer saved/);
}

test('shared duplicate Amazon page selection survives load and actual app refresh by numeric index', async t => {
  unchanged(t);
  const h = await harness();
  assert.equal(h.element('destination').value, stash.id);
  await h.container('117');
  assert.match(h.element('container').innerHTML, /value="30">31\. Amazon/);
  assert.match(h.element('container').innerHTML, /value="117">118\. Amazon/);
  await h.load(); assert.equal(h.element('container').value, '117');
  await refresh(h);
  assert.equal(h.element('destination').value, stash.id);
  assert.equal(h.element('container').value, '117');
  assert.equal(h.requests.filter(request => request.url === '/api/bank/refresh').length, 1);
  assert.equal(h.requests.some(request => request.url === '/api/bank/commit'), false);
});

test('post-commit reload keeps the reviewed shared page instead of the first same-named page', async t => {
  unchanged(t);
  const h = await harness(); await h.container('117');
  await commit(h);
  const input = JSON.parse(h.requests.find(request => request.url === '/api/bank/preview').options.body);
  assert.equal(input.action, 'withdraw');
  assert.equal(input.sourceId, stash.id);
  assert.equal(input.pageIndex, 117);
  assert.equal(h.element('container').value, '117');
  assert.equal(h.element('destination').value, stash.id);
  assert.equal(h.requests.filter(request => request.url === '/api/bank/commit').length, 1);
});

test('character stash and cube containers survive refresh and post-commit reload', async t => {
  unchanged(t);
  for (const container of ['stash', 'cube']) {
    const h = await harness(); await h.destination(character.id); await h.container(container);
    await refresh(h);
    assert.equal(h.element('destination').value, character.id);
    assert.equal(h.element('container').value, container);
    await commit(h);
    const input = JSON.parse(h.requests.find(request => request.url === '/api/bank/preview').options.body);
    assert.equal(input.panel, container);
    assert.equal(Object.hasOwn(input, 'pageIndex'), false);
    assert.equal(h.element('container').value, container);
  }
});

test('destination and container chosen during a pending bank status load survive its completion', async t => {
  unchanged(t);
  const h = await harness(); await h.container('30');
  const pending = h.holdStatus();
  await h.container('117'); pending.finish(); await pending.completion;
  assert.equal(h.element('container').value, '117');
  const changed = h.holdStatus();
  await h.destination(character.id); await h.container('cube');
  changed.finish(); await changed.completion;
  assert.equal(h.element('destination').value, character.id);
  assert.equal(h.element('container').value, 'cube');
});

test('removed destination, missing page, and changed source kind fall back to valid first containers', async t => {
  unchanged(t);
  for (const change of ['page', 'source', 'kind']) {
    const h = await harness(); await h.container('117');
    const next = structuredClone(catalog);
    if (change === 'page') next.sources.find(source => source.id === stash.id).pages =
      next.sources.find(source => source.id === stash.id).pages.filter(page => page.index !== 117);
    if (change === 'source') { next.sources = next.sources.filter(source => source.id !== stash.id); next.defaultSourceId = character.id; }
    if (change === 'kind') { const source = next.sources.find(source => source.id === stash.id); source.kind = 'character'; source.pages = []; }
    await refresh(h, next);
    assert.equal(h.element('destination').value, change === 'source' ? character.id : stash.id);
    assert.equal(h.element('container').value, change === 'page' ? '0' : 'inventory');
  }
});

test('explicit destination changes reset to its first container and retain preview invalidation', async t => {
  unchanged(t);
  const h = await harness(); await h.container('117');
  await h.element('withdraw-form').dispatch('submit'); await tick();
  assert.equal(h.element('preview').hidden, false);
  await h.destination(character.id);
  assert.equal(h.element('container').value, 'inventory');
  assert.equal(h.element('preview').hidden, true);
  assert.equal(h.element('commit'), null);
  await h.container('stash'); await h.destination(stash.id);
  assert.equal(h.element('container').value, '0');
  assert.equal(h.requests.some(request => request.url === '/api/bank/commit'), false);
});

test('container retention follows destination file and kind identity rather than a reusable source ID or label', async t => {
  unchanged(t);
  for (const change of ['file', 'kind', 'labels']) {
    const h = await harness(); await h.container('117');
    const next = structuredClone(catalog), destination = next.sources.find(source => source.id === stash.id);
    if (change === 'file') destination.filePath += '.replacement.sss';
    if (change === 'kind') destination.kind = 'plugy-personal-stash';
    if (change === 'labels') {
      destination.label = 'Refreshed shared label';
      destination.pages.find(page => page.index === 117).name = 'Renamed Amazon';
    }
    await refresh(h, next);
    assert.equal(h.element('destination').value, stash.id);
    assert.equal(h.element('container').value, change === 'labels' ? '117' : '0');
    if (change === 'labels') assert.match(h.element('container').innerHTML, /value="117">118\. Renamed Amazon/);
  }
});
