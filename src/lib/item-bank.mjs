import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectSaveFile } from './save-parsers.mjs';
import { getFixtureLibraryDir, getWorkspaceRoot } from './workspace-paths.mjs';
import { loadPd2Tables } from './pd2-data.mjs';
import { extractStashItem, removeStashItem, insertStashItem, inspectTransferSupport, sha256, TRANSFER_STATUS } from './safe-serialization.mjs';

const emptyBank = () => ({ schemaVersion: 1, revision: 0, items: [] });
const readBytes = (file) => fs.existsSync(file) ? fs.readFileSync(file) : null;
const hashOrNull = (bytes) => bytes === null ? null : sha256(bytes);

function tableFingerprint(tables) {
  const files = ['ItemStatCost.txt', 'Misc.txt', 'armor.txt', 'weapons.txt'];
  return sha256(Buffer.from(JSON.stringify(files.map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(tables.dataDir, file))) })))));
}

function resolvedPath(file) {
  const absolute = path.resolve(file);
  try {
    if (fs.lstatSync(absolute).isSymbolicLink()) throw new Error('Symbolic link targets are not supported');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (fs.existsSync(absolute)) {
    return fs.realpathSync.native(absolute);
  }
  return path.join(fs.realpathSync.native(path.dirname(absolute)), path.basename(absolute));
}

function guardPath(file) {
  const resolved = resolvedPath(file);
  if (fs.existsSync(resolved) && fs.statSync(resolved).nlink > 1) throw new Error('Hardlinked targets are not supported; use an independent disposable copy');
  const roots = [
    path.dirname(getFixtureLibraryDir()),
    path.join(getWorkspaceRoot(), 'Diablo II', 'Save'),
    path.join(getWorkspaceRoot(), 'Diablo II', 'ProjectD2', 'Save'),
    path.join(getWorkspaceRoot(), 'PD2-Singleplayer', 'Diablo II', 'ProjectD2', 'Save')
  ];
  const candidate = resolved.toLowerCase();
  for (const root of roots) {
    const protectedRoot = (fs.existsSync(root) ? fs.realpathSync.native(root) : path.resolve(root)).toLowerCase();
    if (candidate === protectedRoot || candidate.startsWith(protectedRoot + path.sep)) throw new Error('Original game saves and fixture files are protected; use a disposable copy outside the game Save directory');
  }
  return resolved;
}

function assertMetadataPath(file) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink() || stat.nlink > 1 && !stat.isDirectory()) throw new Error('Linked bank metadata is not supported');
}

function guardMetadata(bankPath) {
  for (const suffix of ['.lock', '.journal.json', '.transactions']) assertMetadataPath(bankPath + suffix);
}

function validateBank(value) {
  if (value.schemaVersion !== 1 || !Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.items)) throw new Error('Invalid bank format');
  const ids = new Set();
  for (const item of value.items) {
    if (typeof item.id !== 'string' || ids.has(item.id) || typeof item.bytesBase64 !== 'string' || !Number.isInteger(item.nodeCount) || item.nodeCount < 1 || item.nodeCount > 7 || typeof item.tableFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(item.tableFingerprint)) throw new Error('Invalid bank item or missing table provenance');
    const bytes = Buffer.from(item.bytesBase64, 'base64');
    if (bytes.toString('base64') !== item.bytesBase64 || sha256(bytes) !== item.sha256) throw new Error('Bank item checksum mismatch');
    ids.add(item.id);
  }
  return value;
}

function readBank(file) {
  const bytes = readBytes(file);
  return { bytes, bank: bytes === null ? emptyBank() : validateBank(JSON.parse(bytes.toString('utf8'))) };
}

export function listBank(bankPath) {
  const file = resolvedPath(bankPath);
  guardMetadata(file);
  if (fs.existsSync(file + '.journal.json')) throw new Error('An interrupted transaction requires bank recover before listing items');
  const { bank } = readBank(file);
  return { ...bank, items: bank.items.map(({ bytesBase64, ...item }) => item) };
}

function durableWrite(file, bytes, exclusive = false) {
  const fd = fs.openSync(file, exclusive ? 'wx' : 'w');
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function replaceFile(file, bytes) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    durableWrite(temporary, bytes, true);
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function lockResource(lock, bankPath, stashPath) {
  assertMetadataPath(lock);
  const token = randomUUID();
  try { durableWrite(lock, JSON.stringify({ pid: process.pid, token, bankPath, stashPath: stashPath ?? null, createdAt: new Date().toISOString() }), true); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Bank is locked by another operation; recover a stale lock before continuing'); throw error; }
  return () => {
    if (!fs.existsSync(lock) || JSON.parse(fs.readFileSync(lock, 'utf8')).token !== token) throw new Error('Operation lock changed unexpectedly');
    fs.unlinkSync(lock);
  };
}

function lockOperation(bankPath, stashPath) {
  const locks = [bankPath + '.lock', ...(stashPath ? [stashPath + '.pd2-mule.lock'] : [])].sort();
  const releases = [];
  try {
    for (const lock of locks) releases.push(lockResource(lock, bankPath, stashPath));
  } catch (error) {
    for (const release of releases.reverse()) release();
    throw error;
  }
  return () => { for (const release of releases.reverse()) release(); };
}

function ensureNoPending(file) {
  if (fs.existsSync(file + '.journal.json')) throw new Error('An interrupted transaction requires bank recover before another operation');
}

function checkDifferentFiles(first, second) {
  if (first.toLowerCase() === second.toLowerCase()) throw new Error('Bank and stash must be different files');
  if (fs.existsSync(first) && fs.existsSync(second)) {
    const a = fs.statSync(first); const b = fs.statSync(second);
    if (a.dev === b.dev && a.ino === b.ino) throw new Error('Bank and stash must not be aliases of the same file');
  }
}

function verifyResult(bytes, extension, pageIndex, expectedCount, tables) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pd2-bank-verify-'));
  const file = path.join(directory, `verify${extension}`);
  try {
    fs.writeFileSync(file, bytes);
    const parsed = inspectSaveFile(file, { pd2Tables: tables });
    if (parsed.pages?.[pageIndex]?.itemCount !== expectedCount) throw new Error('Serialized stash count verification failed');
    const support = inspectTransferSupport(bytes, parsed)[pageIndex];
    if (!support?.supported) throw new Error(`Serialized stash verification failed: ${support?.reason ?? 'missing page'}`);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function transact(bankPath, stashPath, bankBefore, bankAfter, stashBefore, stashAfter, result) {
  if (hashOrNull(readBytes(bankPath)) !== hashOrNull(bankBefore) || hashOrNull(readBytes(stashPath)) !== sha256(stashBefore)) throw new Error('Bank or stash changed during planning');
  const transactionId = randomUUID();
  const directory = path.join(bankPath + '.transactions', transactionId);
  guardMetadata(bankPath);
  fs.mkdirSync(bankPath + '.transactions', { recursive: true });
  fs.mkdirSync(directory);
  const entries = [
    { path: stashPath, before: stashBefore, after: stashAfter, label: 'stash' },
    { path: bankPath, before: bankBefore, after: bankAfter, label: 'bank' }
  ].map((entry) => {
    const backupPath = path.join(directory, `${entry.label}.before`);
    if (entry.before !== null) durableWrite(backupPath, entry.before, true);
    return { path: entry.path, beforeSha256: hashOrNull(entry.before), afterSha256: sha256(entry.after), backupPath: entry.before === null ? null : backupPath };
  });
  const journalPath = bankPath + '.journal.json';
  const journal = { schemaVersion: 1, transactionId, bankPath, entries, status: 'prepared' };
  durableWrite(journalPath, JSON.stringify(journal, null, 2), true);
  // Flush backup and journal contents before mutation. Directory and power-loss durability are unverified.
  if (hashOrNull(readBytes(bankPath)) !== hashOrNull(bankBefore) || hashOrNull(readBytes(stashPath)) !== sha256(stashBefore)) throw new Error('Bank or stash changed before transaction commit');
  replaceFile(stashPath, stashAfter);
  if (hashOrNull(readBytes(bankPath)) !== hashOrNull(bankBefore) || hashOrNull(readBytes(stashPath)) !== sha256(stashAfter)) throw new Error('Bank or stash changed during transaction commit; recovery is required');
  replaceFile(bankPath, bankAfter);
  journal.status = 'committed';
  replaceFile(journalPath, Buffer.from(JSON.stringify(journal, null, 2)));
  fs.renameSync(journalPath, path.join(directory, 'committed.json'));
  return { ...result, transactionId, backupPaths: entries.map((entry) => entry.backupPath).filter(Boolean) };
}

function operation(options, type) {
  const { dryRun = true, pd2Tables = loadPd2Tables() } = options;
  const bankPath = guardPath(options.bankPath);
  const stashPath = guardPath(type === 'deposit' ? options.sourcePath : options.destinationPath);
  guardMetadata(bankPath);
  checkDifferentFiles(bankPath, stashPath);
  ensureNoPending(bankPath);
  const unlock = dryRun ? null : lockOperation(bankPath, stashPath);
  try {
    ensureNoPending(bankPath);
    const { bytes: bankBefore, bank } = readBank(bankPath);
    const tablesHash = tableFingerprint(pd2Tables);
    const stashBefore = fs.readFileSync(stashPath);
    const save = inspectSaveFile(stashPath, { pd2Tables });
    if (!save.pages) throw new Error('Only PlugY stash transfers are supported');
    const page = save.pages[options.pageIndex];
    if (!page) throw new Error('Invalid pageIndex');
    let changed; let itemId; let nodeCount;
    const nextBank = { ...bank, revision: bank.revision + 1, items: [...bank.items] };
    if (type === 'deposit') {
      const extracted = extractStashItem(stashBefore, save, options);
      changed = removeStashItem(stashBefore, save, options);
      itemId = randomUUID(); nodeCount = extracted.nodeCount;
      nextBank.items.push({ id: itemId, sha256: extracted.sha256, tableFingerprint: tablesHash, bytesBase64: extracted.bytes.toString('base64'), nodeCount, code: extracted.item.code, displayName: extracted.item.displayName, baseName: extracted.item.baseName ?? extracted.item.itemInfo?.name, quality: extracted.item.qualityLabel, source: { fileName: path.basename(stashPath), pageName: page.name, pageIndex: options.pageIndex, itemIndex: options.itemIndex }, depositedAt: new Date().toISOString() });
    } else {
      const index = bank.items.findIndex((item) => item.id === options.itemId);
      if (index < 0) throw new Error('Bank item not found');
      const item = bank.items[index];
      if (item.tableFingerprint !== tablesHash) throw new Error('Bank item table profile differs from the active PD2 tables; withdrawal refused');
      itemId = item.id; nodeCount = item.nodeCount;
      changed = insertStashItem(stashBefore, save, { ...options, itemBytes: Buffer.from(item.bytesBase64, 'base64'), nodeCount, pd2Tables });
      nextBank.items.splice(index, 1);
    }
    // PlugY's header counts root items; socket children travel with their root
    // but do not contribute to the page's declared item count.
    const expectedCount = page.itemCount + (type === 'deposit' ? -1 : 1);
    verifyResult(changed.buffer, path.extname(stashPath), options.pageIndex, expectedCount, pd2Tables);
    if (tableFingerprint(pd2Tables) !== tablesHash) throw new Error('PD2 tables changed during planning');
    const result = { dryRun, operation: type, itemId, bankItemCountBefore: bank.items.length, bankItemCountAfter: nextBank.items.length, stashItemCountBefore: page.topLevelItems.length, stashItemCountAfter: page.topLevelItems.length + (type === 'deposit' ? -1 : 1), status: TRANSFER_STATUS };
    if (dryRun) {
      if (hashOrNull(readBytes(bankPath)) !== hashOrNull(bankBefore) || hashOrNull(readBytes(stashPath)) !== sha256(stashBefore)) throw new Error('Bank or stash changed during preview');
      return result;
    }
    return transact(bankPath, stashPath, bankBefore, Buffer.from(JSON.stringify(nextBank, null, 2) + '\n'), stashBefore, changed.buffer, result);
  } finally { unlock?.(); }
}

export function depositItem(options) { return operation(options, 'deposit'); }
export function withdrawItem(options) { return operation(options, 'withdraw'); }

function staleLock(lockPath, bankPath, requireOwner = false) {
  assertMetadataPath(lockPath);
  const bytes = readBytes(lockPath);
  if (bytes === null) return null;
  const lock = JSON.parse(bytes.toString('utf8'));
  if (!Number.isInteger(lock.pid) || lock.pid < 1 || requireOwner && lock.bankPath !== bankPath || lock.bankPath && lock.bankPath !== bankPath) throw new Error('Invalid operation lock owner');
  let alive = true;
  try { process.kill(lock.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
  if (alive) throw new Error('Bank or stash is locked by an active operation');
  return { lockPath, bytes, lock };
}

function clearStaleLock(stale) {
  if (!stale) return;
  assertMetadataPath(stale.lockPath);
  if (hashOrNull(readBytes(stale.lockPath)) !== sha256(stale.bytes)) throw new Error('Operation lock changed during recovery');
  fs.unlinkSync(stale.lockPath);
}

function validateJournal(bankPath, journal) {
  if (journal.schemaVersion !== 1 || journal.bankPath !== bankPath || !Array.isArray(journal.entries) || journal.entries.length !== 2 || !['prepared', 'committed'].includes(journal.status)) throw new Error('Invalid transaction journal');
  if (typeof journal.transactionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(journal.transactionId)) throw new Error('Invalid transaction id');
  const directory = path.join(bankPath + '.transactions', journal.transactionId);
  assertMetadataPath(directory);
  if (journal.entries[1]?.path !== bankPath) throw new Error('Journal bank target does not match the selected bank');
  const stashPath = journal.entries[0]?.path;
  if (typeof stashPath !== 'string' || !['.d2x', '.sss'].includes(path.extname(stashPath).toLowerCase())) throw new Error('Invalid journal stash target');
  checkDifferentFiles(bankPath, stashPath);
  for (const [index, entry] of journal.entries.entries()) {
    if (guardPath(entry.path) !== entry.path) throw new Error('Transaction target changed');
    const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    if (!isHash(entry.afterSha256) || !(isHash(entry.beforeSha256) || index === 1 && entry.beforeSha256 === null)) throw new Error('Invalid transaction checksum');
    const expectedBackup = entry.beforeSha256 === null ? null : path.join(directory, index === 0 ? 'stash.before' : 'bank.before');
    if (entry.backupPath !== expectedBackup) throw new Error('Invalid recovery backup path');
    if (expectedBackup !== null) {
      assertMetadataPath(expectedBackup);
      if (hashOrNull(readBytes(expectedBackup)) !== entry.beforeSha256) throw new Error('Recovery backup is missing or corrupted');
    }
    const currentHash = hashOrNull(readBytes(entry.path));
    if (![entry.beforeSha256, entry.afterSha256].includes(currentHash)) throw new Error('Recovery refused: a transaction file was externally modified');
    if (journal.status === 'committed' && currentHash !== entry.afterSha256) throw new Error('Committed transaction contents changed');
  }
  return { directory, stashPath };
}

export function recoverBank({ bankPath: requestedBankPath, dryRun = true }) {
  const bankPath = guardPath(requestedBankPath);
  guardMetadata(bankPath);
  const bankLock = staleLock(bankPath + '.lock', bankPath);
  const journalPath = bankPath + '.journal.json';
  const journalBytes = readBytes(journalPath);
  const journal = journalBytes === null ? null : JSON.parse(journalBytes.toString('utf8'));
  const validated = journal === null ? null : validateJournal(bankPath, journal);
  const stashPath = validated?.stashPath ?? bankLock?.lock.stashPath ?? null;
  if (stashPath && guardPath(stashPath) !== stashPath) throw new Error('Invalid stale lock stash target');
  const stashLock = stashPath ? staleLock(stashPath + '.pd2-mule.lock', bankPath, true) : null;
  const result = { dryRun, operation: 'recover', recovered: false, ...(journal ? { transactionId: journal.transactionId, action: journal.status === 'committed' ? 'finalize' : 'rollback' } : { status: 'No interrupted transaction', ...(bankLock || stashLock ? { action: 'remove-stale-lock' } : {}) }) };
  if (dryRun) return result;
  clearStaleLock(bankLock);
  clearStaleLock(stashLock);
  const unlock = lockOperation(bankPath, stashPath);
  try {
    guardMetadata(bankPath);
    if (hashOrNull(readBytes(journalPath)) !== hashOrNull(journalBytes)) throw new Error('Transaction journal changed during recovery');
    if (journal === null) return { ...result, recovered: Boolean(bankLock || stashLock) };
    validateJournal(bankPath, journal);
    if (journal.status === 'prepared') {
      // Revalidation after acquiring both locks prevents another bank from
      // changing the same stash between recovery preview and restoration.
      for (const entry of journal.entries) {
        if (entry.beforeSha256 === null) { if (fs.existsSync(entry.path)) fs.unlinkSync(entry.path); }
        else replaceFile(entry.path, fs.readFileSync(entry.backupPath));
      }
    }
    fs.renameSync(journalPath, path.join(validated.directory, journal.status === 'committed' ? 'committed.json' : 'recovered.json'));
    return { ...result, recovered: true };
  } finally { unlock(); }
}
