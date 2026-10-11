import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { buildInspectorView, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FREEZING_ARROW = path.join(getFixtureLibraryDir(), 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');

function findOverlap(panel) {
  const owners = new Map();
  for (const item of panel.items) {
    for (let column = item.column; column < item.column + item.width; column += 1) {
      for (let row = item.row; row < item.row + item.height; row += 1) {
        const cell = `${column}:${row}`;
        if (owners.has(cell)) return `${owners.get(cell)} and ${item.displayName} share cell ${cell}`;
        owners.set(cell, item.displayName);
      }
    }
    if (item.column + item.width > panel.columns || item.row + item.height > panel.rows) return `${item.displayName} is outside the grid`;
  }
  return null;
}

test('equipped and mercenary gear sit on fixed paper-doll slots instead of at their slot numbers', () => {
  const view = buildInspectorView(loadInspectorWorkspace([FREEZING_ARROW]), { sourceId: 'source-1' });
  const placement = label => Object.fromEntries(view.panels.find(panel => panel.label === label).items
    .map(item => [item.displayName, [item.column, item.row, item.width, item.height]]));
  assert.deepEqual(placement('Mercenary'), {
    "Andariel's Visage": [4, 0, 2, 2], "Templar's Might": [4, 2, 2, 3], Faith: [0, 0, 2, 4],
    Goldwrap: [4, 5, 2, 1], Wartraveler: [8, 5, 2, 2], "Magnus' Skin": [0, 5, 2, 2]
  });
  const equipped = view.panels.find(panel => panel.label === 'Equipped');
  assert.deepEqual([equipped.columns, equipped.rows], [15, 7]);
  assert.deepEqual(placement('Equipped')['Call to Arms'], [11, 0, 2, 4], 'switch weapons sit right of a gap column');
  const selected = buildInspectorView(loadInspectorWorkspace([FREEZING_ARROW]),
    { sourceId: 'source-1', selectedItemKey: equipped.items.find(item => item.displayName === 'Call to Arms').itemKey }).selectedItem;
  assert.equal(selected.panelLabel, 'Equipped (11:0)', 'location labels still report the saved slot');
});

test('no panel of any fixture character draws two items on the same cell', () => {
  const workspace = loadInspectorWorkspace([]);
  let checkedPanels = 0;
  for (const source of workspace.sources.filter(entry => entry.summary.kind === 'character')) {
    for (const panel of buildInspectorView(workspace, { sourceId: source.id }).panels) {
      assert.equal(findOverlap(panel), null, `${source.summary.fileName} ${panel.label}`);
      checkedPanels += 1;
    }
  }
  assert.ok(checkedPanels > 400, `checked ${checkedPanels} panels`);
});
