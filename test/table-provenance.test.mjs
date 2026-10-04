import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { loadPd2Tables, getPd2TableProvenance, assertPd2TablesCurrent } from '../src/lib/pd2-data.mjs';
import { depositItem, withdrawItem, listBank, recoverBank } from '../src/lib/item-bank.mjs';
import { createMuleService } from '../src/lib/mule-service.mjs';
import { loadInspectorWorkspace, getItemKey } from '../src/lib/inspector-model.mjs';
import { collectBrowseEntries } from '../src/lib/browser-index.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { extractStashItem } from '../src/lib/safe-serialization.mjs';
import { prepareGameAcceptance } from '../src/lib/game-acceptance.mjs';
import { verifyGameAcceptance } from '../src/lib/game-acceptance-verification.mjs';
import { getDefaultPd2DataDir, getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_TABLES = getDefaultPd2DataDir();
const FIXTURES = getFixtureLibraryDir();
const PARSED_FILES = ['armor.txt', 'weapons.txt', 'Misc.txt', 'ItemStatCost.txt', 'Skills.txt', 'MonStats.txt'];
const LEGACY_FILES = ['ItemStatCost.txt', 'Misc.txt', 'armor.txt', 'weapons.txt'];
const STALE = /PD2 tables.*reload/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function files(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) return [[file, fs.readlinkSync(file)]];
    return entry.isDirectory() ? files(file) : [[file, hash(fs.readFileSync(file))]];
  });
}

const canonicalHashes = files(CANONICAL_TABLES);
const canonicalSaveHash = hash(fs.readFileSync(path.join(FIXTURES, 'Bases.d2x')));

function setup(t) {
  const directory = fs.mkdtempSync(path.join(REPO, '.table-provenance-test-'));
  t.after(() => {
    try {
      assert.deepEqual(files(CANONICAL_TABLES), canonicalHashes);
      assert.equal(hash(fs.readFileSync(path.join(FIXTURES, 'Bases.d2x'))), canonicalSaveHash);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const dataDir = path.join(directory, 'tables');
  fs.cpSync(CANONICAL_TABLES, dataDir, { recursive: true });
  const sourcePath = path.join(directory, 'copy.d2x');
  fs.copyFileSync(path.join(FIXTURES, 'Bases.d2x'), sourcePath);
  const bankPath = path.join(directory, 'bank.json');
  return { directory, dataDir, sourcePath, bankPath };
}

function changeDiademWidth(dataDir, width) {
  const file = path.join(dataDir, 'armor.txt');
  const text = fs.readFileSync(file, 'utf8');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const headers = lines[0].split('\t');
  const codeIndex = headers.indexOf('code'), widthIndex = headers.indexOf('invwidth');
  const index = lines.findIndex((line, row) => row > 0 && line.split('\t')[codeIndex] === 'ci3');
  assert.ok(index > 0 && widthIndex >= 0);
  const columns = lines[index].split('\t');
  columns[widthIndex] = String(width);
  lines[index] = columns.join('\t');
  fs.writeFileSync(file, lines.join(newline));
}

function legacyFingerprint(tables) {
  const byName = new Map(getPd2TableProvenance(tables).map(entry => [entry.fileName, entry.sha256]));
  return hash(Buffer.from(JSON.stringify(LEGACY_FILES.map(file => ({ file, sha256: byName.get(file) })))));
}

function assertEntryStale({ directory, sourcePath, bankPath }, tables) {
  const before = files(directory);
  for (const dryRun of [true, false]) {
    assert.throws(() => depositItem({ bankPath, sourcePath, pageIndex: 1, itemIndex: 0, dryRun, pd2Tables: tables }), STALE);
    assert.deepEqual(files(directory), before, 'stale entry must reject before locks, metadata, or saves change');
  }
}

test('loaded provenance hashes the six actual parse buffers and exposes an immutable private snapshot', t => {
  const setupFiles = setup(t);
  const { dataDir } = setupFiles;
  const originalArmor = fs.readFileSync(path.join(dataDir, 'armor.txt'));
  const nativeRead = fs.readFileSync;
  let intercepted = false;
  let tables;
  fs.readFileSync = function (requested, ...args) {
    const result = nativeRead.call(fs, requested, ...args);
    if (!intercepted && requested === path.join(dataDir, 'armor.txt')) {
      intercepted = true;
      changeDiademWidth(dataDir, 3);
    }
    return result;
  };
  try { tables = loadPd2Tables(dataDir); }
  finally { fs.readFileSync = nativeRead; }
  assert.equal(intercepted, true, 'the real armor read must be intercepted');
  assert.equal(tables.resolveItemCode('ci3').invWidth, 2, 'the loader parsed the returned old buffer');
  const provenance = getPd2TableProvenance(tables);
  assert.deepEqual(provenance.map(entry => entry.fileName), PARSED_FILES);
  assert.equal(provenance.find(entry => entry.fileName === 'armor.txt').sha256, hash(originalArmor));
  assert.notEqual(hash(fs.readFileSync(path.join(dataDir, 'armor.txt'))), hash(originalArmor));
  assert.ok(Object.isFrozen(provenance));
  assert.ok(provenance.every(entry => Object.isFrozen(entry)));
  assert.throws(() => provenance.push({ fileName: 'forged', sha256: '0'.repeat(64) }), TypeError);
  assert.throws(() => { provenance[0].sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => assertPd2TablesCurrent(tables), STALE);
  assertEntryStale(setupFiles, tables);
  const fresh = loadPd2Tables(dataDir);
  assert.equal(fresh.resolveItemCode('ci3').invWidth, 3);
  assert.deepEqual(assertPd2TablesCurrent(fresh), getPd2TableProvenance(fresh));
});

test('stale item, skill, and monster tables reject transfer previews and commits before any writes', t => {
  const state = setup(t);
  for (const name of ['armor.txt', 'Skills.txt', 'MonStats.txt']) {
    const tables = loadPd2Tables(state.dataDir);
    const file = path.join(state.dataDir, name);
    const original = fs.readFileSync(file);
    if (name === 'armor.txt') changeDiademWidth(state.dataDir, 3);
    else fs.appendFileSync(file, '\n');
    assertEntryStale(state, tables);
    fs.writeFileSync(file, original);
    assert.doesNotThrow(() => assertPd2TablesCurrent(tables));
  }
});

test('captured paths reject missing files, mutable dataDir changes, and retargeted directory symlinks', t => {
  const { directory, dataDir } = setup(t);
  const tables = loadPd2Tables(dataDir);
  const missing = path.join(dataDir, 'Skills.txt');
  const bytes = fs.readFileSync(missing);
  fs.unlinkSync(missing);
  assert.throws(() => assertPd2TablesCurrent(tables), STALE);
  fs.writeFileSync(missing, bytes);
  const relocated = path.join(directory, 'relocated-tables');
  fs.cpSync(dataDir, relocated, { recursive: true });
  tables.dataDir = relocated;
  assert.throws(() => assertPd2TablesCurrent(tables), STALE);
  const fresh = loadPd2Tables(relocated);
  assert.doesNotThrow(() => assertPd2TablesCurrent(fresh));
  assert.equal(legacyFingerprint(fresh), legacyFingerprint(loadPd2Tables(dataDir)));
  const alias = path.join(directory, 'table-alias');
  fs.symlinkSync(dataDir, alias, 'dir');
  const linked = loadPd2Tables(alias);
  assert.doesNotThrow(() => assertPd2TablesCurrent(linked));
  fs.unlinkSync(alias);
  fs.symlinkSync(relocated, alias, 'dir');
  assert.throws(() => assertPd2TablesCurrent(linked), STALE);
  const originalPaths = loadPd2Tables(dataDir);
  fs.unlinkSync(missing);
  fs.symlinkSync(path.join(relocated, 'Skills.txt'), missing);
  assert.throws(() => assertPd2TablesCurrent(originalPaths), STALE);
});

test('unproven table clones remain usable for inspection but cannot authorize transfers', t => {
  const state = setup(t);
  const loaded = loadPd2Tables(state.dataDir);
  const unproven = { ...loaded, provenance: getPd2TableProvenance(loaded) };
  const inspected = inspectSaveFile(state.sourcePath, { pd2Tables: unproven });
  assert.equal(inspected.totalItems, 2586);
  assert.equal(inspected.pages[1].topLevelItems[0].code, 'ci3');
  assert.throws(() => getPd2TableProvenance(unproven), STALE);
  assert.throws(() => assertPd2TablesCurrent(unproven), STALE);
  assertEntryStale(state, unproven);
});

test('ordinary transfers preserve the exact legacy four-file fingerprint and old schema-one banks remain usable', t => {
  const { directory, dataDir, sourcePath, bankPath } = setup(t);
  const tables = loadPd2Tables(dataDir);
  const before = fs.readFileSync(sourcePath);
  const parsed = inspectSaveFile(sourcePath, { pd2Tables: tables });
  const extracted = extractStashItem(before, parsed, { pageIndex: 1, itemIndex: 0 });
  const expected = hash(Buffer.from(JSON.stringify(LEGACY_FILES.map(file => ({
    file, sha256: hash(fs.readFileSync(path.join(dataDir, file)))
  })))));
  const deposited = depositItem({ bankPath, sourcePath, pageIndex: 1, itemIndex: 0, dryRun: false, pd2Tables: tables });
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  assert.equal(bank.schemaVersion, 1);
  assert.equal(bank.items[0].tableFingerprint, expected);
  assert.equal(bank.items[0].invWidth, 2);
  assert.deepEqual(Buffer.from(bank.items[0].bytesBase64, 'base64'), extracted.bytes);
  const monstersFile = path.join(dataDir, 'MonStats.txt');
  const originalMonsters = fs.readFileSync(monstersFile);
  fs.appendFileSync(monstersFile, '\n');
  const beforeRefusal = files(directory);
  for (const dryRun of [true, false]) {
    assert.throws(() => withdrawItem({ bankPath, destinationPath: sourcePath, pageIndex: 0,
      itemId: deposited.itemId, column: 0, row: 0, dryRun, pd2Tables: tables }), STALE);
    assert.deepEqual(files(directory), beforeRefusal);
  }
  fs.writeFileSync(monstersFile, originalMonsters);
  withdrawItem({ bankPath, destinationPath: sourcePath, pageIndex: 0, itemId: deposited.itemId,
    column: 0, row: 0, dryRun: false, pd2Tables: tables });
  assert.equal(listBank(bankPath).items.length, 0);
  const moved = inspectSaveFile(sourcePath, { pd2Tables: tables }).pages[0].topLevelItems[0];
  assert.equal(moved.code, 'ci3');
  assert.equal(moved.invWidth, 2);

  // The historical bank shape had only the required byte/tree/profile fields;
  // dimension metadata is optional for explicit placement.
  fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [{
    id: 'legacy-entry', sha256: extracted.sha256, tableFingerprint: expected,
    bytesBase64: extracted.bytes.toString('base64'), nodeCount: 1, code: 'ci3'
  }] }));
  const relocated = path.join(directory, 'relocated-tables');
  fs.cpSync(dataDir, relocated, { recursive: true });
  const freshRelocatedTables = loadPd2Tables(relocated);
  withdrawItem({ bankPath, destinationPath: sourcePath, pageIndex: 0, itemId: 'legacy-entry',
    column: 3, row: 0, dryRun: false, pd2Tables: freshRelocatedTables });
  assert.equal(listBank(bankPath).items.length, 0);
  assert.deepEqual(inspectSaveFile(sourcePath, { pd2Tables: tables }).pages[0].topLevelItems.map(item => item.code), ['ci3', 'ci3']);
});

test('table changes between browser preview and commit invalidate the ticket without changing saves or bank metadata', t => {
  const { directory, dataDir, sourcePath, bankPath } = setup(t);
  const tables = loadPd2Tables(dataDir);
  const workspace = loadInspectorWorkspace([sourcePath], { pd2Tables: tables });
  const service = createMuleService(workspace, { bankPath, experimentalWrite: true });
  const entry = collectBrowseEntries(workspace.sources[0].summary).find(item => item.pageIndex === 1 && item.itemIndex === 0);
  const preview = service.preview({ action: 'deposit', sourceId: workspace.sources[0].id, itemKey: getItemKey(entry) });
  assert.equal(preview.result.dryRun, true);
  changeDiademWidth(dataDir, 3);
  const before = files(directory);
  assert.throws(() => service.commit(preview.ticket), STALE);
  assert.deepEqual(files(directory), before);
  assert.equal(fs.existsSync(bankPath), false);
});

test('acceptance preparation and verification reject stale loaded tables without creating or changing artifacts', t => {
  const { directory, dataDir } = setup(t);
  const tables = loadPd2Tables(dataDir);
  const packDir = path.join(directory, 'pack');
  const manifest = prepareGameAcceptance({ outputDir: packDir, pd2Tables: tables });
  const resultsDir = path.join(directory, 'results');
  for (const entry of manifest.scenarios) for (const name of [entry.characterFile, entry.stashFile]) {
    const file = path.join(resultsDir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(path.join(packDir, name), file);
  }
  fs.appendFileSync(path.join(dataDir, 'Skills.txt'), '\n');
  const before = files(directory);
  const outputDir = path.join(directory, 'refused-pack');
  assert.throws(() => prepareGameAcceptance({ outputDir, pd2Tables: tables }), STALE);
  assert.equal(fs.existsSync(outputDir), false);
  assert.throws(() => verifyGameAcceptance({ packDir, resultsDir, pd2Tables: tables }), STALE);
  assert.deepEqual(files(directory), before);
});

test('a table change after journal preparation refuses replacement and leaves recoverable evidence', t => {
  const { dataDir, sourcePath, bankPath } = setup(t);
  const tables = loadPd2Tables(dataDir);
  const original = fs.readFileSync(sourcePath);
  const nativeOpen = fs.openSync, nativeWrite = fs.writeFileSync;
  let journalDescriptor, fired = false;
  fs.openSync = function (file, ...args) {
    const descriptor = nativeOpen.call(fs, file, ...args);
    if (file === bankPath + '.journal.json') journalDescriptor = descriptor;
    return descriptor;
  };
  fs.writeFileSync = function (file, ...args) {
    const result = nativeWrite.call(fs, file, ...args);
    if (!fired && file === journalDescriptor) {
      fired = true;
      fs.appendFileSync(path.join(dataDir, 'Skills.txt'), '\n');
    }
    return result;
  };
  try {
    assert.throws(() => depositItem({ bankPath, sourcePath, pageIndex: 1, itemIndex: 0,
      dryRun: false, pd2Tables: tables }), STALE);
  } finally { fs.openSync = nativeOpen; fs.writeFileSync = nativeWrite; }
  assert.equal(fired, true, 'the table change must occur after the prepared journal is written');
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.existsSync(bankPath), false);
  assert.equal(fs.existsSync(bankPath + '.lock'), false);
  assert.equal(fs.existsSync(sourcePath + '.pd2-mule.lock'), false);
  const journal = JSON.parse(fs.readFileSync(bankPath + '.journal.json', 'utf8'));
  assert.equal(journal.status, 'prepared');
  assert.equal(journal.entries[0].beforeSha256, hash(original));
  assert.deepEqual(fs.readFileSync(journal.entries[0].backupPath), original);
  const recovery = recoverBank({ bankPath, dryRun: false });
  assert.equal(recovery.recovered, true);
  assert.deepEqual(fs.readFileSync(sourcePath), original);
  assert.equal(fs.existsSync(bankPath), false);
  assert.equal(fs.existsSync(bankPath + '.journal.json'), false);
});
