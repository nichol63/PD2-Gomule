import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { findSharedFingerprints } from '../src/lib/duplicate-report.mjs';
import { discoverSaveFiles } from '../src/lib/inspector-model.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'src', 'cli.mjs');
const LIBRARY = getFixtureLibraryDir();
const FREEZING_ARROW = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const TABLES = loadPd2Tables();
const inspect = file => inspectSaveFile(file, { pd2Tables: TABLES });
const runCli = args => spawnSync(process.execPath, [CLI, 'dupes', ...args], { encoding: 'utf8' });

test('a single real character has no shared fingerprints; simple items are not compared', () => {
  const report = findSharedFingerprints([inspect(FREEZING_ARROW)]);
  assert.deepEqual([report.scannedRecords, report.simpleRecords, report.groupCount, report.sharedRecordCount], [81, 24, 0, 0]);
});

test('every non-simple record loaded twice forms an identical group with both locations', () => {
  const report = findSharedFingerprints([inspect(FREEZING_ARROW), inspect(FREEZING_ARROW)]);
  assert.equal(report.groupCount, 81 - 24);
  assert.equal(report.identicalGroupCount, report.groupCount);
  assert.ok(report.groups.every(group => group.copies.length === 2 && group.copies.every(copy => copy.fileName === 'freezing-arrow.d2s')));
  assert.ok(report.groups.every(group => !('signature' in group.copies[0])), 'internal comparison keys are not reported');
});

test('a changed property, ethereal flag, or socket child marks a shared fingerprint as differing', () => {
  const original = inspect(FREEZING_ARROW);
  const edit = change => {
    const copy = structuredClone(original);
    change(copy.topLevelItems.find(item => item.displayName === "M'avina's Caster"), copy);
    const report = findSharedFingerprints([original, copy]);
    return report.groups.find(group => group.displayNames.includes("M'avina's Caster"));
  };
  assert.equal(edit(() => {}).identical, true);
  // topLevelItems and items share objects, so in-memory edits reach the scanned records.
  assert.equal(edit((bow, save) => { save.items.find(item => item.byteOffset === bow.byteOffset).propertyLists[0].properties[0].values[0] += 1; }).identical, false);
  assert.equal(edit((bow, save) => { save.items.find(item => item.byteOffset === bow.byteOffset).isEthereal = true; }).identical, false);
  assert.equal(edit((bow, save) => { save.items.find(item => item.byteOffset === bow.byteOffset).children[0].code = 'r33'; }).identical, false);
  assert.equal(edit(bow => { bow.children[0].propertyLists[0].properties[0].values[0] += 1; }).identical, false,
    'a socketed jewel with different properties makes its parent differ');
});

test('copies with incompletely decoded data or missing socket records are never reported as identical', () => {
  const original = inspect(FREEZING_ARROW);
  for (const mark of [item => { item.propertiesComplete = false; }, item => { item.children[0].propertyLists[0].complete = false; },
    item => { item.children.pop(); }]) {
    const copy = structuredClone(original);
    mark(copy.topLevelItems.find(item => item.displayName === "M'avina's Caster"));
    const group = findSharedFingerprints([original, copy]).groups.find(entry => entry.displayNames.includes("M'avina's Caster"));
    assert.deepEqual([group.identical, group.incompleteCopies], [false, 1]);
  }
});

test('full fixture library reports shared seeds as evidence, separating identical from differing copies', () => {
  const report = findSharedFingerprints(discoverSaveFiles([LIBRARY]).map(inspect));
  assert.deepEqual([report.sourceCount, report.scannedRecords, report.simpleRecords], [134, 22072, 4675]);
  assert.deepEqual([report.groupCount, report.sharedRecordCount, report.identicalGroupCount], [1004, 3173, 391]);
  const [largest] = report.groups;
  assert.deepEqual([largest.fingerprint, largest.copies.length, largest.identical, largest.displayNames], [1974299169, 105, false, ['Charm Large']]);
  const cube = report.groups.find(group => group.fingerprint === 334429822);
  assert.deepEqual([cube.copies.length, cube.identical, cube.displayNames], [32, true, ['Horadric Cube']]);
  const charm = report.groups.find(group => group.fingerprint === 25822651);
  assert.deepEqual(charm.copies.map(copy => copy.fileName).sort(), ['_LOD_SharedStashSave.sss', 'x2flame-whirlw.d2s']);
});

test('CLI prints groups with copy locations, honours --limit, and emits JSON', () => {
  const text = runCli([path.join(LIBRARY, '_LOD_SharedStashSave.sss'), '--limit', '1']);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^SHARED     \d+ fingerprints across \d+ records; \d+ groups have identical copies$/m);
  assert.match(text.stdout, /^GROUP      1\t1974299169\tx105\tdiffers\tCharm Large$/m);
  assert.match(text.stdout, /^COPY       Charm Large\t_LOD_SharedStashSave\.sss, page \d+: .+ - column \d+, row \d+$/m);
  assert.doesNotMatch(text.stdout, /^GROUP      2\t/m);
  assert.match(text.stdout, /^GROUP      \.\.\.\t\d+ more$/m);

  const json = runCli([FREEZING_ARROW, FREEZING_ARROW, '--format', 'json']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).groupCount, 0, 'the same path given twice is loaded once');
  assert.equal(runCli([]).status, 1);
  assert.equal(runCli([path.join(REPO, 'README.md')]).status, 1);
});
