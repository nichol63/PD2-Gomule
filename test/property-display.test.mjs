import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { formatPropertyListForDisplay } from '../src/lib/property-display.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();

test('loads PD2 skill metadata for property display helpers', () => {
  const tables = loadPd2Tables();

  assert.equal(tables.resolveSkill(98)?.name, 'Might');
  assert.equal(tables.resolveSkill(69)?.name, 'Skeleton Mastery');
});

test('formats straightforward fixture property lists into readable lines', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'), { pd2Tables: tables });
  const paladinShield = summary.pages.find((page) => page.name === 'Reg Paladin')?.items[0];
  const displayList = formatPropertyListForDisplay(paladinShield.propertyLists[0], tables);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    [
      'Fire Resist +30%',
      'Lightning Resist +30%',
      'Cold Resist +30%',
      'Poison Resist +30%'
    ]
  );
});

test('formats skill bonuses from fixture items into readable lines', () => {
  const tables = loadPd2Tables();
  const summary = parseCharacterFile(path.join(FIXTURE_DIR, 'Legacy.d2s'), { pd2Tables: tables });
  const scepter = summary.topLevelItems.find((item) => item.code === 'scp');
  const displayList = formatPropertyListForDisplay(scepter.propertyLists[0], tables);

  assert.ok(displayList.displayLines.some((line) => line.text === '+2 to Might'));
});

test('formats skill tabs and grouped elemental damage using presentation-only helpers', () => {
  const tables = loadPd2Tables();
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'item_addskill_tab', values: [18, 3] },
      { statKey: 'item_splashonhit', values: [22913, 100] },
      { statKey: 'firemindam', values: [4] },
      { statKey: 'firemaxdam', values: [12] }
    ]
  }, tables);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    [
      '+3 to Summoning Skills (Necromancer Only)',
      'Melee Splash 100%',
      'Adds Fire Damage: 4-12'
    ]
  );
});
