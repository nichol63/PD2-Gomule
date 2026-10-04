import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { depositItem, recoverBank } from '../src/lib/item-bank.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = getFixtureLibraryDir();
const names = ['Bases.d2x', 'Legacy.d2s', '_LOD_SharedStashSave.sss'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonicalHashes = names.map(name => hash(fs.readFileSync(path.join(FIXTURES, name))));
const deadPID = Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout);
assert.ok(deadPID > 0);

function snapshot(root) {
  return fs.readdirSync(root).sort().flatMap(name => {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return [[file, fs.readlinkSync(file)]];
    return stat.isDirectory() ? snapshot(file) : [[file, hash(fs.readFileSync(file))]];
  });
}

function setup(t, name = 'Bases.d2x') {
  const directory = fs.mkdtempSync(path.join(REPO, '.bank-orphan-test-'));
  t.after(() => {
    try { assert.deepEqual(names.map(name => hash(fs.readFileSync(path.join(FIXTURES, name)))), canonicalHashes); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const sourcePath = path.join(directory, name), bankPath = path.join(directory, 'bank.json');
  fs.copyFileSync(path.join(FIXTURES, name), sourcePath);
  fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const orphanPath = sourcePath + '.pd2-mule.lock';
  const owner = { pid: deadPID, token: 'owned-orphan', bankPath, stashPath: sourcePath };
  fs.writeFileSync(orphanPath, JSON.stringify(owner));
  return { directory, sourcePath, bankPath, orphanPath, owner };
}

function hashes(state) { return [state.sourcePath, state.bankPath].map(file => hash(fs.readFileSync(file))); }

test('an explicitly selected owned orphan previews without writes and recovers each supported save extension', t => {
  for (const name of names) {
    const state = setup(t, name), before = snapshot(state.directory), saved = hashes(state);
    const ordinary = recoverBank({ bankPath: state.bankPath });
    assert.equal(ordinary.action, undefined);
    assert.deepEqual(snapshot(state.directory), before, 'default recovery must not guess an orphan source');
    const preview = recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.action, 'remove-stale-lock');
    assert.equal(preview.recovered, false);
    assert.deepEqual(snapshot(state.directory), before);
    const committed = recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false });
    assert.equal(committed.action, 'remove-stale-lock');
    assert.equal(committed.recovered, true);
    assert.deepEqual(hashes(state), saved);
    assert.equal(fs.existsSync(state.orphanPath), false);
    assert.equal(fs.existsSync(state.bankPath + '.lock'), false);
  }
});

test('an explicit source conflicting with a bank lock or journal is rejected with the exact diagnostic', t => {
  for (const association of ['bank-lock', 'journal']) {
    const state = setup(t); fs.unlinkSync(state.orphanPath);
    const other = path.join(state.directory, 'other.d2s'); fs.copyFileSync(path.join(FIXTURES, 'Legacy.d2s'), other);
    if (association === 'bank-lock') fs.writeFileSync(state.bankPath + '.lock', JSON.stringify(state.owner));
    else {
      const moved = depositItem({ bankPath: state.bankPath, sourcePath: state.sourcePath, pageIndex: 1, itemIndex: 0, dryRun: false });
      fs.copyFileSync(path.join(state.bankPath + '.transactions', moved.transactionId, 'committed.json'), state.bankPath + '.journal.json');
    }
    const before = snapshot(state.directory);
    assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: other, dryRun: false }),
      { message: 'Explicit recovery source conflicts with the interrupted transaction' });
    assert.deepEqual(snapshot(state.directory), before);
  }
});

test('foreign, mismatched, active, and malformed orphan owners cannot be cleaned', t => {
  const state = setup(t), original = fs.readFileSync(state.orphanPath);
  for (const change of [
    { bankPath: path.join(state.directory, 'another-bank.json') },
    { stashPath: path.join(state.directory, 'another-save.d2x') },
    { pid: process.pid }, { pid: 0 }, { bankPath: undefined }, { stashPath: undefined }
  ]) {
    fs.writeFileSync(state.orphanPath, JSON.stringify({ ...state.owner, ...change }));
    const before = snapshot(state.directory);
    assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false }), /owner|source|bank|active|invalid|lock|target/i);
    assert.deepEqual(snapshot(state.directory), before);
  }
  fs.writeFileSync(state.orphanPath, original);
});

test('an unassociated stale bank lock cannot bypass exact ownership of the explicitly selected orphan', t => {
  const state = setup(t);
  fs.writeFileSync(state.bankPath + '.lock', JSON.stringify({ ...state.owner, stashPath: null }));
  fs.writeFileSync(state.orphanPath, JSON.stringify({ ...state.owner, stashPath: path.join(state.directory, 'other.d2x') }));
  const before = snapshot(state.directory);
  for (const dryRun of [true, false]) {
    assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun }), /source|owner|target|lock/i);
    assert.deepEqual(snapshot(state.directory), before);
  }
  fs.writeFileSync(state.orphanPath, JSON.stringify(state.owner));
  const unowned = { ...state.owner, stashPath: null }; delete unowned.bankPath;
  fs.writeFileSync(state.bankPath + '.lock', JSON.stringify(unowned));
  const unownedBefore = snapshot(state.directory);
  assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false }), /owner|bank|lock/i);
  assert.deepEqual(snapshot(state.directory), unownedBefore);
});

test('protected, missing, non-save, linked save, and linked orphan paths are refused', t => {
  const state = setup(t);
  const text = path.join(state.directory, 'not-a-save.txt'); fs.writeFileSync(text, 'not a save');
  const alias = path.join(state.directory, 'alias.d2x'); fs.symlinkSync(state.sourcePath, alias);
  const hard = path.join(state.directory, 'hard.d2x'); fs.linkSync(state.sourcePath, hard);
  for (const sourcePath of [path.join(FIXTURES, 'Bases.d2x'), path.join(state.directory, 'missing.d2x'), text, alias, hard]) {
    const before = snapshot(state.directory);
    assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath, dryRun: false }), /protected|copy|link|exist|source|save|path|target/i);
    assert.deepEqual(snapshot(state.directory), before);
  }
  fs.unlinkSync(hard); fs.unlinkSync(alias);
  const lockCopy = path.join(state.directory, 'lock-copy'); fs.copyFileSync(state.orphanPath, lockCopy);
  fs.unlinkSync(state.orphanPath); fs.symlinkSync(lockCopy, state.orphanPath);
  assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false }), /linked/i);
  fs.unlinkSync(state.orphanPath); fs.linkSync(lockCopy, state.orphanPath);
  assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false }), /linked/i);
});

test('expected hashes refuse changed saves, banks, orphan locks, and newly discovered metadata before cleanup', t => {
  for (const change of ['save', 'bank', 'orphan', 'bank-lock', 'journal']) {
    const state = setup(t);
    const expected = { expectedBankLockSha256: null, expectedJournalSha256: null,
      expectedSourceLockSha256: hash(fs.readFileSync(state.orphanPath)),
      expectedRecoveryFileHashes: [state.sourcePath, state.bankPath].map(file => [file, hash(fs.readFileSync(file))]) };
    if (change === 'save') fs.appendFileSync(state.sourcePath, Buffer.from([0]));
    if (change === 'bank') fs.appendFileSync(state.bankPath, '\n');
    if (change === 'orphan') fs.appendFileSync(state.orphanPath, '\n');
    if (change === 'bank-lock') fs.writeFileSync(state.bankPath + '.lock', JSON.stringify({ ...state.owner, pid: process.pid }));
    if (change === 'journal') fs.writeFileSync(state.bankPath + '.journal.json', '{}');
    const before = snapshot(state.directory);
    assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false, ...expected }), /changed|active|invalid|journal|lock/i);
    assert.deepEqual(snapshot(state.directory), before);
  }
});

function duringClaim(state, mutation, run) {
  const nativeOpen = fs.openSync, nativeSync = fs.fsyncSync;
  let descriptor, fired = false;
  fs.openSync = function (file, ...args) {
    const fd = nativeOpen.call(fs, file, ...args);
    if (file === state.bankPath + '.lock') descriptor = fd;
    return fd;
  };
  fs.fsyncSync = function (fd) {
    const result = nativeSync.call(fs, fd);
    if (!fired && fd === descriptor) { fired = true; mutation(); }
    return result;
  };
  try { run(); }
  finally { fs.openSync = nativeOpen; fs.fsyncSync = nativeSync; }
  assert.equal(fired, true, 'race must occur after the durable bank association exists');
}

test('changes during the durable orphan claim refuse cleanup and release only the owned live bank lock', t => {
  for (const change of ['save', 'orphan', 'bank', 'journal']) {
    const state = setup(t), originalOrphan = fs.readFileSync(state.orphanPath);
    duringClaim(state, () => {
      if (change === 'save') fs.appendFileSync(state.sourcePath, Buffer.from([0]));
      if (change === 'orphan') fs.appendFileSync(state.orphanPath, '\n');
      if (change === 'bank') fs.appendFileSync(state.bankPath, '\n');
      if (change === 'journal') fs.writeFileSync(state.bankPath + '.journal.json', '{}');
    }, () => assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false }), /changed|invalid|journal|lock/i));
    assert.equal(fs.existsSync(state.orphanPath), true);
    if (change !== 'orphan') assert.deepEqual(fs.readFileSync(state.orphanPath), originalOrphan);
    assert.equal(fs.existsSync(state.bankPath + '.lock'), false, 'synchronous validation failures must not strand this process lock');
  }
});

test('a competing bank claimant is preserved and prevents explicit orphan removal', t => {
  const state = setup(t), orphan = fs.readFileSync(state.orphanPath), nativeOpen = fs.openSync;
  const foreign = JSON.stringify({ ...state.owner, pid: process.pid, token: 'competing-owner' });
  let fired = false;
  fs.openSync = function (file, ...args) {
    if (!fired && file === state.bankPath + '.lock' && args[0] === 'wx') {
      fired = true; fs.writeFileSync(file, foreign);
    }
    return nativeOpen.call(fs, file, ...args);
  };
  try { assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false }), /locked|operation/i); }
  finally { fs.openSync = nativeOpen; }
  assert.equal(fired, true);
  assert.equal(fs.readFileSync(state.bankPath + '.lock', 'utf8'), foreign);
  assert.deepEqual(fs.readFileSync(state.orphanPath), orphan);
});

test('changed durable claim bytes cannot redirect cleanup even if the ownership token is retained', t => {
  const state = setup(t), orphan = fs.readFileSync(state.orphanPath);
  const other = path.join(state.directory, 'other.d2s'); fs.copyFileSync(path.join(FIXTURES, 'Legacy.d2s'), other);
  let changed;
  duringClaim(state, () => {
    const claim = JSON.parse(fs.readFileSync(state.bankPath + '.lock', 'utf8'));
    changed = JSON.stringify({ ...claim, stashPath: other });
    fs.writeFileSync(state.bankPath + '.lock', changed);
  }, () => assert.throws(() => recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath, dryRun: false }), /changed|lock/i));
  assert.deepEqual(fs.readFileSync(state.orphanPath), orphan);
  assert.equal(fs.readFileSync(state.bankPath + '.lock', 'utf8'), changed,
    'a changed claim belongs to an external actor and must not be removed');
});

const CHILD = `
import fs from 'node:fs';
const { recoverBank } = await import(process.argv[1]);
const { bankPath, sourcePath, phase } = JSON.parse(process.argv[2]);
const nativeOpen = fs.openSync, nativeSync = fs.fsyncSync, nativeUnlink = fs.unlinkSync;
let descriptor;
fs.openSync = function(file, ...args) { const fd = nativeOpen.call(fs, file, ...args); if(file === bankPath + '.lock') descriptor = fd; return fd; };
fs.fsyncSync = function(fd) { const result = nativeSync.call(fs, fd); if(phase === 'claimed' && fd === descriptor) process.exit(81); return result; };
fs.unlinkSync = function(file) { const result = nativeUnlink.call(fs, file); if(phase === 'cleaned' && file === sourcePath + '.pd2-mule.lock') process.exit(81); return result; };
recoverBank({ bankPath, sourcePath, dryRun: false });
throw new Error('Expected process interruption did not occur');
`;

test('interruption after the durable claim or orphan removal remains discoverable through the bank alone', t => {
  for (const phase of ['claimed', 'cleaned']) {
    const state = setup(t), saved = hashes(state);
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD,
      new URL('../src/lib/item-bank.mjs', import.meta.url).href, JSON.stringify({ ...state, phase })], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 81, result.stderr || result.error?.message);
    const association = JSON.parse(fs.readFileSync(state.bankPath + '.lock', 'utf8'));
    assert.equal(association.bankPath, state.bankPath);
    assert.equal(association.stashPath, state.sourcePath);
    assert.equal(fs.existsSync(state.orphanPath), phase === 'claimed');
    const before = snapshot(state.directory), preview = recoverBank({ bankPath: state.bankPath });
    assert.equal(preview.action, 'remove-stale-lock');
    assert.deepEqual(snapshot(state.directory), before);
    assert.equal(recoverBank({ bankPath: state.bankPath, dryRun: false }).recovered, true);
    assert.deepEqual(hashes(state), saved);
    assert.equal(fs.existsSync(state.orphanPath), false);
    assert.equal(fs.existsSync(state.bankPath + '.lock'), false);
  }
});

test('a valid orphan and stale unassociated bank lock receive a new durable source association before cleanup', t => {
  const state = setup(t), saved = hashes(state);
  fs.writeFileSync(state.bankPath + '.lock', JSON.stringify({ ...state.owner, stashPath: null }));
  const before = snapshot(state.directory);
  assert.equal(recoverBank({ bankPath: state.bankPath, sourcePath: state.sourcePath }).action, 'remove-stale-lock');
  assert.deepEqual(snapshot(state.directory), before);
  const interrupted = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD,
    new URL('../src/lib/item-bank.mjs', import.meta.url).href, JSON.stringify({ ...state, phase: 'claimed' })], { encoding: 'utf8', timeout: 15000 });
  assert.equal(interrupted.status, 81, interrupted.stderr || interrupted.error?.message);
  const association = JSON.parse(fs.readFileSync(state.bankPath + '.lock', 'utf8'));
  assert.equal(association.stashPath, state.sourcePath);
  assert.equal(association.bankPath, state.bankPath);
  assert.equal(fs.existsSync(state.orphanPath), true);
  assert.equal(recoverBank({ bankPath: state.bankPath, dryRun: false }).recovered, true);
  assert.deepEqual(hashes(state), saved);
  assert.equal(fs.existsSync(state.orphanPath), false);
});
