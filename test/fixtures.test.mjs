import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();

test('loads PD2 item tables from the local workspace', () => {
  const tables = loadPd2Tables();
  const horadricCube = tables.resolveItemCode('box');
  const fireResist = tables.resolveItemStat(39);

  assert.ok(horadricCube);
  assert.equal(horadricCube.name, 'Horadric Cube');
  assert.equal(horadricCube.invWidth, 2);
  assert.equal(horadricCube.invHeight, 2);
  assert.ok(fireResist);
  assert.equal(fireResist.stat, 'fireresist');
  assert.equal(fireResist.saveBits, 8);
  assert.equal(fireResist.saveAdd, 50);
});

test('parses the legacy PD2 character header', () => {
  const summary = parseCharacterFile(path.join(FIXTURE_DIR, 'Legacy.d2s'));

  assert.equal(summary.version, 96);
  assert.equal(summary.name, 'Legacy');
  assert.equal(summary.className, 'Paladin');
  assert.equal(summary.level, 1);
  assert.equal(summary.itemCount, 8);
  assert.equal(summary.parsedItemCount, 8);
  assert.deepEqual(
    summary.items.map((item) => item.code),
    ['tbk', 'ibk', 'box', 'lbl', 'hla', 'skp', 'scp', 'sml']
  );
  assert.equal(summary.items[0].displayName, 'Town Portal Book');
  assert.equal(summary.items[2].displayName, 'Horadric Cube');
});

test('parses the Bases PlugY stash envelope', () => {
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'));

  assert.equal(summary.signature, 'CSTM');
  assert.equal(summary.version, '01');
  assert.ok(summary.pageCount > 100);
  assert.equal(summary.totalItems, 2586);
  assert.equal(summary.pages[0].name, 'Landing Page');
  assert.equal(summary.pages[1].name, 'Reg Helm');
  assert.equal(summary.pages[1].parsedItemCount, 28);
  assert.deepEqual(
    summary.pages[1].items.slice(0, 4).map((item) => item.code),
    ['ci3', 'ci2', 'ci1', 'ci0']
  );
  assert.equal(summary.pages[1].items[0].displayName, 'Diadem');
});

test('decodes read-only item property lists from stash fixtures', () => {
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'));
  const paladinShield = summary.pages.find((page) => page.name === 'Reg Paladin')?.items[0];
  const magicArmor = summary.pages.find((page) => page.name === 'Mag Chest 1')?.items[0];
  const incompleteArmor = summary.pages.find((page) => page.name === 'Mag Chest 2')?.items[0];

  assert.ok(paladinShield);
  assert.equal(paladinShield.code, 'pa1');
  assert.equal(paladinShield.propertyCount, 4);
  assert.equal(paladinShield.propertiesComplete, true);
  assert.deepEqual(
    paladinShield.properties.map((property) => property.statKey),
    ['fireresist', 'lightresist', 'coldresist', 'poisonresist']
  );
  assert.deepEqual(
    paladinShield.properties.map((property) => property.values[0]),
    [30, 30, 30, 30]
  );

  assert.ok(magicArmor);
  assert.equal(magicArmor.code, 'rng');
  assert.equal(magicArmor.propertyCount, 1);
  assert.equal(magicArmor.propertiesComplete, true);
  assert.equal(magicArmor.properties[0].statKey, 'lightresist');
  assert.equal(magicArmor.properties[0].values[0], 29);

  assert.ok(incompleteArmor);
  assert.equal(incompleteArmor.code, 'uul');
  assert.ok(incompleteArmor.propertyCount > 0);
  assert.equal(incompleteArmor.propertiesComplete, false);
  assert.match(incompleteArmor.propertyParseError, /stat id 508/);
});

test('parses the shared PlugY stash envelope', () => {
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'));

  assert.equal(summary.signature, 'SSS\u0000');
  assert.equal(summary.version, '02');
  assert.ok(summary.pageCount > 10);
  assert.ok(summary.totalItems > 100);
  assert.equal(summary.pages[0].name, 'Landing Page');
  assert.equal(summary.pages[1].name, 'Workstation');
  assert.equal(summary.pages[1].parsedItemCount, 96);
  assert.deepEqual(
    summary.pages[1].items.slice(0, 5).map((item) => item.code),
    ['r02s', 'key', 'lbox', 'lpp', 'wss']
  );
});

test('smoke parses the local character fixture pack item payloads', () => {
  const files = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.d2s') {
        files.push(fullPath);
      }
    }
  }

  walk(FIXTURE_DIR);

  let socketedChildren = 0;
  for (const filePath of files) {
    const summary = parseCharacterFile(filePath);
    assert.equal(summary.items.length, summary.itemCount, `top-level item mismatch for ${filePath}`);
    socketedChildren += summary.topLevelItems.reduce(
      (sum, item) => sum + item.children.length,
      0
    );
  }

  assert.ok(files.length > 50);
  assert.ok(socketedChildren > 0);
});

test('smoke parses stash fixture item payloads', () => {
  const stashFiles = [
    path.join(FIXTURE_DIR, 'Legacy.d2x'),
    path.join(FIXTURE_DIR, 'Bases.d2x'),
    path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss')
  ];

  for (const filePath of stashFiles) {
    const summary = parsePlugyStashFile(filePath);
    const parsedTopLevelItems = summary.pages.reduce(
      (sum, page) => sum + page.items.length,
      0
    );
    assert.equal(parsedTopLevelItems, summary.totalItems, `stash item mismatch for ${filePath}`);
  }
});
