import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadPd2Tables } from './pd2-data.mjs';
import { inspectSaveFile, validateItemSourcePartition } from './save-parsers.mjs';
import { getDefaultPd2DataDir, getFixtureLibraryDir } from './workspace-paths.mjs';

const SAVE_EXTENSIONS = new Set(['.d2s', '.d2x', '.sss']);
const TABLE_FILES = [
  'armor.txt',
  'weapons.txt',
  'Misc.txt',
  'ItemStatCost.txt',
  'Skills.txt',
  'MonStats.txt',
  'UniqueItems.txt',
  'SetItems.txt',
  'Runes.txt',
  'ItemTypes.txt'
].sort();

class CoverageDriftError extends Error {}

function fileHash(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

function listSaveFiles(root) {
  const files = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile() && SAVE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(filePath);
      }
    }
  }

  visit(root);
  return files.sort((left, right) =>
    path.relative(root, left).replaceAll('\\', '/').localeCompare(
      path.relative(root, right).replaceAll('\\', '/'), 'en'
    )
  );
}

function relativeFile(root, filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}

function countItems(items) {
  return items.filter((item) => !item.propertiesComplete).length;
}

function itemRecoveries(relativePath, page, items) {
  return items.filter((item) => item.parseRecovery).map((item) => ({
    file: relativePath,
    pageIndex: page?.index ?? null,
    pageName: page?.name ?? null,
    itemOffset: item.byteOffset,
    itemCode: item.code,
    itemName: item.displayName,
    parseProfile: item.parseProfile,
    parseRecovery: item.parseRecovery
  }));
}

function countProperties(items) {
  return items.reduce((sum, item) => sum + (item.propertyCount ?? 0), 0);
}

function countPropertyLists(items, complete) {
  return items.reduce(
    (sum, item) => sum + (item.propertyLists ?? []).filter((list) => list.complete === complete).length,
    0
  );
}

function itemFailures(relativePath, page, items) {
  const failures = [];
  for (const item of items) {
    for (const list of item.propertyLists ?? []) {
      if (list.complete) {
        continue;
      }
      failures.push({
        type: 'item',
        file: relativePath,
        pageIndex: page?.index ?? null,
        pageName: page?.name ?? null,
        itemOffset: item.byteOffset,
        itemEndOffset: item.nextOffset,
        itemCode: item.code,
        itemName: item.displayName,
        qualityLabel: item.qualityLabel,
        listKind: list.kind,
        error: list.error,
        failedStatId: list.failedStatId ?? null,
        failedBitOffset: list.failedBitOffset ?? null,
        itemEndBitOffset: item.nextOffset * 8
      });
    }
  }
  return failures;
}

function summarizePage(page) {
  return {
    index: page.index,
    name: page.name,
    declaredItemCount: page.itemCount,
    parsedItemCount: page.parsedItemCount,
    parsedNodeCount: page.parsedNodeCount,
    topLevelItemCount: page.topLevelItems.length,
    clampedItemCount: page.clampedItemCount,
    missingSocketChildCount: page.missingSocketChildCount,
    parsedPropertyCount: countProperties(page.items),
    incompletePropertyListCount: countPropertyLists(page.items, false),
    incompleteItemCount: countItems(page.items),
    recoveredItemCount: page.items.filter((item) => item.parseRecovery).length,
    pageRegion: page.pageRegion,
    itemRegion: page.itemRegion
  };
}

function summarizePartition(buffer, region, items, page = null) {
  const partition = validateItemSourcePartition(buffer, region, items);
  return {
    pageIndex: page?.index ?? null,
    pageName: page?.name ?? null,
    region: partition.region,
    itemCount: partition.itemCount,
    contiguous: partition.contiguous,
    boundedBytesMatch: partition.boundedBytesMatch,
    uncoveredBytes: partition.uncoveredBytes,
    overlapBytes: partition.overlapBytes,
    overflowBytes: partition.overflowBytes,
    startsAtRegionStart: partition.startsAtRegionStart,
    endsAtRegionEnd: partition.endsAtRegionEnd
  };
}

function summarizeSave(root, filePath, summary, hash) {
  const relativePath = relativeFile(root, filePath);
  const pages = summary.pages ?? [];
  const itemGroups = pages.length > 0 ? pages : [summary];
  const allItems = itemGroups.flatMap((group) => group.items ?? []);
  const topLevelItemCount = itemGroups.reduce(
    (sum, group) => sum + (group.topLevelItems?.length ?? 0), 0
  );
  const buffer = fs.readFileSync(filePath);
  const partitionHash = crypto.createHash('sha256').update(buffer).digest('hex');
  if (summary.sourceSha256 !== hash.sha256 || partitionHash !== hash.sha256) {
    throw new CoverageDriftError(`Save changed during coverage scan: ${relativePath}`);
  }
  const sourcePartitions = pages.length > 0
    ? pages.map((page) => summarizePartition(buffer, page.itemRegion, page.items, page))
    : summary.itemRegion
      ? [summarizePartition(buffer, summary.itemRegion, summary.items)]
      : [];

  return {
    file: relativePath,
    bytes: hash.bytes,
    sha256: hash.sha256,
    kind: summary.kind,
    version: summary.version,
    declaredItemCount: summary.totalItems ?? summary.itemCount ?? 0,
    parsedItemCount: summary.parsedItemCount,
    parsedNodeCount: summary.parsedNodeCount,
    topLevelItemCount,
    parsedPropertyCount: countProperties(allItems),
    completePropertyListCount: countPropertyLists(allItems, true),
    incompletePropertyListCount: countPropertyLists(allItems, false),
    incompleteItemCount: countItems(allItems),
    recoveredItemCount: allItems.filter((item) => item.parseRecovery).length,
    pageCount: pages.length,
    pages: pages.map(summarizePage),
    sourcePartitions,
    recoveries: itemGroups.flatMap((group) =>
      itemRecoveries(relativePath, pages.length > 0 ? group : null, group.items ?? [])
    ),
    failures: itemGroups.flatMap((group) =>
      itemFailures(relativePath, pages.length > 0 ? group : null, group.items ?? [])
    )
  };
}

export function collectParserCoverage(options = {}) {
  const fixtureRoot = path.resolve(options.fixtureRoot ?? getFixtureLibraryDir());
  const dataDir = path.resolve(options.dataDir ?? options.pd2Tables?.dataDir ?? getDefaultPd2DataDir());
  const tableHashes = TABLE_FILES.map((file) => ({
    file,
    ...fileHash(path.join(dataDir, file))
  }));
  const pd2Tables = options.pd2Tables ?? loadPd2Tables(dataDir);
  const loadedTableHashes = TABLE_FILES.map((file) => ({
    file,
    ...fileHash(path.join(dataDir, file))
  }));
  if (JSON.stringify(tableHashes) !== JSON.stringify(loadedTableHashes)) {
    throw new CoverageDriftError('PD2 tables changed while loading coverage inputs');
  }
  const files = [];
  const failures = [];
  const savePaths = listSaveFiles(fixtureRoot);

  for (const filePath of savePaths) {
    const hash = fileHash(filePath);
    try {
      const summary = inspectSaveFile(filePath, { pd2Tables });
      const file = summarizeSave(fixtureRoot, filePath, summary, hash);
      files.push(file);
      failures.push(...file.failures);
    } catch (error) {
      if (error instanceof CoverageDriftError) {
        throw error;
      }
      const file = relativeFile(fixtureRoot, filePath);
      const failure = {
        type: 'file',
        file,
        error: error.message
      };
      files.push({
        file,
        ...hash,
        kind: null,
        version: null,
        declaredItemCount: null,
        parsedItemCount: null,
        parsedNodeCount: null,
        topLevelItemCount: null,
        parsedPropertyCount: null,
        completePropertyListCount: null,
        incompletePropertyListCount: null,
        incompleteItemCount: null,
        recoveredItemCount: 0,
        pageCount: null,
        pages: [],
        sourcePartitions: [],
        recoveries: [],
        failures: [failure]
      });
      failures.push(failure);
    }
  }

  if (JSON.stringify(savePaths) !== JSON.stringify(listSaveFiles(fixtureRoot))) {
    throw new CoverageDriftError('Save file set changed during coverage scan');
  }
  for (const file of files) {
    if (fileHash(path.join(fixtureRoot, file.file)).sha256 !== file.sha256) {
      throw new CoverageDriftError(`Save changed during coverage scan: ${file.file}`);
    }
  }
  const finalTableHashes = TABLE_FILES.map((file) => ({
    file,
    ...fileHash(path.join(dataDir, file))
  }));
  if (JSON.stringify(tableHashes) !== JSON.stringify(finalTableHashes)) {
    throw new CoverageDriftError('PD2 tables changed during coverage scan');
  }

  const parsedFiles = files.filter((file) => file.kind !== null);
  const sourcePartitionAnomalies = parsedFiles.flatMap((file) =>
    file.sourcePartitions
      .filter((partition) => !partition.contiguous || !partition.boundedBytesMatch || partition.overflowBytes > 0)
      .map((partition) => ({ file: file.file, ...partition }))
  );
  const totals = {
    fileCount: files.length,
    parsedFileCount: parsedFiles.length,
    fileErrorCount: files.length - parsedFiles.length,
    characterCount: parsedFiles.filter((file) => file.kind === 'character').length,
    stashCount: parsedFiles.filter((file) => file.kind !== 'character').length,
    pageCount: parsedFiles.reduce((sum, file) => sum + file.pageCount, 0),
    declaredItemCount: parsedFiles.reduce((sum, file) => sum + file.declaredItemCount, 0),
    parsedItemCount: parsedFiles.reduce((sum, file) => sum + file.parsedItemCount, 0),
    parsedNodeCount: parsedFiles.reduce((sum, file) => sum + file.parsedNodeCount, 0),
    topLevelItemCount: parsedFiles.reduce((sum, file) => sum + file.topLevelItemCount, 0),
    parsedPropertyCount: parsedFiles.reduce((sum, file) => sum + file.parsedPropertyCount, 0),
    completePropertyListCount: parsedFiles.reduce((sum, file) => sum + file.completePropertyListCount, 0),
    incompletePropertyListCount: parsedFiles.reduce((sum, file) => sum + file.incompletePropertyListCount, 0),
    incompleteItemCount: parsedFiles.reduce((sum, file) => sum + file.incompleteItemCount, 0),
    recoveredItemCount: parsedFiles.reduce((sum, file) => sum + file.recoveredItemCount, 0),
    sourcePartitionAnomalyCount: sourcePartitionAnomalies.length,
    failureCount: failures.length
  };

  return {
    schemaVersion: 1,
    fixtureRoot,
    dataDir,
    tableHashes,
    totals,
    files,
    sourcePartitionAnomalies,
    recoveries: parsedFiles.flatMap((file) => file.recoveries),
    failures
  };
}
