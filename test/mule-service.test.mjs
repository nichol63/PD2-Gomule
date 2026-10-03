import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { loadInspectorWorkspace, getItemKey } from '../src/lib/inspector-model.mjs';
import { collectBrowseEntries } from '../src/lib/browser-index.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { startInspectorServer } from '../src/lib/inspector-server.mjs';

function setup(t, experimentalWrite = true) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pd2-mule-ui-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'copy.d2x');
  fs.copyFileSync(path.join(getFixtureLibraryDir(), 'Bases.d2x'), sourcePath);
  const bankPath = path.join(directory, 'bank.json');
  const workspace = loadInspectorWorkspace([sourcePath]);
  const service = createMuleService(workspace, { bankPath, experimentalWrite });
  const entry = collectBrowseEntries(workspace.sources[0].summary).find(entry => entry.pageIndex === 1);
  const selection = { action: 'deposit', sourceId: 'source-1', itemKey: getItemKey(entry) };
  return { directory, sourcePath, bankPath, workspace, service, selection, entry };
}

test('UI preview and one-use commit move a real item through the bank and refresh the source', t => {
  const { service, selection, sourcePath, bankPath, entry } = setup(t);
  const original = fs.readFileSync(sourcePath);
  const preview = service.preview(selection);
  assert.equal(preview.result.dryRun, true);
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.existsSync(bankPath), false);
  const deposited = service.commit(preview.ticket);
  assert.equal(deposited.dryRun, false);
  assert.ok(deposited.backupPaths.every(file => fs.existsSync(file)));
  assert.throws(() => service.commit(preview.ticket), /expired/);
  const saved = service.status().bank.items[0];
  assert.equal(saved.code, entry.code);
  const withdrawal = service.preview({ action: 'withdraw', sourceId: 'source-1', itemId: saved.id, pageIndex: 0, column: 0, row: 0 });
  service.commit(withdrawal.ticket);
  assert.equal(service.status().bank.items.length, 0);
  const output = inspectSaveFile(sourcePath);
  assert.equal(output.pages[0].topLevelItems[0].code, entry.code);
  assert.equal(output.totalItems, inspectSaveFile(path.join(getFixtureLibraryDir(), 'Bases.d2x')).totalItems);
});

test('UI preview-only mode refuses commit and never creates bank metadata', t => {
  const { service, selection, directory } = setup(t, false);
  const preview = service.preview(selection);
  assert.equal(preview.canCommit, false);
  assert.throws(() => service.commit(preview.ticket), /disabled/);
  assert.deepEqual(fs.readdirSync(directory), ['copy.d2x']);
});

test('character selection omits stash page indexes and automatic placement uses the destination grid', t => {
  const { directory, bankPath } = setup(t);
  const characterPath = path.join(directory, 'Amazon.d2s');
  fs.copyFileSync(path.join(getFixtureLibraryDir(), 'Blank Characters', 'Level 30s', 'Amazon.d2s'), characterPath);
  const workspace = loadInspectorWorkspace([characterPath]);
  const service = createMuleService(workspace, { bankPath, experimentalWrite: true });
  const entry = collectBrowseEntries(workspace.sources[0].summary).find(item => item.code === 'tbk');
  const selection = { action: 'deposit', sourceId: 'source-1', itemKey: getItemKey(entry) };
  const preview = service.preview(selection);
  service.commit(preview.ticket);
  const item = service.status().bank.items[0];
  assert.equal(item.invWidth, 1);
  assert.equal(item.invHeight, 2);
  const withdrawal = service.preview({ action: 'withdraw', sourceId: 'source-1', itemId: item.id,
    panel: 'inventory', column: 15, row: 15, autoPlace: true });
  assert.deepEqual(withdrawal.placement, { column: 0, row: 0 });
  service.commit(withdrawal.ticket);
  assert.equal(service.status().bank.items.length, 0);
  assert.equal(inspectSaveFile(characterPath).topLevelItems.length, 3);
});

test('recovery commit is pinned to the previewed journal state', t => {
  const { service, bankPath } = setup(t);
  const preview = service.preview({ action: 'recover' });
  fs.writeFileSync(bankPath + '.journal.json', '{}');
  assert.throws(() => service.commit(preview.ticket), /changed after preview/);
  assert.equal(fs.readFileSync(bankPath + '.journal.json', 'utf8'), '{}');
});

test('UI refuses stale saves, changed banks, forged item keys, and unloaded sources', t => {
  const { service, selection, sourcePath, bankPath } = setup(t);
  assert.throws(() => service.preview({ ...selection, sourceId: 'outside' }), /loaded/);
  assert.throws(() => service.preview({ ...selection, itemKey: 'forged' }), /no longer/);
  const preview = service.preview(selection);
  fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 1, items: [] }));
  assert.throws(() => service.commit(preview.ticket), /changed after preview/);
  const before = fs.readFileSync(sourcePath);
  const changed = Buffer.from(before);
  changed[20] ^= 1;
  fs.writeFileSync(sourcePath, changed);
  assert.throws(() => service.preview(selection), /save changed/);
  assert.deepEqual(fs.readFileSync(sourcePath), changed);
});

test('bank HTTP endpoints enforce same-origin session and commit only preview tickets', async t => {
  const { sourcePath, bankPath, selection } = setup(t);
  const { server, url } = await startInspectorServer([sourcePath], { port: 0, bankPath, experimentalWrite: true });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const status = await (await fetch(`${url}/api/bank`)).json();
  const post = (route, body, headers = {}) => fetch(`${url}/api/bank/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  assert.equal((await post('preview', selection)).status, 403);
  const auth = { 'X-PD2-Mule-Token': status.sessionToken };
  assert.equal((await post('preview', selection, { ...auth, Origin: 'https://elsewhere.example' })).status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const request = http.request(`${url}/api/bank/preview`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', Host: 'elsewhere.example' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject); request.end(JSON.stringify(selection));
  });
  assert.equal(rebindingStatus, 403);
  assert.equal((await post('commit', { ticket: 'invented' }, auth)).status, 400);
  const previewResponse = await post('preview', selection, auth);
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal((await post('commit', { ticket: preview.ticket }, auth)).status, 200);
  assert.equal((await post('commit', { ticket: preview.ticket }, auth)).status, 400);
  const refreshed = await (await fetch(`${url}/api/bank`)).json();
  assert.equal(refreshed.bank.items.length, 1);
});

test('bank server refuses non-loopback binding and write mode without a bank', async t => {
  const { sourcePath, bankPath } = setup(t);
  await assert.rejects(startInspectorServer([sourcePath], { bankPath, host: '0.0.0.0', port: 0 }), /loopback/);
  await assert.rejects(startInspectorServer([sourcePath], { experimentalWrite: true, port: 0 }), /requires --bank/);
});
