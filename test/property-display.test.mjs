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

function formatSingle(statKey, values, tables = null) {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [{ statKey, values }]
  }, tables);
  return displayList.displayLines.map((line) => line.text);
}

test('formats corrected label/set stats into readable lines', () => {
  assert.deepEqual(formatSingle('item_magicbonus', [25]), ['Magic Find +25%']);
  assert.deepEqual(formatSingle('toblock', [5]), ['Chance to Block +5%']);
  assert.deepEqual(formatSingle('damagepercent', [150]), ['Enhanced Damage +150%']);
  assert.deepEqual(formatSingle('item_armor_percent', [200]), ['Enhanced Defense +200%']);
});

test('formats newly supported simple stat keys into readable lines', () => {
  assert.deepEqual(formatSingle('item_goldbonus', [50]), ['Gold Find +50%']);
  assert.deepEqual(formatSingle('item_lightradius', [2]), ['+2 to Light Radius']);
  assert.deepEqual(formatSingle('maxstamina', [40]), ['+40 to Stamina']);
  assert.deepEqual(formatSingle('crushingblow', [25]), ['Crushing Blow +25%']);
  assert.deepEqual(formatSingle('deadlystrike', [15]), ['Deadly Strike +15%']);
  assert.deepEqual(formatSingle('openwounds', [30]), ['Open Wounds +30%']);
  assert.deepEqual(formatSingle('item_lifeleech', [7]), ['Life Stolen per Hit +7%']);
  assert.deepEqual(formatSingle('item_manaleech', [5]), ['Mana Stolen per Hit +5%']);
});

test('formats pierce resistance stats including negative values', () => {
  assert.deepEqual(formatSingle('piercefire', [25]), ['Pierces Fire Resistance +25%']);
  assert.deepEqual(formatSingle('piercefire', [-15]), ['Pierces Fire Resistance -15%']);
  assert.deepEqual(formatSingle('piercecold', [25]), ['Pierces Cold Resistance +25%']);
  assert.deepEqual(formatSingle('pierceltn', [25]), ['Pierces Lightning Resistance +25%']);
  assert.deepEqual(formatSingle('piercepois', [25]), ['Pierces Poison Resistance +25%']);
});

test('formats new switch-case stat keys into readable lines', () => {
  assert.deepEqual(formatSingle('item_knockback', []), ['Knockback']);
  assert.deepEqual(formatSingle('item_stupidity', []), ['Hit Blinds Target']);
  assert.deepEqual(formatSingle('item_slow', [20]), ['Slows Target by 20%']);
  assert.deepEqual(formatSingle('item_fall', [25]), ['Hit Causes Monster to Flee 25%']);
  assert.deepEqual(
    formatSingle('item_perlevelexp', [2]),
    ['Bonus Experience per Level: 2 (per-level scaling)']
  );
});

test('formats charged skill and aura stats using skill name resolution', () => {
  const tables = loadPd2Tables();

  assert.deepEqual(
    formatSingle('item_charged_skill', [98, 5, 40, 40], tables),
    ['Level 5 Might (40/40 Charges)']
  );
  assert.deepEqual(
    formatSingle('item_aura', [98, 12], tables),
    ['Aura When Equipped: Might (Level 12)']
  );
});

test('groups poison damage triplet into a single line with duration', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'poisonmindam', values: [10] },
      { statKey: 'poisonmaxdam', values: [30] },
      { statKey: 'poisonlength', values: [125] }
    ]
  }, null);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    ['Adds Poison Damage: 10-30 over 5 seconds']
  );
});

test('falls back to poison damage pair when triplet partner is absent', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'poisonmindam', values: [10] },
      { statKey: 'poisonmaxdam', values: [30] },
      { statKey: 'strength', values: [5] }
    ]
  }, null);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    [
      'Adds Poison Damage: 10-30',
      '+5 to Strength'
    ]
  );
});

test('groups cold damage triplet into a single line with freeze duration', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'coldmindam', values: [4] },
      { statKey: 'coldmaxdam', values: [12] },
      { statKey: 'coldlength', values: [100] }
    ]
  }, null);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    ['Adds Cold Damage: 4-12 (4 sec. freeze)']
  );
});

test('falls back to cold damage pair when triplet partner is absent', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'coldmindam', values: [4] },
      { statKey: 'coldmaxdam', values: [12] },
      { statKey: 'strength', values: [5] }
    ]
  }, null);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    [
      'Adds Cold Damage: 4-12',
      '+5 to Strength'
    ]
  );
});

test('groups life and mana drain pairs into single lines', () => {
  const lifeDisplay = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'lifedrainmindam', values: [3] },
      { statKey: 'lifedrainmaxdam', values: [8] }
    ]
  }, null);

  assert.deepEqual(
    lifeDisplay.displayLines.map((line) => line.text),
    ['Drain Life: 3-8']
  );

  const manaDisplay = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'manadrainmindam', values: [2] },
      { statKey: 'manadrainmaxdam', values: [6] }
    ]
  }, null);

  assert.deepEqual(
    manaDisplay.displayLines.map((line) => line.text),
    ['Drain Mana: 2-6']
  );
});
