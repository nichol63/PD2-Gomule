import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { buildCollectionCatalogue, summarizeCollection } from '../src/lib/collection-tracker.mjs';
import { discoverSaveFiles } from '../src/lib/inspector-model.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'src', 'cli.mjs');
const LIBRARY = getFixtureLibraryDir();
const FREEZING_ARROW = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const TABLES = loadPd2Tables();

const inspect = files => files.map(file => inspectSaveFile(file, { pd2Tables: TABLES }));
const byLabel = (entries, label) => entries.find(entry => entry.label === label);
const ownedLabels = entries => entries.filter(entry => entry.owned.total > 0).map(entry => entry.label);
const runCli = args => spawnSync(process.execPath, [CLI, 'collection', ...args], { encoding: 'utf8' });

test('catalogue tracks enabled uniques, set items grouped by set, and runewords by name', () => {
  const catalogue = buildCollectionCatalogue(TABLES);
  assert.equal(catalogue.uniques.filter(entry => entry.available).length, 418);
  assert.equal(catalogue.sets.length, 128);
  assert.equal(new Set(catalogue.sets.map(entry => entry.setName)).size, 32);
  assert.equal(catalogue.runewords.length, 94, 'variant rows sharing a runeword name are one entry');
  assert.equal(byLabel(catalogue.uniques, 'Magefist #105').available, true);
  assert.equal(byLabel(catalogue.uniques, 'Magefist #420').available, false);
  assert.equal(catalogue.uniques.filter(entry => entry.name === 'Rainbow Facet').length, 8, 'same-name rows stay distinct');
});

test('character summary counts equipped, stored and socketed records', () => {
  const report = summarizeCollection(inspect([FREEZING_ARROW]), TABLES);
  assert.equal(report.sourceCount, 1);
  assert.deepEqual([report.uniques.found, report.sets.found, report.runewords.found], [9, 5, 2]);
  assert.deepEqual(ownedLabels(report.runewords.entries), ['Call to Arms', 'Edge']);
  assert.equal(report.uniques.percent, 2.2);
  const mavina = report.sets.groups.find(group => group.name === "M'avina's Battle Hymn");
  assert.deepEqual([mavina.found, mavina.total, mavina.complete], [5, 5, true]);
  assert.equal(report.sets.completeSets, 1);
  const facets = byLabel(report.uniques.entries, 'Rainbow Facet #393');
  assert.deepEqual(facets.owned, { total: 6, character: 6, stash: 0, ethereal: 0, socketed: 6 });
  assert.equal(new Set(facets.copies.map(copy => copy.byteOffset)).size, 6, 'each socketed copy is individually located');
  assert.ok(facets.copies.every(copy => copy.location === 6 && copy.socketParent?.displayName));
  const edge = byLabel(report.runewords.entries, 'Edge').copies[0];
  assert.equal(edge.socketParent, null);
  assert.ok(Number.isInteger(edge.byteOffset) && Number.isInteger(edge.column) && Number.isInteger(edge.row));
  assert.deepEqual(report.unresolved, []);
});

test('character and stash copies are counted separately, including ethereal copies', () => {
  const report = summarizeCollection(inspect([FREEZING_ARROW, path.join(LIBRARY, 'Legacy.d2x'), path.join(LIBRARY, 'Legacy.d2s')]), TABLES);
  const wisp = byLabel(report.uniques.entries, 'Wisp');
  assert.deepEqual(wisp.owned, { total: 3, character: 2, stash: 1, ethereal: 0, socketed: 0 });
  const stashCopy = wisp.copies.find(copy => copy.sourceKind === 'stash');
  assert.equal(stashCopy.fileName, 'Legacy.d2x');
  assert.equal(typeof stashCopy.pageName, 'string');
  assert.equal(stashCopy.characterName, null);
  assert.ok(wisp.copies.filter(copy => copy.sourceKind === 'character').every(copy => copy.characterName && copy.pageIndex === null));
  assert.deepEqual(byLabel(report.uniques.entries, 'Mindrend').owned, { total: 2, character: 0, stash: 2, ethereal: 1, socketed: 0 });
  assert.deepEqual(report.unavailableOwned.map(entry => entry.label), ['Magefist #419', 'Magefist #420', 'Magefist #421'],
    'owned copies of disabled rows are reported but excluded from totals');
});

test('full library completes the catalogue and reports items without a catalogue row instead of guessing', () => {
  const report = summarizeCollection(inspect(discoverSaveFiles([LIBRARY])), TABLES);
  assert.equal(report.sourceCount, 134);
  assert.deepEqual([report.uniques.found, report.uniques.total], [418, 418]);
  assert.deepEqual([report.sets.found, report.sets.total, report.sets.completeSets, report.sets.setCount], [128, 128, 32, 32]);
  assert.deepEqual([report.runewords.found, report.runewords.total], [94, 94]);
  assert.deepEqual(report.unresolved.map(entry => `${entry.code}:${entry.rowId}`).sort(),
    ['cm1:4095', 'g33:4095', 'hdm:4095', ...Array(6).fill('rin:352')]);
});

test('CLI prints collection progress, owned and missing entries, and JSON', () => {
  const text = runCli([FREEZING_ARROW, '--owned', '--missing']);
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^UNIQUES    9\/418 \(2\.2%\)$/m);
  assert.match(text.stdout, /^SETS       5\/128 items \(3\.9%\), 1\/32 complete sets$/m);
  assert.match(text.stdout, /^RUNEWORDS  2\/94 \(2\.1%\)$/m);
  assert.match(text.stdout, /^SET        M'avina's Battle Hymn\t5\/5\tcomplete$/m);
  assert.match(text.stdout, /^OWNED      runeword\tEdge\ttotal=1 char=1 stash=0 eth=0 socketed=0$/m);
  assert.match(text.stdout, /^MISSING    unique\tThe Gnasher\tHand Axe$/m);

  const json = runCli([FREEZING_ARROW, '--format', 'json']);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).runewords.found, 2);
});

test('CLI rejects missing paths, non-save files, directories without saves, and unknown formats', () => {
  assert.equal(runCli([]).status, 1);
  assert.equal(runCli([FREEZING_ARROW, '--format', 'xml']).status, 1);
  const notSave = runCli([path.join(REPO, 'README.md')]);
  assert.equal(notSave.status, 1);
  assert.match(notSave.stderr, /Not a \.d2s, \.d2x, or \.sss save file/);
  const noSaves = runCli([path.join(REPO, 'docs')]);
  assert.equal(noSaves.status, 1);
  assert.match(noSaves.stderr, /No \.d2s, \.d2x, or \.sss save files found/);
  assert.notEqual(runCli([path.join(LIBRARY, 'does-not-exist.d2s')]).status, 0);
});
