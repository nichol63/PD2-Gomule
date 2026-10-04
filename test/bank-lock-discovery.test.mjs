import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { depositItem, recoverBank, listBank } from '../src/lib/item-bank.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK_MODULE = new URL('../src/lib/item-bank.mjs', import.meta.url).href;
const FIXTURE = path.join(getFixtureLibraryDir(), 'Bases.d2x');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalFixtureHash = hash(fs.readFileSync(FIXTURE));

function setup(t, bankFirst) {
  const directory = fs.mkdtempSync(path.join(REPO, '.bank-lock-discovery-'));
  t.after(() => {
    try { assert.equal(hash(fs.readFileSync(FIXTURE)), originalFixtureHash); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const bankPath = path.join(directory, bankFirst ? 'aa-bank.json' : 'zz-bank.json');
  const sourcePath = path.join(directory, bankFirst ? 'zz-save.d2x' : 'aa-save.d2x');
  fs.copyFileSync(FIXTURE, sourcePath);
  return { directory, bankPath, sourcePath, bankLock: bankPath + '.lock', saveLock: sourcePath + '.pd2-mule.lock',
    sourceHash: hash(fs.readFileSync(sourcePath)) };
}

const CHILD = `
import fs from 'node:fs';
const { depositItem, recoverBank } = await import(process.argv[1]);
const { bankPath, sourcePath, phase } = JSON.parse(process.argv[2]);
const nativeOpen = fs.openSync, nativeSync = fs.fsyncSync, nativeRead = fs.readFileSync, nativeUnlink = fs.unlinkSync;
const descriptors = new Map(), events = [];
const bankLock = bankPath + '.lock', saveLock = sourcePath + '.pd2-mule.lock';
function stop() { process.stdout.write(JSON.stringify({ pid: process.pid, events })); process.exit(81); }
fs.openSync = function(file, ...args) {
  const fd = nativeOpen.call(fs, file, ...args); descriptors.set(fd, file); return fd;
};
fs.fsyncSync = function(fd) {
  const result = nativeSync.call(fs, fd), file = descriptors.get(fd);
  if ([bankLock, saveLock].includes(file)) {
    events.push({ event: 'acquired', file });
    if (phase === 'bank-acquired' && file === bankLock || phase === 'save-acquired' && file === saveLock) stop();
  }
  return result;
};
fs.readFileSync = function(file, ...args) {
  if (phase === 'release-interrupted' && file === sourcePath) throw new Error('Injected planning stop after both locks');
  return nativeRead.call(fs, file, ...args);
};
fs.unlinkSync = function(file) {
  const result = nativeUnlink.call(fs, file);
  if ([bankLock, saveLock].includes(file)) {
    events.push({ event: 'released', file });
    if (phase === 'release-interrupted' || phase === 'recovery-interrupted') stop();
  }
  return result;
};
if (phase === 'recovery-interrupted') recoverBank({ bankPath, dryRun: false });
else depositItem({ bankPath, sourcePath, pageIndex: 1, itemIndex: 0, dryRun: false });
throw new Error('Expected interruption hook did not fire');
`;

function interrupt(state, phase) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD, BANK_MODULE,
    JSON.stringify({ bankPath: state.bankPath, sourcePath: state.sourcePath, phase })], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 81, result.stderr || result.error?.message);
  assert.equal(result.signal, null);
  return JSON.parse(result.stdout);
}

function unchangedEarly(state) {
  assert.equal(hash(fs.readFileSync(state.sourcePath)), state.sourceHash);
  assert.equal(fs.existsSync(state.bankPath), false);
  assert.equal(fs.existsSync(state.bankPath + '.journal.json'), false);
  assert.equal(fs.existsSync(state.bankPath + '.transactions'), false);
}

function recoverAndRetry(state) {
  const before = fs.readdirSync(state.directory).map(name => [name, hash(fs.readFileSync(path.join(state.directory, name)))]);
  const preview = recoverBank({ bankPath: state.bankPath });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.action, 'remove-stale-lock');
  assert.deepEqual(fs.readdirSync(state.directory).map(name => [name, hash(fs.readFileSync(path.join(state.directory, name)))]), before);
  const commit = recoverBank({ bankPath: state.bankPath, dryRun: false });
  assert.equal(commit.recovered, true);
  assert.equal(fs.existsSync(state.bankLock), false);
  assert.equal(fs.existsSync(state.saveLock), false);
  unchangedEarly(state);
  depositItem({ bankPath: state.bankPath, sourcePath: state.sourcePath, pageIndex: 1, itemIndex: 0, dryRun: false });
  assert.equal(listBank(state.bankPath).items.length, 1);
  assert.equal(inspectSaveFile(state.sourcePath).totalItems, 2585);
  assert.equal(fs.existsSync(state.bankLock), false);
  assert.equal(fs.existsSync(state.saveLock), false);
}

test('the durable bank discovery lock is acquired first in both lexical path orders', t => {
  for (const bankFirst of [true, false]) {
    const state = setup(t, bankFirst), child = interrupt(state, 'bank-acquired');
    assert.deepEqual(child.events, [{ event: 'acquired', file: state.bankLock }]);
    assert.equal(fs.existsSync(state.saveLock), false, 'save lock must never precede the bank discovery lock');
    const lock = JSON.parse(fs.readFileSync(state.bankLock, 'utf8'));
    assert.equal(lock.pid, child.pid);
    assert.equal(lock.bankPath, state.bankPath);
    assert.equal(lock.stashPath, state.sourcePath);
    unchangedEarly(state);
    recoverAndRetry(state);
  }
});

test('interruption after both lock acquisitions is discoverable and recoverable without changing saves', t => {
  for (const bankFirst of [true, false]) {
    const state = setup(t, bankFirst), child = interrupt(state, 'save-acquired');
    assert.deepEqual(child.events.map(event => event.file), [state.bankLock, state.saveLock]);
    assert.equal(JSON.parse(fs.readFileSync(state.saveLock, 'utf8')).pid, child.pid);
    unchangedEarly(state);
    recoverAndRetry(state);
  }
});

test('interrupted ordinary release removes the save lock first and keeps recovery discovery intact', t => {
  for (const bankFirst of [true, false]) {
    const state = setup(t, bankFirst), child = interrupt(state, 'release-interrupted');
    assert.deepEqual(child.events.filter(event => event.event === 'released'), [{ event: 'released', file: state.saveLock }]);
    assert.equal(fs.existsSync(state.bankLock), true);
    assert.equal(fs.existsSync(state.saveLock), false);
    unchangedEarly(state);
    recoverAndRetry(state);
  }
});

test('interrupted stale-lock cleanup preserves the bank lock until its associated save lock is gone', t => {
  for (const bankFirst of [true, false]) {
    const state = setup(t, bankFirst);
    interrupt(state, 'save-acquired');
    const recovery = interrupt(state, 'recovery-interrupted');
    assert.deepEqual(recovery.events, [{ event: 'released', file: state.saveLock }]);
    assert.equal(fs.existsSync(state.bankLock), true);
    assert.equal(fs.existsSync(state.saveLock), false);
    unchangedEarly(state);
    recoverAndRetry(state);
  }
});

test('recovery still refuses active owners, changed lock hashes, and linked lock metadata', t => {
  const state = setup(t, false);
  interrupt(state, 'save-acquired');
  const bankBytes = fs.readFileSync(state.bankLock), saveBytes = fs.readFileSync(state.saveLock);
  const expected = { expectedBankLockSha256: hash(bankBytes), expectedSourceLockSha256: hash(saveBytes) };
  fs.appendFileSync(state.bankLock, '\n');
  assert.throws(() => recoverBank({ bankPath: state.bankPath, dryRun: false, ...expected }), /changed/i);
  assert.deepEqual(fs.readFileSync(state.saveLock), saveBytes);
  fs.writeFileSync(state.bankLock, bankBytes);
  fs.appendFileSync(state.saveLock, '\n');
  assert.throws(() => recoverBank({ bankPath: state.bankPath, dryRun: false, ...expected }), /changed/i);
  assert.deepEqual(fs.readFileSync(state.bankLock), bankBytes);
  fs.writeFileSync(state.saveLock, saveBytes);
  const active = { ...JSON.parse(bankBytes), pid: process.pid };
  fs.writeFileSync(state.bankLock, JSON.stringify(active));
  assert.throws(() => recoverBank({ bankPath: state.bankPath, dryRun: false }), /active|locked/i);
  fs.writeFileSync(state.bankLock, bankBytes);
  fs.writeFileSync(state.saveLock, JSON.stringify({ ...JSON.parse(saveBytes), pid: process.pid }));
  assert.throws(() => recoverBank({ bankPath: state.bankPath, dryRun: false }), /active|locked/i);
  assert.deepEqual(fs.readFileSync(state.bankLock), bankBytes);
  fs.writeFileSync(state.saveLock, saveBytes);
  const alias = path.join(state.directory, 'alias-lock'); fs.linkSync(state.saveLock, alias);
  assert.throws(() => recoverBank({ bankPath: state.bankPath, dryRun: false }), /linked|Hardlink/i);
  fs.unlinkSync(alias);
  unchangedEarly(state);
  recoverAndRetry(state);
});

test('an orphan save lock without a bank lock or journal is not guessed or removed', t => {
  const state = setup(t, false);
  interrupt(state, 'save-acquired');
  fs.unlinkSync(state.bankLock);
  const orphan = fs.readFileSync(state.saveLock);
  const unrelated = path.join(state.directory, 'unrelated.d2x.pd2-mule.lock');
  fs.writeFileSync(unrelated, 'unrelated lock');
  assert.equal(recoverBank({ bankPath: state.bankPath }).action, undefined);
  assert.equal(recoverBank({ bankPath: state.bankPath, dryRun: false }).recovered, false);
  assert.deepEqual(fs.readFileSync(state.saveLock), orphan);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'unrelated lock');
  unchangedEarly(state);
});
