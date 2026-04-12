import fs from 'node:fs';
import path from 'node:path';

import { getDefaultPd2DataDir } from './workspace-paths.mjs';

const ITEM_TABLE_FILES = [
  'armor.txt',
  'weapons.txt',
  'Misc.txt'
];
const ITEM_STAT_COST_FILE = 'ItemStatCost.txt';
const SKILLS_FILE = 'Skills.txt';
const MONSTER_TABLE_FILE = 'MonStats.txt';

const CODE_COLUMNS_BY_TABLE = {
  'armor.txt': ['code', 'normcode', 'ubercode', 'ultracode'],
  'weapons.txt': ['code', 'normcode', 'ubercode', 'ultracode'],
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

function loadTableRows(tablePath) {
  const text = fs.readFileSync(tablePath, 'utf8');
  return parseTsv(text);
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
    stackable: row.stackable === '1'
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
  const itemsByCode = new Map();
  const itemStatsById = new Map();
  const skillsById = new Map();
  const monstersById = new Map();

  for (const tableFile of ITEM_TABLE_FILES) {
    const tablePath = path.join(dataDir, tableFile);
    const rows = loadTableRows(tablePath);
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

  const itemStatRows = loadTableRows(path.join(dataDir, ITEM_STAT_COST_FILE));
  for (const row of itemStatRows) {
    const statRecord = buildItemStatRecord(row);
    if (statRecord.id === null || !statRecord.stat) {
      continue;
    }

    itemStatsById.set(statRecord.id, statRecord);
  }

  const skillRows = loadTableRows(path.join(dataDir, SKILLS_FILE));
  for (const row of skillRows) {
    const skillRecord = buildSkillRecord(row);
    if (skillRecord.id === null || !skillRecord.name) {
      continue;
    }

    skillsById.set(skillRecord.id, skillRecord);
  }

  const monsterRows = loadTableRows(path.join(dataDir, MONSTER_TABLE_FILE));
  for (const row of monsterRows) {
    const monsterRecord = buildMonsterRecord(row);
    if (monsterRecord.id === null) {
      continue;
    }

    monstersById.set(monsterRecord.id, monsterRecord);
  }

  return {
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
}
