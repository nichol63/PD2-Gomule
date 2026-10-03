import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { formatPropertyListForDisplay } from '../src/lib/property-display.mjs';
import { insertStashItem, inspectTransferSupport } from '../src/lib/safe-serialization.mjs';
import { collectParserCoverage } from '../src/lib/parser-coverage.mjs';

const LIBRARY = getFixtureLibraryDir();

test('real trophy state and clout metadata remain inspectable without leaking into the tooltip', () => {
  const parsed = parsePlugyStashFile(path.join(LIBRARY, '_LOD_SharedStashSave.sss'));
  const page = parsed.pages.find((entry) => entry.name === 'Testing 2');
  const item = page.items.find((entry) => entry.byteOffset === 145220);
  assert.equal(item.propertiesComplete, true);
  assert.deepEqual(item.properties.map((property) => [property.statKey, property.values]), [
    ['maxhp', [20]], ['state', [210, 1]], ['maxlevel_clout', [1]]
  ]);
  const lines = formatPropertyListForDisplay(item.propertyLists[0], loadPd2Tables()).displayLines;
  assert.deepEqual(lines.map((line) => line.text), ['+20 to Life']);
});

test('historical Deep Wounds and map bytes cannot enter an experimental stash transfer', () => {
  const destinationPath = path.join(LIBRARY, 'Bases.d2x');
  const destination = parsePlugyStashFile(destinationPath);
  const original = fs.readFileSync(destinationPath);
  for (const [relativePath, offset] of [
    ['Showcase Characters/amazon/cold_arrow.d2s', 3086],
    ['Showcase Characters/barbarian/werewolf-fury.d2s', 3882]
  ]) {
    const sourcePath = path.join(LIBRARY, relativePath);
    const sourceBytes = fs.readFileSync(sourcePath);
    const sourceItem = parseCharacterFile(sourcePath).items.find((item) => item.byteOffset === offset);
    assert.equal(sourceItem.propertiesComplete, true);
    assert.ok(sourceItem.parseRecovery);
    const itemBytes = sourceBytes.subarray(sourceItem.sourceSpan.startOffset, sourceItem.sourceSpan.endOffset);
    assert.throws(() => insertStashItem(original, destination, {
      pageIndex: 0, itemBytes, column: 0, row: 0
    }), /Historical item profiles are read-only/);
    assert.deepEqual(fs.readFileSync(destinationPath), original);
    assert.deepEqual(fs.readFileSync(sourcePath), sourceBytes);
  }
});

test('coverage retains historical profile provenance and the undeclared-key transfer gate', () => {
  const report = collectParserCoverage();
  assert.ok(report.recoveries.length >= 15);
  assert.equal(report.totals.recoveredItemCount, report.recoveries.length);
  assert.equal(report.files.reduce((sum, file) => sum + file.recoveredItemCount, 0), report.recoveries.length);
  const arrows = report.recoveries.find((item) => item.file === 'Showcase Characters/amazon/cold_arrow.d2s' && item.itemOffset === 3086);
  assert.equal(arrows.parseProfile, 'pd2-s7-deep-wounds');
  assert.ok(arrows.parseRecovery.originalError);
  assert.ok(arrows.parseRecovery.trailingBitCount >= 0 && arrows.parseRecovery.trailingBitCount <= 7);
  assert.equal(arrows.parseRecovery.propertyEndBitOffset + arrows.parseRecovery.trailingBitCount,
    arrows.parseRecovery.itemEndBitOffset);
  const legacyPath = path.join(LIBRARY, 'Legacy.d2x');
  const parsed = parsePlugyStashFile(legacyPath);
  const support = inspectTransferSupport(fs.readFileSync(legacyPath), parsed);
  assert.equal(support.find((page) => page.name === 'Season 6 Extra').supported, false);
  assert.equal(report.sourcePartitionAnomalies.length, 1);
});
