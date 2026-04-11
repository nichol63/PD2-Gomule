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
