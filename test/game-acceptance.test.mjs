import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { prepareGameAcceptance } from '../src/lib/game-acceptance.mjs';
import { getFixtureLibraryDir, getDefaultPd2DataDir } from '../src/lib/workspace-paths.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { extractCharacterItem } from '../src/lib/character-serialization.mjs';
import { extractStashItem } from '../src/lib/safe-serialization.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = getFixtureLibraryDir();
const TABLES = loadPd2Tables();
const SCRIPT = path.join(REPO, 'scripts', 'prepare-game-acceptance.mjs');
const STATUS = 'prepared; in-game acceptance pending';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

function fixtureHashes() {
  return filesIn(FIXTURES).filter(file => /\.(d2s|d2x|sss)$/i.test(file))
    .map(file => [path.relative(FIXTURES, file), hash(fs.readFileSync(file))]);
}

function withWorkspace(run) {
  const directory = fs.mkdtempSync(path.join(REPO, '.game-acceptance-test-'));
  try { return run(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function resolvedArtifact(output, relative) {
  assert.equal(path.isAbsolute(relative), false, 'manifest artifacts must use relative paths');
  const file = path.resolve(output, relative);
  assert.ok(file.startsWith(output + path.sep), 'manifest artifacts must stay in output');
  return file;
}

function assertHeader(bytes) {
  let checksum = 0;
  for (let offset = 0; offset < bytes.length; offset += 1) {
    checksum = (((checksum << 1) | (checksum >>> 31)) +
      (offset >= 12 && offset < 16 ? 0 : bytes[offset])) >>> 0;
  }
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(12), checksum);
}

function assertTreePreserved(before, after) {
  assert.equal(after.length, before.length);
  for (let bit = 0; bit < before.length * 8; bit += 1) {
    if (bit >= 58 && bit < 76) continue;
    assert.equal((after[bit >>> 3] >>> (bit & 7)) & 1,
      (before[bit >>> 3] >>> (bit & 7)) & 1, `untouched tree bit ${bit}`);
  }
}

function checkScenario(output, scenario, specification) {
  const characterPath = resolvedArtifact(output, scenario.characterFile);
  const stashPath = resolvedArtifact(output, scenario.stashFile);
  const bankPath = resolvedArtifact(output, scenario.bankFile);
  assert.equal(scenario.characterFile, specification.characterFile);
  assert.equal(scenario.stashFile, specification.stashFile);
  const originalBytes = fs.readFileSync(path.join(FIXTURES, specification.fixture));
  const original = parseCharacterFile(path.join(FIXTURES, specification.fixture), { pd2Tables: TABLES });
  const itemIndex = original.topLevelItems.findIndex(item => item.fingerprint === specification.fingerprint);
  assert.ok(itemIndex >= 0);
  const extracted = extractCharacterItem(originalBytes, original, { itemIndex });
  const characterBytes = fs.readFileSync(characterPath);
  const stashBytes = fs.readFileSync(stashPath);
  const character = parseCharacterFile(characterPath, { pd2Tables: TABLES });
  const stash = parsePlugyStashFile(stashPath, { pd2Tables: TABLES });
  const landing = stash.pages[0];
  const moved = landing.topLevelItems[0];
  const tree = extractStashItem(stashBytes, stash, { pageIndex: 0, itemIndex: 0 });
  assertHeader(characterBytes);
  assert.equal(character.itemCount, original.itemCount - 1);
  assert.equal(character.parsedNodeCount, original.parsedNodeCount - specification.nodeCount);
  assert.equal(character.topLevelItems.some(item => item.fingerprint === specification.fingerprint), false);
  assert.equal(stash.totalItems, 2587);
  assert.equal(landing.itemCount, 1);
  assert.equal(landing.parsedNodeCount, specification.nodeCount);
  assert.equal(moved.code, specification.code);
  assert.equal(moved.fingerprint, specification.fingerprint);
  assert.equal(moved.panel, 5);
  assert.equal(moved.location, 0);
  assert.equal(moved.column, 0);
  assert.equal(moved.row, 0);
  assert.equal(moved.propertiesComplete, true);
  assert.deepEqual(moved.children.map(child => child.code), specification.children);
  if (specification.stackSize !== undefined) assert.equal(moved.stackSize, specification.stackSize);
  assertTreePreserved(extracted.bytes, tree.bytes);
  assert.deepEqual(characterBytes.subarray(character.itemRegion.endOffset),
    originalBytes.subarray(original.itemRegion.endOffset));
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  assert.equal(bank.schemaVersion, 1);
  assert.deepEqual(bank.items, []);
  assert.deepEqual(scenario.before.character, {
    sha256: hash(originalBytes), rootCount: original.itemCount, nodeCount: original.parsedNodeCount
  });
  assert.deepEqual(scenario.prepared.character, {
    sha256: hash(characterBytes), rootCount: character.itemCount, nodeCount: character.parsedNodeCount
  });
  assert.equal(scenario.before.stash.sha256, hash(fs.readFileSync(path.join(FIXTURES, 'Bases.d2x'))));
  assert.equal(scenario.before.stash.rootCount, 2586);
  assert.equal(scenario.before.stash.nodeCount, 2586);
  assert.equal(scenario.before.stash.landingRootCount, 0);
  assert.equal(scenario.before.stash.landingNodeCount, 0);
  assert.equal(scenario.prepared.stash.sha256, hash(stashBytes));
  assert.equal(scenario.prepared.stash.rootCount, 2587);
  assert.equal(scenario.prepared.stash.nodeCount, stash.parsedNodeCount);
  assert.equal(scenario.prepared.stash.landingRootCount, 1);
  assert.equal(scenario.prepared.stash.landingNodeCount, specification.nodeCount);
  assert.equal(scenario.item.rawTreeSha256Before, hash(extracted.bytes));
  assert.equal(scenario.item.rawTreeSha256Prepared, hash(tree.bytes));
  assert.equal(scenario.item.patchedTreeSha256Expected, hash(tree.bytes));
  assert.equal(scenario.item.propertiesSha256Before, scenario.item.propertiesSha256Prepared);
  assert.equal(scenario.item.code, specification.code);
  assert.equal(scenario.item.fingerprint, specification.fingerprint);
  assert.equal(scenario.item.nodeCount, specification.nodeCount);
  assert.equal(scenario.item.stackSize, extracted.item.stackSize);
  assert.deepEqual(scenario.item.socketChildCodes, specification.children);
  assert.equal(scenario.item.sourcePanel, extracted.item.panel);
  assert.equal(scenario.item.sourceColumn, extracted.item.column);
  assert.equal(scenario.item.sourceRow, extracted.item.row);
  assert.equal(scenario.item.destinationPageIndex, 0);
  assert.equal(scenario.item.destinationColumn, 0);
  assert.equal(scenario.item.destinationRow, 0);
  assert.deepEqual(scenario.transactions.map(transaction => transaction.operation), ['deposit', 'withdraw']);
  for (const transaction of scenario.transactions) {
    assert.ok(transaction.backupPaths.length >= 1);
    for (const backup of transaction.backupPaths) assert.ok(fs.statSync(resolvedArtifact(output, backup)).size > 0);
  }
}

test('prepares real tome and socketed transfers with intact item trees and pending game acceptance', () => {
  const beforeHashes = fixtureHashes();
  assert.equal(beforeHashes.length, 134);
  withWorkspace(directory => {
    const output = path.join(directory, 'prepared');
    const manifest = prepareGameAcceptance({ outputDir: output });
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.status, STATUS);
    assert.ok(Number.isFinite(Date.parse(manifest.createdAt)));
    assert.equal(manifest.scenarios.length, 2);
    checkScenario(output, manifest.scenarios.find(scenario => scenario.id === 'tome'), {
      fixture: 'Blank Characters/Level 30s/Amazon.d2s', characterFile: 'tome/Amazon.d2s',
      stashFile: 'tome/Amazon.d2x', fingerprint: 28610618, code: 'tbk', stackSize: 20,
      nodeCount: 1, children: []
    });
    checkScenario(output, manifest.scenarios.find(scenario => scenario.id === 'socketed'), {
      fixture: 'Showcase Characters/amazon/freezing-arrow.d2s',
      characterFile: 'socketed/freezing-arrow.d2s', stashFile: 'socketed/freezing-arrow.d2x',
      fingerprint: 70879556, code: 'amc', nodeCount: 4, children: ['r03', 'r07', 'r11']
    });
    for (const fixture of manifest.fixtures) {
      assert.equal(fixture.sha256, hash(fs.readFileSync(path.join(FIXTURES, fixture.relativePath))));
    }
    assert.equal(manifest.tables.length, 10);
    for (const table of manifest.tables) {
      assert.equal(table.sha256, hash(fs.readFileSync(path.join(getDefaultPd2DataDir(), table.fileName))));
    }
    const artifacts = filesIn(output);
    assert.equal(artifacts.some(file => /\.lock$|\.journal\.json$/.test(file)), false);
    const saved = artifacts.find(file => path.basename(file) === 'manifest.json');
    assert.ok(saved, 'a reviewable manifest must be written');
    assert.deepEqual(JSON.parse(fs.readFileSync(saved, 'utf8')), manifest);
  });
  assert.deepEqual(fixtureHashes(), beforeHashes, 'all canonical fixtures must remain untouched');
});

test('existing directories, files, and symlinks are rejected without changing their contents', () => {
  withWorkspace(directory => {
    const existing = path.join(directory, 'existing');
    fs.mkdirSync(existing);
    fs.writeFileSync(path.join(existing, 'sentinel'), 'preserve me');
    const file = path.join(directory, 'existing-file');
    fs.writeFileSync(file, 'preserve file');
    const link = path.join(directory, 'existing-link');
    fs.symlinkSync(existing, link, 'dir');
    const broken = path.join(directory, 'broken-link');
    fs.symlinkSync(path.join(directory, 'absent'), broken, 'dir');
    for (const outputDir of [existing, file, link, broken]) {
      assert.throws(() => prepareGameAcceptance({ outputDir }), /Output directory already exists/);
    }
    assert.deepEqual(fs.readdirSync(existing), ['sentinel']);
    assert.equal(fs.readFileSync(path.join(existing, 'sentinel'), 'utf8'), 'preserve me');
    assert.equal(fs.readFileSync(file, 'utf8'), 'preserve file');
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.ok(fs.lstatSync(broken).isSymbolicLink());
  });
});

test('protected fixture roots and symlinked ancestors are rejected before creating output', () => {
  withWorkspace(directory => {
    const alias = path.join(directory, 'fixture-alias');
    fs.symlinkSync(FIXTURES, alias, 'dir');
    const name = path.basename(directory) + '-forbidden';
    const destinations = [path.join(FIXTURES, name), path.join(path.dirname(FIXTURES), name),
      path.join(alias, name), path.join(getDefaultPd2DataDir(), name),
      path.join(FIXTURES, name, 'nested-output')];
    for (const outputDir of destinations) {
      assert.throws(() => prepareGameAcceptance({ outputDir }), /protected/i);
      assert.equal(fs.existsSync(outputDir), false);
    }
  });
});

test('incomplete fixture input cannot produce an acceptance manifest', () => {
  withWorkspace(directory => {
    const fixtures = path.join(directory, 'partial-fixtures');
    fs.mkdirSync(fixtures);
    fs.copyFileSync(path.join(FIXTURES, 'Bases.d2x'), path.join(fixtures, 'Bases.d2x'));
    const copiedHash = hash(fs.readFileSync(path.join(fixtures, 'Bases.d2x')));
    const output = path.join(directory, 'incomplete-output');
    assert.throws(() => prepareGameAcceptance({ outputDir: output, fixtureDir: fixtures }));
    assert.equal(hash(fs.readFileSync(path.join(fixtures, 'Bases.d2x'))), copiedHash);
    if (fs.existsSync(output)) {
      assert.equal(filesIn(output).some(file => path.basename(file) === 'manifest.json'), false);
    }
  });
});

test('CLI prepares explicit output and rejects missing and unknown arguments without output', () => {
  withWorkspace(directory => {
    const output = path.join(directory, 'cli-output');
    const run = args => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' });
    const help = run(['--help', '--tables', path.join(directory, 'absent-tables')]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--output/);
    const unknown = run(['--unknown', 'value']);
    assert.equal(unknown.status, 1);
    const missing = run([]);
    assert.equal(missing.status, 1);
    assert.deepEqual(fs.readdirSync(directory), []);
    const prepared = run(['--output', output, '--fixtures', FIXTURES, '--tables', getDefaultPd2DataDir()]);
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.match(prepared.stdout, /prepared; in-game acceptance pending/);
    const manifestFile = filesIn(output).find(file => path.basename(file) === 'manifest.json');
    assert.equal(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).status, STATUS);
    const originalManifest = fs.readFileSync(manifestFile);
    const repeat = run(['--output', output]);
    assert.equal(repeat.status, 1);
    assert.match(repeat.stderr, /Output directory already exists/);
    assert.deepEqual(fs.readFileSync(manifestFile), originalManifest);
  });
});
