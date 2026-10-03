import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { loadInspectorWorkspace, getItemKey } from '../src/lib/inspector-model.mjs';
import { collectBrowseEntries } from '../src/lib/browser-index.mjs';
import { removeStashItem, sha256 } from '../src/lib/safe-serialization.mjs';
import { depositItem, recoverBank, listBank } from '../src/lib/item-bank.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setup(t) {
  const directory = fs.mkdtempSync(path.join(REPO, '.mule-preview-race-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'copy.d2x');
  const bankPath = path.join(directory, 'bank.json');
  fs.copyFileSync(path.join(getFixtureLibraryDir(), 'Bases.d2x'), sourcePath);
  const workspace = loadInspectorWorkspace([sourcePath]);
  const service = createMuleService(workspace, { bankPath, experimentalWrite: true });
  const entries = collectBrowseEntries(workspace.sources[0].summary).filter(entry => entry.pageIndex === 1);
  assert.equal(entries[0].code, 'ci3');
  assert.equal(entries[1].code, 'ci2');
  return { directory, sourcePath, bankPath, workspace, service,
    selection: { action: 'deposit', sourceId: 'source-1', itemKey: getItemKey(entries[0]) } };
}

// Model an external write immediately after the bank engine's final preview
// validation read. It receives its previously read bytes; the service must
// compare the resulting file with its earlier baseline before issuing a ticket.
function externalWriteAfterEngineRead(file, mutation, run) {
  const nativeRead = fs.readFileSync;
  let fired = false;
  fs.readFileSync = function (requested, ...args) {
    const bytes = nativeRead.call(fs, requested, ...args);
    const stack = new Error().stack;
    if (!fired && requested === file && stack.includes('at readBytes') &&
        stack.includes('at operation') && !stack.includes('at readBank')) {
      fired = true;
      mutation();
    }
    return bytes;
  };
  try { run(); }
  finally { fs.readFileSync = nativeRead; }
  assert.equal(fired, true, 'the mutation must occur at the preview validation boundary');
}

function externalWriteAfterSecondServiceHash(file, mutation, run) {
  const nativeRead = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = function (requested, ...args) {
    const bytes = nativeRead.call(fs, requested, ...args);
    if (requested === file && new Error().stack.includes('at fileHash') && ++reads === 2) mutation();
    return bytes;
  };
  try { run(); }
  finally { fs.readFileSync = nativeRead; }
  assert.ok(reads >= 2, 'the mutation must occur after the service baseline check');
}

test('a Diadem preview refuses a concurrent save change that would shift the selection to a Tiara', t => {
  const { directory, sourcePath, bankPath, workspace, service, selection } = setup(t);
  const original = fs.readFileSync(sourcePath);
  const external = removeStashItem(original, workspace.sources[0].summary,
    { pageIndex: 1, itemIndex: 0 }).buffer;
  externalWriteAfterEngineRead(sourcePath, () => fs.writeFileSync(sourcePath, external), () => {
    assert.throws(() => service.preview(selection), /changed/i);
  });
  assert.deepEqual(fs.readFileSync(sourcePath), external, 'preview must preserve the external edit');
  assert.equal(fs.existsSync(bankPath), false);
  assert.deepEqual(fs.readdirSync(directory), ['copy.d2x']);
});

test('a preview refuses a bank change after the bank engine has validated its prior contents', t => {
  const { directory, sourcePath, bankPath, service, selection } = setup(t);
  const original = fs.readFileSync(sourcePath);
  fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const externalBank = JSON.stringify({ schemaVersion: 1, revision: 7, items: [] });
  externalWriteAfterEngineRead(bankPath, () => fs.writeFileSync(bankPath, externalBank), () => {
    assert.throws(() => service.preview(selection), /changed/i);
  });
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.readFileSync(bankPath, 'utf8'), externalBank);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['bank.json', 'copy.d2x']);
});

test('an unchanged preview still commits the originally selected Diadem exactly once', t => {
  const { sourcePath, bankPath, service, selection } = setup(t);
  const original = fs.readFileSync(sourcePath);
  const preview = service.preview(selection);
  assert.match(preview.label, /Deposit Diadem/);
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.existsSync(bankPath), false);
  service.commit(preview.ticket);
  assert.equal(service.status().bank.items[0].code, 'ci3');
  assert.equal(service.status().bank.items.length, 1);
  assert.throws(() => service.commit(preview.ticket), /expired/i);
});

test('the bank engine refuses source changes between the service precheck and its own source read', t => {
  const { sourcePath, bankPath, workspace, service, selection } = setup(t);
  const external = removeStashItem(fs.readFileSync(sourcePath), workspace.sources[0].summary,
    { pageIndex: 1, itemIndex: 0 }).buffer;
  externalWriteAfterSecondServiceHash(sourcePath, () => fs.writeFileSync(sourcePath, external), () => {
    assert.throws(() => service.preview(selection), /changed since preview/i);
  });
  assert.deepEqual(fs.readFileSync(sourcePath), external);
  assert.equal(fs.existsSync(bankPath), false);
});

test('the bank engine refuses bank changes between the service precheck and its own bank read', t => {
  const { sourcePath, bankPath, service, selection } = setup(t);
  const original = fs.readFileSync(sourcePath);
  fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const external = JSON.stringify({ schemaVersion: 1, revision: 7, items: [] });
  externalWriteAfterSecondServiceHash(bankPath, () => fs.writeFileSync(bankPath, external), () => {
    assert.throws(() => service.preview(selection), /changed since preview/i);
  });
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.readFileSync(bankPath, 'utf8'), external);
});

test('recovery refuses changed previewed journals and transaction files before restoring anything', t => {
  const { sourcePath, bankPath } = setup(t);
  const original = fs.readFileSync(sourcePath);
  const committed = depositItem({ bankPath, sourcePath, pageIndex: 1, itemIndex: 0, dryRun: false });
  const journalFile = bankPath + '.journal.json';
  const journal = JSON.parse(fs.readFileSync(path.join(bankPath + '.transactions', committed.transactionId, 'committed.json'), 'utf8'));
  fs.writeFileSync(journalFile, JSON.stringify({ ...journal, status: 'prepared' }));
  const journalBytes = fs.readFileSync(journalFile);
  const sourceAfter = fs.readFileSync(sourcePath);
  const expected = { bankPath, dryRun: false, expectedJournalSha256: sha256(journalBytes),
    expectedRecoveryFileHashes: [[sourcePath, sha256(sourceAfter)], [bankPath, sha256(fs.readFileSync(bankPath))]] };
  fs.appendFileSync(journalFile, '\n'); // Still valid JSON, but a different previewed journal.
  assert.throws(() => recoverBank(expected), /journal.*changed since preview/i);
  assert.deepEqual(fs.readFileSync(sourcePath), sourceAfter);
  fs.writeFileSync(journalFile, journalBytes);
  fs.writeFileSync(sourcePath, original); // Another recovery completed its source restoration.
  assert.throws(() => recoverBank(expected), /recovery file.*changed since preview/i);
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.existsSync(journalFile), true);
  assert.equal(fs.existsSync(bankPath), true);
  const recovered = recoverBank({ ...expected,
    expectedRecoveryFileHashes: [[sourcePath, sha256(original)], [bankPath, sha256(fs.readFileSync(bankPath))]] });
  assert.equal(recovered.recovered, true);
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.existsSync(bankPath), false);
});

test('stale-lock recovery cannot redirect from a loaded save to an unloaded save after the commit precheck', t => {
  const { directory, sourcePath, bankPath, service } = setup(t);
  const alternate = path.join(directory, 'unloaded.d2x');
  fs.copyFileSync(sourcePath, alternate);
  const bankLock = bankPath + '.lock';
  const sourceLock = sourcePath + '.pd2-mule.lock';
  const alternateLock = alternate + '.pd2-mule.lock';
  const lock = target => JSON.stringify({ pid: 2147483647, token: 'stale-review-lock', bankPath, stashPath: target });
  const originalLock = lock(sourcePath);
  const redirectedLock = lock(alternate);
  fs.writeFileSync(bankLock, originalLock);
  fs.writeFileSync(sourceLock, originalLock);
  fs.writeFileSync(alternateLock, redirectedLock);
  const preview = service.preview({ action: 'recover' });
  assert.equal(preview.result.action, 'remove-stale-lock');
  const nativeRead = fs.readFileSync;
  let fired = false;
  fs.readFileSync = function (requested, ...args) {
    const bytes = nativeRead.call(fs, requested, ...args);
    if (!fired && requested === bankLock && new Error().stack.includes('at fileHash')) {
      fired = true;
      fs.writeFileSync(bankLock, redirectedLock);
    }
    return bytes;
  };
  try { assert.throws(() => service.commit(preview.ticket), /lock.*changed|changed.*preview/i); }
  finally { fs.readFileSync = nativeRead; }
  assert.equal(fired, true);
  assert.equal(fs.readFileSync(bankLock, 'utf8'), redirectedLock);
  assert.equal(fs.readFileSync(sourceLock, 'utf8'), originalLock);
  assert.equal(fs.readFileSync(alternateLock, 'utf8'), redirectedLock);
  assert.equal(fs.existsSync(bankPath), false);
});

test('rollback validates the exact restoration buffers when a backup changes after journal validation', t => {
  const { sourcePath, bankPath } = setup(t);
  fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const committed = depositItem({ bankPath, sourcePath, pageIndex: 1, itemIndex: 0, dryRun: false });
  const journalFile = bankPath + '.journal.json';
  const journal = JSON.parse(fs.readFileSync(path.join(bankPath + '.transactions', committed.transactionId, 'committed.json'), 'utf8'));
  fs.writeFileSync(journalFile, JSON.stringify({ ...journal, status: 'prepared' }));
  const sourceAfter = fs.readFileSync(sourcePath);
  const bankAfter = fs.readFileSync(bankPath);
  // The save buffer can already be validated when the later bank backup fails.
  // Neither target may change until every restoration buffer is proven.
  const backupPath = journal.entries[1].backupPath;
  const corrupted = Buffer.from(fs.readFileSync(backupPath));
  corrupted[20] ^= 1;
  const nativeRead = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = function (requested, ...args) {
    const bytes = nativeRead.call(fs, requested, ...args);
    if (requested === backupPath && new Error().stack.includes('at validateJournal') && ++reads === 2) {
      fs.writeFileSync(backupPath, corrupted);
    }
    return bytes;
  };
  try { assert.throws(() => recoverBank({ bankPath, dryRun: false }), /backup changed before restoration/i); }
  finally { fs.readFileSync = nativeRead; }
  assert.equal(reads, 2, 'the backup must change after the final journal validation read');
  assert.deepEqual(fs.readFileSync(sourcePath), sourceAfter);
  assert.deepEqual(fs.readFileSync(bankPath), bankAfter);
  assert.equal(fs.existsSync(journalFile), true);
  assert.equal(fs.existsSync(bankPath + '.lock'), false);
  assert.equal(fs.existsSync(sourcePath + '.pd2-mule.lock'), false);
});

test('bank metadata listing honors the captured bank hash before exposing placement metadata', t => {
  const { bankPath } = setup(t);
  const original = JSON.stringify({ schemaVersion: 1, revision: 0, items: [] });
  fs.writeFileSync(bankPath, original);
  const expectedBankSha256 = sha256(Buffer.from(original));
  assert.equal(listBank(bankPath, { expectedBankSha256 }).revision, 0);
  const external = JSON.stringify({ schemaVersion: 1, revision: 7, items: [] });
  fs.writeFileSync(bankPath, external);
  assert.throws(() => listBank(bankPath, { expectedBankSha256 }), /bank.*changed since preview/i);
  assert.equal(fs.readFileSync(bankPath, 'utf8'), external);
});

test('recovery authorizes the exact lock bytes it hashed rather than transient metadata from another save', t => {
  const { directory, sourcePath, bankPath, service } = setup(t);
  const alternate = path.join(directory, 'unloaded.d2x');
  fs.copyFileSync(sourcePath, alternate);
  const bankLock = bankPath + '.lock';
  const lock = target => JSON.stringify({ pid: 2147483647, token: 'stale-review-lock', bankPath, stashPath: target });
  const original = lock(alternate);
  const transient = lock(sourcePath);
  fs.writeFileSync(bankLock, original);
  const nativeRead = fs.readFileSync;
  let fired = false;
  fs.readFileSync = function (requested, ...args) {
    const bytes = nativeRead.call(fs, requested, ...args);
    const stack = new Error().stack;
    if (!fired && requested === bankLock && stack.includes('mule-service.mjs') && !stack.includes('at fileHash')) {
      fired = true;
      return typeof bytes === 'string' ? transient : Buffer.from(transient);
    }
    return bytes;
  };
  try { assert.throws(() => service.preview({ action: 'recover' }), /changed/i); }
  finally { fs.readFileSync = nativeRead; }
  assert.equal(fired, true, 'the metadata read must occur after the initial lock hash');
  assert.equal(fs.readFileSync(bankLock, 'utf8'), original);
  assert.equal(fs.existsSync(bankPath), false);
});
