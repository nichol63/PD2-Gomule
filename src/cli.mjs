import fs from 'node:fs';
import path from 'node:path';
import { runBankCli } from './bank-cli.mjs';

import {
  collectBrowseEntries,
  filterBrowseEntries,
  limitBrowseEntries,
  listPages,
  resolvePage,
  searchSummaries,
  sortBrowseEntries
} from './lib/browser-index.mjs';
import { summarizeCollection } from './lib/collection-tracker.mjs';
import { describeCopyLocation } from './lib/collection-view.mjs';
import { findSharedFingerprints } from './lib/duplicate-report.mjs';
import { discoverSaveFiles } from './lib/inspector-model.mjs';
import { startInspectorServer } from './lib/inspector-server.mjs';
import { loadPd2Tables } from './lib/pd2-data.mjs';
import { inspectSaveFile } from './lib/save-parsers.mjs';
import { getFixtureLibraryDir } from './lib/workspace-paths.mjs';

function formatItemSample(item) {
  const position = `loc=${item.location}/${item.panel} @ ${item.column},${item.row}`;
  const sockets = item.totalSockets > 0
    ? ` sockets=${item.socketsFilled}/${item.totalSockets}`
    : item.socketsFilled > 0
      ? ` sockets=${item.socketsFilled}`
      : '';
  const properties = item.propertyCount > 0 ? ` props=${item.propertyCount}` : '';
  const incomplete = item.propertiesComplete === false ? ' props=incomplete' : '';
  return `${item.displayName} [${item.code}] ${item.qualityLabel} ${position}${sockets}${properties}${incomplete}`;
}

function formatCharacter(summary) {
  const visibleItems = summary.topLevelItems ?? summary.items;
  const lines = [
    `FILE       ${summary.filePath}`,
    `TYPE       ${summary.kind}`,
    `VERSION    ${summary.version}`,
    `NAME       ${summary.name}`,
    `CLASS      ${summary.className}`,
    `LEVEL      ${summary.level}`,
    `ITEMS      ${summary.itemCount ?? 'unknown'}`,
    `PARSED     ${summary.parsedItemCount}/${summary.parsedNodeCount}`
  ];

  for (const [index, item] of visibleItems.slice(0, 10).entries()) {
    lines.push(`ITEM       ${index + 1}\t${formatItemSample(item)}`);
  }

  if (visibleItems.length > 10) {
    lines.push(`ITEM       ...\t${visibleItems.length - 10} more`);
  }

  return lines.join('\n');
}

function formatPlugy(summary) {
  const lines = [
    `FILE       ${summary.filePath}`,
    `TYPE       ${summary.kind}`,
    `SIGNATURE  ${summary.signature.replace(/\0/g, '\\0')}`,
    `VERSION    ${summary.version}`,
    `PAGES      ${summary.pageCount}`,
    `ITEMS      ${summary.totalItems}`,
    `PARSED     ${summary.parsedItemCount}/${summary.parsedNodeCount}`
  ];

  for (const page of summary.pages.slice(0, 10)) {
    const sampleItems = (page.topLevelItems ?? page.items)
      .slice(0, 3)
      .map((item) => item.displayName)
      .join(', ');
    const suffix = sampleItems ? `\t${sampleItems}` : '';
    lines.push(`PAGE       ${page.index + 1}\t${page.itemCount}\t${page.name}${suffix}`);
  }

  if (summary.pages.length > 10) {
    lines.push(`PAGE       ...\t${summary.pages.length - 10} more`);
  }

  return lines.join('\n');
}

function formatBrowseEntry(entry) {
  const source = entry.pageName
    ? `${entry.fileName} :: ${entry.pageName}`
    : entry.characterName
      ? `${entry.fileName} :: ${entry.characterName}`
      : entry.fileName;

  const position = `loc=${entry.location}/${entry.panel} @ ${entry.column},${entry.row}`;
  const sockets = entry.totalSockets > 0
    ? ` sockets=${entry.socketsFilled}/${entry.totalSockets}`
    : entry.socketsFilled > 0
      ? ` sockets=${entry.socketsFilled}`
      : '';
  const properties = entry.propertyCount > 0 ? ` props=${entry.propertyCount}` : '';
  const incomplete = entry.propertiesComplete ? '' : ' props=incomplete';

  return `${entry.displayName} [${entry.code}] ${entry.qualityLabel} ${position}${sockets}${properties}${incomplete}\t${source}`;
}

function printSummary(summary) {
  if (summary.kind === 'character') {
    console.log(formatCharacter(summary));
    return;
  }

  console.log(formatPlugy(summary));
}

function printBanner(pd2Tables) {
  console.log(`PD2_DATA   ${path.normalize(pd2Tables.dataDir)}`);
  console.log(`ITEM_CODES ${pd2Tables.itemsByCode.size}`);
  console.log('');
}

function parseCliArguments(args) {
  const options = {
    sort: 'name',
    limit: 25
  };
  const fileArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case '--query':
      case '-q':
        options.query = args[index + 1] ?? '';
        index += 1;
        break;
      case '--page':
        options.page = args[index + 1] ?? '';
        index += 1;
        break;
      case '--sort':
        options.sort = args[index + 1] ?? 'name';
        index += 1;
        break;
      case '--limit':
        options.limit = args[index + 1] ?? '25';
        index += 1;
        break;
      case '--quality':
        options.quality = args[index + 1] ?? '';
        index += 1;
        break;
      case '--host':
        options.host = args[index + 1] ?? '127.0.0.1';
        index += 1;
        break;
      case '--port':
        options.port = args[index + 1] ?? '4173';
        index += 1;
        break;
      case '--bank':
        if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('--bank requires a file path.');
        options.bankPath = args[++index];
        break;
      case '--experimental-write':
        options.experimentalWrite = true;
        break;
      case '--complete-only':
        options.completeOnly = true;
        break;
      case '--missing':
        options.missing = true;
        break;
      case '--owned':
        options.owned = true;
        break;
      case '--format':
        options.format = args[index + 1] ?? '';
        index += 1;
        break;
      default:
        fileArgs.push(arg);
        break;
    }
  }

  return { fileArgs, options };
}

function printUsage() {
  console.error('Usage:');
  console.error('  node ./src/cli.mjs inspect <save files...>');
  console.error('  node ./src/cli.mjs pages <stash file> [--query <text>] [--limit <n>]');
  console.error('  node ./src/cli.mjs items <save file> [--page <name|index>] [--query <text>] [--quality <label>] [--sort <name|quality|props|sockets|source|position>] [--limit <n>] [--complete-only]');
  console.error('  node ./src/cli.mjs search <save files...> --query <text> [--quality <label>] [--sort <name|quality|props|sockets|source|position>] [--limit <n>] [--complete-only]');
  console.error('  node ./src/cli.mjs collection <save files or directories...> [--owned] [--missing] [--format <text|json>]');
  console.error('  node ./src/cli.mjs dupes <save files or directories...> [--limit <n>] [--format <text|json>]');
  console.error('  node ./src/cli.mjs ui [save files or directories...] [--host <addr>] [--port <n>] [--bank <bank.json>] [--experimental-write]');
  console.error('  node ./src/cli.mjs bank list --bank <bank.json> [--query <text>] [--sort <stored|name|source>]');
  console.error('  node ./src/cli.mjs bank deposit --bank <bank.json> --source <save> [--page <1-based stash page>] --item <1-based item> [--experimental-write] [--dry-run]');
  console.error('  node ./src/cli.mjs bank withdraw --bank <bank.json> --item-id <id> --destination <save> [--page <1-based stash page> | --panel <inventory|cube|stash>] --column <0-based column> --row <0-based row> [--experimental-write] [--dry-run]');
  console.error('  node ./src/cli.mjs bank recover --bank <bank.json> [--source <disposable save>] [--experimental-write] [--dry-run]');
  console.error('  Bank mutations default to dry-run. Experimental writes require explicit paths and --experimental-write.');
}

function runInspect(fileArgs, pd2Tables) {
  if (fileArgs.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  printBanner(pd2Tables);

  for (const filePath of fileArgs) {
    const summary = inspectSaveFile(filePath, { pd2Tables });
    printSummary(summary);
    console.log('');
  }
}

function runPages(fileArgs, options, pd2Tables) {
  if (fileArgs.length !== 1) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const summary = inspectSaveFile(fileArgs[0], { pd2Tables });
  const matchedPages = listPages(summary, options);
  const pages = limitBrowseEntries(matchedPages, options.limit);

  printBanner(pd2Tables);
  console.log(`FILE       ${summary.filePath}`);
  console.log(`TYPE       ${summary.kind}`);
  console.log(`PAGES      ${summary.pageCount ?? 0}`);
  console.log(`MATCHED    ${matchedPages.length}`);

  for (const page of pages) {
    const sampleItems = (page.topLevelItems ?? page.items ?? [])
      .slice(0, 3)
      .map((item) => item.displayName)
      .join(', ');
    const suffix = sampleItems ? `\t${sampleItems}` : '';
    console.log(`PAGE       ${page.index + 1}\t${page.itemCount}\t${page.name}${suffix}`);
  }
}

function runItems(fileArgs, options, pd2Tables) {
  if (fileArgs.length !== 1) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const summary = inspectSaveFile(fileArgs[0], { pd2Tables });
  const page = summary.pages ? resolvePage(summary, options.page ?? null) : null;
  if (summary.pages && options.page && !page) {
    throw new Error(`Could not find stash page: ${options.page}`);
  }

  const entries = collectBrowseEntries(summary, options);
  const filtered = filterBrowseEntries(entries, options);
  const sorted = sortBrowseEntries(filtered, options.sort);
  const limited = limitBrowseEntries(sorted, options.limit);

  printBanner(pd2Tables);
  console.log(`FILE       ${summary.filePath}`);
  console.log(`TYPE       ${summary.kind}`);
  if (summary.kind === 'character') {
    console.log(`CHAR       ${summary.name}`);
  }
  if (page) {
    console.log(`PAGE       ${page.index + 1}\t${page.itemCount}\t${page.name}`);
  }
  console.log(`MATCHED    ${filtered.length}`);

  for (const [index, entry] of limited.entries()) {
    console.log(`ITEM       ${index + 1}\t${formatBrowseEntry(entry)}`);
  }

  if (filtered.length > limited.length) {
    console.log(`ITEM       ...\t${filtered.length - limited.length} more`);
  }
}

function runSearch(fileArgs, options, pd2Tables) {
  if (fileArgs.length === 0 || !options.query) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const summaries = fileArgs.map((filePath) => inspectSaveFile(filePath, { pd2Tables }));
  const allEntries = summaries.flatMap((summary) => collectBrowseEntries(summary));
  const filtered = filterBrowseEntries(allEntries, options);
  const limited = searchSummaries(summaries, options);

  printBanner(pd2Tables);
  console.log(`FILES      ${summaries.length}`);
  console.log(`QUERY      ${options.query}`);
  console.log(`MATCHED    ${filtered.length}`);

  for (const [index, entry] of limited.entries()) {
    console.log(`RESULT     ${index + 1}\t${formatBrowseEntry(entry)}`);
  }

  if (filtered.length > limited.length) {
    console.log(`RESULT     ...\t${filtered.length - limited.length} more`);
  }
}

const REPORT_SAVE_EXTENSIONS = new Set(['.d2s', '.d2x', '.sss']);

function formatOwnership(owned) {
  return `total=${owned.total} char=${owned.character} stash=${owned.stash} eth=${owned.ethereal} socketed=${owned.socketed}`;
}

function printCollectionEntries(label, entries, options) {
  for (const entry of entries) {
    const owned = entry.owned.total > 0;
    if (options.owned && owned) console.log(`OWNED      ${label}\t${entry.label}\t${formatOwnership(entry.owned)}`);
    if (options.missing && !owned) console.log(`MISSING    ${label}\t${entry.label}${entry.baseName ? `\t${entry.baseName}` : ''}`);
  }
}

function loadReportSaves(fileArgs, pd2Tables) {
  const unsupported = fileArgs.find((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    && !REPORT_SAVE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
  if (unsupported) {
    throw new Error(`Not a .d2s, .d2x, or .sss save file: ${unsupported}`);
  }
  const filePaths = discoverSaveFiles(fileArgs);
  if (filePaths.length === 0) {
    throw new Error(`No .d2s, .d2x, or .sss save files found in: ${fileArgs.join(', ')}`);
  }
  return filePaths.map((filePath) => inspectSaveFile(filePath, { pd2Tables }));
}

function hasReportArguments(fileArgs, options) {
  if (fileArgs.length > 0 && ['text', 'json', undefined].includes(options.format)) return true;
  printUsage();
  process.exitCode = 1;
  return false;
}

function runCollection(fileArgs, options, pd2Tables) {
  if (!hasReportArguments(fileArgs, options)) return;

  const report = summarizeCollection(loadReportSaves(fileArgs, pd2Tables), pd2Tables);
  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { uniques, sets, runewords } = report;
  printBanner(pd2Tables);
  console.log(`FILES      ${report.sourceCount}`);
  console.log(`UNIQUES    ${uniques.found}/${uniques.total} (${uniques.percent}%)`);
  console.log(`SETS       ${sets.found}/${sets.total} items (${sets.percent}%), ${sets.completeSets}/${sets.setCount} complete sets`);
  console.log(`RUNEWORDS  ${runewords.found}/${runewords.total} (${runewords.percent}%)`);
  for (const group of sets.groups.filter((entry) => entry.found > 0)) {
    console.log(`SET        ${group.name}\t${group.found}/${group.total}${group.complete ? '\tcomplete' : ''}`);
  }
  printCollectionEntries('unique', uniques.entries, options);
  printCollectionEntries('set', sets.entries, options);
  printCollectionEntries('runeword', runewords.entries, options);
  for (const entry of report.unavailableOwned) {
    console.log(`DISABLED   unique\t${entry.label}\t${formatOwnership(entry.owned)}`);
  }
  if (report.unresolved.length > 0) {
    console.log(`UNRESOLVED ${report.unresolved.length} unique/set records have no catalogue row`);
  }
}

function runDupes(fileArgs, options, pd2Tables) {
  if (!hasReportArguments(fileArgs, options)) return;

  const report = findSharedFingerprints(loadReportSaves(fileArgs, pd2Tables));
  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printBanner(pd2Tables);
  console.log(`FILES      ${report.sourceCount}`);
  console.log(`SCANNED    ${report.scannedRecords} records (${report.simpleRecords} simple records have no fingerprint)`);
  console.log(`SHARED     ${report.groupCount} fingerprints across ${report.sharedRecordCount} records; ${report.identicalGroupCount} groups have identical copies`);
  const shown = limitBrowseEntries(report.groups, options.limit);
  for (const [index, group] of shown.entries()) {
    console.log(`GROUP      ${index + 1}\t${group.fingerprint}\tx${group.copies.length}\t${group.identical ? 'identical' : group.incompleteCopies > 0 ? 'incomplete' : 'differs'}\t${group.displayNames.join(' / ')}`);
    for (const copy of group.copies) console.log(`COPY       ${copy.displayName}\t${describeCopyLocation(copy)}`);
  }
  if (report.groups.length > shown.length) {
    console.log(`GROUP      ...\t${report.groups.length - shown.length} more`);
  }
}

async function runUi(fileArgs, options, pd2Tables) {
  const inputPaths = fileArgs.length > 0 ? fileArgs : [getFixtureLibraryDir()];
  const { workspace, url } = await startInspectorServer(inputPaths, {
    host: options.host ?? '127.0.0.1',
    port: options.port ?? '4173',
    pd2Tables,
    bankPath: options.bankPath,
    experimentalWrite: options.experimentalWrite
  });

  printBanner(pd2Tables);
  console.log(`UI_URL     ${url}`);
  console.log(`FILES      ${workspace.sourceCount}`);
  console.log(`ROOTS      ${workspace.loadedFrom.join(' | ')}`);
  console.log(`MODE       ${options.experimentalWrite ? 'experimental copy transfers' : 'read-only'}`);
  console.log('PRESS      Ctrl+C to stop');
}

async function main(argv) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'inspect';
  const parsed = parseCliArguments(command === 'inspect' ? args.slice(1) : args.slice(1));
  const pd2Tables = loadPd2Tables();

  if (command === 'bank') {
    await runBankCli(args.slice(1), pd2Tables);
    return;
  }

  if (command === 'inspect') {
    runInspect(parsed.fileArgs, pd2Tables);
    return;
  }

  if (command === 'pages') {
    runPages(parsed.fileArgs, parsed.options, pd2Tables);
    return;
  }

  if (command === 'items') {
    runItems(parsed.fileArgs, parsed.options, pd2Tables);
    return;
  }

  if (command === 'search') {
    runSearch(parsed.fileArgs, parsed.options, pd2Tables);
    return;
  }

  if (command === 'dupes') {
    runDupes(parsed.fileArgs, parsed.options, pd2Tables);
    return;
  }

  if (command === 'collection') {
    runCollection(parsed.fileArgs, parsed.options, pd2Tables);
    return;
  }

  if (command === 'ui') {
    await runUi(parsed.fileArgs, parsed.options, pd2Tables);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main(process.argv).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
