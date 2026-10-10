import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverSaveFiles } from '../src/lib/inspector-model.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();
const FREEZING_ARROW = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const TABLES = loadPd2Tables();
const inspect = file => inspectSaveFile(file, { pd2Tables: TABLES });

test('every fixture character exposes its mercenary and golem items read-only and completely', () => {
  const totals = { characters: 0, mercenaryRoots: 0, mercenaryRecords: 0, golemRoots: 0 };
  for (const file of discoverSaveFiles([LIBRARY]).filter(name => name.endsWith('.d2s'))) {
    const save = inspect(file);
    totals.characters += 1;
    assert.deepEqual(save.auxiliaryRegions.map(region => region.id), ['mercenary', 'golem']);
    for (const region of save.auxiliaryRegions) {
      assert.equal(region.parseError, null, `${file} ${region.id}`);
      assert.equal(region.topLevelItems.length, region.itemCount);
      assert.ok(region.items.every(item => item.propertiesComplete !== false));
    }
    const [mercenary, golem] = save.auxiliaryRegions;
    assert.equal(mercenary.itemCount, save.characterSections.mercenary.itemCount);
    totals.mercenaryRoots += mercenary.topLevelItems.length;
    totals.mercenaryRecords += mercenary.items.length;
    totals.golemRoots += golem.topLevelItems.length;
  }
  assert.deepEqual(totals, { characters: 131, mercenaryRoots: 595, mercenaryRecords: 1273, golemRoots: 2 });
});

test('mercenary items are named but stay out of the primary item list used by transfers', () => {
  const save = inspect(FREEZING_ARROW);
  assert.deepEqual([save.items.length, save.topLevelItems.length], [81, 60]);
  const mercenary = save.auxiliaryRegions[0];
  assert.deepEqual(mercenary.topLevelItems.map(item => [item.displayName, item.bodyPosition]),
    [['Goldwrap', 8], ["Andariel's Visage", 1], ["Magnus' Skin", 10], ["Templar's Might", 3], ['Wartraveler', 9], ['Faith', 4]]);
  assert.equal(mercenary.topLevelItems.find(item => item.displayName === 'Faith').namedItem.kind, 'runeword');
  assert.ok(!save.items.some(item => mercenary.items.includes(item)));
});

function writeBits(bytes, bit, width, value) {
  for (let index = 0; index < width; index += 1) {
    const absolute = bit + index, mask = 1 << (absolute & 7);
    bytes[absolute >>> 3] = (bytes[absolute >>> 3] & ~mask) | (((value >>> index) & 1) ? mask : 0);
  }
}

function inspectEdited(directory, source, edit) {
  const file = path.join(directory, `${fs.readdirSync(directory).length}-${path.basename(source)}`);
  fs.writeFileSync(file, edit(fs.readFileSync(source), inspect(source)));
  return inspect(file);
}

function insertBeforeGolem(bytes, save, extra) {
  const at = save.characterSections.golem.markerOffset;
  return Buffer.concat([bytes.subarray(0, at), Buffer.from(extra), bytes.subarray(at)]);
}

test('undecodable properties and stray bytes in mercenary sections are reported, never partially exposed', () => {
  const directory = fs.mkdtempSync(path.join(REPO, '.mercenary-items-test-'));
  try {
    const unsupportedStat = inspectEdited(directory, FREEZING_ARROW, (bytes, save) => {
      const list = save.auxiliaryRegions[0].topLevelItems[0].propertyLists[0];
      writeBits(bytes, list.startBitOffset, 9, 508);
      return bytes;
    });
    assert.ok(unsupportedStat.auxiliaryRegions[0].parseError, 'an incomplete mercenary item fails the section');
    assert.deepEqual(unsupportedStat.auxiliaryRegions[0].items, []);

    const trailing = inspectEdited(directory, FREEZING_ARROW, (bytes, save) => insertBeforeGolem(bytes, save, [1, 2, 3]));
    assert.match(trailing.auxiliaryRegions[0].parseError, /boundary|unparsed/);
    assert.deepEqual(trailing.auxiliaryRegions[0].items, []);

    const withoutMercenary = discoverSaveFiles([LIBRARY]).find(file => file.endsWith('.d2s') && inspect(file).characterSections.mercenary.itemCount === 0);
    const emptyWithBytes = inspectEdited(directory, withoutMercenary, (bytes, save) => insertBeforeGolem(bytes, save, [1, 2, 3]));
    assert.equal(emptyWithBytes.auxiliaryRegions[0].parseError, 'Empty Mercenary section has extra bytes');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a mercenary section that does not decode exactly is reported without affecting the rest of the save', () => {
  const directory = fs.mkdtempSync(path.join(REPO, '.mercenary-items-test-'));
  try {
    const original = inspect(FREEZING_ARROW);
    const bytes = fs.readFileSync(FREEZING_ARROW);
    const { itemListOffset } = original.characterSections.mercenary;
    bytes.writeUInt16LE(bytes.readUInt16LE(itemListOffset + 2) + 1, itemListOffset + 2);
    const copy = path.join(directory, 'freezing-arrow.d2s');
    fs.writeFileSync(copy, bytes);

    const damaged = inspect(copy);
    const mercenary = damaged.auxiliaryRegions[0];
    assert.equal(mercenary.itemCount, 7);
    assert.match(mercenary.parseError, /Mercenary item boundary is uncertain|Invalid|item/i);
    assert.deepEqual([mercenary.items, mercenary.topLevelItems], [[], []], 'no partial mercenary items are exposed');
    assert.deepEqual(damaged.topLevelItems.map(item => item.fingerprint), original.topLevelItems.map(item => item.fingerprint));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
