#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { collectParserCoverage } from '../src/lib/parser-coverage.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

function readArguments(argv) {
  const options = { format: 'json' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const separator = argument.indexOf('=');
    const flag = separator >= 0 ? argument.slice(0, separator) : argument;
    const value = separator >= 0 ? argument.slice(separator + 1) : argv[++index];
    if (!value || !['--fixture-root', '--data-dir', '--format', '--output'].includes(flag)) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    if (flag === '--fixture-root') options.fixtureRoot = value;
    if (flag === '--data-dir') options.dataDir = value;
    if (flag === '--format') options.format = value;
    if (flag === '--output') options.output = value;
  }
  if (!['json', 'markdown'].includes(options.format)) {
    throw new Error('--format must be json or markdown');
  }
  return options;
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function formatMarkdown(report) {
  const { totals } = report;
  const lines = [
    '# Parser coverage',
    '',
    `Fixture root: ${report.fixtureRoot}`,
    `Table directory: ${report.dataDir}`,
    '',
    '| Measure | Count |',
    '| --- | ---: |'
  ];
  for (const [key, value] of Object.entries(totals)) {
    lines.push(`| ${key} | ${value} |`);
  }
  lines.push('', '## Table hashes', '', '| Table | Bytes | SHA256 |', '| --- | ---: | --- |');
  for (const table of report.tableHashes) {
    lines.push(`| ${table.file} | ${table.bytes} | ${table.sha256} |`);
  }
  lines.push('', '## Save files', '', '| File | Version | Bytes | SHA256 | Declared roots | Parsed roots | Physical nodes | Incomplete |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |');
  for (const file of report.files) {
    lines.push(`| ${markdownCell(file.file)} | ${markdownCell(file.version)} | ${file.bytes} | ${file.sha256} | ${file.declaredItemCount ?? ''} | ${file.parsedItemCount ?? ''} | ${file.parsedNodeCount ?? ''} | ${file.incompleteItemCount ?? ''} |`);
  }
  lines.push('', '## Source partition anomalies', '');
  if (report.sourcePartitionAnomalies.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| File | Page | Uncovered bytes | Overlap bytes | Overflow bytes | Bounded bytes match |',
      '| --- | --- | ---: | ---: | ---: | --- |');
    for (const anomaly of report.sourcePartitionAnomalies) {
      lines.push(`| ${markdownCell(anomaly.file)} | ${markdownCell(anomaly.pageName)} | ${anomaly.uncoveredBytes} | ${anomaly.overlapBytes} | ${anomaly.overflowBytes} | ${anomaly.boundedBytesMatch} |`);
    }
  }
  lines.push('', '## Failures', '');
  if (report.failures.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| File | Page | Item offset | Code | Stat ID | Error |',
      '| --- | --- | ---: | --- | ---: | --- |');
    for (const failure of report.failures) {
      lines.push(`| ${markdownCell(failure.file)} | ${markdownCell(failure.pageName)} | ${failure.itemOffset ?? ''} | ${markdownCell(failure.itemCode)} | ${failure.failedStatId ?? ''} | ${markdownCell(failure.error)} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function assertSafeOutput(outputPath, fixtureRoot, dataDir) {
  const resolvedOutput = path.resolve(outputPath);
  if (['.d2s', '.d2x', '.sss'].includes(path.extname(resolvedOutput).toLowerCase())) {
    throw new Error('--output cannot name a save file');
  }
  if (fs.existsSync(resolvedOutput)) {
    const stat = fs.lstatSync(resolvedOutput);
    if (stat.isSymbolicLink() || stat.nlink > 1) {
      throw new Error('--output cannot target a symbolic or hard link');
    }
    throw new Error('--output already exists; choose a new report path');
  }
  const parent = path.dirname(resolvedOutput);
  if (fs.lstatSync(parent).isSymbolicLink()) {
    throw new Error('--output parent cannot be a symbolic link');
  }
  const realParent = fs.realpathSync.native(parent);
  const realOutput = path.join(realParent, path.basename(resolvedOutput));
  const protectedRoots = [fixtureRoot, getFixtureLibraryDir(), dataDir]
    .map((root) => fs.realpathSync.native(root));
  if (protectedRoots.some((root) => isWithin(realOutput, root))) {
    throw new Error('--output must be outside fixture and table directories');
  }
  return realOutput;
}

function writeExclusive(outputPath, contents) {
  const descriptor = fs.openSync(outputPath, 'wx');
  try {
    fs.writeFileSync(descriptor, contents);
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.closeSync(descriptor);
    fs.unlinkSync(outputPath);
    throw error;
  }
  fs.closeSync(descriptor);
}

try {
  const options = readArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('Usage: node scripts/parser-coverage.mjs [--fixture-root DIR] [--data-dir DIR] [--format json|markdown] [--output FILE]\n');
  } else {
    const report = collectParserCoverage(options);
    const text = options.format === 'markdown'
      ? formatMarkdown(report)
      : `${JSON.stringify(report, null, 2)}\n`;
    if (options.output) {
      writeExclusive(assertSafeOutput(
        options.output,
        options.fixtureRoot ?? getFixtureLibraryDir(),
        report.dataDir
      ), text);
    } else {
      process.stdout.write(text);
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
