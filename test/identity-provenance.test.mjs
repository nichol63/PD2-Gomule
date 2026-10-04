import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { loadPd2Tables, getPd2TableProvenance } from '../src/lib/pd2-data.mjs';
import { loadItemIdentityTables, getItemIdentityTableProvenance, assertItemIdentityTablesCurrent } from '../src/lib/item-identity.mjs';
import { depositItem, withdrawItem, listBank, recoverBank } from '../src/lib/item-bank.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { prepareGameAcceptance } from '../src/lib/game-acceptance.mjs';
import { verifyGameAcceptance } from '../src/lib/game-acceptance-verification.mjs';
import { getDefaultPd2DataDir, getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = getDefaultPd2DataDir(), FIXTURES = getFixtureLibraryDir();
const BOW = path.join(FIXTURES, 'Showcase Characters/amazon/freezing-arrow.d2s');
const BASES = path.join(FIXTURES, 'Bases.d2x');
const TOME = path.join(FIXTURES, 'Blank Characters/Level 30s/Amazon.d2s');
const IDENTITY_FILES = ['armor.txt', 'weapons.txt', 'Misc.txt', 'UniqueItems.txt', 'SetItems.txt', 'Runes.txt', 'ItemTypes.txt'];
const OPTIONAL_FILES = IDENTITY_FILES.slice(3);
const LEGACY_FILES = ['ItemStatCost.txt', 'Misc.txt', 'armor.txt', 'weapons.txt'];
const STALE = /PD2.*tables.*reload/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function snapshot(root) {
  return fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) return [[file, fs.readlinkSync(file)]];
    return entry.isDirectory() ? snapshot(file) : [[file, hash(fs.readFileSync(file))]];
  });
}

const canonicalTables = snapshot(TABLES);
const canonicalSaves = [BOW, BASES, TOME].map(file => [file, hash(fs.readFileSync(file))]);

function setup(t) {
  const directory = fs.mkdtempSync(path.join(REPO, '.identity-provenance-test-'));
  t.after(() => {
    try {
      assert.deepEqual(snapshot(TABLES), canonicalTables);
      assert.deepEqual([BOW, BASES, TOME].map(file => [file, hash(fs.readFileSync(file))]), canonicalSaves);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const dataDir = path.join(directory, 'tables');
  fs.cpSync(TABLES, dataDir, { recursive: true });
  const sourcePath = path.join(directory, 'freezing-arrow.d2s');
  const destinationPath = path.join(directory, 'landing.d2x');
  fs.copyFileSync(BOW, sourcePath);
  fs.copyFileSync(BASES, destinationPath);
  return { directory, dataDir, sourcePath, destinationPath, bankPath: path.join(directory, 'bank.json') };
}

function renameEdge(dataDir, name = 'EdgeTestRename') {
  const file = path.join(dataDir, 'Runes.txt');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/), header = lines[0].split('\t');
  const nameIndex = header.indexOf('Rune Name');
  const row = lines.findIndex((line, index) => index > 0 && line.split('\t')[nameIndex] === 'Edge');
  assert.ok(row > 0 && nameIndex >= 0, 'the real Edge recipe row must exist');
  const columns = lines[row].split('\t'); columns[nameIndex] = name;
  lines[row] = columns.join('\t');
  fs.writeFileSync(file, lines.join(text.includes('\r\n') ? '\r\n' : '\n'));
}

function selected(state, tables) {
  const save = inspectSaveFile(state.sourcePath, { pd2Tables: tables });
  const itemIndex = save.topLevelItems.findIndex(item => item.code === 'amc' && item.fingerprint === 70879556);
  assert.ok(itemIndex >= 0);
  const item = save.topLevelItems[itemIndex];
  assert.equal(item.panel, 5);
  assert.deepEqual(item.children.map(child => child.code), ['r03', 'r07', 'r11']);
  return { itemIndex, item };
}

function staleEntry(state, tables, itemIndex) {
  const before = snapshot(state.directory);
  for (const dryRun of [true, false]) {
    assert.throws(() => depositItem({ bankPath: state.bankPath, sourcePath: state.sourcePath,
      itemIndex, dryRun, pd2Tables: tables }), STALE);
    assert.deepEqual(snapshot(state.directory), before, 'stale entry must not create locks, metadata, or save changes');
  }
}

function legacyFingerprint(tables) {
  const hashes = new Map(getPd2TableProvenance(tables).map(entry => [entry.fileName, entry.sha256]));
  return hash(Buffer.from(JSON.stringify(LEGACY_FILES.map(file => ({ file, sha256: hashes.get(file) })))));
}

test('identity provenance captures the exact decoded buffers and exposes frozen private metadata', t => {
  const state = setup(t), tables = loadPd2Tables(state.dataDir);
  const originalRunes = fs.readFileSync(path.join(state.dataDir, 'Runes.txt'));
  const nativeRead = fs.readFileSync;
  let intercepted = false, identity;
  fs.readFileSync = function (file, ...args) {
    const bytes = nativeRead.call(fs, file, ...args);
    if (!intercepted && file === path.join(state.dataDir, 'Runes.txt')) {
      intercepted = true;
      renameEdge(state.dataDir);
    }
    return bytes;
  };
  try { identity = loadItemIdentityTables(tables); }
  finally { fs.readFileSync = nativeRead; }
  assert.equal(intercepted, true);
  assert.ok(identity.runewords.some(row => row['Rune Name'] === 'Edge'));
  assert.ok(!identity.runewords.some(row => row['Rune Name'] === 'EdgeTestRename'));
  const provenance = getItemIdentityTableProvenance(tables);
  assert.deepEqual(provenance.map(entry => entry.fileName), IDENTITY_FILES);
  for (const entry of provenance) assert.equal(entry.sha256,
    hash(entry.fileName === 'Runes.txt' ? originalRunes : fs.readFileSync(path.join(state.dataDir, entry.fileName))));
  assert.ok(Object.isFrozen(provenance));
  assert.ok(provenance.every(Object.isFrozen));
  assert.throws(() => { provenance[0].sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => provenance.push({ fileName: 'forged', sha256: null }), TypeError);
  tables.identityProvenance = provenance.map(entry => ({ ...entry }));
  assert.equal(getItemIdentityTableProvenance(tables), provenance);
  assert.throws(() => assertItemIdentityTablesCurrent(tables), STALE);
});

test('a mixed first identity core read is refused even when disk bytes are restored before validation', t => {
  const state = setup(t), tables = loadPd2Tables(state.dataDir);
  const armorFile = path.join(state.dataDir, 'armor.txt'), original = fs.readFileSync(armorFile);
  const nativeRead = fs.readFileSync;
  let intercepted = false, armorReads = 0;
  fs.readFileSync = function (file, ...args) {
    // The first read is the existing loaded-table freshness guard. The second
    // supplies the identity decoder's rows and must be compared before caching.
    if (file === armorFile && ++armorReads === 2) {
      intercepted = true;
      fs.writeFileSync(armorFile, Buffer.concat([original, Buffer.from('\n')]));
      try { return nativeRead.call(fs, file, ...args); }
      finally { fs.writeFileSync(armorFile, original); }
    }
    return nativeRead.call(fs, file, ...args);
  };
  try { assert.throws(() => loadItemIdentityTables(tables), /PD2 item identity tables.*reload/i); }
  finally { fs.readFileSync = nativeRead; }
  assert.equal(intercepted, true);
  assert.deepEqual(fs.readFileSync(armorFile), original);
  assert.doesNotThrow(() => loadItemIdentityTables(tables), 'failed mixed reads must not cache identity rows');
  const coreArmorHash = getPd2TableProvenance(tables).find(entry => entry.fileName === 'armor.txt').sha256;
  assert.equal(getItemIdentityTableProvenance(tables).find(entry => entry.fileName === 'armor.txt').sha256, coreArmorHash);
  assert.doesNotThrow(() => assertItemIdentityTablesCurrent(tables));
});

test('renamed cached Edge rejects previews and commits before writes while a fresh reload stores the new label', t => {
  const state = setup(t), tables = loadPd2Tables(state.dataDir);
  const { itemIndex, item } = selected(state, tables);
  assert.equal(item.displayName, 'Edge');
  const oldFingerprint = legacyFingerprint(tables);
  renameEdge(state.dataDir);
  staleEntry(state, tables, itemIndex);
  const fresh = loadPd2Tables(state.dataDir);
  assert.equal(selected(state, fresh).item.displayName, 'EdgeTestRename');
  assert.equal(legacyFingerprint(fresh), oldFingerprint);
  depositItem({ ...state, itemIndex, dryRun: false, pd2Tables: fresh });
  const bank = JSON.parse(fs.readFileSync(state.bankPath, 'utf8'));
  assert.equal(bank.schemaVersion, 1);
  assert.equal(bank.items[0].displayName, 'EdgeTestRename');
  assert.equal(bank.items[0].tableFingerprint, oldFingerprint);
  assert.equal(bank.items[0].nodeCount, 4);
});

test('all optional file changes and deletions invalidate a populated identity cache', t => {
  const state = setup(t);
  for (const fileName of OPTIONAL_FILES) {
    const tables = loadPd2Tables(state.dataDir);
    const { itemIndex } = selected(state, tables);
    const file = path.join(state.dataDir, fileName), bytes = fs.readFileSync(file);
    fs.appendFileSync(file, '\n');
    assert.throws(() => assertItemIdentityTablesCurrent(tables), STALE);
    staleEntry(state, tables, itemIndex);
    fs.writeFileSync(file, bytes);
    assert.doesNotThrow(() => assertItemIdentityTablesCurrent(tables));
    fs.unlinkSync(file);
    assert.throws(() => assertItemIdentityTablesCurrent(tables), STALE);
    fs.writeFileSync(file, bytes);
  }
});

test('absent optional files retain null provenance and support fallback transfers until a file appears', t => {
  const state = setup(t);
  const originalRunes = fs.readFileSync(path.join(state.dataDir, 'Runes.txt'));
  for (const fileName of OPTIONAL_FILES) fs.unlinkSync(path.join(state.dataDir, fileName));
  const tables = loadPd2Tables(state.dataDir), { itemIndex, item } = selected(state, tables);
  assert.equal(item.displayName, 'Grand Matron Bow');
  assert.equal(item.namedItem, null);
  assert.deepEqual(getItemIdentityTableProvenance(tables).slice(3), OPTIONAL_FILES.map(fileName => ({ fileName, sha256: null })));
  assert.doesNotThrow(() => assertItemIdentityTablesCurrent(tables));
  assert.equal(depositItem({ ...state, itemIndex, pd2Tables: tables }).dryRun, true);
  const deposited = depositItem({ ...state, itemIndex, dryRun: false, pd2Tables: tables });
  withdrawItem({ bankPath: state.bankPath, destinationPath: state.destinationPath, pageIndex: 0,
    itemId: deposited.itemId, column: 0, row: 0, dryRun: false, pd2Tables: tables });
  assert.equal(listBank(state.bankPath).items.length, 0);
  assert.equal(inspectSaveFile(state.destinationPath, { pd2Tables: tables }).pages[0].topLevelItems[0].fingerprint, 70879556);
  fs.writeFileSync(path.join(state.dataDir, 'Runes.txt'), originalRunes);
  assert.throws(() => assertItemIdentityTablesCurrent(tables), STALE);
  const before = snapshot(state.directory);
  assert.throws(() => depositItem({ bankPath: path.join(state.directory, 'new-bank.json'),
    sourcePath: state.destinationPath, pageIndex: 0, itemIndex: 0, pd2Tables: tables }), STALE);
  assert.deepEqual(snapshot(state.directory), before);
});

test('optional symlink targets are bound to their loaded paths even when replacement bytes are identical', t => {
  const state = setup(t), runesPath = path.join(state.dataDir, 'Runes.txt');
  const first = path.join(state.directory, 'first-runes.txt'), second = path.join(state.directory, 'second-runes.txt');
  fs.copyFileSync(runesPath, first); fs.copyFileSync(runesPath, second);
  fs.unlinkSync(runesPath); fs.symlinkSync(first, runesPath);
  const tables = loadPd2Tables(state.dataDir), { itemIndex } = selected(state, tables);
  assert.doesNotThrow(() => assertItemIdentityTablesCurrent(tables));
  fs.unlinkSync(runesPath); fs.symlinkSync(second, runesPath);
  assert.throws(() => assertItemIdentityTablesCurrent(tables), STALE);
  staleEntry(state, tables, itemIndex);
  assert.doesNotThrow(() => assertItemIdentityTablesCurrent(loadPd2Tables(state.dataDir)));
});

test('unproven clones remain inspectable but public metadata cannot authorize a guarded transfer', t => {
  const state = setup(t), tables = loadPd2Tables(state.dataDir);
  assert.equal(selected(state, tables).item.displayName, 'Edge');
  const clone = { ...tables, identityProvenance: getItemIdentityTableProvenance(tables), provenance: getPd2TableProvenance(tables) };
  const { itemIndex, item } = selected(state, clone);
  assert.equal(item.displayName, 'Edge');
  assert.throws(() => getItemIdentityTableProvenance(clone), STALE);
  assert.throws(() => assertItemIdentityTablesCurrent(clone), STALE);
  staleEntry(state, clone, itemIndex);
});

test('old schema-one bank entries remain withdrawable after optional naming tables change', t => {
  const state = setup(t), tables = loadPd2Tables(state.dataDir), { itemIndex } = selected(state, tables);
  const fingerprint = legacyFingerprint(tables);
  const deposited = depositItem({ ...state, itemIndex, dryRun: false, pd2Tables: tables });
  const bank = JSON.parse(fs.readFileSync(state.bankPath, 'utf8'));
  assert.equal(bank.schemaVersion, 1);
  assert.equal(bank.items[0].displayName, 'Edge');
  assert.equal(bank.items[0].tableFingerprint, fingerprint);
  renameEdge(state.dataDir);
  const fresh = loadPd2Tables(state.dataDir);
  assert.equal(legacyFingerprint(fresh), fingerprint);
  withdrawItem({ bankPath: state.bankPath, destinationPath: state.destinationPath, pageIndex: 0,
    itemId: deposited.itemId, column: 0, row: 0, dryRun: false, pd2Tables: fresh });
  assert.equal(listBank(state.bankPath).items.length, 0);
  const moved = inspectSaveFile(state.destinationPath, { pd2Tables: fresh }).pages[0].topLevelItems[0];
  assert.equal(moved.displayName, 'EdgeTestRename');
  assert.equal(moved.fingerprint, 70879556);
  assert.deepEqual(moved.children.map(child => child.code), ['r03', 'r07', 'r11']);
});

test('acceptance guards reject stale identity caches even when manifest hashes match the current renamed tables', t => {
  const state = setup(t), stale = loadPd2Tables(state.dataDir);
  selected(state, stale);
  renameEdge(state.dataDir);
  const refused = path.join(state.directory, 'refused-pack'), beforeRefusal = snapshot(state.directory);
  assert.throws(() => prepareGameAcceptance({ outputDir: refused, pd2Tables: stale }), STALE);
  assert.equal(fs.existsSync(refused), false);
  assert.deepEqual(snapshot(state.directory), beforeRefusal);
  const fresh = loadPd2Tables(state.dataDir), packDir = path.join(state.directory, 'fresh-pack');
  const manifest = prepareGameAcceptance({ outputDir: packDir, pd2Tables: fresh });
  assert.equal(manifest.tables.find(entry => entry.fileName === 'Runes.txt').sha256,
    hash(fs.readFileSync(path.join(state.dataDir, 'Runes.txt'))));
  const resultsDir = path.join(state.directory, 'results');
  for (const scenario of manifest.scenarios) for (const name of [scenario.characterFile, scenario.stashFile]) {
    const file = path.join(resultsDir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(path.join(packDir, name), file);
  }
  const before = snapshot(state.directory);
  assert.throws(() => verifyGameAcceptance({ packDir, resultsDir, pd2Tables: stale }), STALE);
  const verified = verifyGameAcceptance({ packDir, resultsDir, pd2Tables: fresh });
  assert.equal(verified.structuralPassed, true);
  assert.equal(verified.gameAcceptance, 'unverified');
  assert.deepEqual(snapshot(state.directory), before);
});

test('an optional table change after journal creation rejects replacement and preserves recoverable evidence', t => {
  const state = setup(t), tables = loadPd2Tables(state.dataDir), { itemIndex } = selected(state, tables);
  const before = fs.readFileSync(state.sourcePath), nativeOpen = fs.openSync, nativeWrite = fs.writeFileSync;
  let journalDescriptor, fired = false;
  fs.openSync = function (file, ...args) {
    const descriptor = nativeOpen.call(fs, file, ...args);
    if (file === state.bankPath + '.journal.json') journalDescriptor = descriptor;
    return descriptor;
  };
  fs.writeFileSync = function (file, ...args) {
    const result = nativeWrite.call(fs, file, ...args);
    if (!fired && file === journalDescriptor) { fired = true; renameEdge(state.dataDir); }
    return result;
  };
  try { assert.throws(() => depositItem({ ...state, itemIndex, dryRun: false, pd2Tables: tables }), STALE); }
  finally { fs.openSync = nativeOpen; fs.writeFileSync = nativeWrite; }
  assert.equal(fired, true);
  assert.deepEqual(fs.readFileSync(state.sourcePath), before);
  assert.equal(fs.existsSync(state.bankPath), false);
  assert.equal(fs.existsSync(state.bankPath + '.lock'), false);
  assert.equal(fs.existsSync(state.sourcePath + '.pd2-mule.lock'), false);
  const journal = JSON.parse(fs.readFileSync(state.bankPath + '.journal.json', 'utf8'));
  assert.equal(journal.status, 'prepared');
  assert.equal(journal.entries[0].beforeSha256, hash(before));
  assert.deepEqual(fs.readFileSync(journal.entries[0].backupPath), before);
  assert.equal(recoverBank({ bankPath: state.bankPath, dryRun: false }).recovered, true);
  assert.deepEqual(fs.readFileSync(state.sourcePath), before);
  assert.equal(fs.existsSync(state.bankPath), false);
  assert.equal(fs.existsSync(state.bankPath + '.journal.json'), false);
});
