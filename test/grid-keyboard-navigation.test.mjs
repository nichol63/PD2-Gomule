import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { Element } from './helpers/ui-element.mjs';
import { buildInspectorView, getInspectorCatalog, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FREEZING_ARROW = path.join(getFixtureLibraryDir(), 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function renderCharacterGrid() {
  const workspace = loadInspectorWorkspace([FREEZING_ARROW]);
  const document = { ids: new Map(), getElementById(id) { return this.ids.get(id) ?? null; },
    querySelector(selector) { return this.getElementById(selector.slice(1)); } };
  const shell = fs.readFileSync(path.join(REPO, 'src/ui/index.html'), 'utf8');
  for (const [, tag, id] of shell.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]*)"[^>]*>/g)) {
    const element = new Element(document, tag); element.id = id;
    document.ids.set(id, element);
  }
  const response = body => ({ ok: true, status: 200, async json() { return body; } });
  const context = vm.createContext({ document, URLSearchParams,
    createBankUi: () => ({ load() {}, selectionChanged() {} }),
    window: { innerWidth: 1280, innerHeight: 800, setTimeout() { return 0; }, clearTimeout() {} },
    async fetch(url) {
      if (url === '/api/catalog') return response(getInspectorCatalog(workspace));
      assert.ok(url.startsWith('/api/view?'), `unexpected request ${url}`);
      return response(buildInspectorView(workspace, Object.fromEntries(new URL(url, 'http://localhost').searchParams)));
    } });
  const app = fs.readFileSync(path.join(REPO, 'src/ui/app.js'), 'utf8').replace(/^import \{ createBankUi \} from '\/bank\.js';\s*/, '');
  vm.runInContext(app, context, { filename: 'app.js' });
  for (let index = 0; index < 5; index += 1) await tick();
  vm.runInContext("state.sourceId = 'source-1'; loadView()", context);
  for (let index = 0; index < 5; index += 1) await tick();

  const buttons = document.getElementById('grid-panels').children;
  assert.ok(buttons.length > 60, 'character grid rendered');
  let focused = null;
  for (const button of buttons) button.focus = () => { focused = button; };
  return {
    press(panelKey, name, key) {
      const button = buttons.find(entry => entry.dataset.panelKey === panelKey && entry.dataset.tooltipName === name);
      assert.ok(button, `${name} in ${panelKey}`);
      focused = null;
      button.listeners.get('keydown')({ key, preventDefault() {} });
      return focused && [focused.dataset.panelKey, focused.dataset.tooltipName];
    }
  };
}

test('arrow keys move to the nearest item in the same panel across paper-doll gaps', async () => {
  const grid = await renderCharacterGrid();
  assert.deepEqual(grid.press('1/0', "M'avina's True Sight", 'ArrowRight'), ['1/0', 'Crescent Moon']);
  assert.deepEqual(grid.press('1/0', "M'avina's Caster", 'ArrowRight'), ['1/0', "M'avina's True Sight"]);
  assert.deepEqual(grid.press('1/0', "M'avina's True Sight", 'ArrowDown'), ['1/0', "M'avina's Embrace"]);
  assert.deepEqual(grid.press('1/0', "M'avina's Caster", 'ArrowDown'), ['1/0', "M'avina's Icy Clutch"]);
  assert.deepEqual(grid.press('1/0', 'Arrows', 'ArrowRight'), ['1/0', 'Call to Arms'], 'switch weapons are reachable');
  assert.deepEqual(grid.press('mercenary/1/0', 'Faith', 'ArrowRight'), ['mercenary/1/0', "Andariel's Visage"]);
});

test('arrow keys stop at the panel edge instead of jumping into another panel', async () => {
  const grid = await renderCharacterGrid();
  assert.equal(grid.press('1/0', 'Lidless Wall', 'ArrowRight'), null);
  assert.equal(grid.press('mercenary/1/0', 'Faith', 'ArrowUp'), null);
  assert.equal(grid.press('1/0', "M'avina's Caster", 'ArrowLeft'), null);
});
