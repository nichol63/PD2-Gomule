import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  buildInspectorView, getInspectorCatalog, loadInspectorWorkspace
} from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();
const SHARED = path.join(LIBRARY, '_LOD_SharedStashSave.sss');
const workspace = loadInspectorWorkspace([SHARED, path.join(LIBRARY, 'Legacy.d2s')]);
const stashSource = workspace.sources.find(source => source.summary.filePath === SHARED);
const characterSource = workspace.sources.find(source => source.summary.kind === 'character');
const originalHash = createHash('sha256').update(fs.readFileSync(SHARED)).digest('hex');
const pairs = [
  ['Amazon', 30, 117, 15], ['Assassin', 31, 118, 12], ['Barbarian', 35, 119, 15],
  ['Druid', 36, 120, 13], ['Necromancer', 33, 121, 11],
  ['Paladin', 34, 122, 9], ['Sorceress', 32, 123, 9]
];

function view(options = {}) {
  return buildInspectorView(workspace, { sourceId: stashSource.id, ...options });
}

function expectedKey(index, item, itemIndex) {
  return [SHARED, index, itemIndex, item.code, item.location ?? 'na', item.panel ?? 'na',
    item.row ?? 'na', item.column ?? 'na'].join('|');
}

function assertPageIdentity(result, index, expectedItems = stashSource.summary.pages[index].topLevelItems) {
  const page = stashSource.summary.pages[index];
  assert.equal(result.summary.selectedPage.index, index);
  assert.equal(result.summary.selectedPage.name, page.name);
  assert.equal(result.summary.visibleItemCount, page.topLevelItems.length);
  assert.equal(result.summary.matchedItemCount, expectedItems.length);
  assert.equal(result.filters.page, String(index + 1));
  assert.deepEqual(result.pages.filter(candidate => candidate.selected).map(candidate => candidate.index), [index]);
  const expectedKeys = expectedItems.map(item => expectedKey(index, item, page.topLevelItems.indexOf(item))).sort();
  assert.deepEqual(result.matches.map(item => item.itemKey).sort(), expectedKeys);
  assert.deepEqual(result.panels.flatMap(panel => panel.items.map(item => item.itemKey)).sort(), expectedKeys);
  for (const match of result.matches) {
    assert.equal(match.sourceLabel, `_LOD_SharedStashSave.sss / ${page.name}`);
  }
  if (expectedItems.length) {
    assert.equal(result.selectedItem.pageIndex, index);
    assert.ok(expectedKeys.includes(result.selectedItem.itemKey));
    const selected = page.topLevelItems[result.selectedItem.itemIndex];
    assert.equal(result.selectedItem.code, selected.code);
    assert.equal(result.selectedItem.fingerprint, selected.fingerprint ?? null);
    assert.deepEqual(result.matches.filter(item => item.selected).map(item => item.itemKey), [result.selectedItem.itemKey]);
    assert.deepEqual(result.panels.flatMap(panel => panel.items).filter(item => item.selected)
      .map(item => item.itemKey), [result.selectedItem.itemKey]);
  } else {
    assert.equal(result.selectedItem, null);
  }
}

test('numeric page selectors preserve all seven repeated class pages and their physical item keys', () => {
  for (const [name, earlierIndex, laterIndex, earlierCount] of pairs) {
    assert.equal(stashSource.summary.pages[earlierIndex].name, name);
    assert.equal(stashSource.summary.pages[laterIndex].name, name);
    assert.equal(stashSource.summary.pages[earlierIndex].topLevelItems.length, earlierCount);
    assert.equal(stashSource.summary.pages[laterIndex].topLevelItems.length, 57);
    assertPageIdentity(view({ page: String(earlierIndex + 1) }), earlierIndex);
    assertPageIdentity(view({ page: String(laterIndex + 1) }), laterIndex);
    assertPageIdentity(view({ page: laterIndex + 1 }), laterIndex);
  }
  assert.equal(createHash('sha256').update(fs.readFileSync(SHARED)).digest('hex'), originalHash);
});

test('legacy names keep first-match semantics while numeric filter selectors round-trip', () => {
  for (const [name, earlierIndex, laterIndex] of pairs) {
    const named = view({ page: ` ${name.toLowerCase()} ` });
    assertPageIdentity(named, earlierIndex);
    assertPageIdentity(view(named.filters), earlierIndex);
    const numbered = view({ page: String(laterIndex + 1) });
    assertPageIdentity(view(numbered.filters), laterIndex);
  }
});

test('filtering, sorting, and selected details stay on the second Amazon page', () => {
  const page = stashSource.summary.pages[117];
  const expected = page.topLevelItems.filter(item => item.qualityLabel === 'superior');
  assert.equal(expected.length, 12);
  const filtered = view({ page: '118', quality: 'superior', completeOnly: true, sort: 'code' });
  assertPageIdentity(filtered, 117, expected);
  const roundTrip = view({ ...filtered.filters, selectedItemKey: filtered.matches.at(-1).itemKey });
  assertPageIdentity(roundTrip, 117, expected);
  assert.equal(roundTrip.selectedItem.itemKey, filtered.matches.at(-1).itemKey);
  const codes = roundTrip.matches.map(item => item.code);
  assert.deepEqual(codes, [...codes].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })));
  const empty = view({ ...roundTrip.filters, query: 'no-such-item-on-this-page' });
  assertPageIdentity(empty, 117, []);
  assert.deepEqual(empty.panels, []);
  assertPageIdentity(view({ page: empty.filters.page }), 117);
});

test('default stash page and non-page sources retain their original contracts', () => {
  assertPageIdentity(view(), 0);
  const character = buildInspectorView(workspace, { sourceId: characterSource.id, page: '118' });
  assert.equal(character.filters.page, null);
  assert.equal(character.summary.selectedPage, null);
  assert.deepEqual(character.pages, []);
  assert.equal(character.selectedItem.pageIndex, null);
  for (const query of ['', 'horadric cube']) {
    const library = buildInspectorView(workspace, { sourceId: 'workspace-library', page: '118', query });
    assert.equal(library.filters.page, null);
    assert.equal(library.summary.selectedPage, null);
    assert.deepEqual(library.pages, []);
    assert.deepEqual(library.panels, []);
  }
});

// Run the shipped UI with a small DOM boundary and the actual fixture-backed
// API model. Rendered buttons and registered events are exercised, rather than
// checking source text or replacing the navigation functions under test.
class Element {
  constructor() {
    this.dataset = {};
    this.listeners = new Map();
    this.value = '';
    this.checked = false;
    this.className = '';
    this.textContent = '';
    this.style = {};
    this.classList = { add() {}, remove() {} };
    this.buttons = [];
  }

  set innerHTML(html) {
    this.html = html;
    this.buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attributes, body]) => {
      const button = new Element();
      button.textContent = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      button.className = attributes.match(/class="([^"]*)"/)?.[1] ?? '';
      for (const [, name, value] of attributes.matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
        const key = name.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
        button.dataset[key] = value.replaceAll('&amp;', '&');
      }
      return button;
    });
  }

  get innerHTML() { return this.html ?? ''; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  querySelectorAll(selector) {
    const name = selector.match(/^\[data-([a-z-]+)\]$/)?.[1];
    assert.ok(name, `supported DOM boundary selector: ${selector}`);
    const key = name.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    return this.buttons.filter(button => key in button.dataset);
  }
  async dispatch(name) {
    assert.ok(this.listeners.has(name), `${name} event must be registered`);
    await this.listeners.get(name)({ preventDefault() {} });
  }
}

async function runUi() {
  const elements = new Map();
  const requests = [];
  const catalog = getInspectorCatalog(workspace);
  const uiCatalog = { ...catalog, defaultSourceId: stashSource.id };
  let ready;
  const loaded = new Promise(resolve => { ready = resolve; });
  const context = vm.createContext({
    URLSearchParams,
    document: { querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    } },
    window: { clearTimeout, setTimeout, innerWidth: 1280, innerHeight: 800 },
    createBankUi: () => ({ selectionChanged() {}, async load() { ready(); } }),
    async fetch(url) {
      requests.push(url);
      const parsed = new URL(url, 'http://localhost');
      const body = parsed.pathname === '/api/catalog' ? uiCatalog
        : buildInspectorView(workspace, Object.fromEntries(parsed.searchParams));
      return { ok: true, async json() { return body; } };
    }
  });
  const script = fs.readFileSync(path.join(REPO, 'src', 'ui', 'app.js'), 'utf8')
    .replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  vm.runInContext(script, context, { filename: 'app.js' });
  let timeout;
  try {
    await Promise.race([loaded, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('UI initialization did not reach bank load')), 1000);
    })]);
  } finally { clearTimeout(timeout); }
  return { elements, requests, context };
}

test('rendered page 118 click and subsequent selection, reload, filter, and sort keep page identity', async () => {
  const { elements, requests, context } = await runUi();
  const pageList = elements.get('#page-list');
  const firstAmazon = pageList.buttons.find(button => button.dataset.pageIndex === '30');
  const secondAmazon = pageList.buttons.find(button => button.dataset.pageIndex === '117');
  assert.ok(firstAmazon.textContent.startsWith('31. Amazon'));
  assert.ok(secondAmazon.textContent.startsWith('118. Amazon'));
  assert.equal(firstAmazon.dataset.pageIndex, '30');
  assert.equal(secondAmazon.dataset.pageIndex, '117');
  const latestParams = () => new URL(requests.at(-1), 'http://localhost').searchParams;
  await firstAmazon.dispatch('click');
  assert.equal(latestParams().get('page'), '31');
  assert.equal(vm.runInContext('state.page', context), '31');
  assert.equal(vm.runInContext('state.view.summary.matchedItemCount', context), 15);
  const assertSecondAmazon = () => {
    assert.equal(latestParams().get('page'), '118');
    assert.equal(vm.runInContext('state.page', context), '118');
    assert.equal(vm.runInContext('state.view.summary.selectedPage.index', context), 117);
    assert.deepEqual(pageList.buttons.filter(button => button.className.includes('is-selected'))
      .map(button => button.dataset.pageIndex), ['117']);
  };
  await secondAmazon.dispatch('click');
  assertSecondAmazon();
  assert.equal(vm.runInContext('state.view.summary.matchedItemCount', context), 57);
  const item = elements.get('#grid-panels').buttons[1];
  assert.equal(item.dataset.itemKey.split('|')[1], '117');
  await item.dispatch('click');
  assertSecondAmazon();
  assert.equal(latestParams().get('selectedItemKey'), item.dataset.itemKey);
  assert.equal(vm.runInContext('state.view.selectedItem.itemKey', context), item.dataset.itemKey);
  await vm.runInContext('loadView()', context);
  assertSecondAmazon();
  const quality = elements.get('#quality-select');
  quality.value = 'superior';
  await quality.dispatch('change');
  assertSecondAmazon();
  assert.equal(latestParams().get('quality'), 'superior');
  assert.equal(vm.runInContext('state.view.summary.matchedItemCount', context), 12);
  const sort = elements.get('#sort-select');
  sort.value = 'code';
  await sort.dispatch('change');
  assertSecondAmazon();
  assert.equal(latestParams().get('sort'), 'code');
  await elements.get('#clear-filters').dispatch('click');
  assertSecondAmazon();
  assert.equal(vm.runInContext('state.view.summary.matchedItemCount', context), 57);
  assert.equal(createHash('sha256').update(fs.readFileSync(SHARED)).digest('hex'), originalHash);
});
