import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { prepareGameAcceptance } from '../src/lib/game-acceptance.mjs';
import { verifyGameAcceptance } from '../src/lib/game-acceptance-verification.mjs';
import { getDefaultPd2DataDir } from '../src/lib/workspace-paths.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { calculateCharacterChecksum, insertCharacterItem, removeCharacterItem } from '../src/lib/character-serialization.mjs';
import { extractStashItem, insertStashItem, patchItemLocation, removeStashItem } from '../src/lib/safe-serialization.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO, 'scripts', 'verify-game-acceptance.mjs');
const TABLES = loadPd2Tables();
const PASS = 'structural checks passed; in-game acceptance pending';
const FAIL = 'structural checks failed; in-game acceptance pending';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let directory, packDir, manifest, initialPackHashes;

function fileHashes(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) return [[file, fs.readlinkSync(file)]];
    return entry.isDirectory() ? fileHashes(file) : [[file, hash(fs.readFileSync(file))]];
  });
}

before(() => {
  directory = fs.mkdtempSync(path.join(REPO, '.acceptance-verification-test-'));
  packDir = path.join(directory, 'pack');
  manifest = prepareGameAcceptance({ outputDir: packDir, pd2Tables: TABLES });
  initialPackHashes = fileHashes(packDir);
});

after(() => {
  try { if (initialPackHashes) assert.deepEqual(fileHashes(packDir), initialPackHashes); }
  finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
});

function scenario(id) { return manifest.scenarios.find(entry => entry.id === id); }

function withResults(run) {
  const resultsDir = fs.mkdtempSync(path.join(directory, 'results-'));
  for (const entry of manifest.scenarios) {
    for (const relative of [entry.characterFile, entry.stashFile]) {
      const file = path.join(resultsDir, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.copyFileSync(path.join(packDir, relative), file, fs.constants.COPYFILE_EXCL);
    }
  }
  try { return run(resultsDir); }
  finally { fs.rmSync(resultsDir, { recursive: true, force: true }); }
}

function readOnlyVerify(resultsDir, options = {}) {
  const beforeResults = fileHashes(resultsDir);
  const chosenPack = options.packDir ?? packDir;
  const beforePack = fileHashes(chosenPack);
  try { return verifyGameAcceptance({ packDir: chosenPack, resultsDir, pd2Tables: TABLES, ...options }); }
  finally {
    assert.deepEqual(fileHashes(resultsDir), beforeResults, 'verification must not edit result files');
    assert.deepEqual(fileHashes(chosenPack), beforePack, 'verification must not edit the retained pack');
  }
}

function assertReport(report, passed) {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, passed ? PASS : FAIL);
  assert.equal(report.gameAcceptance, 'unverified');
  assert.equal(report.structuralPassed, passed);
  assert.equal(report.packManifestSha256, hash(fs.readFileSync(path.join(packDir, 'manifest.json'))));
  assert.equal(report.tables.length, 10);
  assert.deepEqual(report.scenarios.map(entry => entry.id).sort(), ['socketed', 'tome']);
  for (const entry of report.scenarios) {
    assert.ok(entry.checks.length > 0);
    for (const check of entry.checks) {
      assert.equal(typeof check.code, 'string');
      assert.equal(typeof check.passed, 'boolean');
      assert.ok(Object.hasOwn(check, 'expected'), `${check.code} must explain its expectation`);
      assert.ok(Object.hasOwn(check, 'actual'), `${check.code} must explain the observed result`);
    }
  }
  if (passed) assert.ok(report.scenarios.every(entry => entry.checks.every(check => check.passed)));
}

function failedCheck(report, id, code) {
  assertReport(report, false);
  const check = report.scenarios.find(entry => entry.id === id).checks.find(entry => entry.code === code);
  assert.ok(check, `diagnostic check ${id}/${code} must exist`);
  assert.equal(check.passed, false, `${id}/${code} must fail`);
  assert.notDeepEqual(check.actual, check.expected, `${id}/${code} must describe the mismatch`);
}

function rewriteHeader(bytes) {
  bytes.writeUInt32LE(calculateCharacterChecksum(bytes), 12);
  return bytes;
}

function writeBits(bytes, bit, width, value) {
  for (let index = 0; index < width; index += 1) {
    const absolute = bit + index, mask = 1 << (absolute & 7);
    bytes[absolute >>> 3] = (bytes[absolute >>> 3] & ~mask) | (((value >>> index) & 1) ? mask : 0);
  }
}

function editLanding(resultsDir, id, edit) {
  const file = path.join(resultsDir, scenario(id).stashFile);
  const bytes = fs.readFileSync(file);
  const save = parsePlugyStashFile(file, { pd2Tables: TABLES });
  const extracted = extractStashItem(bytes, save, { pageIndex: 0, itemIndex: 0 });
  edit({ file, bytes, save, item: extracted.item, tree: extracted });
}

test('independent identical copies pass structural checks while game acceptance stays unverified', () => {
  withResults(resultsDir => {
    const report = readOnlyVerify(resultsDir);
    assertReport(report, true);
    for (const entry of report.scenarios) {
      const prepared = scenario(entry.id).prepared;
      assert.deepEqual(entry.preparedHashes, { character: prepared.character.sha256, stash: prepared.stash.sha256 });
      assert.deepEqual(entry.resultHashes, entry.preparedHashes);
      assert.deepEqual(entry.filesChangedSincePreparation, { character: false, stash: false });
      const treeCheck = entry.checks.find(check => check.code === 'item-tree-bytes');
      assert.ok(treeCheck.passed);
      assert.deepEqual(treeCheck.expected, treeCheck.actual);
      assert.equal(treeCheck.actual.sha256, scenario(entry.id).item.rawTreeSha256Prepared);
    }
  });
});

test('a character timestamp rewrite with valid checksum passes and records the changed file hash', () => {
  withResults(resultsDir => {
    const file = path.join(resultsDir, scenario('tome').characterFile);
    const bytes = fs.readFileSync(file);
    bytes.writeUInt32LE((bytes.readUInt32LE(48) + 1) >>> 0, 48);
    fs.writeFileSync(file, rewriteHeader(bytes));
    const report = readOnlyVerify(resultsDir);
    assertReport(report, true);
    const tome = report.scenarios.find(entry => entry.id === 'tome');
    assert.deepEqual(tome.filesChangedSincePreparation, { character: true, stash: false });
    assert.notEqual(tome.resultHashes.character, tome.preparedHashes.character);
  });
});

test('bad character checksum, size, and valid serialized root-count changes are diagnosed', () => {
  for (const change of ['checksum', 'size', 'count']) {
    withResults(resultsDir => {
      const file = path.join(resultsDir, scenario('tome').characterFile);
      const bytes = fs.readFileSync(file);
      if (change === 'checksum') bytes[12] ^= 1;
      if (change === 'size') { bytes.writeUInt32LE(bytes.length + 1, 8); rewriteHeader(bytes); }
      if (change === 'count') {
        const save = parseCharacterFile(file, { pd2Tables: TABLES });
        const index = save.topLevelItems.findIndex(item => item.code === 'ibk');
        assert.ok(index >= 0);
        fs.writeFileSync(file, removeCharacterItem(bytes, save, { itemIndex: index, pd2Tables: TABLES }).buffer);
      } else fs.writeFileSync(file, bytes);
      failedCheck(readOnlyVerify(resultsDir), 'tome', change === 'count' ? 'character-counts' : 'character-header');
    });
  }
});

test('parseable stash signature and unsupported version changes fail header integrity checks', () => {
  for (const change of ['signature', 'version']) {
    withResults(resultsDir => {
      const file = path.join(resultsDir, scenario('tome').stashFile);
      const bytes = fs.readFileSync(file);
      const before = parsePlugyStashFile(file, { pd2Tables: TABLES });
      const originalTree = extractStashItem(bytes, before, { pageIndex: 0, itemIndex: 0 });
      if (change === 'signature') bytes.write('JUNK', 0, 4, 'ascii');
      else bytes.write('99', 4, 2, 'ascii');
      fs.writeFileSync(file, bytes);
      // The read-only parser can still expose all items in these damaged
      // headers. The verifier must independently reject that header evidence.
      const parsed = parsePlugyStashFile(file, { pd2Tables: TABLES });
      assert.equal(parsed.totalItems, scenario('tome').prepared.stash.rootCount);
      assert.equal(parsed.pages[0].topLevelItems[0].fingerprint, scenario('tome').item.fingerprint);
      assert.deepEqual(bytes.subarray(originalTree.startOffset, originalTree.endOffset), originalTree.bytes);
      const report = readOnlyVerify(resultsDir);
      failedCheck(report, 'tome', 'stash-header');
      assert.equal(report.gameAcceptance, 'unverified');
    });
  }
});

test('missing or duplicate destination fingerprints and restored source items are diagnosed', () => {
  for (const change of ['missing', 'duplicate', 'source']) {
    withResults(resultsDir => {
      editLanding(resultsDir, 'tome', ({ file, bytes, save, tree }) => {
        if (change === 'missing') {
          fs.writeFileSync(file, removeStashItem(bytes, save, { pageIndex: 0, itemIndex: 0 }).buffer);
        } else if (change === 'duplicate') {
          fs.writeFileSync(file, insertStashItem(bytes, save, {
            pageIndex: 0, itemBytes: tree.bytes, nodeCount: 1, column: 3, row: 0, pd2Tables: TABLES
          }).buffer);
        } else {
          const characterFile = path.join(resultsDir, scenario('tome').characterFile);
          const characterBytes = fs.readFileSync(characterFile);
          const character = parseCharacterFile(characterFile, { pd2Tables: TABLES });
          fs.writeFileSync(characterFile, insertCharacterItem(characterBytes, character, {
            itemBytes: tree.bytes, panel: 'inventory', column: scenario('tome').item.sourceColumn,
            row: scenario('tome').item.sourceRow, pd2Tables: TABLES
          }).buffer);
        }
      });
      const report = readOnlyVerify(resultsDir);
      failedCheck(report, 'tome', change === 'source' ? 'source-absence' : 'destination-occurrences');
      if (change !== 'source') failedCheck(report, 'tome', 'landing-counts');
    });
  }
});

test('wrong landing placement and tome stack remain parseable but fail their specific checks', () => {
  for (const change of ['placement', 'stack']) {
    withResults(resultsDir => {
      editLanding(resultsDir, 'tome', ({ file, bytes, item, tree }) => {
        if (change === 'placement') patchItemLocation(tree.bytes, { column: 2, row: 0 }).copy(bytes, tree.startOffset);
        else writeBits(bytes, item.propertyLists[0].startBitOffset - 9, 9, 19);
        fs.writeFileSync(file, bytes);
        const changed = parsePlugyStashFile(file, { pd2Tables: TABLES }).pages[0].topLevelItems[0];
        assert.equal(changed.propertiesComplete, true);
        assert.equal(change === 'placement' ? changed.column : changed.stackSize, change === 'placement' ? 2 : 19);
      });
      const report = readOnlyVerify(resultsDir);
      failedCheck(report, 'tome', change === 'placement' ? 'destination-location' : 'item-stack');
      failedCheck(report, 'tome', 'item-tree-bytes');
    });
  }
});

test('decoded bow properties, child rune substitutions, and opaque padding changes are never normalized away', () => {
  for (const change of ['property', 'child', 'padding']) {
    withResults(resultsDir => {
      editLanding(resultsDir, 'socketed', ({ file, bytes, item }) => {
        if (change === 'property') {
          const bit = item.propertyLists[0].startBitOffset + 9;
          bytes[bit >>> 3] ^= 1 << (bit & 7);
        } else if (change === 'child') {
          // r03 (Tir) to r04 (Nef): identical simple-record layout.
          writeBits(bytes, item.children[0].byteOffset * 8 + 76 + 16, 8, '4'.charCodeAt(0));
        } else {
          const bit = item.byteOffset * 8 + item.coreBitLength;
          assert.notEqual(item.coreBitLength % 8, 0, 'real root has opaque alignment bits');
          bytes[bit >>> 3] ^= 1 << (bit & 7);
        }
        fs.writeFileSync(file, bytes);
        const changed = parsePlugyStashFile(file, { pd2Tables: TABLES }).pages[0].topLevelItems[0];
        assert.equal(changed.propertiesComplete, true);
        assert.equal(changed.children.length, 3);
        if (change === 'property') assert.notDeepEqual(changed.properties[0].values, item.properties[0].values);
        if (change === 'child') assert.deepEqual(changed.children.map(child => child.code), ['r04', 'r07', 'r11']);
      });
      const report = readOnlyVerify(resultsDir);
      failedCheck(report, 'socketed', 'item-tree-bytes');
      if (change === 'property') failedCheck(report, 'socketed', 'item-properties');
      if (change === 'child') failedCheck(report, 'socketed', 'item-sockets');
      if (change === 'padding') {
        assert.ok(report.scenarios.find(entry => entry.id === 'socketed').checks
          .filter(check => ['item-properties', 'item-sockets', 'destination-location'].includes(check.code))
          .every(check => check.passed));
      }
    });
  }
});

function withAlteredPack(change, run) {
  const copy = fs.mkdtempSync(path.join(directory, 'altered-pack-'));
  fs.cpSync(packDir, copy, { recursive: true });
  try { change(copy); return run(copy); }
  finally { fs.rmSync(copy, { recursive: true, force: true }); }
}

test('corrupted prepared evidence and malformed, duplicate, or escaping manifest data are rejected', () => {
  for (const change of ['prepared', 'schema', 'missing-field', 'duplicate-id', 'escape', 'symlink-escape']) {
    withResults(resultsDir => withAlteredPack(copy => {
      const manifestFile = path.join(copy, 'manifest.json');
      const value = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (change === 'prepared') {
        const file = path.join(copy, value.scenarios[0].characterFile);
        const bytes = fs.readFileSync(file); bytes[48] ^= 1; fs.writeFileSync(file, rewriteHeader(bytes));
      } else {
        if (change === 'schema') value.schemaVersion = 99;
        if (change === 'missing-field') delete value.scenarios[0].item.rawTreeSha256Before;
        if (change === 'duplicate-id') value.scenarios[1].id = value.scenarios[0].id;
        if (change === 'escape') value.scenarios[0].characterFile = '../outside.d2s';
        if (change === 'symlink-escape') {
          fs.symlinkSync(path.join(packDir, 'tome'), path.join(copy, 'external'), 'dir');
          value.scenarios[0].characterFile = 'external/Amazon.d2s';
        }
        fs.writeFileSync(manifestFile, JSON.stringify(value));
      }
    }, copy => {
      assert.throws(() => readOnlyVerify(resultsDir, { packDir: copy }),
        /manifest|prepared|hash|schema|scenario|provenance|path|escape|link|contained/i);
    }));
  }
});

test('mismatched tables and missing result inputs cannot claim structural acceptance', () => {
  withResults(resultsDir => {
    const tableDir = fs.mkdtempSync(path.join(directory, 'different-tables-'));
    try {
      fs.cpSync(getDefaultPd2DataDir(), tableDir, { recursive: true });
      fs.appendFileSync(path.join(tableDir, 'armor.txt'), '\n');
      const changedTables = loadPd2Tables(tableDir);
      assert.throws(() => readOnlyVerify(resultsDir, { pd2Tables: changedTables }), /table|provenance|hash/i);
    } finally { fs.rmSync(tableDir, { recursive: true, force: true }); }
    fs.unlinkSync(path.join(resultsDir, scenario('socketed').stashFile));
    assert.throws(() => readOnlyVerify(resultsDir), /missing|ENOENT|file|input/i);
  });
  withResults(resultsDir => {
    fs.rmSync(path.join(resultsDir, 'socketed'), { recursive: true });
    assert.throws(() => readOnlyVerify(resultsDir), /missing|ENOENT|scenario|input/i);
  });
});

test('unrelated files in the table directory do not affect table provenance checks', () => {
  withResults(resultsDir => {
    const tableDir = fs.mkdtempSync(path.join(directory, 'extra-tables-'));
    try {
      for (const table of manifest.tables) fs.copyFileSync(path.join(getDefaultPd2DataDir(), table.fileName), path.join(tableDir, table.fileName));
      fs.writeFileSync(path.join(tableDir, 'Properties (copy).txt'), 'unrelated\n');
      assertReport(readOnlyVerify(resultsDir, { pd2Tables: loadPd2Tables(tableDir) }), true);
    } finally { fs.rmSync(tableDir, { recursive: true, force: true }); }
  });
});

test('same roots, symlink aliases, hardlinked saves, and symlinked result ancestors are refused', () => {
  assert.throws(() => readOnlyVerify(packDir), /independent|same|alias|different/i);
  const alias = path.join(directory, 'pack-alias');
  fs.symlinkSync(packDir, alias, 'dir');
  try { assert.throws(() => readOnlyVerify(alias), /independent|same|alias|different|link/i); }
  finally { fs.unlinkSync(alias); }
  for (const change of ['hardlink', 'symlink-parent']) {
    withResults(resultsDir => {
      const relative = scenario('tome').characterFile;
      if (change === 'hardlink') {
        fs.unlinkSync(path.join(resultsDir, relative));
        fs.linkSync(path.join(packDir, relative), path.join(resultsDir, relative));
      } else {
        fs.rmSync(path.join(resultsDir, 'tome'), { recursive: true });
        fs.symlinkSync(path.join(packDir, 'tome'), path.join(resultsDir, 'tome'), 'dir');
      }
      assert.throws(() => readOnlyVerify(resultsDir), /independent|alias|link|escape|contained|same/i);
    });
  }
});

test('CLI emits only diagnostic JSON and returns failure for mismatches and invalid arguments', () => {
  const run = args => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' });
  const help = run(['--help', '--tables', path.join(directory, 'missing-tables')]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--pack.*--results/);
  for (const args of [[], ['--unknown'], ['--pack'], ['--pack', packDir, '--pack', packDir]]) {
    const invalid = run(args);
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.ok(invalid.stderr.trim());
  }
  withResults(resultsDir => {
    const argumentsForResults = ['--pack', packDir, '--results', resultsDir, '--tables', getDefaultPd2DataDir()];
    const beforeFiles = fileHashes(resultsDir);
    const passed = run(argumentsForResults);
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(passed.stderr, '');
    assertReport(JSON.parse(passed.stdout), true);
    assert.deepEqual(fileHashes(resultsDir), beforeFiles);
    const character = path.join(resultsDir, scenario('tome').characterFile);
    const bytes = fs.readFileSync(character); bytes[12] ^= 1; fs.writeFileSync(character, bytes);
    const mismatchedFiles = fileHashes(resultsDir);
    const failed = run(argumentsForResults);
    assert.equal(failed.status, 1);
    assert.equal(failed.stderr, '');
    failedCheck(JSON.parse(failed.stdout), 'tome', 'character-header');
    assert.deepEqual(fileHashes(resultsDir), mismatchedFiles);
  });
});
