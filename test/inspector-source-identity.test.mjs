import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { buildInspectorView, getInspectorCatalog, getItemKey, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { collectBrowseEntries } from '../src/lib/browser-index.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = ['Bases.d2x', 'Legacy.d2s', '_LOD_SharedStashSave.sss'].map(name => path.join(getFixtureLibraryDir(), name));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonicalHashes = fixtures.map(hash);
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(t) {
  const directory = fs.mkdtempSync(path.join(REPO, '.source-identity-test-'));
  const a = path.join(directory, 'A.d2x'), b = path.join(directory, 'B.d2s'), c = path.join(directory, 'C.sss');
  for (const [index, file] of [a, b, c].entries()) fs.copyFileSync(fixtures[index], file);
  const alias = path.join(directory, 'alias-B.d2s'); fs.symlinkSync(b, alias);
  const bankPath = path.join(directory, 'bank.json'); fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const inputs = [a, alias, c], workspace = loadInspectorWorkspace(inputs);
  const service = createMuleService(workspace, { bankPath, experimentalWrite: true });
  const originalCopies = [a, b, c].map(hash);
  t.after(() => {
    try { assert.deepEqual(fixtures.map(hash), canonicalHashes); assert.deepEqual([a, b, c].map(hash), originalCopies); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  return { directory, a, b, c, alias, inputs, workspace, service, bankPath };
}

function retarget(state, target) { fs.unlinkSync(state.alias); fs.symlinkSync(target, state.alias); }
function identities(workspace) { return workspace.sources.map(source => [source.id, source.summary.filePath]); }
function selection(state, sourceId = 'source-1') {
  const source = state.workspace.sources.find(source => source.id === sourceId);
  const entry = collectBrowseEntries(source.summary).find(entry => source.summary.pages ? entry.pageIndex === 1 : entry.code === 'box');
  assert.ok(entry);
  return { action: 'deposit', sourceId, itemKey: getItemKey(entry) };
}

test('service refresh preserves survivor IDs and restores a removed exact alias path without remapping it', t => {
  const state = setup(t);
  assert.deepEqual(identities(state.workspace), [['source-1', state.a], ['source-2', state.alias], ['source-3', state.c]]);
  const request = selection(state), preview = state.service.preview(request);
  retarget(state, state.a); state.service.refresh();
  assert.deepEqual(identities(state.workspace), [['source-1', state.a], ['source-3', state.c]]);
  assert.equal(getInspectorCatalog(state.workspace).sources.find(source => source.filePath === state.c).id, 'source-3');
  assert.throws(() => state.service.preview({ ...request, sourceId: 'source-2' }), /loaded/i);
  assert.throws(() => state.service.commit(preview.ticket), /expired/i);
  retarget(state, state.b); state.service.refresh();
  assert.deepEqual(identities(state.workspace), [['source-1', state.a], ['source-2', state.alias], ['source-3', state.c]]);
  assert.throws(() => state.service.preview(selection(state, 'source-2')), /Symbolic link/i);
  assert.equal(state.service.preview(selection(state)).result.dryRun, true);
  const sourceBytes = fs.readFileSync(state.a);
  fs.appendFileSync(state.a, Buffer.from([0]));
  try { assert.throws(() => state.service.preview(selection(state)), /save changed|refresh/i); }
  finally { fs.writeFileSync(state.a, sourceBytes); }
  assert.deepEqual(identities(state.workspace), [['source-1', state.a], ['source-2', state.alias], ['source-3', state.c]]);
});

test('standalone workspace IDs remain indexed while a service retains path identities after deduplication', t => {
  const state = setup(t); retarget(state, state.a);
  const standalone = loadInspectorWorkspace(state.inputs);
  assert.deepEqual(identities(standalone), [['source-1', state.a], ['source-2', state.c]]);
  state.service.refresh();
  assert.deepEqual(identities(state.workspace), [['source-1', state.a], ['source-3', state.c]]);
  const view = buildInspectorView(state.workspace, { sourceId: 'source-3', page: '118' });
  assert.equal(view.summary.filePath, state.c);
  assert.equal(view.summary.selectedPage.index, 117);
  assert.equal(view.matches.length, 57);
});

test('newly discovered exact child paths cannot reuse IDs reserved by missing initial sources', t => {
  const state = setup(t);
  fs.unlinkSync(state.alias); fs.mkdirSync(state.alias);
  const d = path.join(state.alias, 'D.d2x'), e = path.join(state.alias, 'E.d2s');
  fs.copyFileSync(state.a, d); fs.copyFileSync(state.b, e);
  state.service.refresh();
  const added = state.workspace.sources.filter(source => [d, e].includes(source.summary.filePath));
  assert.equal(added.length, 2);
  assert.ok(added.every(source => !['source-1', 'source-2', 'source-3'].includes(source.id)));
  assert.equal(new Set(state.workspace.sources.map(source => source.id)).size, 4);
  assert.equal(state.workspace.sources.find(source => source.summary.filePath === state.c).id, 'source-3');
  const issued = added.map(source => source.id);
  fs.rmSync(state.alias, { recursive: true }); fs.symlinkSync(state.b, state.alias); state.service.refresh();
  assert.equal(state.workspace.sources.find(source => source.summary.filePath === state.alias).id, 'source-2');
  fs.unlinkSync(state.alias); fs.mkdirSync(state.alias);
  const f = path.join(state.alias, 'F.d2x'); fs.copyFileSync(state.a, f); state.service.refresh();
  const newest = state.workspace.sources.find(source => source.summary.filePath === f);
  assert.ok(!issued.includes(newest.id));
  assert.ok(!['source-1', 'source-2', 'source-3'].includes(newest.id));
});

test('failed refresh keeps a valid workspace and identity mapping until its requested source returns', t => {
  const state = setup(t), before = identities(state.workspace);
  const sources = state.workspace.sources, preview = state.service.preview(selection(state));
  retarget(state, path.join(state.directory, 'missing.d2s'));
  assert.throws(() => state.service.refresh(), /Save path does not exist/);
  assert.equal(state.workspace.sources, sources);
  assert.deepEqual(identities(state.workspace), before);
  assert.equal(buildInspectorView(state.workspace, { sourceId: 'source-3', page: '118' }).matches.length, 57);
  retarget(state, state.b); state.service.refresh();
  assert.deepEqual(identities(state.workspace), before);
  assert.throws(() => state.service.commit(preview.ticket), /expired/i);
});

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


async function harness(state) {
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; },
    querySelector(selector) { return this.getElementById(selector.slice(1)); } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, attributes, id] of shell.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]*)"[^>]*)>/g)) {
    const element = new Element(document, tag); element.id = id;
    element.disabled = /\bdisabled\b/.test(attributes); element.hidden = /\bhidden\b/.test(attributes);
    document.ids.set(id, element);
  }
  const panel = document.getElementById('bank-panel');
  panel.children = [...document.ids.values()].filter(element => element.id.startsWith('bank-') && element !== panel);
  let initialCatalog = true;
  const requests = [], catalogs = [];
  const response = body => ({ ok: true, async json() { return body; } });
  const context = vm.createContext({ document, URLSearchParams,
    window: { innerWidth: 1280, innerHeight: 800, clearTimeout() {}, setTimeout() {} },
    async fetch(url, options) {
      requests.push({ url, options });
      if (url === '/api/catalog') {
        if (initialCatalog) { initialCatalog = false; return response(getInspectorCatalog(state.workspace)); }
        const pending = deferred(url); catalogs.push(pending); return pending.promise;
      }
      if (url === '/api/bank') return response(state.service.status());
      if (url.startsWith('/api/view?')) return response(buildInspectorView(state.workspace,
        Object.fromEntries(new URLSearchParams(url.slice(url.indexOf('?') + 1)))));
      assert.equal(url, '/api/bank/refresh');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-PD2-Mule-Token'], state.service.sessionToken);
      assert.deepEqual(JSON.parse(options.body), {});
      try { return response(state.service.refresh()); }
      catch (error) { return { ok: false, async json() { return { error: error.message }; } }; }
    }
  });
  const bank = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8').replace('export function createBankUi', 'function createBankUi');
  vm.runInContext('globalThis.createBankUi = (() => { ' + bank + '\nreturn createBankUi; })();', context);
  const app = fs.readFileSync(path.join(REPO, 'src/ui/app.js'), 'utf8').replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  vm.runInContext(app, context, { filename: 'app.js' }); await tick();
  return {
    context, requests, catalogs,
    element: id => document.getElementById(id),
    state: expression => vm.runInContext('state.' + expression, context),
    async browse(id, page) {
      await document.getElementById('source-list').querySelectorAll('[data-source-id]').find(button => button.dataset.sourceId === id).dispatch('click');
      if (page) await document.getElementById('page-list').querySelectorAll('[data-page-index]')
        .find(button => button.dataset.pageIndex === String(page - 1)).dispatch('click');
    },
    async destination(id, container) {
      const destination = document.getElementById('bank-destination'); destination.value = id; await destination.dispatch('change');
      const target = document.getElementById('bank-container'); target.value = container; await target.dispatch('change');
    },
    finishCatalog() { catalogs.at(-1).resolve(response(getInspectorCatalog(state.workspace))); }
  };
}

async function refreshUi(h, succeeds = true) {
  const count = h.catalogs.length, completion = h.element('bank-refresh').dispatch('click'); await tick();
  if (succeeds) { assert.equal(h.catalogs.length, count + 1); h.finishCatalog(); }
  else assert.equal(h.catalogs.length, count);
  await completion;
}

function assertC(h, state, selectedKey) {
  assert.equal(h.state('sourceId'), 'source-3');
  assert.equal(h.state('view.source.filePath'), state.c);
  assert.equal(h.state('page'), '118');
  assert.equal(h.state('view.summary.selectedPage.index'), 117);
  assert.equal(h.state('view.matches.length'), 57);
  assert.equal(h.element('bank-destination').value, 'source-3');
  assert.equal(h.element('bank-container').value, '117');
  if (selectedKey) assert.equal(h.state('selectedItemKey'), selectedKey);
}

test('actual service, app, and bank refresh retain selected C and numeric page while alias B disappears and returns', async t => {
  const state = setup(t), h = await harness(state);
  await h.browse('source-3', 118); await h.destination('source-3', '117');
  const selected = h.state('selectedItemKey'); assertC(h, state);
  retarget(state, state.a); await refreshUi(h);
  assertC(h, state, selected);
  assert.equal(h.element('source-list').querySelectorAll('[data-source-id]').some(button => button.dataset.sourceId === 'source-2'), false);
  assert.equal(h.element('bank-message').textContent, 'Library refreshed.');
  retarget(state, state.b); await refreshUi(h);
  assertC(h, state, selected);
  assert.ok(h.element('source-list').querySelectorAll('[data-source-id]').some(button => button.dataset.sourceId === 'source-2'));
  assert.equal(h.requests.some(request => request.url === '/api/bank/preview' || request.url === '/api/bank/commit'), false);
});

test('removing a selected alias permits fallback but never maps its former ID onto surviving C', async t => {
  const state = setup(t), h = await harness(state);
  await h.browse('source-2'); await h.destination('source-2', 'stash');
  assert.equal(h.state('view.source.filePath'), state.alias);
  retarget(state, state.a); await refreshUi(h);
  assert.equal(h.state('sourceId'), 'source-1');
  assert.equal(h.state('view.source.filePath'), state.a);
  assert.equal(h.element('bank-destination').value, 'source-1');
  assert.equal(h.element('bank-container').value, '0');
  assert.equal(state.workspace.sources.find(source => source.summary.filePath === state.c).id, 'source-3');
  assert.equal(state.workspace.sources.some(source => source.id === 'source-2'), false);
});

test('a failed actual UI refresh preserves the selected source, bank destination, and previous catalog', async t => {
  const state = setup(t), h = await harness(state);
  await h.browse('source-3', 118); await h.destination('source-3', '117');
  const selected = h.state('selectedItemKey'), sources = identities(state.workspace);
  retarget(state, path.join(state.directory, 'missing.d2s')); await refreshUi(h, false);
  assertC(h, state, selected);
  assert.deepEqual(identities(state.workspace), sources);
  assert.match(h.element('bank-message').textContent, /Save path does not exist/);
  retarget(state, state.b); await refreshUi(h); assertC(h, state, selected);
});
