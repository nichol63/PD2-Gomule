import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = getFixtureLibraryDir(), names = ['Bases.d2x', 'Legacy.d2s'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originals = names.map(name => hash(fs.readFileSync(path.join(FIXTURES, name))));
const deadPID = Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout);

function snapshot(root) {
  return fs.readdirSync(root).sort().map(name => [name, hash(fs.readFileSync(path.join(root, name)))]);
}

function setup(t, experimentalWrite = true) {
  const directory = fs.mkdtempSync(path.join(REPO, '.mule-orphan-test-'));
  t.after(() => {
    try { assert.deepEqual(names.map(name => hash(fs.readFileSync(path.join(FIXTURES, name)))), originals); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const sourcePath = path.join(directory, 'Bases.d2x'), otherPath = path.join(directory, 'Legacy.d2s');
  fs.copyFileSync(path.join(FIXTURES, names[0]), sourcePath); fs.copyFileSync(path.join(FIXTURES, names[1]), otherPath);
  const bankPath = path.join(directory, 'bank.json'); fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const workspace = loadInspectorWorkspace([sourcePath, otherPath]);
  const orphanPath = sourcePath + '.pd2-mule.lock', owner = { pid: deadPID, token: 'orphan', bankPath, stashPath: sourcePath };
  fs.writeFileSync(orphanPath, JSON.stringify(owner));
  return { directory, sourcePath, otherPath, bankPath, orphanPath, owner, workspace,
    service: createMuleService(workspace, { bankPath, experimentalWrite }) };
}

test('loaded source IDs preview an owned orphan without writes and commit preserves bank and save hashes', t => {
  const state = setup(t), before = snapshot(state.directory);
  const ordinary = state.service.preview({ action: 'recover' });
  assert.equal(ordinary.result.action, undefined);
  assert.deepEqual(snapshot(state.directory), before);
  const preview = state.service.preview({ action: 'recover', sourceId: 'source-1' });
  assert.equal(preview.canCommit, true);
  assert.equal(preview.result.dryRun, true);
  assert.equal(preview.result.action, 'remove-stale-lock');
  assert.deepEqual(snapshot(state.directory), before);
  const committed = state.service.commit(preview.ticket);
  assert.equal(committed.recovered, true);
  assert.equal(fs.existsSync(state.orphanPath), false);
  assert.deepEqual(snapshot(state.directory), before.filter(([name]) => name !== path.basename(state.orphanPath)));
  assert.throws(() => state.service.commit(preview.ticket), /expired/i);
});

test('browser file path parameters never select orphan targets and unloaded IDs are rejected', t => {
  const state = setup(t), before = snapshot(state.directory);
  const preview = state.service.preview({ action: 'recover', sourcePath: state.sourcePath, filePath: state.sourcePath });
  assert.equal(preview.result.action, undefined);
  state.service.commit(preview.ticket);
  assert.equal(fs.existsSync(state.orphanPath), true);
  assert.deepEqual(snapshot(state.directory), before);
  assert.throws(() => state.service.preview({ action: 'recover', sourceId: 'unknown', sourcePath: state.sourcePath }), /loaded/i);
  const stale = fs.readFileSync(state.sourcePath); fs.appendFileSync(state.sourcePath, Buffer.from([0]));
  const changed = snapshot(state.directory);
  assert.throws(() => state.service.preview({ action: 'recover', sourceId: 'source-1' }), /save changed|refresh/i);
  assert.deepEqual(snapshot(state.directory), changed);
  fs.writeFileSync(state.sourcePath, stale);
});

test('preview-only service mode exposes recovery evidence but keeps commit disabled', t => {
  const state = setup(t, false), before = snapshot(state.directory);
  const preview = state.service.preview({ action: 'recover', sourceId: 'source-1' });
  assert.equal(preview.canCommit, false);
  assert.equal(preview.result.action, 'remove-stale-lock');
  assert.throws(() => state.service.commit(preview.ticket), /disabled/i);
  assert.deepEqual(snapshot(state.directory), before);
});

test('source, orphan, bank, and new association changes after preview invalidate recovery tickets', t => {
  for (const change of ['save', 'orphan', 'bank', 'bank-lock', 'journal']) {
    const state = setup(t), preview = state.service.preview({ action: 'recover', sourceId: 'source-1' });
    if (change === 'save') fs.appendFileSync(state.sourcePath, Buffer.from([0]));
    if (change === 'orphan') fs.appendFileSync(state.orphanPath, '\n');
    if (change === 'bank') fs.appendFileSync(state.bankPath, '\n');
    if (change === 'bank-lock') fs.writeFileSync(state.bankPath + '.lock', JSON.stringify({ ...state.owner, pid: process.pid }));
    if (change === 'journal') fs.writeFileSync(state.bankPath + '.journal.json', '{}');
    const changed = snapshot(state.directory);
    assert.throws(() => state.service.commit(preview.ticket), /changed after preview/i);
    assert.deepEqual(snapshot(state.directory), changed, 'ticket failure must preserve external edits and orphan lock');
  }
});

test('explicit loaded-source recovery cannot conflict with another discovered association', t => {
  const state = setup(t);
  fs.writeFileSync(state.bankPath + '.lock', JSON.stringify({ ...state.owner, stashPath: state.otherPath }));
  const before = snapshot(state.directory);
  assert.throws(() => state.service.preview({ action: 'recover', sourceId: 'source-1' }),
    { message: 'Explicit recovery source conflicts with the interrupted transaction' });
  assert.deepEqual(snapshot(state.directory), before);
});

test('default recovery refuses discovered unloaded saves rather than using browser path hints', t => {
  const state = setup(t), unloaded = path.join(state.directory, 'unloaded.d2s');
  fs.copyFileSync(state.otherPath, unloaded);
  fs.writeFileSync(state.bankPath + '.lock', JSON.stringify({ ...state.owner, stashPath: unloaded }));
  const before = snapshot(state.directory);
  assert.throws(() => state.service.preview({ action: 'recover', sourcePath: unloaded }), /load.*save|loaded/i);
  assert.deepEqual(snapshot(state.directory), before);
});
