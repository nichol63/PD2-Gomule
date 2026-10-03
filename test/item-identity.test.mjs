import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { resolveItemIdentity } from '../src/lib/item-identity.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { inspectSaveFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FILE = path.join(getFixtureLibraryDir(), 'Legacy.d2x');
const tables = loadPd2Tables();

function hashFile() {
  return createHash('sha256').update(fs.readFileSync(FILE)).digest('hex');
}

function requireItem(save, pageName, predicate) {
  const page = save.pages.find((entry) => entry.name === pageName);
  assert.ok(page, `missing page ${pageName}`);
  const item = page.topLevelItems.find(predicate);
  assert.ok(item, `missing item on ${pageName}`);
  return item;
}

test('inspected real unique, set, and runeword items retain base and resolved names', () => {
  const beforeHash = hashFile();
  const save = inspectSaveFile(FILE, { pd2Tables: tables });

  const magefist = requireItem(save, 'Season 4 Armor', (item) =>
    item.code === 'tgl' && item.qualityData?.uniqueId === 421
  );
  assert.equal(magefist.baseName, 'Light Gauntlets');
  assert.equal(magefist.displayName, 'Magefist');
  assert.deepEqual(magefist.namedItem,
    { kind: 'unique', id: 421, name: 'Magefist' });
  assert.equal(magefist.nameSource, 'UniqueItems.txt:421');

  const haemosu = requireItem(save, 'Season 4 Armor', (item) =>
    item.code === 'xrs' && item.qualityData?.setId === 102
  );
  assert.equal(haemosu.baseName, 'Cuirass');
  assert.equal(haemosu.displayName, "Haemosu's Adament");
  assert.equal(haemosu.namedItem?.kind, 'set');
  assert.equal(haemosu.namedItem?.id, 102);
  assert.equal(haemosu.nameSource, 'SetItems.txt:102');

  const phoenix = requireItem(save, 'Season 5 Armor', (item) =>
    item.code === 'uit' && item.isRuneword && item.namedItem?.name === 'Phoenix'
  );
  assert.equal(phoenix.baseName, 'Monarch');
  assert.equal(phoenix.displayName, 'Phoenix');
  assert.deepEqual(phoenix.namedItem,
    { kind: 'runeword', id: 'Runeword103', name: 'Phoenix',
      runes: ['r26', 'r26', 'r28', 'r31'] });
  assert.equal(phoenix.nameSource, 'Runes.txt:Runeword103');
  assert.equal(hashFile(), beforeHash);
});

test('identity resolution refuses incompatible base codes and altered rune order', () => {
  const raw = parsePlugyStashFile(FILE, { pd2Tables: tables });
  const magefist = requireItem(raw, 'Season 4 Armor', (item) =>
    item.code === 'tgl' && item.qualityData?.uniqueId === 421
  );
  const phoenix = requireItem(raw, 'Season 5 Armor', (item) =>
    item.code === 'uit' && item.isRuneword && item.children.length === 4
  );
  assert.equal(magefist.displayName, 'Light Gauntlets',
    'the direct parser keeps base names before presentation enrichment');

  const wrongBase = resolveItemIdentity({ ...magefist, code: 'zzz' }, tables);
  assert.equal(wrongBase.displayName, 'Light Gauntlets');
  assert.equal(wrongBase.namedItem, null);
  assert.equal(wrongBase.nameSource, null);

  const reordered = resolveItemIdentity({
    ...phoenix,
    children: [phoenix.children[0], phoenix.children[2], phoenix.children[1], phoenix.children[3]]
  }, tables);
  assert.equal(reordered.displayName, 'Monarch');
  assert.equal(reordered.namedItem, null);
  assert.equal(reordered.nameSource, null);
});
