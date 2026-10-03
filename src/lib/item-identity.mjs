import fs from 'node:fs';
import path from 'node:path';

const cache = new WeakMap();

function readRows(dataDir, file, skipExpansion = false) {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const headers = lines.shift().split('\t');
  return lines.filter((line) => line && (!skipExpansion || line.split('\t')[0] !== 'Expansion')).map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function loadItemIdentityTables(pd2Tables) {
  if (cache.has(pd2Tables)) return cache.get(pd2Tables);
  const dataDir = pd2Tables.dataDir;
  const families = new Map();
  const itemTypes = new Map();
  for (const file of ['armor.txt', 'weapons.txt', 'Misc.txt']) {
    for (const row of readRows(dataDir, file)) {
      if (!row.code) continue;
      families.set(row.code, new Set([row.code, row.normcode, row.ubercode, row.ultracode].filter(Boolean)));
      itemTypes.set(row.code, [row.type, row.type2].filter(Boolean));
    }
  }
  const tables = {
    uniques: readRows(dataDir, 'UniqueItems.txt', true),
    sets: readRows(dataDir, 'SetItems.txt', true),
    runewords: readRows(dataDir, 'Runes.txt').filter((row) => row.complete === '1'),
    typeParents: new Map(readRows(dataDir, 'ItemTypes.txt').map((row) => [row.Code, [row.Equiv1, row.Equiv2].filter(Boolean)])),
    families,
    itemTypes
  };
  cache.set(pd2Tables, tables);
  return tables;
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
