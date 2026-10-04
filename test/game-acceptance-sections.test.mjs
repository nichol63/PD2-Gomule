import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { prepareGameAcceptance } from '../src/lib/game-acceptance.mjs';
import { verifyGameAcceptance } from '../src/lib/game-acceptance-verification.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { parseLegacyItemList } from '../src/lib/legacy-item-parser.mjs';
import { calculateCharacterChecksum, inspectCharacterTransferSupport } from '../src/lib/character-serialization.mjs';
import { extractStashItem } from '../src/lib/safe-serialization.mjs';
import { getDefaultPd2DataDir, getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = loadPd2Tables(), FIXTURES = getFixtureLibraryDir();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const CHECK_CODES = ['character-header', 'character-identity', 'character-counts', 'stash-header',
  'stash-counts', 'stash-pages', 'landing-counts', 'complete-records', 'source-absence',
  'destination-occurrences', 'destination-location', 'item-stack', 'item-sockets', 'item-properties', 'item-tree-bytes'];
const fixtureNames = ['Bases.d2x', 'Blank Characters/Level 30s/Amazon.d2s', 'Showcase Characters/amazon/freezing-arrow.d2s'];
const fixtureHashes = () => fixtureNames.map(name => [name, hash(fs.readFileSync(path.join(FIXTURES, name)))]);
const canonicalHashes = fixtureHashes();
let directory, packDir, manifest, preparedHashes;

function fileHashes(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? fileHashes(file) : [[file, hash(fs.readFileSync(file))]];
  });
}

before(() => {
  directory = fs.mkdtempSync(path.join(REPO, '.acceptance-sections-test-'));
  packDir = path.join(directory, 'pack');
  manifest = prepareGameAcceptance({ outputDir: packDir, pd2Tables: TABLES });
  preparedHashes = fileHashes(packDir);
});

after(() => {
  try {
    assert.deepEqual(fixtureHashes(), canonicalHashes);
    if (preparedHashes) assert.deepEqual(fileHashes(packDir), preparedHashes);
  } finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
});

function scenario(id = 'socketed') { return manifest.scenarios.find(entry => entry.id === id); }

function results(t) {
  const root = fs.mkdtempSync(path.join(directory, 'results-'));
  for (const entry of manifest.scenarios) for (const name of [entry.characterFile, entry.stashFile]) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(path.join(packDir, name), file, fs.constants.COPYFILE_EXCL);
  }
  t.after(() => {
    try {
      assert.deepEqual(fixtureHashes(), canonicalHashes);
      assert.deepEqual(fileHashes(packDir), preparedHashes);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  return root;
}

function character(root, id = 'socketed') {
  const file = path.join(root, scenario(id).characterFile);
  return { file, bytes: fs.readFileSync(file), save: parseCharacterFile(file, { pd2Tables: TABLES }) };
}

function tree() {
  const file = path.join(packDir, scenario().stashFile);
  const save = parsePlugyStashFile(file, { pd2Tables: TABLES });
  const extracted = extractStashItem(fs.readFileSync(file), save, { pageIndex: 0, itemIndex: 0 });
  assert.equal(extracted.item.code, 'amc');
  assert.equal(extracted.item.fingerprint, 70879556);
  assert.equal(extracted.nodeCount, 4);
  assert.deepEqual(extracted.item.children.map(child => child.code), ['r03', 'r07', 'r11']);
  return extracted.bytes;
}

function writeCharacter(file, bytes) {
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(calculateCharacterChecksum(bytes), 12);
  fs.writeFileSync(file, bytes);
  return parseCharacterFile(file, { pd2Tables: TABLES });
}

function support(bytes, save, supported = true) {
  const result = inspectCharacterTransferSupport(bytes, save, { pd2Tables: TABLES });
  assert.equal(result.supported, supported, result.reason);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(12), calculateCharacterChecksum(bytes));
  return result;
}

function mercenary(bytes, save) {
  const merc = save.characterSections.mercenary;
  return parseLegacyItemList(bytes, merc.itemRegion.startOffset, merc.itemCount, merc.itemRegion.endOffset, TABLES);
}

function readOnlyVerify(root) {
  const beforeResults = fileHashes(root), beforePack = fileHashes(packDir);
  const beforeTables = fileHashes(getDefaultPd2DataDir());
  try { return verifyGameAcceptance({ packDir, resultsDir: root, pd2Tables: TABLES }); }
  finally {
    assert.deepEqual(fileHashes(root), beforeResults, 'result inputs must remain unchanged');
    assert.deepEqual(fileHashes(packDir), beforePack, 'prepared evidence must remain unchanged');
    assert.deepEqual(fileHashes(getDefaultPd2DataDir()), beforeTables, 'table inputs must remain unchanged');
  }
}

function assertReport(report, absence, { supported = true } = {}) {
  const passed = absence === 0;
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.gameAcceptance, 'unverified');
  assert.equal(report.structuralPassed, passed);
  assert.equal(report.status, passed ? 'structural checks passed; in-game acceptance pending'
    : 'structural checks failed; in-game acceptance pending');
  assert.ok(report.scenarios.find(entry => entry.id === 'tome').checks.every(check => check.passed));
  const checks = report.scenarios.find(entry => entry.id === 'socketed').checks;
  assert.deepEqual(checks.map(check => check.code), CHECK_CODES);
  const source = checks.find(check => check.code === 'source-absence');
  assert.equal(source.expected, 0);
  assert.equal(source.actual, absence);
  assert.equal(source.passed, passed);
  const complete = checks.find(check => check.code === 'complete-records');
  assert.equal(complete.actual.character, supported);
  if (supported) {
    assert.ok(complete.passed);
    assert.deepEqual(checks.filter(check => !check.passed).map(check => check.code), passed ? [] : ['source-absence']);
  }
}

test('legitimate empty golem and nonselected mercenary trees establish selected source absence', t => {
  const root = results(t), { bytes, save } = character(root);
  support(bytes, save);
  assert.equal(save.characterSections.golem.present, false);
  const merc = mercenary(bytes, save);
  assert.equal(merc.topLevelItems.length, 6);
  assert.equal(merc.items.length, 12);
  assert.ok(merc.topLevelItems.some(item => item.code === 'amc' && item.fingerprint !== 70879556));
  assertReport(readOnlyVerify(root), 0);
});

test('an added selected bow in a validated mercenary section fails source absence despite unchanged primary counts', t => {
  const root = results(t), { file, bytes, save } = character(root);
  const merc = save.characterSections.mercenary, end = merc.itemRegion.endOffset;
  const changed = Buffer.concat([bytes.subarray(0, end), tree(), bytes.subarray(end)]);
  changed.writeUInt16LE(merc.itemCount + 1, merc.itemListOffset + 2);
  const parsed = writeCharacter(file, changed);
  support(changed, parsed);
  assert.equal(parsed.itemCount, save.itemCount);
  const aux = mercenary(changed, parsed);
  assert.equal(aux.topLevelItems.length, 7);
  assert.equal(aux.items.length, 16);
  assert.equal(aux.topLevelItems.filter(item => item.fingerprint === 70879556 && item.code === 'amc').length, 1);
  assertReport(readOnlyVerify(root), 1);
});

test('a same-root-count mercenary book substitution still detects the selected bow duplicate', t => {
  const root = results(t), { file, bytes, save } = character(root);
  const merc = mercenary(bytes, save), index = merc.topLevelItems.findIndex(item => item.code === 'tbl');
  assert.ok(index >= 0);
  const start = merc.topLevelItems[index].byteOffset;
  const end = merc.topLevelItems[index + 1]?.byteOffset ?? save.characterSections.mercenary.itemRegion.endOffset;
  const changed = Buffer.concat([bytes.subarray(0, start), tree(), bytes.subarray(end)]);
  const parsed = writeCharacter(file, changed);
  support(changed, parsed);
  assert.equal(parsed.characterSections.mercenary.itemCount, 6);
  assert.equal(mercenary(changed, parsed).items.length, 15);
  assert.equal(parsed.parsedNodeCount, save.parsedNodeCount);
  assertReport(readOnlyVerify(root), 1);
});

test('a populated validated golem tree cannot hide the selected bow duplicate', t => {
  const root = results(t), { file, bytes, save } = character(root);
  const offset = save.characterSections.golem.markerOffset;
  assert.equal(offset + 3, bytes.length);
  const changed = Buffer.concat([bytes, tree()]);
  changed[offset + 2] = 1;
  const parsed = writeCharacter(file, changed);
  support(changed, parsed);
  assert.equal(parsed.characterSections.golem.present, true);
  const golem = parsed.characterSections.golem.itemRegion;
  const aux = parseLegacyItemList(changed, golem.startOffset, 1, golem.endOffset, TABLES);
  assert.equal(aux.topLevelItems[0].fingerprint, 70879556);
  assert.equal(aux.items.length, 4);
  assertReport(readOnlyVerify(root), 1);
});

test('a validated nonselected populated golem remains compatible with absence verification', t => {
  const root = results(t), { file, bytes, save } = character(root);
  const merc = mercenary(bytes, save), book = merc.topLevelItems.find(item => item.code === 'tbl');
  assert.ok(book);
  const changed = Buffer.concat([bytes, bytes.subarray(book.byteOffset, book.nextOffset)]);
  changed[save.characterSections.golem.markerOffset + 2] = 1;
  const parsed = writeCharacter(file, changed);
  support(changed, parsed);
  assertReport(readOnlyVerify(root), 0);
});

test('unsupported corpse and auxiliary boundaries fail absence conservatively rather than reporting zero', t => {
  for (const change of ['corpse', 'mercenary-count', 'golem-presence']) {
    const root = results(t), { file, bytes, save } = character(root);
    if (change === 'corpse') bytes.writeUInt16LE(1, save.characterSections.corpse.markerOffset + 2);
    if (change === 'mercenary-count') bytes.writeUInt16LE(7, save.characterSections.mercenary.itemListOffset + 2);
    if (change === 'golem-presence') bytes[save.characterSections.golem.markerOffset + 2] = 1;
    const parsed = writeCharacter(file, bytes);
    support(bytes, parsed, false);
    assertReport(readOnlyVerify(root), null, { supported: false });
  }
});
