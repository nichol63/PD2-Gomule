import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { collectBrowseEntries } from '../src/lib/browser-index.mjs';
import { getItemKey, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { startInspectorServer } from '../src/lib/inspector-server.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const fixtures = getFixtureLibraryDir();
const names = ['Bases.d2x', 'Legacy.d2s'];
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const originalHashes = names.map(name => hash(path.join(fixtures, name)));
const deadPID = Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout);
function snapshot(root) {
  const stat = fs.statSync(root);
  return [[root, stat.ino, stat.mtimeMs, stat.ctimeMs, stat.isFile() ? hash(root) : null],
    ...(stat.isDirectory() ? fs.readdirSync(root).sort().flatMap(name => snapshot(path.join(root, name))) : [])];
}
function setup(t) {
  const directory = fs.mkdtempSync(path.join(process.cwd(), '.post-commit-test-'));
  t.after(() => {
    try { assert.deepEqual(names.map(name => hash(path.join(fixtures, name))), originalHashes); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const [sourcePath, otherPath] = names.map(name => path.join(directory, name));
  for (const name of names) fs.copyFileSync(path.join(fixtures, name), path.join(directory, name));
  const bankPath = path.join(directory, 'bank.json');
  const workspace = loadInspectorWorkspace([sourcePath, otherPath]);
  const service = createMuleService(workspace, { bankPath, experimentalWrite: true });
  const entry = collectBrowseEntries(workspace.sources[0].summary).find(entry => entry.pageIndex === 1 && entry.itemIndex === 0);
  const selection = { action: 'deposit', sourceId: 'source-1', itemKey: getItemKey(entry) };
  return { directory, sourcePath, otherPath, bankPath, workspace, service, selection };
}
function cleanMetadata(state) {
  for (const file of [state.bankPath + '.lock', state.bankPath + '.journal.json', state.sourcePath + '.pd2-mule.lock']) assert.equal(fs.existsSync(file), false, file);
}
function retained(result, sourceBefore, bankBefore = null) {
  assert.ok(result.transactionId);
  assert.equal(result.backupPaths.length, bankBefore === null ? 1 : 2);
  for (const file of result.backupPaths) assert.ok(fs.existsSync(file));
  assert.equal(hash(result.backupPaths.find(file => file.endsWith('stash.before'))), sourceBefore);
  if (bankBefore !== null) assert.equal(hash(result.backupPaths.find(file => file.endsWith('bank.before'))), bankBefore);
}
function warning(result, state) {
  assert.equal(typeof result.refreshError, 'string');
  assert.equal(result.refreshError, 'Save path does not exist: ' + state.otherPath);
  assert.equal(result.dryRun, false);
}

test('completed deposit returns its result when unrelated refresh fails, expires every ticket and retains stale-source guards', t => {
  const state = setup(t), { service, sourcePath, otherPath, workspace } = state;
  const sourceBefore = hash(sourcePath), sourcesBefore = workspace.sources;
  const first = service.preview(state.selection), second = service.preview(state.selection);
  fs.unlinkSync(otherPath);
  const result = service.commit(first.ticket);
  warning(result, state); assert.equal(result.operation, 'deposit'); retained(result, sourceBefore);
  assert.equal(inspectSaveFile(sourcePath).totalItems, 2585);
  assert.equal(service.status().bank.items.length, 1);
  assert.equal(workspace.sources, sourcesBefore); assert.equal(workspace.sources[0].summary.totalItems, 2586);
  for (const ticket of [first.ticket, second.ticket]) assert.throws(() => service.commit(ticket), /expired/);
  assert.throws(() => service.preview(state.selection), /save changed|refresh/i);
  cleanMetadata(state);
  fs.copyFileSync(path.join(fixtures, names[1]), otherPath);
  service.refresh(); assert.equal(workspace.sources[0].summary.totalItems, 2585);
  const current = collectBrowseEntries(workspace.sources[0].summary).find(entry => entry.pageIndex === 1 && entry.itemIndex === 0);
  const next = service.preview({ ...state.selection, itemKey: getItemKey(current) });
  const success = service.commit(next.ticket);
  assert.equal(Object.hasOwn(success, 'refreshError'), false);
  assert.equal(success.operation, 'deposit'); assert.equal(service.status().bank.items.length, 2);
  assert.equal(workspace.sources[0].summary.totalItems, 2584); cleanMetadata(state);
});

test('completed withdrawal still reports its saved result and exact backups when another loaded save disappears', t => {
  const state = setup(t), { service, sourcePath, otherPath, bankPath, workspace } = state;
  const deposit = service.commit(service.preview(state.selection).ticket);
  assert.equal(Object.hasOwn(deposit, 'refreshError'), false);
  const bankItem = service.status().bank.items[0], sourceBefore = hash(sourcePath), bankBefore = hash(bankPath);
  const request = { action: 'withdraw', sourceId: 'source-1', itemId: bankItem.id, pageIndex: 0, column: 0, row: 0 };
  const preview = service.preview(request), second = service.preview(request), sourcesBefore = workspace.sources;
  fs.unlinkSync(otherPath);
  const result = service.commit(preview.ticket);
  warning(result, state); assert.equal(result.operation, 'withdraw'); retained(result, sourceBefore, bankBefore);
  assert.equal(inspectSaveFile(sourcePath).totalItems, 2586); assert.equal(service.status().bank.items.length, 0);
  assert.equal(inspectSaveFile(sourcePath).pages[0].topLevelItems[0].code, 'ci3');
  assert.equal(workspace.sources, sourcesBefore);
  for (const ticket of [preview.ticket, second.ticket]) assert.throws(() => service.commit(ticket), /expired/);
  cleanMetadata(state);
});

test('explicit orphan cleanup remains successful after refresh failure without changing save or bank bytes', t => {
  const state = setup(t), { service, sourcePath, otherPath, bankPath, workspace } = state;
  fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const lock = sourcePath + '.pd2-mule.lock';
  fs.writeFileSync(lock, JSON.stringify({ pid: deadPID, bankPath, stashPath: sourcePath, token: 'owned-orphan' }));
  const saveHash = hash(sourcePath), bankHash = hash(bankPath), sourcesBefore = workspace.sources;
  const request = { action: 'recover', sourceId: 'source-1' };
  const first = service.preview(request), second = service.preview(request);
  fs.unlinkSync(otherPath);
  const result = service.commit(first.ticket);
  warning(result, state); assert.equal(result.operation, 'recover'); assert.equal(result.recovered, true);
  assert.equal(result.action, 'remove-stale-lock'); assert.equal(hash(sourcePath), saveHash); assert.equal(hash(bankPath), bankHash);
  assert.equal(workspace.sources, sourcesBefore); cleanMetadata(state);
  for (const ticket of [first.ticket, second.ticket]) assert.throws(() => service.commit(ticket), /expired/);
});

test('genuine engine lock failures and preview hash failures still throw without reporting a saved transfer', t => {
  const state = setup(t), { service, sourcePath, bankPath } = state;
  fs.writeFileSync(bankPath + '.lock', JSON.stringify({ pid: process.pid, bankPath, stashPath: sourcePath, token: 'active' }));
  const first = service.preview(state.selection), second = service.preview(state.selection), before = snapshot(state.directory);
  assert.throws(() => service.commit(first.ticket), /locked|already exists/i);
  assert.throws(() => service.commit(second.ticket), /locked|already exists/i, 'an unsuccessful run must not masquerade as success and invalidate every plan');
  assert.deepEqual(snapshot(state.directory), before); assert.equal(inspectSaveFile(sourcePath).totalItems, 2586);
  fs.unlinkSync(bankPath + '.lock');
  const preview = service.preview(state.selection);
  const changed = fs.readFileSync(sourcePath); changed[20] ^= 1; fs.writeFileSync(sourcePath, changed);
  const modified = snapshot(state.directory);
  assert.throws(() => service.commit(preview.ticket), /changed after preview/);
  assert.deepEqual(snapshot(state.directory), modified); assert.equal(fs.existsSync(bankPath), false);
});

test('authenticated HTTP commit returns 200 for the completed transfer with refreshError and rejects all replay tickets', async t => {
  const state = setup(t);
  const { server, url, workspace } = await startInspectorServer([state.sourcePath, state.otherPath], { bankPath: state.bankPath, experimentalWrite: true, port: 0, host: '127.0.0.1' });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const status = await (await fetch(url + '/api/bank')).json();
  const post = (route, body) => fetch(url + '/api/bank/' + route, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-PD2-Mule-Token': status.sessionToken }, body: JSON.stringify(body) });
  const first = await (await post('preview', state.selection)).json();
  const second = await (await post('preview', state.selection)).json();
  const sourceBefore = hash(state.sourcePath); fs.unlinkSync(state.otherPath);
  const response = await post('commit', { ticket: first.ticket }); assert.equal(response.status, 200);
  const result = await response.json(); warning(result, state); retained(result, sourceBefore);
  assert.equal(result.operation, 'deposit'); assert.equal(result.bankItemCountAfter, 1);
  assert.equal(inspectSaveFile(state.sourcePath).totalItems, 2585); assert.equal(workspace.sources[0].summary.totalItems, 2586);
  const fresh = await (await fetch(url + '/api/bank')).json(); assert.equal(fresh.bank.items.length, 1);
  const committed = snapshot(state.directory);
  for (const ticket of [first.ticket, second.ticket]) {
    const replay = await post('commit', { ticket }); assert.equal(replay.status, 400);
    assert.match((await replay.json()).error, /expired/);
  }
  assert.deepEqual(snapshot(state.directory), committed); cleanMetadata(state);
});
