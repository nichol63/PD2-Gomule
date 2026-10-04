import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadPd2Tables, assertPd2TablesCurrent } from './pd2-data.mjs';
import { inspectSaveFile } from './save-parsers.mjs';
import { calculateCharacterChecksum, inspectCharacterTransferSupport } from './character-serialization.mjs';
import { extractStashItem, sha256 } from './safe-serialization.mjs';

const PREPARED_STATUS = 'prepared; in-game acceptance pending';
const CASES = {
  tome: { basename: 'Amazon', code: 'tbk', fingerprint: 28610618, stackSize: 20, socketChildCodes: [], nodeCount: 1 },
  socketed: { basename: 'freezing-arrow', code: 'amc', fingerprint: 70879556, stackSize: null, socketChildCodes: ['r03', 'r07', 'r11'], nodeCount: 4 }
};

function demand(condition, message) {
  if (!condition) throw new Error(message);
}

function validHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }

function relativePath(value) {
  demand(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !path.isAbsolute(value) && !path.win32.isAbsolute(value)
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..'), 'Manifest contains an unsafe relative path');
  return value;
}

function directory(value, label) {
  demand(typeof value === 'string' && value.trim().length > 0, `${label} directory is required`);
  let root;
  try { root = fs.realpathSync.native(path.resolve(value)); }
  catch (error) { throw new Error(`${label} directory is missing or inaccessible: ${error.message}`); }
  demand(fs.statSync(root).isDirectory(), `${label} must be a directory`);
  return root;
}

function artifact(root, relative, label) {
  const file = path.join(root, relativePath(relative));
  let real;
  try { real = fs.realpathSync.native(file); }
  catch (error) { throw new Error(`${label} is missing or inaccessible: ${relative}: ${error.message}`); }
  const distance = path.relative(root, real);
  demand(distance && distance !== '..' && !distance.startsWith(`..${path.sep}`) && !path.isAbsolute(distance), `${label} escapes its root`);
  demand(fs.statSync(real).isFile(), `${label} must be a file`);
  return { file, real };
}

function validateManifest(manifest) {
  demand(manifest?.schemaVersion === 1 && manifest.status === PREPARED_STATUS, 'Invalid acceptance manifest schema or status');
  demand(Array.isArray(manifest.scenarios) && manifest.scenarios.length === 2, 'Manifest must contain exactly tome and socketed scenarios');
  const ids = new Set();
  for (const scenario of manifest.scenarios) {
    demand(scenario && Object.hasOwn(CASES, scenario.id) && !ids.has(scenario.id), 'Manifest scenario IDs must be unique tome and socketed');
    const spec = CASES[scenario.id];
    ids.add(scenario.id);
    demand(relativePath(scenario.characterFile) === `${scenario.id}/${spec.basename}.d2s`
      && relativePath(scenario.stashFile) === `${scenario.id}/${spec.basename}.d2x`, 'Invalid manifest scenario file layout');
    demand(relativePath(scenario.bankFile) === `${scenario.id}/bank.json`, 'Invalid manifest bank file layout');
    for (const stage of ['before', 'prepared']) {
      for (const kind of ['character', 'stash']) {
        const counts = scenario[stage]?.[kind];
        demand(counts && validHash(counts.sha256) && integer(counts.rootCount) && integer(counts.nodeCount), 'Invalid manifest save hashes or counts');
        if (kind === 'stash') demand(integer(counts.landingRootCount) && integer(counts.landingNodeCount), 'Invalid manifest landing counts');
      }
    }
    const item = scenario.item;
    demand(item && ['code', 'fingerprint', 'stackSize', 'socketChildCodes', 'nodeCount'].every(key => isDeepStrictEqual(item[key], spec[key])), 'Invalid manifest acceptance item identity');
    for (const key of ['sourcePanel', 'sourceColumn', 'sourceRow', 'destinationPageIndex', 'destinationColumn', 'destinationRow']) {
      demand(integer(item[key]), 'Invalid manifest item coordinates');
    }
    demand(item.destinationPageIndex === 0 && item.destinationColumn === 0 && item.destinationRow === 0, 'Invalid manifest destination');
    for (const key of ['rawTreeSha256Before', 'rawTreeSha256Prepared', 'patchedTreeSha256Expected', 'propertiesSha256Before', 'propertiesSha256Prepared']) {
      demand(validHash(item[key]), 'Invalid manifest item hashes');
    }
    demand(item.rawTreeSha256Prepared === item.patchedTreeSha256Expected && item.propertiesSha256Before === item.propertiesSha256Prepared, 'Inconsistent manifest item hashes');
    demand(scenario.prepared.character.rootCount === scenario.before.character.rootCount - 1
      && scenario.prepared.character.nodeCount === scenario.before.character.nodeCount - item.nodeCount
      && scenario.prepared.stash.rootCount === 2587 && scenario.before.stash.rootCount === 2586
      && scenario.prepared.stash.nodeCount === scenario.before.stash.nodeCount + item.nodeCount
      && scenario.prepared.stash.landingRootCount === 1 && scenario.prepared.stash.landingNodeCount === item.nodeCount,
    'Inconsistent manifest preparation counts');
    demand(Array.isArray(scenario.transactions) && scenario.transactions.length === 2, 'Invalid manifest transactions');
    for (const transaction of scenario.transactions) {
      demand(Array.isArray(transaction.backupPaths), 'Invalid manifest transaction backups');
      transaction.backupPaths.forEach(relativePath);
    }
  }
  demand(Array.isArray(manifest.fixtures) && manifest.fixtures.length > 0, 'Invalid manifest fixture provenance');
  for (const fixture of manifest.fixtures) {
    relativePath(fixture.relativePath);
    demand(validHash(fixture.sha256), 'Invalid manifest fixture hash');
  }
  demand(Array.isArray(manifest.tables) && manifest.tables.length > 0, 'Invalid manifest table provenance');
  const names = new Set();
  for (const table of manifest.tables) {
    demand(typeof table.fileName === 'string' && relativePath(table.fileName) === path.basename(table.fileName)
      && table.fileName.toLowerCase().endsWith('.txt') && !names.has(table.fileName.toLowerCase()) && validHash(table.sha256), 'Invalid manifest table name or hash');
    names.add(table.fileName.toLowerCase());
  }
}

function propertyHash(item) {
  return sha256(Buffer.from(JSON.stringify({ properties: item.properties, children: item.children.map(child => ({ code: child.code, fingerprint: child.fingerprint ?? null, properties: child.properties })) })));
}

function cleanProperties(item) {
  if (!item) return null;
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !['byteOffset', 'nextOffset', 'sourceSpan', 'parentOffset', 'startBitOffset', 'endBitOffset'].includes(key))
      .map(([key, entry]) => [key, clean(entry)]));
  };
  return clean({ quality: item.quality, qualityData: item.qualityData, properties: item.properties, propertyLists: item.propertyLists,
    children: item.children });
}

function header(bytes) {
  return bytes.length < 44 ? null : { magic: bytes.readUInt32LE(0), version: bytes.readUInt32LE(4), size: bytes.readUInt32LE(8), checksum: bytes.readUInt32LE(12) };
}

const charCounts = save => ({ rootCount: save.itemCount, nodeCount: save.parsedNodeCount, parsedRoots: save.topLevelItems.length });
const stashCounts = save => ({ rootCount: save.totalItems, nodeCount: save.parsedNodeCount, parsedRoots: save.pages.reduce((sum, page) => sum + page.topLevelItems.length, 0) });
const landingCounts = save => ({ rootCount: save.pages[0]?.itemCount ?? null, nodeCount: save.pages[0]?.parsedNodeCount ?? null });
const pages = save => ({ pageCount: save.pageCount, names: save.pages.map(page => page.name) });
const stashHeader = save => ({ kind: save.kind, signature: save.signature, version: save.version });
const identity = save => ({ name: save.name, classId: save.classId });
const isSelected = (item, spec) => item.code === spec.code && item.fingerprint === spec.fingerprint;
const completeNode = item => item.propertiesComplete === true && !item.coreParseError && !item.propertyParseError;

function compareScenario(scenario, original, result, pd2Tables) {
  const checks = [];
  const check = (code, expected, actual) => checks.push({ code, passed: isDeepStrictEqual(expected, actual), expected, actual });
  const character = result.character.save;
  const stash = result.stash.save;
  const characterBytes = result.character.bytes;
  const h = header(characterBytes);
  check('character-header', { magic: 0xaa55aa55, version: original.character.save.version, size: characterBytes.length,
    checksum: calculateCharacterChecksum(characterBytes) }, h);
  check('character-identity', identity(original.character.save), identity(character));
  check('character-counts', charCounts(original.character.save), charCounts(character));
  check('stash-header', stashHeader(original.stash.save), stashHeader(stash));
  check('stash-counts', stashCounts(original.stash.save), stashCounts(stash));
  check('stash-pages', pages(original.stash.save), pages(stash));
  check('landing-counts', landingCounts(original.stash.save), landingCounts(stash));
  const characterSupport = inspectCharacterTransferSupport(characterBytes, character, { pd2Tables });
  check('complete-records', { character: true, stash: true }, {
    character: characterSupport.supported && character.items.every(completeNode),
    stash: stash.pages.every(page => page.items.every(completeNode) && page.itemCount === page.topLevelItems.length
      && page.parsedNodeCount === page.items.length && page.clampedItemCount === 0 && page.missingSocketChildCount === 0)
  });
  check('source-absence', 0, character.topLevelItems.filter(item => isSelected(item, scenario.item)).length);
  const occurrences = stash.pages.flatMap(page => page.topLevelItems.map((item, index) => ({ item, pageIndex: page.index, itemIndex: index })))
    .filter(entry => isSelected(entry.item, scenario.item));
  check('destination-occurrences', 1, occurrences.length);
  const moved = occurrences[0];
  const item = moved?.item;
  check('destination-location', { pageIndex: 0, column: 0, row: 0, panel: 5, location: 0 }, item ? {
    pageIndex: moved.pageIndex, column: item.column, row: item.row, panel: item.panel, location: item.location } : null);
  check('item-stack', scenario.item.stackSize, item?.stackSize ?? null);
  check('item-sockets', { filled: original.tree.item.socketsFilled, total: original.tree.item.totalSockets, children: scenario.item.socketChildCodes }, item ? {
    filled: item.socketsFilled, total: item.totalSockets, children: item.children.map(child => child.code) } : null);
  const semanticHash = value => value === null ? null : sha256(Buffer.from(JSON.stringify(value)));
  check('item-properties', semanticHash(cleanProperties(original.tree.item)), semanticHash(cleanProperties(item)));
  let tree = null;
  let treeError = null;
  try {
    if (moved?.pageIndex === 0) tree = extractStashItem(result.stash.bytes, stash, { pageIndex: 0, itemIndex: moved.itemIndex });
  } catch (error) { treeError = error.message; }
  check('item-tree-bytes', { sha256: scenario.item.rawTreeSha256Prepared, nodeCount: scenario.item.nodeCount, error: null },
    { sha256: tree?.sha256 ?? null, nodeCount: tree?.nodeCount ?? null, error: treeError });
  const preparedHashes = { character: original.character.sha256, stash: original.stash.sha256 };
  const resultHashes = { character: result.character.sha256, stash: result.stash.sha256 };
  return { id: scenario.id, checks, preparedHashes, resultHashes,
    filesChangedSincePreparation: { character: preparedHashes.character !== resultHashes.character, stash: preparedHashes.stash !== resultHashes.stash } };
}

export function verifyGameAcceptance({ packDir, resultsDir, pd2Tables = loadPd2Tables() } = {}) {
  assertPd2TablesCurrent(pd2Tables);
  const pack = directory(packDir, 'Pack');
  const results = directory(resultsDir, 'Results');
  demand(pack !== results, 'Pack and results must be independent directories');
  const inputs = [];
  const read = target => {
    const bytes = fs.readFileSync(target.real);
    const stat = fs.statSync(target.real);
    const entry = { ...target, bytes, sha256: sha256(bytes), identity: `${stat.dev}:${stat.ino}` };
    inputs.push(entry);
    return entry;
  };
  const manifestInput = read(artifact(pack, 'manifest.json', 'Pack manifest'));
  let manifest;
  try { manifest = JSON.parse(manifestInput.bytes.toString('utf8')); }
  catch (error) { throw new Error(`Invalid acceptance manifest JSON: ${error.message}`); }
  validateManifest(manifest);
  const tablesRoot = directory(pd2Tables.dataDir, 'Tables');
  const diskTableNames = () => fs.readdirSync(tablesRoot).filter(name => name.toLowerCase().endsWith('.txt') && fs.statSync(path.join(tablesRoot, name)).isFile()).sort();
  const tableNames = manifest.tables.map(table => table.fileName).sort();
  demand(isDeepStrictEqual(tableNames, diskTableNames()), 'Table provenance differs from the current table directory');
  for (const table of manifest.tables) {
    const input = read(artifact(tablesRoot, table.fileName, 'PD2 table'));
    demand(input.sha256 === table.sha256, `PD2 table provenance hash mismatch: ${table.fileName}`);
  }
  assertPd2TablesCurrent(pd2Tables);
  const saveIdentities = new Set();
  const loadSave = (root, relative, label) => {
    const input = read(artifact(root, relative, label));
    demand(!saveIdentities.has(input.identity), 'Prepared and result save files must be independent; aliases and hardlinks are refused');
    saveIdentities.add(input.identity);
    try { input.save = inspectSaveFile(input.real, { pd2Tables }); }
    catch (error) { throw new Error(`${label} could not be parsed: ${relative}: ${error.message}`); }
    demand(input.save.sourceSha256 === input.sha256, `${label} changed during parsing`);
    return input;
  };
  const retained = manifest.scenarios.map(scenario => {
    const original = { character: loadSave(pack, scenario.characterFile, 'Prepared character'), stash: loadSave(pack, scenario.stashFile, 'Prepared stash') };
    for (const kind of ['character', 'stash']) demand(original[kind].sha256 === scenario.prepared[kind].sha256, `Prepared ${kind} hash mismatch for ${scenario.id}`);
    demand(isDeepStrictEqual(charCounts(original.character.save), { rootCount: scenario.prepared.character.rootCount, nodeCount: scenario.prepared.character.nodeCount, parsedRoots: scenario.prepared.character.rootCount })
      && isDeepStrictEqual(stashCounts(original.stash.save), { rootCount: scenario.prepared.stash.rootCount, nodeCount: scenario.prepared.stash.nodeCount, parsedRoots: scenario.prepared.stash.rootCount })
      && isDeepStrictEqual(landingCounts(original.stash.save), { rootCount: scenario.prepared.stash.landingRootCount, nodeCount: scenario.prepared.stash.landingNodeCount }), 'Prepared counts differ from manifest');
    original.tree = extractStashItem(original.stash.bytes, original.stash.save, { pageIndex: 0, itemIndex: 0 });
    demand(original.tree.sha256 === scenario.item.rawTreeSha256Prepared && original.tree.nodeCount === scenario.item.nodeCount
      && isSelected(original.tree.item, scenario.item) && propertyHash(original.tree.item) === scenario.item.propertiesSha256Prepared, 'Prepared item differs from manifest');
    const self = compareScenario(scenario, original, original, pd2Tables);
    demand(self.checks.every(check => check.passed), `Prepared scenario ${scenario.id} fails structural invariants`);
    return { scenario, original };
  });
  const scenarios = retained.map(({ scenario, original }) => {
    const result = { character: loadSave(results, scenario.characterFile, 'Result character'), stash: loadSave(results, scenario.stashFile, 'Result stash') };
    return compareScenario(scenario, original, result, pd2Tables);
  });
  for (const input of inputs) {
    const stat = fs.statSync(input.real);
    demand(fs.realpathSync.native(input.file) === input.real && `${stat.dev}:${stat.ino}` === input.identity
      && sha256(fs.readFileSync(input.real)) === input.sha256, 'An input changed during verification; retry with stable copies');
  }
  demand(isDeepStrictEqual(diskTableNames(), tableNames), 'PD2 tables changed during verification');
  assertPd2TablesCurrent(pd2Tables);
  const structuralPassed = scenarios.every(scenario => scenario.checks.every(check => check.passed));
  return { schemaVersion: 1,
    status: `${structuralPassed ? 'structural checks passed' : 'structural checks failed'}; in-game acceptance pending`,
    gameAcceptance: 'unverified', packManifestSha256: manifestInput.sha256, tables: manifest.tables, structuralPassed, scenarios };
}
