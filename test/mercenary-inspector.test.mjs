import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { Element } from './helpers/ui-element.mjs';
import { collectBrowseEntries, collectMercenaryBrowseEntries } from '../src/lib/browser-index.mjs';
import { filterBankItems } from '../src/lib/bank-search.mjs';
import { sortBankItems } from '../src/lib/bank-sort.mjs';
import { buildInspectorView, getItemKey, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FREEZING_ARROW = path.join(getFixtureLibraryDir(), 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const MERCENARY_GEAR = ['Goldwrap', "Andariel's Visage", "Magnus' Skin", "Templar's Might", 'Wartraveler', 'Faith'];

test('character view shows mercenary equipment in its own panel with distinct read-only keys', () => {
  const workspace = loadInspectorWorkspace([FREEZING_ARROW]);
  const summary = workspace.sources[0].summary;
  const primaryKeys = collectBrowseEntries(summary).map(getItemKey);
  assert.equal(primaryKeys.length, 60, 'primary entries, which deposits index into, exclude mercenary gear');
  const mercenaryKeys = collectMercenaryBrowseEntries(summary).map(getItemKey);
  assert.ok(mercenaryKeys.every(key => key.startsWith('mercenary|')));
  assert.equal(new Set([...primaryKeys, ...mercenaryKeys]).size, 66, 'no key collisions');

  const view = buildInspectorView(workspace, { sourceId: 'source-1' });
  assert.deepEqual(view.panels.map(panel => panel.label), ['Equipped', 'Mercenary', 'Inventory', 'Stash', 'Belt']);
  assert.deepEqual(view.panels[1].items.map(item => item.displayName), MERCENARY_GEAR);
  assert.equal(view.matches.length, 66);
  assert.deepEqual([view.summary.visibleItemCount, view.summary.matchedItemCount, view.summary.notice], [66, 66, null]);
  const primary = buildInspectorView(workspace, { sourceId: 'source-1', selectedItemKey: view.panels[0].items[0].itemKey }).selectedItem;
  assert.equal(primary.transferable, true, 'primary selections stay transferable');

  const selected = buildInspectorView(workspace, { sourceId: 'source-1', selectedItemKey: view.panels[1].items[5].itemKey }).selectedItem;
  assert.deepEqual([selected.displayName, selected.panelLabel, selected.transferable], ['Faith', 'Mercenary (4:0)', false]);
  assert.ok(selected.runewordRecipe, 'mercenary items keep full read-only details');

  const searched = buildInspectorView(workspace, { sourceId: 'source-1', query: 'andariel' });
  assert.deepEqual(searched.matches.map(match => [match.displayName, match.locationLabel]), [["Andariel's Visage", 'Mercenary (1:0)']]);
});

test('a mercenary section that fails to decode is reported in the summary instead of looking empty', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pd2-mule-mercenary-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const damagedPath = path.join(directory, 'freezing-arrow.d2s');
  const bytes = fs.readFileSync(FREEZING_ARROW);
  const { itemListOffset } = loadInspectorWorkspace([FREEZING_ARROW]).sources[0].summary.characterSections.mercenary;
  bytes.writeUInt16LE(bytes.readUInt16LE(itemListOffset + 2) + 1, itemListOffset + 2);
  fs.writeFileSync(damagedPath, bytes);

  const view = buildInspectorView(loadInspectorWorkspace([damagedPath]), { sourceId: 'source-1' });
  assert.match(view.summary.notice, /^Mercenary equipment could not be decoded and is not shown: /);
  assert.equal(view.panels.some(panel => panel.label === 'Mercenary'), false);
  assert.deepEqual([view.summary.visibleItemCount, view.matches.length], [60, 60]);
});

test('the bank service refuses to deposit mercenary equipment and changes nothing', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pd2-mule-mercenary-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'freezing-arrow.d2s');
  fs.copyFileSync(FREEZING_ARROW, sourcePath);
  const bankPath = path.join(directory, 'bank.json');
  const workspace = loadInspectorWorkspace([sourcePath]);
  const service = createMuleService(workspace, { bankPath, experimentalWrite: true });
  const [mercenaryEntry] = collectMercenaryBrowseEntries(workspace.sources[0].summary);
  const before = fs.readFileSync(sourcePath);
  assert.throws(() => service.preview({ action: 'deposit', sourceId: 'source-1', itemKey: getItemKey(mercenaryEntry) }),
    /Mercenary equipment is read-only and cannot be deposited/);
  assert.deepEqual(fs.readFileSync(sourcePath), before);
  assert.equal(fs.existsSync(bankPath), false);
});

test('the bank panel disables deposit previews for non-transferable selections', async () => {
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, attributes, id] of shell.matchAll(/<([a-z]+)\b([^>]*\bid="(bank-[^"]*)"[^>]*)>/g)) {
    const element = new Element(document, tag); element.id = id;
    element.disabled = /\bdisabled\b/.test(attributes); element.hidden = /\bhidden\b/.test(attributes);
    document.ids.set(id, element);
  }
  document.getElementById('bank-sort').innerHTML = shell.match(/<select id="bank-sort">([\s\S]*?)<\/select>/)[1];
  const source = { id: 'source-1', kind: 'character', label: 'freezing-arrow', fileName: 'copy.d2s', filePath: '/disposable/copy.d2s', pages: [] };
  const state = { catalog: { sources: [source] }, view: { selectedItem: { itemKey: 'mercenary|x', displayName: 'Faith', filePath: source.filePath, transferable: false } } };
  const context = vm.createContext({ document, URLSearchParams, filterBankItems, sortBankItems, async fetch(url) {
    assert.equal(url, '/api/bank', 'only bank status is loaded');
    return { ok: true, async json() { return { configured: true, enabled: true, bankName: 'bank.json', sessionToken: 'token', bank: { items: [] } }; } };
  } });
  const script = fs.readFileSync(path.join(REPO, 'src/ui/bank.js'), 'utf8')
    .replace("import { filterBankItems } from './bank-search.mjs';", '').replace("import { sortBankItems } from './bank-sort.mjs';", '')
    .replace('export function createBankUi', 'function createBankUi');
  vm.runInContext(script + '\nglobalThis.create = createBankUi;', context, { filename: 'bank.js' });
  const ui = context.create(state, () => assert.fail('no reload expected'));
  await ui.load();
  assert.equal(document.getElementById('bank-deposit').disabled, true);
  state.view.selectedItem = { ...state.view.selectedItem, itemKey: 'primary', transferable: true };
  ui.selectionChanged();
  assert.equal(document.getElementById('bank-deposit').disabled, false, 'transferable selections remain available');
});
