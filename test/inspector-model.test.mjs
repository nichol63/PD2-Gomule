import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildInspectorView,
  discoverSaveFiles,
  getInspectorCatalog,
  loadInspectorWorkspace
} from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();

test('discovers supported save files from the local fixture library', () => {
  const files = discoverSaveFiles([FIXTURE_DIR]);

  assert.ok(files.some((filePath) => filePath.endsWith(path.join('Library', 'Legacy.d2s'))));
  assert.ok(files.some((filePath) => filePath.endsWith(path.join('Library', 'Bases.d2x'))));
  assert.ok(files.some((filePath) => filePath.endsWith(path.join('Library', '_LOD_SharedStashSave.sss'))));
  assert.ok(files.length > 50);
});

test('includes a workspace library catalog entry ahead of file sources', () => {
  const workspace = loadInspectorWorkspace([
    path.join(FIXTURE_DIR, 'Legacy.d2s'),
    path.join(FIXTURE_DIR, 'Bases.d2x')
  ]);
  const catalog = getInspectorCatalog(workspace);

  assert.equal(catalog.defaultSourceId, 'source-1');
  assert.equal(catalog.sources[0].kind, 'workspace-library');
  assert.equal(catalog.sources[0].label, 'All Loaded Saves');
  assert.equal(catalog.sources[0].itemCount, 2594);
});

test('builds a character inspector view from parser summaries', () => {
  const workspace = loadInspectorWorkspace([path.join(FIXTURE_DIR, 'Legacy.d2s')]);
  const catalog = getInspectorCatalog(workspace);
  const view = buildInspectorView(workspace, {
    sourceId: catalog.defaultSourceId,
    query: 'horadric cube'
  });

  assert.equal(catalog.sources.length, 2);
  assert.equal(view.source.kind, 'character');
  assert.equal(view.summary.visibleItemCount, 8);
  assert.equal(view.summary.matchedItemCount, 1);
  assert.equal(view.selectedItem?.displayName, 'Horadric Cube');
  assert.ok(view.panels.some((panel) => panel.label === 'Inventory'));
});

test('surfaces formatted property lines in inspector item details', () => {
  const workspace = loadInspectorWorkspace([path.join(FIXTURE_DIR, 'Legacy.d2s')]);
  const catalog = getInspectorCatalog(workspace);
  const view = buildInspectorView(workspace, {
    sourceId: catalog.defaultSourceId,
    query: 'mighty scepter'
  });

  assert.equal(view.selectedItem?.displayName, 'Mighty Scepter');
  assert.ok(
    view.selectedItem?.propertyLists[0].displayLines.some((line) => line.text === '+2 to Might')
  );
});

test('builds a stash inspector view with page navigation and partial-property warnings', () => {
  const workspace = loadInspectorWorkspace([path.join(FIXTURE_DIR, 'Bases.d2x')]);
  const catalog = getInspectorCatalog(workspace);
  const view = buildInspectorView(workspace, {
    sourceId: catalog.defaultSourceId,
    page: 'Mag Chest 2',
    query: 'uul'
  });

  assert.equal(view.source.kind, 'plugy-personal-stash');
  assert.ok(view.pages.some((page) => page.selected && page.name === 'Mag Chest 2'));
  assert.equal(view.summary.selectedPage?.name, 'Mag Chest 2');
  assert.equal(view.summary.matchedItemCount, 1);
  assert.equal(view.selectedItem?.code, 'uul');
  assert.equal(view.selectedItem?.propertyStatus, 'partial');
  assert.match(view.selectedItem?.propertyParseError ?? '', /stat id 508/);
  assert.ok(view.panels.some((panel) => panel.label === 'Stash'));
});

test('builds a workspace-wide inspector search view across loaded saves', () => {
  const workspace = loadInspectorWorkspace([
    path.join(FIXTURE_DIR, 'Legacy.d2s'),
    path.join(FIXTURE_DIR, 'Bases.d2x')
  ]);
  const catalog = getInspectorCatalog(workspace);
  const workspaceSource = catalog.sources.find((source) => source.kind === 'workspace-library');
  const view = buildInspectorView(workspace, {
    sourceId: workspaceSource.id,
    query: 'horadric cube'
  });

  assert.equal(view.source.kind, 'workspace-library');
  assert.equal(view.summary.sourceCount, 2);
  assert.equal(view.summary.matchedItemCount, 1);
  assert.equal(view.selectedItem?.displayName, 'Horadric Cube');
  assert.equal(view.selectedItem?.sourceLabel, 'Legacy.d2s / Legacy');
  assert.deepEqual(view.panels, []);
});

test('keeps empty-result inspector views unselected when filters match nothing', () => {
  const workspace = loadInspectorWorkspace([path.join(FIXTURE_DIR, 'Legacy.d2s')]);
  const catalog = getInspectorCatalog(workspace);
  const view = buildInspectorView(workspace, {
    sourceId: catalog.defaultSourceId,
    query: 'this-does-not-exist'
  });

  assert.equal(view.summary.matchedItemCount, 0);
  assert.equal(view.selectedItem, null);
  assert.deepEqual(view.matches, []);
  assert.deepEqual(view.panels, []);
});
