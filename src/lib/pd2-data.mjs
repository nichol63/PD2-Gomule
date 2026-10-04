import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { getDefaultPd2DataDir } from './workspace-paths.mjs';

const ITEM_TABLE_FILES = [
  'armor.txt',
  'weapons.txt',
  'Misc.txt'
];
const ITEM_STAT_COST_FILE = 'ItemStatCost.txt';
const SKILLS_FILE = 'Skills.txt';
const MONSTER_TABLE_FILE = 'MonStats.txt';
const LOADED_PROVENANCE = new WeakMap();
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');

export function getPd2TableProvenance(tables) {
  const captured = LOADED_PROVENANCE.get(tables);
  if (!captured) throw new Error('PD2 tables have no loaded provenance; reload PD2 tables before continuing');
  return captured.files;
}

export function assertPd2TablesCurrent(tables) {
  const files = getPd2TableProvenance(tables);
  const captured = LOADED_PROVENANCE.get(tables);
  try {
    if (path.resolve(tables.dataDir) !== captured.requestedRoot || fs.realpathSync.native(captured.requestedRoot) !== captured.realRoot) {
      throw new Error('Table directory changed');
    }
    for (const entry of files) {
      const file = path.join(captured.requestedRoot, entry.fileName);
      if (fs.realpathSync.native(file) !== captured.targets.get(entry.fileName) || hashBytes(fs.readFileSync(file)) !== entry.sha256) {
        throw new Error('Table contents or target changed');
      }
    }
  } catch {
    throw new Error('PD2 tables changed or became inaccessible; reload PD2 tables before continuing');
  }
  return files;
}

const CODE_COLUMNS_BY_TABLE = {
  // Upgrade columns describe related bases, not aliases for this row. Indexing
  // them would overwrite Cap with Shako and Mage Plate with Archon Plate.
  'armor.txt': ['code'],
  'weapons.txt': ['code'],
  'Misc.txt': ['code']
};

function parseTsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const columns = line.split('\t');
    const row = {};

    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = columns[index] ?? '';
    }

    return row;
  });
}

function buildItemRecord(row, tableFile, codeColumn) {
  return {
    code: row[codeColumn]?.trim() || '',
    codeColumn,
    name: row.name?.trim() || row['*name']?.trim() || row.code?.trim() || '',
    namestr: row.namestr?.trim() || '',
    type: row.type?.trim() || '',
    type2: row.type2?.trim() || '',
    section: tableFile,
    invFile: row.invfile?.trim() || '',
    invWidth: Number.parseInt(row.invwidth ?? '', 10) || 0,
    invHeight: Number.parseInt(row.invheight ?? '', 10) || 0,
    stackable: row.stackable === '1',
    minStack: parseOptionalInt(row.minstack),
    maxStack: parseOptionalInt(row.maxstack)
  };
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildItemStatRecord(row) {
  return {
    id: parseOptionalInt(row.ID),
    stat: row.Stat?.trim() || '',
    saveBits: parseOptionalInt(row['Save Bits']) ?? 0,
    saveAdd: parseOptionalInt(row['Save Add']) ?? 0,
    saveParamBits: parseOptionalInt(row['Save Param Bits']),
    csvBits: parseOptionalInt(row.CSvBits),
    csvParam: parseOptionalInt(row.CSvParam),
    descPriority: parseOptionalInt(row.descpriority),
    descFunc: parseOptionalInt(row.descfunc),
    descVal: parseOptionalInt(row.descval),
    descStringKey: row.descstrpos?.trim() || '',
    descStringNegKey: row.descstrneg?.trim() || '',
    descString2Key: row.descstr2?.trim() || '',
    groupId: parseOptionalInt(row.dgrp),
    groupFunc: parseOptionalInt(row.dgrpfunc),
    groupVal: parseOptionalInt(row.dgrpval)
  };
}

function buildSkillRecord(row) {
  return {
    id: parseOptionalInt(row.Id),
    name: row.skill?.trim() || '',
    charClass: row.charclass?.trim() || '',
    skillDesc: row.skilldesc?.trim() || ''
  };
}

function getRowValue(row, ...keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return '';
}

function buildMonsterRecord(row) {
  const id = parseOptionalInt(getRowValue(row, 'hcIdx', 'hcIDx', 'hcID', 'ID'));
  const nameKey = getRowValue(row, 'NameStr', 'namestr').trim();
  const code = getRowValue(row, 'Code', 'code').trim();
  const name = getRowValue(row, 'Name', 'name', 'DisplayName').trim() || nameKey || code;

  return {
    id,
    code,
    name,
    nameKey
  };
}

export function loadPd2Tables(dataDir = getDefaultPd2DataDir()) {
  const requestedRoot = path.resolve(dataDir);
  const realRoot = fs.realpathSync.native(requestedRoot);
  const provenance = [];
  const targets = new Map();
  const loadRows = fileName => {
    const tablePath = path.join(requestedRoot, fileName);
    targets.set(fileName, fs.realpathSync.native(tablePath));
    const bytes = fs.readFileSync(tablePath);
    provenance.push(Object.freeze({ fileName, sha256: hashBytes(bytes) }));
    // Hash and decode the same read, so the evidence describes loaded records.
    return parseTsv(bytes.toString('utf8'));
  };
  const itemsByCode = new Map();
  const itemStatsById = new Map();
  const skillsById = new Map();
  const monstersById = new Map();

  for (const tableFile of ITEM_TABLE_FILES) {
    const rows = loadRows(tableFile);
    const codeColumns = CODE_COLUMNS_BY_TABLE[tableFile] ?? ['code'];

    for (const row of rows) {
      for (const codeColumn of codeColumns) {
        const code = row[codeColumn]?.trim();
        if (!code) {
          continue;
        }

        itemsByCode.set(code, buildItemRecord(row, tableFile, codeColumn));
      }
    }
  }

  const itemStatRows = loadRows(ITEM_STAT_COST_FILE);
  for (const row of itemStatRows) {
    const statRecord = buildItemStatRecord(row);
    if (statRecord.id === null || !statRecord.stat) {
      continue;
    }

    itemStatsById.set(statRecord.id, statRecord);
  }

  const skillRows = loadRows(SKILLS_FILE);
  for (const row of skillRows) {
    const skillRecord = buildSkillRecord(row);
    if (skillRecord.id === null || !skillRecord.name) {
      continue;
    }

    skillsById.set(skillRecord.id, skillRecord);
  }

  const monsterRows = loadRows(MONSTER_TABLE_FILE);
  for (const row of monsterRows) {
    const monsterRecord = buildMonsterRecord(row);
    if (monsterRecord.id === null) {
      continue;
    }

    monstersById.set(monsterRecord.id, monsterRecord);
  }

  const tables = {
    dataDir,
    itemsByCode,
    itemStatsById,
    skillsById,
    monstersById,
    resolveItemCode(code) {
      return itemsByCode.get(code) ?? null;
    },
    resolveItemStat(id) {
      return itemStatsById.get(id) ?? null;
    },
    resolveSkill(id) {
      return skillsById.get(id) ?? null;
    },
    resolveMonster(id) {
      return monstersById.get(id) ?? null;
    }
  };
  LOADED_PROVENANCE.set(tables, { files: Object.freeze(provenance), requestedRoot, realRoot, targets });
  return tables;
}
