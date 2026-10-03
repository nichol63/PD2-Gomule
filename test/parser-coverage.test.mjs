import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { collectParserCoverage } from '../src/lib/parser-coverage.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();

test('canonical coverage report is deterministic, hashed, and keeps failures at bounded locations', () => {
  const report = collectParserCoverage({ fixtureRoot: LIBRARY });
  const again = collectParserCoverage({ fixtureRoot: LIBRARY });
  assert.deepEqual(again, report);
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(
    {
      files: report.totals.fileCount,
      parsed: report.totals.parsedFileCount,
      fileErrors: report.totals.fileErrorCount,
      pages: report.totals.pageCount,
      declared: report.totals.declaredItemCount,
      parsedItems: report.totals.parsedItemCount,
      parsedNodes: report.totals.parsedNodeCount,
      topLevel: report.totals.topLevelItemCount
    },
    { files: 134, parsed: 134, fileErrors: 0, pages: 286,
      declared: 19778, parsedItems: 19778, parsedNodes: 22072, topLevel: 19778 }
  );
  assert.equal(report.totals.incompleteItemCount, 0);
  assert.equal(report.totals.incompletePropertyListCount, 0);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.sourcePartitionAnomalies.map((anomaly) => ({
    file: anomaly.file,
    page: anomaly.pageName,
    uncoveredBytes: anomaly.uncoveredBytes
  })), [{ file: 'Legacy.d2x', page: 'Season 6 Extra', uncoveredBytes: 22 }]);
  assert.equal(report.failures.length, report.totals.failureCount);
  assert.deepEqual(report.files.map((file) => file.file),
    report.files.map((file) => file.file).sort((left, right) => left.localeCompare(right)));

  const shared = report.files.find((file) => file.file === '_LOD_SharedStashSave.sss');
  assert.ok(shared);
  assert.equal(shared.sha256,
    'b8f6a79e9a800c085bd63f092559057294addd404bb7e67afc3ed97252e2b5ed');
  assert.equal(shared.version, '02');
  assert.equal(shared.declaredItemCount, 5040);
  assert.equal(shared.parsedItemCount, 5040);
  const miscellaneous = shared.pages.find((page) => page.name === 'Miscellaneous');
  assert.deepEqual({
    declared: miscellaneous.declaredItemCount,
    parsed: miscellaneous.parsedItemCount,
    clamped: miscellaneous.clampedItemCount
  }, { declared: 147, parsed: 147, clamped: 0 });

  assert.ok(report.tableHashes.some((table) =>
    table.file === 'ItemStatCost.txt'
      && table.sha256 === '6f9e4be187af784a1772cc61a705e98fbbd3674ae2dde87673cdc392f8d2d7d2'
  ));
  for (const failure of report.failures) {
    assert.equal(failure.type, 'item');
    assert.ok(typeof failure.file === 'string' && failure.file.length > 0);
    assert.ok(Number.isInteger(failure.itemOffset));
    assert.ok(Number.isInteger(failure.itemEndOffset));
    assert.ok(failure.itemOffset < failure.itemEndOffset);
    assert.ok(failure.failedBitOffset <= failure.itemEndBitOffset,
      `${failure.file} ${failure.itemCode} failure cursor crossed its item`);
    assert.ok(![508, 509, 510].includes(failure.failedStatId),
      'shifted terminators must not be reported as table IDs');
  }
});

test('coverage CLI writes only when output is explicit and supports a disposable fixture root', () => {
  const directory = fs.mkdtempSync(path.join(REPO, '.coverage-test-'));
  assert.equal(path.dirname(path.resolve(directory)), REPO);
  const fixtureRoot = path.join(directory, 'fixtures');
  fs.mkdirSync(fixtureRoot);
  fs.copyFileSync(path.join(LIBRARY, 'Legacy.d2s'), path.join(fixtureRoot, 'Legacy.d2s'));
  const script = path.join(REPO, 'scripts', 'parser-coverage.mjs');
  const outputFile = path.join(directory, 'coverage.json');
  try {
    const stdoutRun = spawnSync(process.execPath,
      [script, '--fixture-root', fixtureRoot, '--format', 'json'],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    assert.equal(stdoutRun.status, 0, stdoutRun.stderr);
    const stdoutReport = JSON.parse(stdoutRun.stdout);
    assert.equal(stdoutReport.totals.fileCount, 1);
    assert.equal(stdoutReport.files[0].file, 'Legacy.d2s');
    assert.equal(fs.existsSync(outputFile), false);

    const fileRun = spawnSync(process.execPath,
      [script, '--fixture-root', fixtureRoot, '--format', 'json', '--output', outputFile],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    assert.equal(fileRun.status, 0, fileRun.stderr);
    assert.equal(fileRun.stdout, '');
    assert.deepEqual(JSON.parse(fs.readFileSync(outputFile, 'utf8')), stdoutReport);

    const protectedOutput = path.join(fixtureRoot, '..report.json');
    const rejected = spawnSync(process.execPath,
      [script, '--fixture-root', fixtureRoot, '--output', protectedOutput],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /outside fixture and table directories/i);
    assert.equal(fs.existsSync(protectedOutput), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
