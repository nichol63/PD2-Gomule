import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertPd2TablesCurrent, getPd2TableProvenance } from './pd2-data.mjs';

const cache = new WeakMap();
const provenance = new WeakMap();
const CORE_FILES = ['armor.txt', 'weapons.txt', 'Misc.txt'];
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const reloadError = () => new Error('PD2 item identity tables changed or became inaccessible; reload PD2 tables before continuing');

function readRows(dataDir, file, skipExpansion = false, snapshot = null) {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) {
    if (snapshot) {
      snapshot.files.push(Object.freeze({ fileName: file, sha256: null }));
      snapshot.targets.set(file, null);
      if (snapshot.coreHashes.has(file)) throw reloadError();
    }
    return [];
  }
  const target = snapshot ? fs.realpathSync.native(filePath) : null;
  const bytes = fs.readFileSync(filePath);
  if (snapshot) {
    const sha256 = hashBytes(bytes);
    snapshot.files.push(Object.freeze({ fileName: file, sha256 }));
    snapshot.targets.set(file, target);
    if (snapshot.coreHashes.has(file) && snapshot.coreHashes.get(file) !== sha256) throw reloadError();
  }
  // Snapshot the same read that supplies decoded family and naming rows.
  const lines = bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const headers = lines.shift().split('\t');
  return lines.filter((line) => line && (!skipExpansion || line.split('\t')[0] !== 'Expansion')).map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function loadItemIdentityTables(pd2Tables) {
  if (cache.has(pd2Tables)) return cache.get(pd2Tables);
  let core = null;
  try { core = getPd2TableProvenance(pd2Tables); } catch { /* Read-only mocks keep optional fallbacks. */ }
  if (core) assertPd2TablesCurrent(pd2Tables);
  const dataDir = pd2Tables.dataDir;
  let snapshot = null;
  if (core) {
    try {
      snapshot = {
        requestedRoot: path.resolve(dataDir), realRoot: fs.realpathSync.native(dataDir),
        files: [], targets: new Map(), coreHashes: new Map(core.map(entry => [entry.fileName, entry.sha256]))
      };
    } catch { throw reloadError(); }
  }
  const rows = (file, skipExpansion = false) => {
    try { return readRows(dataDir, file, skipExpansion, snapshot); }
    catch (error) { if (snapshot) throw reloadError(); throw error; }
  };
  const families = new Map();
  const itemTypes = new Map();
  for (const file of CORE_FILES) {
    for (const row of rows(file)) {
      if (!row.code) continue;
      families.set(row.code, new Set([row.code, row.normcode, row.ubercode, row.ultracode].filter(Boolean)));
      itemTypes.set(row.code, [row.type, row.type2].filter(Boolean));
    }
  }
  const tables = {
    uniques: rows('UniqueItems.txt', true),
    sets: rows('SetItems.txt', true),
    runewords: rows('Runes.txt').filter((row) => row.complete === '1'),
    typeParents: new Map(rows('ItemTypes.txt').map((row) => [row.Code, [row.Equiv1, row.Equiv2].filter(Boolean)])),
    families,
    itemTypes
  };
  if (snapshot) {
    assertPd2TablesCurrent(pd2Tables);
    snapshot.files = Object.freeze(snapshot.files);
    provenance.set(pd2Tables, snapshot);
  }
  cache.set(pd2Tables, tables);
  return tables;
}

export function getItemIdentityTableProvenance(pd2Tables) {
  getPd2TableProvenance(pd2Tables);
  loadItemIdentityTables(pd2Tables);
  return provenance.get(pd2Tables).files;
}

export function assertItemIdentityTablesCurrent(pd2Tables) {
  const core = assertPd2TablesCurrent(pd2Tables);
  const files = getItemIdentityTableProvenance(pd2Tables);
  const snapshot = provenance.get(pd2Tables);
  const coreHashes = new Map(core.map(entry => [entry.fileName, entry.sha256]));
  try {
    if (path.resolve(pd2Tables.dataDir) !== snapshot.requestedRoot || fs.realpathSync.native(snapshot.requestedRoot) !== snapshot.realRoot) throw reloadError();
    for (const entry of files) {
      if (CORE_FILES.includes(entry.fileName) && coreHashes.get(entry.fileName) !== entry.sha256) throw reloadError();
      const file = path.join(snapshot.requestedRoot, entry.fileName);
      if (entry.sha256 === null) {
        if (fs.existsSync(file)) throw reloadError();
      } else if (!fs.existsSync(file) || fs.realpathSync.native(file) !== snapshot.targets.get(entry.fileName) || hashBytes(fs.readFileSync(file)) !== entry.sha256) {
        throw reloadError();
      }
    }
  } catch { throw reloadError(); }
  return files;
}

function compatibleCode(actual, expected, tables) {
  return actual === expected || tables.families.get(actual)?.has(expected) || tables.families.get(expected)?.has(actual);
}

function typeClosure(item, tables) {
  const result = new Set(tables.itemTypes.get(item.code) ?? [item.type, item.type2].filter(Boolean));
  const pending = [...result];
  while (pending.length) {
    for (const parent of tables.typeParents.get(pending.pop()) ?? []) {
      if (!result.has(parent)) { result.add(parent); pending.push(parent); }
    }
  }
  return result;
}

export function resolveItemIdentity(item, pd2Tables) {
  const baseName = item.baseName ?? item.itemInfo?.name ?? item.displayName ?? item.code;
  const fallback = { baseName, displayName: baseName, namedItem: null, nameSource: null };
  if (item.coreParseError || !item.itemInfo) return fallback;
  const tables = loadItemIdentityTables(pd2Tables);
  if (item.quality === 7 || item.quality === 5) {
    const kind = item.quality === 7 ? 'unique' : 'set';
    const id = item.qualityData?.[kind === 'unique' ? 'uniqueId' : 'setId'];
    const row = (kind === 'unique' ? tables.uniques : tables.sets)[id];
    const sourceCode = row?.[kind === 'unique' ? 'code' : 'item'];
    if (Number.isInteger(id) && row?.index && compatibleCode(item.code, sourceCode, tables)) {
      return { baseName, displayName: row.index, namedItem: { kind, id, name: row.index, ...(kind === 'set' ? { setName: row.set } : {}) }, nameSource: `${kind === 'unique' ? 'UniqueItems' : 'SetItems'}.txt:${id}` };
    }
  }
  if (item.isRuneword && item.children?.length && item.children.length === item.socketsFilled) {
    const runes = item.children.map((child) => child.code);
    const types = typeClosure(item, tables);
    const matches = tables.runewords.filter((row) => {
      const recipe = Array.from({ length: 6 }, (_, index) => row[`Rune${index + 1}`]).filter(Boolean);
      const allowed = Array.from({ length: 6 }, (_, index) => row[`itype${index + 1}`]).filter(Boolean);
      const excluded = Array.from({ length: 3 }, (_, index) => row[`etype${index + 1}`]).filter(Boolean);
      return recipe.length === runes.length && recipe.every((code, index) => code === runes[index]) && allowed.some((type) => types.has(type)) && !excluded.some((type) => types.has(type));
    });
    if (matches.length === 1) {
      const row = matches[0];
      return { baseName, displayName: row['Rune Name'], namedItem: { kind: 'runeword', id: row.Name, name: row['Rune Name'], runes }, nameSource: `Runes.txt:${row.Name}` };
    }
  }
  return fallback;
}

export function enrichParsedSave(save, pd2Tables) {
  const seen = new Set();
  const visit = (item) => {
    if (seen.has(item)) return;
    seen.add(item);
    for (const child of item.children ?? []) visit(child);
    Object.assign(item, resolveItemIdentity(item, pd2Tables));
  };
  for (const item of save.items ?? []) visit(item);
  for (const page of save.pages ?? []) for (const item of page.items ?? []) visit(item);
  return save;
}
