import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { getFixtureLibraryDir, getWorkspaceRoot } from './workspace-paths.mjs';
import { loadPd2Tables, assertPd2TablesCurrent } from './pd2-data.mjs';
import { inspectSaveFile } from './save-parsers.mjs';
import { extractCharacterItem } from './character-serialization.mjs';
import { extractStashItem, patchItemLocation, sha256 } from './safe-serialization.mjs';
import { depositItem, withdrawItem, listBank } from './item-bank.mjs';

const STATUS = 'prepared; in-game acceptance pending';
const CASES = [
  { id: 'tome', fixture: 'Blank Characters/Level 30s/Amazon.d2s', code: 'tbk', fingerprint: 28610618, stackSize: 20, childCodes: [] },
  { id: 'socketed', fixture: 'Showcase Characters/amazon/freezing-arrow.d2s', code: 'amc', fingerprint: 70879556, panel: 5, stackSize: null, childCodes: ['r03', 'r07', 'r11'] }
];

function exists(file) {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Resolve symlinked ancestors even when several requested path components do
// not exist yet. No directory is created until all protected roots are checked.
function resolveAncestor(file) {
  let ancestor = path.resolve(file);
  const missing = [];
  while (!exists(ancestor)) {
    missing.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  return path.join(fs.realpathSync.native(ancestor), ...missing);
}

function within(candidate, root) {
  const relative = path.relative(root.toLowerCase(), candidate.toLowerCase());
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function outputPath(outputDir, fixtureDir, tablesDir) {
  if (typeof outputDir !== 'string' || !outputDir.trim()) throw new Error('Output directory is required');
  const requested = path.resolve(outputDir);
  if (exists(requested)) throw new Error('Output directory already exists');
  const resolved = resolveAncestor(requested);
  const workspace = getWorkspaceRoot();
  const roots = [fixtureDir, tablesDir, path.dirname(getFixtureLibraryDir()),
    path.join(workspace, 'PD2-Singleplayer'), path.join(workspace, 'gomule-d2r'), path.join(workspace, 'gomule-git'),
    path.join(workspace, 'Diablo II', 'Save'),
    path.join(workspace, 'Diablo II', 'ProjectD2', 'Save'),
    path.join(workspace, 'PD2-Singleplayer', 'Diablo II', 'ProjectD2', 'Save')];
  if (roots.some(root => within(resolved, resolveAncestor(root)))) {
    throw new Error('Output directory is protected; use a new disposable directory outside fixture, table, and game Save directories');
  }
  return resolved;
}

const hashFile = file => sha256(fs.readFileSync(file));
const relativeFile = (root, file) => path.relative(root, file).split(path.sep).join('/');
const inspect = (file, pd2Tables) => inspectSaveFile(file, { pd2Tables });

function tableHashes(dataDir) {
  return fs.readdirSync(dataDir).filter(name => name.toLowerCase().endsWith('.txt') && fs.statSync(path.join(dataDir, name)).isFile())
    .sort().map(fileName => ({ fileName, sha256: hashFile(path.join(dataDir, fileName)) }));
}

function snapshot(characterFile, stashFile, character, stash) {
  return {
    character: { sha256: hashFile(characterFile), rootCount: character.itemCount, nodeCount: character.parsedNodeCount },
    stash: { sha256: hashFile(stashFile), rootCount: stash.totalItems, nodeCount: stash.parsedNodeCount,
      landingRootCount: stash.pages[0].itemCount, landingNodeCount: stash.pages[0].parsedNodeCount }
  };
}

// Only the root's storage location and byte offsets may change. Compare every
// parsed field, including all child identities/properties, without offsets.
function semanticTree(item, root = true) {
  const omitted = new Set(['byteOffset', 'nextOffset', 'sourceSpan', 'parentOffset', 'startBitOffset', 'endBitOffset']);
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)).map(([key, entry]) => [key, clean(entry)]));
  };
  const result = clean(item);
  if (root) for (const key of ['location', 'bodyPosition', 'column', 'row', 'panel']) delete result[key];
  return result;
}

function propertiesHash(item) {
  return sha256(Buffer.from(JSON.stringify({ properties: item.properties, children: item.children.map(child => ({ code: child.code, fingerprint: child.fingerprint ?? null, properties: child.properties })) })));
}

function prepareCase(root, spec, fixtureDir, pd2Tables) {
  const directory = path.join(root, spec.id);
  fs.mkdirSync(directory);
  const characterFile = path.join(directory, path.basename(spec.fixture));
  const stashFile = characterFile.replace(/\.d2s$/i, '.d2x');
  const bankFile = path.join(directory, 'bank.json');
  fs.copyFileSync(path.join(fixtureDir, spec.fixture), characterFile, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(fixtureDir, 'Bases.d2x'), stashFile, fs.constants.COPYFILE_EXCL);
  const character = inspect(characterFile, pd2Tables);
  const stash = inspect(stashFile, pd2Tables);
  const before = snapshot(characterFile, stashFile, character, stash);
  assert.equal(stash.totalItems, 2586, 'Unexpected Bases fixture root count');
  assert.equal(stash.pages[0].itemCount, 0, 'Landing page must start empty');
  const matches = character.topLevelItems.map((item, index) => ({ item, index })).filter(({ item }) =>
    item.code === spec.code && item.fingerprint === spec.fingerprint &&
    (spec.panel === undefined || item.panel === spec.panel));
  assert.equal(matches.length, 1, 'Expected one exact acceptance item');
  const { item, index: itemIndex } = matches[0];
  assert.equal(item.stackSize, spec.stackSize);
  assert.deepEqual(item.children.map(child => child.code), spec.childCodes);
  const extracted = extractCharacterItem(fs.readFileSync(characterFile), character, { itemIndex, pd2Tables });
  assert.equal(extracted.nodeCount, 1 + spec.childCodes.length);

  const deposit = { bankPath: bankFile, sourcePath: characterFile, itemIndex, pd2Tables,
    expectedSourceSha256: before.character.sha256, expectedBankSha256: null };
  depositItem({ ...deposit, dryRun: true });
  const deposited = depositItem({ ...deposit, dryRun: false });
  const withdraw = { bankPath: bankFile, destinationPath: stashFile, pageIndex: 0, itemId: deposited.itemId,
    column: 0, row: 0, pd2Tables, expectedSourceSha256: before.stash.sha256, expectedBankSha256: hashFile(bankFile) };
  withdrawItem({ ...withdraw, dryRun: true });
  const withdrawn = withdrawItem({ ...withdraw, dryRun: false });

  // Independent inspection of the completed saves, separate from the bank's
  // own commit verification. Exact tree bytes prove preservation of opaque bits.
  const finalCharacter = inspect(characterFile, pd2Tables);
  const finalStash = inspect(stashFile, pd2Tables);
  const prepared = snapshot(characterFile, stashFile, finalCharacter, finalStash);
  assert.equal(prepared.character.rootCount, before.character.rootCount - 1);
  assert.equal(prepared.character.nodeCount, before.character.nodeCount - extracted.nodeCount);
  assert.equal(prepared.stash.rootCount, 2587);
  assert.equal(prepared.stash.nodeCount, before.stash.nodeCount + extracted.nodeCount);
  assert.equal(prepared.stash.landingRootCount, 1);
  assert.equal(prepared.stash.landingNodeCount, extracted.nodeCount);
  assert.equal(finalCharacter.topLevelItems.some(candidate => candidate.code === spec.code && candidate.fingerprint === spec.fingerprint), false);
  const moved = extractStashItem(fs.readFileSync(stashFile), finalStash, { pageIndex: 0, itemIndex: 0 });
  const patched = patchItemLocation(extracted.bytes, { column: 0, row: 0 });
  assert.deepEqual(moved.bytes, patched, 'Transferred tree bytes differ beyond authorized location patch');
  assert.deepEqual(semanticTree(moved.item), semanticTree(item), 'Transferred identity or properties changed');
  assert.equal(moved.item.column, 0);
  assert.equal(moved.item.row, 0);
  assert.equal(listBank(bankFile).items.length, 0);
  for (const file of [bankFile + '.lock', bankFile + '.journal.json', characterFile + '.pd2-mule.lock', stashFile + '.pd2-mule.lock']) {
    assert.equal(exists(file), false, 'Unexpected active transaction metadata');
  }
  const transactions = [deposited, withdrawn].map(result => {
    const committed = JSON.parse(fs.readFileSync(path.join(bankFile + '.transactions', result.transactionId, 'committed.json'), 'utf8'));
    assert.equal(committed.transactionId, result.transactionId);
    assert.equal(committed.status, 'committed');
    for (const entry of committed.entries) {
      if (entry.backupPath !== null) assert.equal(hashFile(entry.backupPath), entry.beforeSha256, 'Transaction backup hash differs');
    }
    return { operation: result.operation, transactionId: result.transactionId, itemId: result.itemId,
      backupPaths: result.backupPaths.map(file => relativeFile(root, file)) };
  });
  return { id: spec.id, characterFile: relativeFile(root, characterFile), stashFile: relativeFile(root, stashFile),
    bankFile: relativeFile(root, bankFile), before, prepared,
    item: { code: item.code, fingerprint: item.fingerprint, stackSize: item.stackSize, socketChildCodes: spec.childCodes,
      nodeCount: extracted.nodeCount, sourcePanel: item.panel, sourceColumn: item.column, sourceRow: item.row,
      destinationPageIndex: 0, destinationColumn: 0, destinationRow: 0,
      rawTreeSha256Before: extracted.sha256, rawTreeSha256Prepared: moved.sha256, patchedTreeSha256Expected: sha256(patched),
      propertiesSha256Before: propertiesHash(item), propertiesSha256Prepared: propertiesHash(moved.item) }, transactions };
}

function checklist(manifest) {
  return `# Disposable PD2 game acceptance checks\n\nStatus: ${STATUS}\n\nThese are independent single-item cases. The preparation uses separate deposit and withdrawal transactions; it does not establish an atomic batch or game acceptance. Retain this pack and its backups as preparation evidence. No files have been placed into a game installation automatically.\n\n1. Use an isolated, compatible PD2 + PlugY installation and a separate disposable save path for each case. Preserve your normal saves. Record game, PD2 and PlugY versions, save-path configuration, and any warnings.\n2. Copy only the two save files for ONE case into its clean disposable save path. Keep their exact basenames. Do not combine cases or copy the whole Library: these personal stashes contain the large Bases fixture. Disable shared-stash mixing for this test.\n3. Load the correct character, inspect the original container, and confirm the selected item is absent there. Open personal stash Landing Page (page index 0); confirm exactly one root item at column 0, row 0.\n\n${manifest.scenarios.map(s => `- ${s.id}: load ${path.basename(s.characterFile, '.d2s')}; files \`${s.characterFile}\` and \`${s.stashFile}\`. Check ${s.item.code} from the original ${s.item.sourcePanel === 1 ? "inventory" : "character stash"} (panel ${s.item.sourcePanel}), column ${s.item.sourceColumn}, row ${s.item.sourceRow}. Parser comparison fingerprint: ${s.item.fingerprint}. ${s.id === 'tome' ? 'Town Portal Book must retain a stack of 20.' : 'Edge Grand Matron Bow must retain its properties and three socket children in order: Tir (r03), Tal (r07), Amn (r11).'} Prepared character roots: ${s.prepared.character.rootCount}; personal stash roots: ${s.prepared.stash.rootCount}; Landing Page roots: 1, physical nodes: ${s.item.nodeCount}.`).join('\n')}\n\n4. Capture item/property/socket screenshots and note load errors, duplicates, missing items, or altered values. Save and exit normally, reload the same character, and repeat source/destination and property checks.\n5. Preserve the game-written copies separately, then reparse both files with this repository's read-only CLI: \`node src/cli.mjs inspect "<game-written-character.d2s>" "<game-written-personal-stash.d2x>"\`. Compare root/node counts to manifest.json. Browse the landing item with \`node src/cli.mjs items "<game-written-personal-stash.d2x>" --page 1 --limit 1\`. Inspect item identity, stack/socket children and decoded properties in the read-only browser: \`node src/cli.mjs ui "<game-written-character.d2s>" "<game-written-personal-stash.d2x>"\`; compare against retained preparation files and screenshots. Game rewrites may change whole-file hashes; retain both versions. Record post-game hashes, results and observations. Mirror the scenario paths from manifest.json inside a separate results directory, retaining both cases. Run \`node scripts/verify-game-acceptance.mjs --pack "<retained-pack>" --results "<post-game-results>"\` to produce a read-only diagnostic JSON report. A passing structural report still leaves game acceptance unverified; retain screenshots and load/save/reload observations for review.\n6. Report pass/fail evidence for BOTH cases. The manifest remains '${STATUS}' until actual game checks and evidence review establish acceptance.\n`;
}

export function prepareGameAcceptance({ outputDir, fixtureDir = getFixtureLibraryDir(), pd2Tables = loadPd2Tables() } = {}) {
  assertPd2TablesCurrent(pd2Tables);
  const fixturesRoot = fs.realpathSync.native(path.resolve(fixtureDir));
  const root = outputPath(outputDir, fixturesRoot, pd2Tables.dataDir);
  const fixturePaths = [...new Set(['Bases.d2x', ...CASES.map(spec => spec.fixture)])];
  const fixtures = fixturePaths.map(relativePath => ({ relativePath, sha256: hashFile(path.join(fixturesRoot, relativePath)) }));
  const tables = tableHashes(pd2Tables.dataDir);
  assert.ok(tables.length > 0, 'No PD2 table files found');
  // All subsequent writes are exclusive copies or journaled edits inside this
  // newly created directory. Failures deliberately retain partial evidence.
  assertPd2TablesCurrent(pd2Tables);
  fs.mkdirSync(path.dirname(root), { recursive: true });
  try { fs.mkdirSync(root); } catch (error) { if (error.code === 'EEXIST') throw new Error('Output directory already exists'); throw error; }
  const scenarios = CASES.map(spec => prepareCase(root, spec, fixturesRoot, pd2Tables));
  for (const fixture of fixtures) assert.equal(hashFile(path.join(fixturesRoot, fixture.relativePath)), fixture.sha256, 'Canonical fixture changed during preparation');
  assertPd2TablesCurrent(pd2Tables);
  assert.deepEqual(tableHashes(pd2Tables.dataDir), tables, 'PD2 tables changed during preparation');
  const manifest = { schemaVersion: 1, status: STATUS, createdAt: new Date().toISOString(), fixtures, tables, scenarios };
  assertPd2TablesCurrent(pd2Tables);
  fs.writeFileSync(path.join(root, 'CHECKLIST.md'), checklist(manifest), { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}
