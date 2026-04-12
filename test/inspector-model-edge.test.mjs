import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import {
  loadInspectorWorkspace,
  getInspectorCatalog,
  buildInspectorView
} from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();
const tables = loadPd2Tables();

const CHAR_PATH = path.join(FIXTURE_DIR, 'Legacy.d2s');
const STASH_PATH = path.join(FIXTURE_DIR, 'Bases.d2x');
const LEGACY_STASH_PATH = path.join(FIXTURE_DIR, 'Legacy.d2x');

test('buildInspectorView with no selectedItemKey returns selectedItem null', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const view = buildInspectorView(workspace, { sourceId: catalog.sources[0]?.id });

  assert.equal(view.selectedItem, null, 'selectedItem should be null when no key given');
});

test('buildInspectorView with invalid selectedItemKey returns selectedItem null gracefully', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const view = buildInspectorView(workspace, {
    sourceId: catalog.sources[0]?.id,
    selectedItemKey: 'totally-invalid-key-xyz-99999'
  });

  assert.equal(view.selectedItem, null, 'invalid item key should fail open to null');
});

test('buildInspectorView for character source returns correct kindLabel in summary', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const charSource = catalog.sources.find((s) => s.kind === 'character');
  assert.ok(charSource, 'should have a character source');

  const view = buildInspectorView(workspace, { sourceId: charSource.id });
  assert.ok(view.summary?.kindLabel, 'summary should have a kindLabel');
  assert.match(view.summary.kindLabel.toLowerCase(), /character|d2s/i, 'kindLabel should mention character');
});

test('buildInspectorView for stash source with page returns panels array', async () => {
  const workspace = await loadInspectorWorkspace([STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const stashSource = catalog.sources.find((s) => s.kind !== 'workspace-library');
  assert.ok(stashSource, 'should have a non-workspace source');

  const allPages = buildInspectorView(workspace, { sourceId: stashSource.id });
  assert.ok(allPages.pages.length > 0, 'should have at least one page');

  // Find a page that has items rather than assuming the first has items
  const pageWithItems = allPages.pages.find((p) => p.topLevelCount > 0);
  if (!pageWithItems) return; // no items in any page — skip gracefully

  const view = buildInspectorView(workspace, { sourceId: stashSource.id, page: pageWithItems.name });
  assert.ok(Array.isArray(view.panels), 'panels should be an array');
  assert.ok(view.panels.length > 0, `panels should be non-empty for page "${pageWithItems.name}" which has items`);
});

test('getInspectorCatalog always includes a workspace-library source', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH, STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);

  const workspaceSource = catalog.sources.find((s) => s.kind === 'workspace-library');
  assert.ok(workspaceSource, 'catalog should always include a workspace-library source');
});

test('getInspectorCatalog defaultSourceId points to an existing source', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);

  const defaultSource = catalog.sources.find((s) => s.id === catalog.defaultSourceId);
  assert.ok(defaultSource, 'defaultSourceId should match an existing source');
});

test('buildInspectorView for stash file exposes stash pages in view.pages', async () => {
  const workspace = await loadInspectorWorkspace([STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const stashSource = catalog.sources.find((s) => s.kind !== 'workspace-library');

  const view = buildInspectorView(workspace, { sourceId: stashSource.id });

  assert.ok(Array.isArray(view.pages), 'view.pages should be an array');
  assert.ok(view.pages.length > 0, 'stash file should have pages in view');
  for (const page of view.pages) {
    assert.ok(typeof page.name === 'string', 'page should have a name');
    assert.ok(typeof page.topLevelCount === 'number', 'page should have a topLevelCount');
  }
});

test('buildInspectorView workspace-library source returns matches when query provided', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH, STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const wsSource = catalog.sources.find((s) => s.kind === 'workspace-library');

  const view = buildInspectorView(workspace, { sourceId: wsSource.id, query: 'a' });
  assert.ok(Array.isArray(view.matches), 'workspace view should have matches array');
});

// Helper: find the first socketed item key across all panels/pages in a view.
function findSocketedItemKey(workspace, catalog) {
  const sources = [
    catalog.sources.find((s) => s.kind === 'character'),
    catalog.sources.find((s) => s.kind !== 'workspace-library' && s.kind !== 'character')
  ].filter(Boolean);

  for (const src of sources) {
    const allView = buildInspectorView(workspace, { sourceId: src.id });
    const pages = Array.isArray(allView.pages) && allView.pages.length > 0 ? allView.pages : [null];
    for (const page of pages) {
      const view = page
        ? buildInspectorView(workspace, { sourceId: src.id, page: page.name })
        : allView;
      const panels = Array.isArray(view.panels) ? view.panels : [];
      for (const panel of panels) {
        const grid = Array.isArray(panel.items) ? panel.items : [];
        for (const entry of grid) {
          const candidate = entry?.item ?? entry;
          const sockets = candidate?.totalSockets ?? candidate?.socketsFilled ?? 0;
          const hasChildren = Array.isArray(candidate?.children) && candidate.children.length > 0;
          if ((sockets > 0 || hasChildren) && candidate?.key) {
            return { sourceId: src.id, page: page?.name, itemKey: candidate.key };
          }
        }
      }
      const matches = Array.isArray(view.matches) ? view.matches : [];
      for (const m of matches) {
        const sockets = m?.totalSockets ?? m?.socketsFilled ?? 0;
        const hasChildren = Array.isArray(m?.children) && m.children.length > 0;
        if ((sockets > 0 || hasChildren) && m?.key) {
          return { sourceId: src.id, page: page?.name, itemKey: m.key };
        }
      }
    }
  }
  return null;
}

test('selected item children expose formatted propertyLists with displayLines', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH, STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);

  const target = findSocketedItemKey(workspace, catalog);
  if (!target) return; // no socketed items with children found in fixtures — skip gracefully

  const view = buildInspectorView(workspace, {
    sourceId: target.sourceId,
    page: target.page,
    selectedItemKey: target.itemKey
  });

  const selected = view.selectedItem;
  assert.ok(selected, 'selected item should resolve for the chosen itemKey');
  assert.ok(Array.isArray(selected.children), 'selectedItem.children should be an array');

  if (selected.children.length === 0) return;

  for (const child of selected.children) {
    assert.equal(typeof child.displayName, 'string', 'child.displayName should be a string');
    assert.equal(typeof child.code, 'string', 'child.code should be a string');
    assert.equal(typeof child.propertyCount, 'number', 'child.propertyCount should be a number');
    assert.equal(typeof child.propertiesComplete, 'boolean', 'child.propertiesComplete should be boolean');
    assert.ok(Array.isArray(child.propertyLists), 'child.propertyLists must always be an array');

    for (const pl of child.propertyLists) {
      assert.equal(typeof pl.kind, 'string', 'propertyList.kind should be a string');
      assert.equal(typeof pl.complete, 'boolean', 'propertyList.complete should be a boolean');
      assert.equal(typeof pl.propertyCount, 'number', 'propertyList.propertyCount should be a number');
      assert.ok(Array.isArray(pl.properties), 'propertyList.properties should be an array');
      assert.ok(Array.isArray(pl.displayLines), 'propertyList.displayLines should be an array');
      assert.ok('error' in pl, 'propertyList should expose an error field (null or string)');
      for (const line of pl.displayLines) {
        assert.equal(typeof line.text, 'string', 'displayLine.text should be a string');
        assert.ok(line.text.length > 0, 'displayLine.text should not be empty');
      }
    }
  }
});

test('selectedItem propertyLists expose noiseCount alongside filtered propertyCount', async () => {
  // Corona in Legacy.d2x Season 4 Armor has 10 raw props / 7 real / 3 noise on
  // its single base propertyList. The UI depends on selectedItem.propertyLists[0]
  // carrying noiseCount so it can render the "(N noise filtered)" annotation
  // in the details panel. Also asserts the top-level selectedItem.propertyCount
  // is the filtered count (7) because inspector-model reads it off the browse
  // entry built by createBrowseEntry.
  const workspace = await loadInspectorWorkspace([LEGACY_STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const legacySource = catalog.sources.find((s) => s.kind !== 'workspace-library');

  const view = buildInspectorView(workspace, {
    sourceId: legacySource.id,
    page: 'Season 4 Armor',
    query: 'corona'
  });

  const selected = view.selectedItem;
  assert.ok(selected, 'Corona should resolve as selected item');
  assert.equal(selected.displayName, 'Corona');
  assert.equal(selected.propertyCount, 7, 'selectedItem.propertyCount should be filtered (10 raw - 3 noise)');
  assert.ok(Array.isArray(selected.propertyLists) && selected.propertyLists.length > 0);

  const baseList = selected.propertyLists[0];
  assert.equal(baseList.propertyCount, 7, 'formatted propertyList.propertyCount should be filtered');
  assert.equal(baseList.noiseCount, 3, 'formatted propertyList.noiseCount should report 3 dropped noise stats');
  assert.ok(Array.isArray(baseList.displayLines));
  // Defensive: dropped noise stats must not appear in displayLines
  const droppedKeys = ['item_crush_damage_percent', 'item_tohit_percent_vs_monster', 'unit_dooverlay'];
  for (const key of droppedKeys) {
    assert.ok(
      !baseList.displayLines.some((line) => line.statKey === key),
      `dropped noise stat ${key} should not appear in selectedItem displayLines`
    );
  }
});

test('selectedItem propertyLists expose noiseCount = 0 when item has no parser noise', async () => {
  // pa1 (Sacred Targe) in Bases.d2x Reg Paladin has 4 clean resistance props.
  // UI must NOT render "(0 noise filtered)" — the app.js ternary gates on
  // noiseCount > 0, so the API exposing noiseCount: 0 is the contract.
  const workspace = await loadInspectorWorkspace([STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);
  const stashSource = catalog.sources.find((s) => s.kind !== 'workspace-library');

  const view = buildInspectorView(workspace, {
    sourceId: stashSource.id,
    page: 'Reg Paladin',
    query: 'sacred targe'
  });

  const selected = view.selectedItem;
  assert.ok(selected, 'Sacred Targe should resolve as selected item');
  assert.equal(selected.code, 'pa1');
  assert.equal(selected.propertyCount, 4);
  assert.ok(selected.propertyLists.length > 0);
  assert.equal(selected.propertyLists[0].propertyCount, 4);
  assert.equal(selected.propertyLists[0].noiseCount, 0);
});

test('child items without propertyLists still expose an empty propertyLists array', async () => {
  const workspace = await loadInspectorWorkspace([CHAR_PATH, STASH_PATH], { pd2Tables: tables });
  const catalog = getInspectorCatalog(workspace);

  const target = findSocketedItemKey(workspace, catalog);
  if (!target) return; // no fixture with socketed children — skip

  const view = buildInspectorView(workspace, {
    sourceId: target.sourceId,
    page: target.page,
    selectedItemKey: target.itemKey
  });

  const selected = view.selectedItem;
  assert.ok(selected, 'selected item should resolve');
  assert.ok(Array.isArray(selected.children), 'children should be an array');

  // Every child — whether or not it has decoded properties — must carry an array
  // (not undefined, not null). Children with no properties should produce [].
  for (const child of selected.children) {
    assert.ok(
      Array.isArray(child.propertyLists),
      'child.propertyLists must be an array even when the child has zero decoded property lists'
    );
    if (child.propertyCount === 0) {
      assert.equal(
        child.propertyLists.length,
        0,
        'a child with propertyCount 0 should have an empty propertyLists array'
      );
    }
  }
});
