import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { formatPropertyListForDisplay } from '../src/lib/property-display.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();
const FIXTURE_FILE_CACHE = new Map();

function findFixtureFile(fileName) {
  const cached = FIXTURE_FILE_CACHE.get(fileName);
  if (cached) {
    return cached;
  }

  const stack = [FIXTURE_DIR];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidatePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidatePath);
        continue;
      }

      if (entry.name === fileName) {
        FIXTURE_FILE_CACHE.set(fileName, candidatePath);
        return candidatePath;
      }
    }
  }

  throw new Error(`Could not find fixture file ${fileName} under ${FIXTURE_DIR}`);
}

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

test('formats summon-cap presentation strings from raw stat keys', () => {
  assert.deepEqual(formatSingle('extra_spirits', [1]), ['+1 to Maximum Spirits']);
  assert.deepEqual(formatSingle('extra_spirits', [3]), ['+3 to Maximum Spirits']);
  assert.deepEqual(
    formatSingle('extra_skele_war', [2]),
    ['You may summon 2 extra Skeleton Warriors']
  );
  assert.deepEqual(
    formatSingle('extra_skele_mage', [2]),
    ['You may summon 2 extra Skeletal Mages']
  );
  assert.deepEqual(
    formatSingle('extra_skele_archer', [12]),
    ['You may summon 12 extra Skeleton Archers']
  );
  assert.deepEqual(
    formatSingle('extra_hydra', [17]),
    ['You may summon 17 extra Hydras']
  );
  assert.deepEqual(
    formatSingle('extra_golem', [3]),
    ['You may summon 3 extra Golems']
  );
});

test('formats summon-cap singular forms naturally', () => {
  assert.deepEqual(formatSingle('extra_skele_war', [1]), ['You may summon 1 extra Skeleton Warrior']);
  assert.deepEqual(formatSingle('extra_skele_mage', [1]), ['You may summon 1 extra Skeletal Mage']);
  assert.deepEqual(formatSingle('extra_skele_archer', [1]), ['You may summon 1 extra Skeleton Archer']);
  assert.deepEqual(formatSingle('extra_hydra', [1]), ['You may summon 1 extra Hydra']);
  assert.deepEqual(formatSingle('extra_golem', [1]), ['You may summon 1 extra Golem']);
  assert.deepEqual(formatSingle('extra_spirits', [1]), ['+1 to Maximum Spirits']);
});

test('formats additional summon-cap stats from raw stat keys', () => {
  assert.deepEqual(formatSingle('extra_revives', [1]), ['+1 to Maximum Revives']);
  assert.deepEqual(formatSingle('extra_revives', [29]), ['+29 to Maximum Revives']);
  assert.deepEqual(formatSingle('extra_bonespears', [1]), ['+1 to Bone Spear Missiles']);
  assert.deepEqual(formatSingle('extra_bonespears', [24]), ['+24 to Bone Spear Missiles']);
  assert.deepEqual(
    formatSingle('grims_extra_skele_mage', [1]),
    ['You may summon 1 extra Skeletal Mage']
  );
  assert.deepEqual(
    formatSingle('grims_extra_skele_mage', [6]),
    ['You may summon 6 extra Skeletal Mages']
  );
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

function formatSingleWithMeta(statKey, values, meta = {}, tables = null) {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [{ statKey, values, ...meta }]
  }, tables);
  return displayList.displayLines.map((line) => line.text);
}

function packBytimeValue(peakPeriod, minValue, maxValue) {
  return ((peakPeriod & 0x3) << 20) | ((minValue & 0x3ff) << 10) | (maxValue & 0x3ff);
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

test('formats deep_wounds as signed damage per second, distinct from Open Wounds chance', () => {
  assert.deepEqual(formatSingle('deep_wounds', [300]), ['+300 Open Wounds Damage Per Second']);
  assert.deepEqual(formatSingle('deep_wounds', [50]), ['+50 Open Wounds Damage Per Second']);
  assert.deepEqual(formatSingle('deep_wounds', [0]), ['+0 Open Wounds Damage Per Second']);
  assert.deepEqual(formatSingle('deep_wounds', [-10]), ['-10 Open Wounds Damage Per Second']);
  assert.deepEqual(formatSingle('item_openwounds', [30]), ['Open Wounds +30%']);
});

test('formats deep_wounds from the clean unique Blade Bow fixture', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });
  const item = summary.pages
    .find((page) => page.name === 'Bows 2,3')
    ?.items.find((candidate) => candidate.code === '8hb' && candidate.row === 3 && candidate.column === 0);

  assert.ok(item, 'expected the Blade Bow at row 3, column 0 on Bows 2,3');
  assert.deepEqual(item.qualityData, { qualityId: 7, qualityLabel: 'unique', uniqueId: 189 });
  assert.equal(item.propertiesComplete, true);
  const properties = item.propertyLists[0].properties.filter(
    (property) => ['item_openwounds', 'deep_wounds'].includes(property.statKey)
  );
  assert.deepEqual(properties.map(({ statKey, values }) => ({ statKey, values })), [
    { statKey: 'item_openwounds', values: [30] },
    { statKey: 'deep_wounds', values: [50] }
  ]);
  const damage = properties.find((property) => property.statKey === 'deep_wounds');
  assert.equal(damage.descStringKey, 'OpenWoundsItem');
  assert.equal(damage.descFunc, 1);
  assert.equal(damage.descVal, 1);
  const displayList = formatPropertyListForDisplay({ ...item.propertyLists[0], properties }, tables);
  assert.deepEqual(displayList.displayLines.map((line) => line.text), [
    'Open Wounds +30%',
    '+50 Open Wounds Damage Per Second'
  ]);
});

test('formats only the proven Eaglehorn Raven value with its historical wording', () => {
  assert.deepEqual(formatSingle('eaglehorn_raven', [500]), ['Your Ravens deal an additional 500 Cold Damage']);
  assert.deepEqual(formatSingle('eaglehorn_raven', [501]), ['+501 to Eaglehorn Raven']);
  assert.deepEqual(formatSingle('eaglehorn_raven', [500, 1]), ['Eaglehorn Raven: 500, 1']);
});

test('formats the clean unique Eaglehorn fixture without changing its parsed metadata', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });
  const item = summary.pages
    .find((page) => page.name === 'Bows 2,3')
    ?.items.find((candidate) => candidate.code === '6l7' && candidate.row === 3 && candidate.column === 8);

  assert.ok(item, 'expected the Crusader Bow at row 3, column 8 on Bows 2,3');
  assert.deepEqual(item.qualityData, { qualityId: 7, qualityLabel: 'unique', uniqueId: 265 });
  assert.equal(item.propertiesComplete, true);
  const properties = item.propertyLists[0].properties.filter((property) => property.statKey === 'eaglehorn_raven');
  assert.equal(properties.length, 1);
  assert.deepEqual(properties[0].values, [500]);
  assert.equal(properties[0].descStringKey, 'EaglehornRaven');
  assert.equal(properties[0].descFunc, 3);
  assert.equal(properties[0].descVal, 0);
  const originalProperty = structuredClone(properties[0]);
  const displayList = formatPropertyListForDisplay({ ...item.propertyLists[0], properties }, tables);
  assert.deepEqual(displayList.displayLines.map((line) => line.text), [
    'Your Ravens deal an additional 500 Cold Damage'
  ]);
  assert.deepEqual(properties[0], originalProperty);
});

test('formats percent-style simple stat keys using their display labels', () => {
  assert.deepEqual(formatSingle('curse_effectiveness', [20]), ['Curse Effectiveness +20%']);
  assert.deepEqual(formatSingle('curse_effectiveness', [-43]), ['Curse Effectiveness -43%']);
  assert.deepEqual(formatSingle('item_leap_speed', [30]), ['Leap Speed +30%']);
  assert.deepEqual(formatSingle('item_leap_speed', [12]), ['Leap Speed +12%']);
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

test('formats skill-proc triplet stats with skill name resolution', () => {
  const tables = loadPd2Tables();

  // encoding: values = [level, skillId, chance%]
  assert.deepEqual(
    formatSingle('item_skillonhit', [5, 98, 7], tables),
    ['7% Chance to Cast Level 5 Might on Striking']
  );
  assert.deepEqual(
    formatSingle('item_skillongethit', [3, 98, 10], tables),
    ['10% Chance to Cast Level 3 Might When Struck']
  );
  assert.deepEqual(
    formatSingle('item_skillondeath', [20, 98, 50], tables),
    ['50% Chance to Cast Level 20 Might on Death']
  );
  assert.deepEqual(
    formatSingle('item_skillonattack', [1, 98, 5], tables),
    ['5% Chance to Cast Level 1 Might on Attack']
  );
  assert.deepEqual(
    formatSingle('item_skillonkill', [8, 98, 15], tables),
    ['15% Chance to Cast Level 8 Might on Kill']
  );
});

test('formats summon-cap stats from parsed fixture items', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });

  const findItem = (displayName, statKey, value) =>
    summary.pages
      .flatMap((page) => page.items ?? page.topLevelItems ?? [])
      .find(
        (item) =>
          item.displayName === displayName &&
          item.properties.some(
            (property) =>
              property.statKey === statKey &&
              property.values?.[0] === value
          )
      );

  const earthSpirit = findItem('Earth Spirit', 'extra_spirits', 1);
  const perfectDiamond = findItem('Perfect Diamond', 'extra_skele_war', 16);
  const ithRune = findItem('Ith Rune', 'extra_skele_mage', 17);
  const perfectSaphire = findItem('Perfect Saphire', 'extra_skele_archer', 14);
  const ghostSpear = findItem('Ghost Spear', 'extra_hydra', 2);
  const archonStaff = findItem('Archon Staff', 'extra_golem', 6);

  assert.ok(earthSpirit, 'expected Earth Spirit to expose extra_spirits in the shared stash fixture');
  assert.ok(
    perfectDiamond,
    'expected Perfect Diamond to expose extra_skele_war in the shared stash fixture'
  );
  assert.ok(ithRune, 'expected Ith Rune to expose extra_skele_mage in the shared stash fixture');
  assert.ok(
    perfectSaphire,
    'expected Perfect Saphire to expose extra_skele_archer in the shared stash fixture'
  );
  assert.ok(ghostSpear, 'expected Ghost Spear to expose extra_hydra in the shared stash fixture');
  assert.ok(archonStaff, 'expected Archon Staff to expose extra_golem in the shared stash fixture');

  const render = (item, statKey) =>
    formatPropertyListForDisplay(
      {
        ...item.propertyLists[0],
        properties: item.propertyLists[0].properties.filter((property) => property.statKey === statKey)
      },
      tables
    ).displayLines.map((line) => line.text);

  assert.deepEqual(render(earthSpirit, 'extra_spirits'), ['+1 to Maximum Spirits']);
  assert.deepEqual(render(perfectDiamond, 'extra_skele_war'), ['You may summon 16 extra Skeleton Warriors']);
  assert.deepEqual(render(ithRune, 'extra_skele_mage'), ['You may summon 17 extra Skeletal Mages']);
  assert.deepEqual(render(perfectSaphire, 'extra_skele_archer'), ['You may summon 14 extra Skeleton Archers']);
  assert.deepEqual(render(ghostSpear, 'extra_hydra'), ['You may summon 2 extra Hydras']);
  assert.deepEqual(render(archonStaff, 'extra_golem'), ['You may summon 6 extra Golems']);
});

test('formats safe summon-cap stats from parsed fixture items', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });

  const findItem = (displayName, statKey, value) =>
    summary.pages
      .flatMap((page) => page.items ?? page.topLevelItems ?? [])
      .find(
        (item) =>
          item.displayName === displayName &&
          item.properties.some(
            (property) =>
              property.statKey === statKey &&
              property.values?.[0] === value
          )
      );

  const unearthedWand = findItem('Unearthed Wand', 'extra_revives', 29);
  const elderStaff = findItem('Elder Staff', 'extra_bonespears', 31);
  const lichWand = findItem('Lich Wand', 'extra_bonespears', 31);
  const giantThresher = findItem('Giant Thresher', 'grims_extra_skele_mage', 6);

  assert.ok(unearthedWand, 'expected Unearthed Wand to expose extra_revives in the shared stash fixture');
  assert.ok(elderStaff, 'expected Elder Staff to expose extra_bonespears in the shared stash fixture');
  assert.ok(lichWand, 'expected Lich Wand to expose extra_bonespears in the shared stash fixture');
  assert.ok(
    giantThresher,
    'expected Giant Thresher to expose grims_extra_skele_mage in the shared stash fixture'
  );

  const render = (item, statKey) =>
    formatPropertyListForDisplay(
      {
        ...item.propertyLists[0],
        properties: item.propertyLists[0].properties.filter((property) => property.statKey === statKey)
      },
      tables
    ).displayLines.map((line) => line.text);

  assert.deepEqual(render(unearthedWand, 'extra_revives'), ['+29 to Maximum Revives']);
  assert.deepEqual(render(elderStaff, 'extra_bonespears'), ['+31 to Bone Spear Missiles']);
  assert.deepEqual(render(lichWand, 'extra_bonespears'), ['+31 to Bone Spear Missiles']);
  assert.deepEqual(
    render(giantThresher, 'grims_extra_skele_mage'),
    ['You may summon 6 extra Skeletal Mages']
  );
});

test('formats monster-linked display stats with explicit monster names and fallback identifiers', () => {
  assert.deepEqual(
    formatSingleWithMeta('attack_vs_montype', [996, 63], { monsterName: 'WestmarchBoss' }),
    ['+63 to Attack Rating versus WestmarchBoss']
  );
  assert.deepEqual(
    formatSingleWithMeta('damage_vs_montype', [229, 59], { monsterName: 'Radament' }),
    ['+59 to Damage versus Radament']
  );
  assert.deepEqual(
    formatSingleWithMeta('item_reanimate', [795, 74], { monsterName: 'Ancient Barbarian 1' }),
    ['74% Reanimate as: Ancient Barbarian 1']
  );

  assert.deepEqual(
    formatSingleWithMeta('attack_vs_montype', [996, 63]),
    ['+63 to Attack Rating versus 996']
  );
  assert.deepEqual(
    formatSingleWithMeta('damage_vs_montype', [229, 59]),
    ['+59 to Damage versus 229']
  );
  assert.deepEqual(
    formatSingleWithMeta('item_reanimate', [795, 74]),
    ['74% Reanimate as: 795']
  );
});

test('formats class-wide skill level bonuses including unknown class fallback', () => {
  assert.deepEqual(
    formatSingle('item_addclassskills', [2, 3]),
    ['+3 to Necromancer Skill Levels']
  );
  assert.deepEqual(
    formatSingle('item_addclassskills', [3, 1]),
    ['+1 to Paladin Skill Levels']
  );
  assert.deepEqual(
    formatSingle('item_addclassskills', [99, 2]),
    ['+2 to Class 99 Skill Levels']
  );
});

test('formats monster-linked display stats from parsed fixture data', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Legacy.d2x'), { pd2Tables: tables });
  const monarch = summary.pages
    .flatMap((page) => page.items ?? page.topLevelItems ?? [])
    .find((item) => item.displayName === 'Monarch');

  assert.ok(monarch, 'expected Monarch to exist in the legacy stash fixture');

  const monsterProperty = monarch.properties.find(
    (property) => property.statKey === 'damage_vs_montype'
  );

  assert.ok(monsterProperty, 'Monarch should expose damage_vs_montype');

  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [monsterProperty]
  }, tables);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    ['+421 to Damage versus GrotesqueWyrm']
  );
});

test('formats new non-percent simple stat entries into "+N to Label" lines', () => {
  assert.deepEqual(formatSingle('item_kickdamage', [16]), ['+16 to Kick Damage']);
  assert.deepEqual(formatSingle('item_healafterkill', [1]), ['+1 to Life After Each Kill']);
  assert.deepEqual(
    formatSingle('item_healafterdemonkill', [84]),
    ['+84 to Life After Each Demon Kill']
  );
  assert.deepEqual(formatSingle('item_healafterhit', [5]), ['+5 to Life After Each Hit']);
  assert.deepEqual(formatSingle('item_manaafterkill', [4]), ['+4 to Mana After Each Kill']);
  assert.deepEqual(
    formatSingle('item_demon_tohit', [200]),
    ['+200 to Attack Rating against Demons']
  );
  assert.deepEqual(
    formatSingle('item_undead_tohit', [27]),
    ['+27 to Attack Rating against Undead']
  );
});

test('formats right-value percent simple stats into "Label +N%" lines', () => {
  assert.deepEqual(
    formatSingle('item_maxdurability_percent', [14]),
    ['Increase Maximum Durability +14%']
  );
  assert.deepEqual(
    formatSingle('item_reducedprices', [53]),
    ['Reduces All Vendor Prices +53%']
  );
  assert.deepEqual(
    formatSingle('item_tohit_percent', [5]),
    ['Bonus to Attack Rating +5%']
  );
  assert.deepEqual(
    formatSingle('item_absorbmagic_percent', [20]),
    ['Magic Absorb +20%']
  );
  assert.deepEqual(
    formatSingle('item_staminadrainpct', [77]),
    ['Slower Stamina Drain +77%']
  );
  assert.deepEqual(
    formatSingle('item_poisonlengthresist', [50]),
    ['Poison Length Reduced +50%']
  );
});

test('formats prefix percent simple stats into "+N% Label" lines', () => {
  assert.deepEqual(
    formatSingle('item_demondamage_percent', [149]),
    ['+149% Damage to Demons']
  );
  assert.deepEqual(
    formatSingle('item_undeaddamage_percent', [31]),
    ['+31% Damage to Undead']
  );
  assert.deepEqual(formatSingle('maxmagicresist', [4]), ['+4% Maximum Magic Resist']);
  assert.deepEqual(formatSingle('magicresist', [51]), ['+51% Magic Resist']);
});

test('formats new flat-label switch cases into static lines', () => {
  assert.deepEqual(
    formatSingle('item_restinpeace', [1]),
    ['Slain Monsters Rest in Peace']
  );
  assert.deepEqual(formatSingle('item_halffreezeduration', [1]), ['Half Freeze Duration']);
  assert.deepEqual(formatSingle('item_indesctructible', [1]), ['Indestructible']);
  assert.deepEqual(formatSingle('item_cannotbefrozen', [1]), ['Cannot Be Frozen']);
  assert.deepEqual(formatSingle('item_preventheal', [1]), ['Prevent Monster Heal']);
  assert.deepEqual(
    formatSingle('item_ignoretargetac', [1]),
    ["Ignores Target's Defense"]
  );
  assert.deepEqual(formatSingle('item_throwable', [1]), ['Throwable']);
});

test('flat-label switch cases ignore the value array', () => {
  assert.deepEqual(formatSingle('item_indesctructible', [0]), ['Indestructible']);
  assert.deepEqual(formatSingle('item_indesctructible', [42]), ['Indestructible']);
  assert.deepEqual(
    formatSingle('item_restinpeace', []),
    ['Slain Monsters Rest in Peace']
  );
});

test('groups magic damage pair into a single line', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'magicmindam', values: [10] },
      { statKey: 'magicmaxdam', values: [20] }
    ]
  }, null);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    ['Adds Magic Damage: 10-20']
  );
});

test('falls back to single magic damage stats when the pair is separated', () => {
  assert.deepEqual(formatSingle('magicmindam', [10]), ['+10 to Magic Minimum Damage']);
  assert.deepEqual(formatSingle('magicmaxdam', [20]), ['+20 to Magic Maximum Damage']);

  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'magicmindam', values: [10] },
      { statKey: 'strength', values: [5] },
      { statKey: 'magicmaxdam', values: [20] }
    ]
  }, null);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    [
      '+10 to Magic Minimum Damage',
      '+5 to Strength',
      '+20 to Magic Maximum Damage'
    ]
  );
});

test('formats corrupted and mirrored as flat labels ignoring values', () => {
  assert.deepEqual(formatSingle('corrupted', [692, 396]), ['Corrupted']);
  assert.deepEqual(formatSingle('corrupted', [0, 0]), ['Corrupted']);
  assert.deepEqual(formatSingle('corrupted', []), ['Corrupted']);
  assert.deepEqual(formatSingle('mirrored', [1023, 496]), ['Mirrored']);
  assert.deepEqual(formatSingle('mirrored', [99, 95]), ['Mirrored']);
  assert.deepEqual(formatSingle('mirrored', []), ['Mirrored']);
});

test('formats item_skillonlevelup triplet with skill name resolution', () => {
  const tables = loadPd2Tables();

  // Known skill id 98 resolves to 'Might'
  assert.deepEqual(
    formatSingle('item_skillonlevelup', [5, 98, 20], tables),
    ['20% Chance to Cast Level 5 Might on Level Up']
  );

  // Known skill id 112 resolves to 'Blessed Hammer'
  assert.deepEqual(
    formatSingle('item_skillonlevelup', [3, 112, 15], tables),
    ['15% Chance to Cast Level 3 Blessed Hammer on Level Up']
  );

  // Unknown skill id falls back to 'Skill <id>'
  assert.deepEqual(
    formatSingle('item_skillonlevelup', [10, 999, 50], tables),
    ['50% Chance to Cast Level 10 Skill 999 on Level Up']
  );
});

test('formats item_skilloncast from parsed fixture data with parser metadata', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(
    path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'),
    { pd2Tables: tables }
  );

  const findProperty = (displayName, values) =>
    summary.pages
      .flatMap((page) => page.items ?? page.topLevelItems ?? [])
      .find(
        (item) =>
          item.displayName === displayName &&
          item.properties.some(
            (property) =>
              property.statKey === 'item_skilloncast' &&
              property.values?.[0] === values[0] &&
              property.values?.[1] === values[1]
          )
      );

  const wirtsLeg = findProperty("Wirt's Leg", [2064, 29]);
  const elderStaff = findProperty('Elder Staff', [1094, 10]);
  const fullRejuvPotion = findProperty('Full Rejuv Potion', [60645, 88]);

  assert.ok(wirtsLeg, "expected Wirt's Leg to exist in the shared stash fixture");
  assert.ok(elderStaff, 'expected the [1094,10] Elder Staff to exist in the shared stash fixture');
  assert.ok(fullRejuvPotion, 'expected Full Rejuv Potion to exist in the shared stash fixture');

  const render = (item) =>
    formatPropertyListForDisplay(
      {
        kind: 'base',
        complete: true,
        error: null,
        properties: item.properties.filter((property) => property.statKey === 'item_skilloncast')
      },
      tables
    ).displayLines.map((line) => line.text);

  assert.deepEqual(render(wirtsLeg), ['29% Chance to Cast Level 16 Valkyrie on Casting']);
  assert.deepEqual(render(elderStaff), ['10% Chance to Cast Level 6 Slow Movement on Casting']);
  assert.deepEqual(render(fullRejuvPotion), ['88% Chance to Cast Level 37 Skill 947 on Casting']);
});

test('formats item_skilloncast from raw packed values without parser metadata', () => {
  const tables = loadPd2Tables();

  assert.deepEqual(
    formatSingle('item_skilloncast', [2064, 29], tables),
    ['29% Chance to Cast Level 16 Valkyrie on Casting']
  );
  assert.deepEqual(
    formatSingle('item_skilloncast', [1094, 10], tables),
    ['10% Chance to Cast Level 6 Slow Movement on Casting']
  );
  assert.deepEqual(
    formatSingle('item_skilloncast', [60645, 88]),
    ['88% Chance to Cast Level 37 Skill 947 on Casting']
  );
});

test('formats packed item_*_bytime values from the 22-bit presentation contract', () => {
  assert.deepEqual(
    formatSingleWithMeta('item_strength_bytime', [packBytimeValue(0, 240, 240)], { descFunc: 17, descVal: 1 }),
    ['Strength (Varies by Time of Day, peaks near Day): min +240, max +240']
  );
  assert.deepEqual(
    formatSingleWithMeta('item_armorpercent_bytime', [packBytimeValue(2, 565, 710)], { descFunc: 18, descVal: 1 }),
    ['Enhanced Defense (Varies by Time of Day, peaks near Night): min +565%, max +710%']
  );
  assert.deepEqual(
    formatSingleWithMeta('item_resist_pois_bytime', [packBytimeValue(0, 1016, 170)], { descFunc: 18, descVal: 2 }),
    ['Poison Resist (Varies by Time of Day, peaks near Day): min +1016%, max +170%']
  );
  assert.deepEqual(
    formatSingleWithMeta('item_find_magic_bytime', [packBytimeValue(3, 6, 719)], { descFunc: 18, descVal: 1 }),
    ['Magic Find (Varies by Time of Day, peaks near Dawn): min +6%, max +719%']
  );
  assert.deepEqual(
    formatSingle('item_find_gems_bytime', [packBytimeValue(3, 12, 34)]),
    ['Chance of Finding Gems (Varies by Time of Day, peaks near Dawn): min +12%, max +34%']
  );
  assert.deepEqual(
    formatSingle('item_absorb_pois_bytime', [packBytimeValue(1, 69, 129)]),
    ['Poison Absorb (Varies by Time of Day, peaks near Dusk): min +69, max +129']
  );
});

test('formats packed item_*_bytime stats from real fixtures, including metadata-incomplete poison absorb', () => {
  const tables = loadPd2Tables();
  const sharedStash = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });
  const bases = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Bases.d2x'), { pd2Tables: tables });

  const bytimeCases = [
    {
      source: sharedStash,
      itemName: 'Unearthed Wand',
      statKey: 'item_strength_bytime',
      value: 246000,
      expected: 'Strength (Varies by Time of Day, peaks near Day): min +240, max +240'
    },
    {
      source: sharedStash,
      itemName: 'Elder Staff',
      statKey: 'item_armorpercent_bytime',
      value: 2676422,
      expected: 'Enhanced Defense (Varies by Time of Day, peaks near Night): min +565%, max +710%'
    },
    {
      source: sharedStash,
      itemName: 'Seraph Rod',
      statKey: 'item_resist_pois_bytime',
      value: 1040554,
      expected: 'Poison Resist (Varies by Time of Day, peaks near Day): min +1016%, max +170%'
    },
    {
      source: sharedStash,
      itemName: 'Caduceus',
      statKey: 'item_find_magic_bytime',
      value: 3152591,
      expected: 'Magic Find (Varies by Time of Day, peaks near Dawn): min +6%, max +719%'
    },
    {
      source: bases,
      itemName: 'Monarch',
      statKey: 'item_absorb_pois_bytime',
      value: 1119361,
      expected: 'Poison Absorb (Varies by Time of Day, peaks near Dusk): min +69, max +129'
    }
  ];

  for (const { source, itemName, statKey, value, expected } of bytimeCases) {
    const item = source.pages
      .flatMap((page) => page.topLevelItems ?? [])
      .find((entry) => entry.displayName === itemName && entry.properties?.some((property) => property.statKey === statKey));

    assert.ok(item, `expected ${itemName} to expose ${statKey} in fixture data`);

    const property = item.properties.find((entry) => entry.statKey === statKey);
    assert.deepEqual(property.values, [value], `${itemName} should preserve the packed 22-bit bytime value`);

    const lines = formatPropertyListForDisplay({
      kind: 'base',
      complete: true,
      error: null,
      properties: [property]
    }, tables).displayLines.map((line) => line.text);

    assert.deepEqual(lines, [expected]);
  }
});

test('formats per-level flat stats as +N Label (Based on Character Level)', () => {
  assert.deepEqual(formatSingle('item_armor_perlevel', [4]), ['+4 Defense (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_hp_perlevel', [6]), ['+6 Life (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_hp_perlevel', [0]), ['+0 Life (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_mana_perlevel', [32]), ['+32 Mana (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_maxdamage_perlevel', [4]), ['+4 Maximum Damage (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_strength_perlevel', [49]), ['+49 Strength (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_dexterity_perlevel', [14]), ['+14 Dexterity (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_energy_perlevel', [14]), ['+14 Energy (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_vitality_perlevel', [47]), ['+47 Vitality (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_tohit_perlevel', [33]), ['+33 Attack Rating (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_cold_damagemax_perlevel', [22]), ['+22 Maximum Cold Damage (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_fire_damagemax_perlevel', [33]), ['+33 Maximum Fire Damage (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_ltng_damagemax_perlevel', [24]), ['+24 Maximum Lightning Damage (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_pois_damagemax_perlevel', [21]), ['+21 Maximum Poison Damage (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_absorb_cold_perlevel', [44]), ['+44 Cold Absorb (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_absorb_fire_perlevel', [9]), ['+9 Fire Absorb (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_absorb_ltng_perlevel', [14]), ['+14 Lightning Absorb (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_absorb_pois_perlevel', [54]), ['+54 Poison Absorb (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_stamina_perlevel', [60]), ['+60 Stamina (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_tohit_demon_perlevel', [43]), ['+43 Attack Rating against Demons (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_tohit_undead_perlevel', [25]), ['+25 Attack Rating against Undead (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_kick_damage_perlevel', [42]), ['+42 Kick Damage (Based on Character Level)']);
});

test('formats per-level percent stats as N% Label (Based on Character Level)', () => {
  assert.deepEqual(formatSingle('item_tohitpercent_perlevel', [2]), ['2% Bonus to Attack Rating (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_resist_cold_perlevel', [23]), ['23% Cold Resist (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_resist_fire_perlevel', [54]), ['54% Fire Resist (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_resist_ltng_perlevel', [14]), ['14% Lightning Resist (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_resist_pois_perlevel', [21]), ['21% Poison Resist (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_find_gold_perlevel', [62]), ['62% Gold Find (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_find_magic_perlevel', [32]), ['32% Magic Find (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_crushingblow_perlevel', [60]), ['60% Crushing Blow (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_openwounds_perlevel', [11]), ['11% Open Wounds (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_deadlystrike_perlevel', [2]), ['2% Deadly Strike (Based on Character Level)']);
});

test('formats per-level signed-percent stats as +N% Label (Based on Character Level)', () => {
  assert.deepEqual(formatSingle('item_armorpercent_perlevel', [35]), ['+35% Enhanced Defense (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_maxdamage_percent_perlevel', [8]), ['+8% Enhanced Maximum Damage (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_regenstamina_perlevel', [57]), ['+57% Stamina Recovery (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_damage_demon_perlevel', [36]), ['+36% Damage to Demons (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_damage_undead_perlevel', [9]), ['+9% Damage to Undead (Based on Character Level)']);
});

test('formats item_thorns_perlevel as flat unsigned value', () => {
  assert.deepEqual(formatSingle('item_thorns_perlevel', [32]), ['32 Thorns (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_thorns_perlevel', [2624]), ['2624 Thorns (Based on Character Level)']);
});

test('formats per-level stats with negative values correctly', () => {
  assert.deepEqual(formatSingle('item_hp_perlevel', [-3]), ['-3 Life (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_damage_demon_perlevel', [-5]), ['-5% Damage to Demons (Based on Character Level)']);
  assert.deepEqual(formatSingle('item_resist_cold_perlevel', [-10]), ['-10% Cold Resist (Based on Character Level)']);
});

test('unknown perlevel stat not in PERLEVEL_STAT_RULES falls through to generic formatter', () => {
  const lines = formatSingle('item_fake_perlevel', [5]);
  assert.equal(lines.length, 1);
  assert.ok(
    !lines[0].includes('(Based on Character Level)'),
    'unknown perlevel stat should not use the per-level format'
  );
});

test('formats Batch B2 stats: hpregen, damage reduction family, requirements reduction', () => {
  // hpregen → "Replenish Life +N" switch case: flat right-side with signed prefix
  assert.deepEqual(formatSingle('hpregen', [9]), ['Replenish Life +9']);
  assert.deepEqual(formatSingle('hpregen', [3]), ['Replenish Life +3']);
  assert.deepEqual(formatSingle('hpregen', [-30]), ['Replenish Life -30']);

  // normal_damage_reduction → "Damage Reduced by N" switch case: flat right-side, no sign prefix
  assert.deepEqual(
    formatSingle('normal_damage_reduction', [21]),
    ['Damage Reduced by 21']
  );
  assert.deepEqual(
    formatSingle('normal_damage_reduction', [1]),
    ['Damage Reduced by 1']
  );

  // magic_damage_reduction → "Magic Damage Reduced by N"
  assert.deepEqual(
    formatSingle('magic_damage_reduction', [2]),
    ['Magic Damage Reduced by 2']
  );
  assert.deepEqual(
    formatSingle('magic_damage_reduction', [6]),
    ['Magic Damage Reduced by 6']
  );

  // damageresist → "Damage Reduced by N%" switch case: percent right-side, "by" wording
  assert.deepEqual(
    formatSingle('damageresist', [10]),
    ['Damage Reduced by 10%']
  );
  assert.deepEqual(
    formatSingle('damageresist', [20]),
    ['Damage Reduced by 20%']
  );

  // item_req_percent → "Requirements -N%" via SIMPLE_STAT_LABELS + PERCENT + RIGHT_VALUE path
  // D2 in-game values are always negative (requirements only go down), but the test also covers a hypothetical positive value for robustness
  assert.deepEqual(
    formatSingle('item_req_percent', [-15]),
    ['Requirements -15%']
  );
  assert.deepEqual(
    formatSingle('item_req_percent', [-50]),
    ['Requirements -50%']
  );
});

test('drops parser noise (saveBits=0) while preserving real stats and legacy test-shape properties', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'fireresist', saveBits: 8, values: [30] },      // real → kept
      { statKey: 'unit_dooverlay', saveBits: 0, values: [0] },   // noise → dropped
      { statKey: 'strength', values: [10] },                     // undefined saveBits → kept
      { statKey: 'experience', saveBits: 0, values: [0] },       // noise → dropped
      { statKey: 'coldresist', saveBits: 8, values: [25] }       // real → kept
    ]
  }, null);

  assert.equal(displayList.propertyCount, 3);
  assert.equal(displayList.noiseCount, 2);
  assert.deepEqual(
    displayList.properties.map((p) => p.statKey),
    ['fireresist', 'strength', 'coldresist']
  );
  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    [
      'Fire Resist +30%',
      '+10 to Strength',
      'Cold Resist +25%'
    ]
  );
});

test('noiseCount is 0 when no property has saveBits=0', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'fireresist', saveBits: 8, values: [30] },
      { statKey: 'coldresist', saveBits: 8, values: [20] }
    ]
  }, null);

  assert.equal(displayList.propertyCount, 2);
  assert.equal(displayList.noiseCount, 0);
  assert.equal(displayList.properties.length, 2);
});

test('fully-noise property list collapses to empty displayLines', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'experience', saveBits: 0, values: [0] },
      { statKey: 'goldbank', saveBits: 0, values: [0] },
      { statKey: 'unit_dooverlay', saveBits: 0, values: [0] }
    ]
  }, null);

  assert.equal(displayList.propertyCount, 0);
  assert.equal(displayList.noiseCount, 3);
  assert.deepEqual(displayList.displayLines, []);
  assert.deepEqual(displayList.properties, []);
});

test('grouped magic damage pair detection bridges across filtered noise', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'magicmindam', saveBits: 10, values: [10] },
      { statKey: 'unit_dooverlay', saveBits: 0, values: [0] },   // noise between partners
      { statKey: 'magicmaxdam', saveBits: 10, values: [20] }
    ]
  }, null);

  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    ['Adds Magic Damage: 10-20']
  );
  assert.equal(displayList.noiseCount, 1);
  assert.equal(displayList.propertyCount, 2);
});

test('existing test-shape properties (saveBits undefined) still format unchanged', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'strength', values: [10] },
      { statKey: 'dexterity', values: [5] }
    ]
  }, null);

  assert.equal(displayList.noiseCount, 0);
  assert.equal(displayList.propertyCount, 2);
  assert.deepEqual(
    displayList.displayLines.map((line) => line.text),
    ['+10 to Strength', '+5 to Dexterity']
  );
});

test('formatter is a no-op for a real fixture item whose parser-level noise is already removed (War Pike)', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Legacy.d2x'), { pd2Tables: tables });
  const page = summary.pages.find((p) => p.name === 'Season 5 Weapons');
  assert.ok(page, 'fixture sanity: Legacy.d2x should contain a Season 5 Weapons page');
  const warPike = page.topLevelItems.find((item) => item.code === '7p7');
  assert.ok(warPike, 'fixture sanity: Season 5 Weapons should contain a War Pike (7p7)');

  const rawList = warPike.propertyLists[0];
  assert.equal(rawList.properties.length, 0, 'fixture sanity: parser should already drop the War Pike noise rows');

  const displayList = formatPropertyListForDisplay(rawList, tables);
  assert.equal(displayList.propertyCount, 0);
  assert.equal(displayList.noiseCount, 0);
  assert.deepEqual(displayList.displayLines, []);
  assert.deepEqual(displayList.properties, []);
});

test('formatter is a no-op for a mixed real/noise fixture once parser-level noise is removed (Corona, Legacy.d2x)', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, 'Legacy.d2x'), { pd2Tables: tables });
  const page = summary.pages.find((p) => p.name === 'Season 4 Armor');
  assert.ok(page, 'fixture sanity: Legacy.d2x should contain a Season 4 Armor page');
  const corona = page.topLevelItems[6];
  assert.ok(corona, 'fixture sanity: Season 4 Armor should have a 7th top-level item');
  assert.equal(corona.displayName, 'Corona', 'fixture sanity: topLevelItems[6] is the Corona');

  const rawList = corona.propertyLists[0];
  assert.equal(rawList.properties.length, 7, 'fixture sanity: parser should already drop Corona zero-saveBits noise');

  const displayList = formatPropertyListForDisplay(rawList, tables);
  assert.equal(displayList.propertyCount, 7);
  assert.equal(displayList.noiseCount, 0);

  const droppedKeys = ['item_crush_damage_percent', 'item_tohit_percent_vs_monster', 'unit_dooverlay'];
  for (const key of droppedKeys) {
    assert.ok(
      !displayList.properties.some((p) => p.statKey === key),
      `dropped noise stat ${key} should not appear in filtered properties`
    );
    assert.ok(
      !displayList.displayLines.some((line) => line.statKey === key),
      `dropped noise stat ${key} should not appear in displayLines`
    );
  }
});

test('formats item_elemskill_* stats using values[1] as the bonus level', () => {
  assert.deepEqual(formatSingle('item_elemskill_cold', [0, 1]), ['+1 to Cold Skills']);
  assert.deepEqual(formatSingle('item_elemskill_fire', [1, 3]), ['+3 to Fire Skills']);
  assert.deepEqual(formatSingle('item_elemskill_lightning', [0, 5]), ['+5 to Lightning Skills']);
  assert.deepEqual(formatSingle('item_elemskill_poison', [2, 6]), ['+6 to Poison Skills']);
  assert.deepEqual(formatSingle('item_elemskill_magic', [6, 2]), ['+2 to Magic Skills']);
  assert.deepEqual(formatSingle('item_elemskill', [3, 1]), ['+1 to Elemental Skills']);
  assert.deepEqual(formatSingle('item_elemskill_cold', [0, 0]), ['+0 to Cold Skills']);
});

test('formats extra_valk summon cap with singular and plural forms', () => {
  assert.deepEqual(formatSingle('extra_valk', [1]), ['You may summon 1 extra Valkyrie']);
  assert.deepEqual(formatSingle('extra_valk', [9]), ['You may summon 9 extra Valkyries']);
});

test('formats pierce and mastery stats as percent labels', () => {
  assert.deepEqual(formatSingle('passive_fire_pierce', [15]), ['+15% Enemy Fire Resistance']);
  assert.deepEqual(formatSingle('passive_phys_pierce', [5]), ['+5% Enemy Physical Resistance']);
  assert.deepEqual(formatSingle('passive_mag_pierce', [10]), ['+10% Enemy Magic Resistance']);
  assert.deepEqual(formatSingle('passive_mag_mastery', [53]), ['+53% Magic Skill Damage']);
  assert.deepEqual(formatSingle('item_pierce_fire', [-25]), ['-25% Enemy Fire Resistance']);
  assert.deepEqual(formatSingle('item_pierce_ltng', [-50]), ['-50% Enemy Lightning Resistance']);
  assert.deepEqual(formatSingle('item_pierce_cold', [-2]), ['-2% Enemy Cold Resistance']);
  assert.deepEqual(formatSingle('item_pierce_pois', [-16]), ['-16% Enemy Poison Resistance']);
  assert.deepEqual(formatSingle('item_pierce', [101]), ['+101% Chance of Piercing Attack']);
  assert.deepEqual(formatSingle('curse_resistance', [56]), ['+56% Curse Duration Reduced']);
  assert.deepEqual(formatSingle('inc_splash_radius', [15]), ['+15% Increased Splash Radius']);
});

test('formats target defense reduction stats with forced negative sign', () => {
  assert.deepEqual(formatSingle('item_damagetargetac', [128]), ["-128 to Target's Defense"]);
  assert.deepEqual(formatSingle('item_damagetargetac', [766]), ["-766 to Target's Defense"]);
  assert.deepEqual(formatSingle('item_fractionaltargetac', [25]), ['-25% Target Defense']);
  assert.deepEqual(formatSingle('item_fractionaltargetac', [57]), ['-57% Target Defense']);
});

test('formats howl, freeze, and other combat switch-case stats', () => {
  assert.deepEqual(formatSingle('item_howl', [33]), ['Hit Causes Monster to Flee 33%']);
  assert.deepEqual(formatSingle('item_howl', [108]), ['Hit Causes Monster to Flee 108%']);
  assert.deepEqual(formatSingle('item_freeze', [13]), ['Freezes Target +13']);
  assert.deepEqual(formatSingle('item_freeze', [2]), ['Freezes Target +2']);
  assert.deepEqual(formatSingle('item_normaldamage', [30]), ['+30 to Normal Damage']);
  assert.deepEqual(formatSingle('item_extra_stack', [197]), ['+197 to Increased Stack Size']);
  assert.deepEqual(formatSingle('max_curses', [2]), ['+2 to Maximum Curses']);
});

test('formats boolean/flag stats as static labels', () => {
  assert.deepEqual(formatSingle('item_magicarrow', [16]), ['Fires Magic Arrows']);
  assert.deepEqual(formatSingle('item_explosivearrow', [6]), ['Fires Explosive Arrows/Bolts']);
  assert.deepEqual(formatSingle('item_replenish_quantity', [16]), ['Replenishes Quantity']);
  assert.deepEqual(formatSingle('item_replenish_charges', [49]), ['Replenishes Charges']);
  assert.deepEqual(formatSingle('heroic', [4]), ['Heroic']);
});

test('formats replenish durability with time value', () => {
  assert.deepEqual(formatSingle('item_replenish_durability', [5]), ['Repairs 1 Durability in 5 Seconds']);
  assert.deepEqual(formatSingle('item_replenish_durability', [44]), ['Repairs 1 Durability in 44 Seconds']);
});

test('formats numsockets textonly and PD2 cooldown reduction stats', () => {
  assert.deepEqual(formatSingle('item_numsockets_textonly', [4]), ['Socketed (4)']);
  assert.deepEqual(formatSingle('dragonflightreduction', [31]), ['+31% Dragon Flight Cooldown Reduction']);
  assert.deepEqual(formatSingle('joustreduction', [13]), ['+13% Joust Cooldown Reduction']);
  assert.deepEqual(formatSingle('gustreduction', [50]), ['+50% Gust Cooldown Reduction']);
  assert.deepEqual(formatSingle('corpseexplosionradius', [31]), ['+31% Increased Corpse Explosion Radius']);
});

test('formats map_mon_* stats via data-driven descFunc formatter', () => {
  // descFunc=8: +val% label label2
  assert.deepEqual(
    formatSingleWithMeta('map_mon_fastercastrate', [60], { descFunc: 8, descVal: 2, descStringKey: 'MapMonHave', descString2Key: 'ModStr4v' }),
    ['Monsters Have Faster Cast Rate +60%']
  );
  // descFunc=7: val% label label2
  assert.deepEqual(
    formatSingleWithMeta('map_mon_crushingblow', [17], { descFunc: 7, descVal: 2, descStringKey: 'MapMonHave', descString2Key: 'ModStr5c' }),
    ['Monsters Have Crushing Blow 17%']
  );
  // descFunc=6: +val label label2
  assert.deepEqual(
    formatSingleWithMeta('map_mon_firemindam', [114], { descFunc: 6, descVal: 2, descStringKey: 'MapMonHave', descString2Key: 'ModStr1p' }),
    ['Monsters Have +114 Minimum Fire Damage']
  );
  // descFunc=9: label label2 (no value displayed)
  assert.deepEqual(
    formatSingleWithMeta('map_mon_cannotbefrozen', [1], { descFunc: 9, descVal: 2, descStringKey: 'MapMonHave', descString2Key: 'ModStr5z' }),
    ['Monsters Have Cannot Be Frozen']
  );
});

test('formats only canonical map_mon_splash and suppresses noncanonical values', () => {
  const meta = { descFunc: 9, descVal: 0, descStringKey: 'MapMon', descString2Key: 'MapMonSplash' };

  assert.deepEqual(
    formatSingleWithMeta('map_mon_splash', [22913, 100], meta),
    ['Monsters Melee Splash']
  );
  assert.deepEqual(formatSingleWithMeta('map_mon_splash', [32896, 82], meta), []);
  assert.deepEqual(formatSingleWithMeta('map_mon_splash', [33189, 0], meta), []);
  assert.deepEqual(formatSingleWithMeta('map_mon_splash', [45166, 6], meta), []);
});

test('formats map_play_* stats via data-driven descFunc formatter', () => {
  // descFunc=7 with negative value
  assert.deepEqual(
    formatSingleWithMeta('map_play_fireresist', [-15], { descFunc: 7, descVal: 2, descStringKey: 'MapPlayHave', descString2Key: 'ModStr1j' }),
    ['Players Have Fire Resist -15%']
  );
  assert.deepEqual(
    formatSingleWithMeta('map_play_toblock', [-16], { descFunc: 7, descVal: 2, descStringKey: 'MapPlayHave', descString2Key: 'MapPlayBlock' }),
    ['Players Have Chance to Block -16%']
  );
  // descFunc=8 with negative value
  assert.deepEqual(
    formatSingleWithMeta('map_play_fastergethitrate', [-12], { descFunc: 8, descVal: 2, descStringKey: 'MapPlayHave', descString2Key: 'ModStr4p' }),
    ['Players Have Faster Hit Recovery -12%']
  );
});

test('formats map_glob_* stats via data-driven descFunc formatter', () => {
  // descFunc=1
  assert.deepEqual(
    formatSingleWithMeta('map_glob_arealevel', [1], { descFunc: 1, descVal: 1, descStringKey: 'MapGlobLevel', descString2Key: '' }),
    ['+1 Area Level']
  );
  // descFunc=4
  assert.deepEqual(
    formatSingleWithMeta('map_glob_density', [64], { descFunc: 4, descVal: 1, descStringKey: 'MapGlobDensity', descString2Key: '' }),
    ['+64% Monster Density']
  );
  // descFunc=3 (flag-style)
  assert.deepEqual(
    formatSingleWithMeta('map_glob_boss_dropcorruptedunique', [1], { descFunc: 3, descVal: 0, descStringKey: 'MapBossCorruptedUnique', descString2Key: '' }),
    ['Boss Drops Corrupted Unique']
  );
  // descFunc=3 monster type
  assert.deepEqual(
    formatSingleWithMeta('map_glob_add_mon_cow', [391], { descFunc: 3, descVal: 0, descStringKey: 'MapAddMonCow', descString2Key: '' }),
    ['Additional Monster Type: Cows']
  );
});

test('suppresses hidden map supporting stats from display output', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'map_mon_coldmindam', values: [100], descFunc: 6, descVal: 2, descStringKey: 'MapMonHave', descString2Key: 'ModStr1t' },
      { statKey: 'map_mon_coldlength', values: [169], descFunc: null, descVal: null, descStringKey: '', descString2Key: '' },
      { statKey: 'map_mon_poisonlength', values: [257], descFunc: null, descVal: null, descStringKey: '', descString2Key: '' }
    ]
  }, null);

  assert.equal(displayList.displayLines.length, 1, 'hidden stats should be suppressed');
  assert.equal(displayList.displayLines[0].text, 'Monsters Have +100 Minimum Cold Damage');
  assert.ok(!displayList.displayLines.some(l => l.statKey === 'map_mon_coldlength'), 'coldlength hidden');
  assert.ok(!displayList.displayLines.some(l => l.statKey === 'map_mon_poisonlength'), 'poisonlength hidden');
});

test('formats map stats from real fixture items', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });

  // Find a map item with map stats
  const mapItem = summary.pages
    .flatMap((page) => page.topLevelItems ?? [])
    .find((item) => item.displayName?.includes('Map') &&
      item.properties?.some((p) => p.statKey?.startsWith('map_mon_') || p.statKey?.startsWith('map_play_')));

  if (mapItem) {
    const mapProps = mapItem.properties.filter(p => p.statKey?.startsWith('map_'));
    const formatted = formatPropertyListForDisplay({
      kind: 'base',
      complete: true,
      error: null,
      properties: mapProps
    }, tables);

    // All map stats should produce display lines (except hidden ones)
    const nonHiddenCount = mapProps.filter(p => p.statKey !== 'map_mon_coldlength' && p.statKey !== 'map_mon_poisonlength').length;
    assert.equal(formatted.displayLines.length, nonHiddenCount, 'all non-hidden map stats should produce display lines');

    // Verify no display line falls back to humanize pattern
    for (const line of formatted.displayLines) {
      assert.ok(
        !line.text.match(/^[A-Z][a-z]+[A-Z]/),
        `map stat ${line.statKey} should not use humanized fallback: ${line.text}`
      );
    }
  }
});

test('formats canonical map_mon_splash from maps and hides non-map fixture leaks', () => {
  const tables = loadPd2Tables();
  const sharedSummary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });
  const canonicalMap = sharedSummary.pages
    .flatMap((page) => page.topLevelItems ?? [])
    .find((item) =>
      item.displayName === 'Westmarch Map' &&
      item.properties.some((property) => property.statKey === 'map_mon_splash')
    );
  assert.ok(canonicalMap, 'expected Westmarch Map to expose canonical map_mon_splash');

  const renderStat = (item, statKey) => {
    const property = item.properties.find((candidate) => candidate.statKey === statKey);
    assert.ok(property, `expected ${item.displayName} to expose ${statKey}`);
    return formatPropertyListForDisplay({
      kind: 'base',
      complete: true,
      error: null,
      properties: [property]
    }, tables).displayLines.map((line) => line.text);
  };

  assert.deepEqual(renderStat(canonicalMap, 'map_mon_splash'), ['Monsters Melee Splash']);

  const showcaseSummary = parseCharacterFile(
    path.join(FIXTURE_DIR, 'Showcase Characters', 'amazon', 'summoner.d2s'),
    { pd2Tables: tables }
  );
  const nonMapPotion = showcaseSummary.topLevelItems.find((item) =>
    item.displayName === 'Greater Mana Potion' &&
    item.properties.some((property) =>
      property.statKey === 'map_mon_splash' &&
      property.values?.[0] === 32896 &&
      property.values?.[1] === 82
    )
  );
  assert.ok(nonMapPotion, 'expected summoner.d2s Greater Mana Potion to expose noncanonical map_mon_splash');
  assert.deepEqual(renderStat(nonMapPotion, 'map_mon_splash'), []);
});

test('formats item_elemskill_* from real fixture items', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });

  const findItemWithStat = (statKey) =>
    summary.pages
      .flatMap((page) => page.items ?? page.topLevelItems ?? [])
      .find((item) => item.properties.some((p) => p.statKey === statKey));

  const itemWithCold = findItemWithStat('item_elemskill_cold');
  const itemWithPoison = findItemWithStat('item_elemskill_poison');

  if (itemWithCold) {
    const prop = itemWithCold.properties.find((p) => p.statKey === 'item_elemskill_cold');
    const lines = formatSingle('item_elemskill_cold', prop.values, tables);
    assert.ok(lines[0].includes('to Cold Skills'), 'fixture item_elemskill_cold should format with Cold Skills label');
  }

  if (itemWithPoison) {
    const prop = itemWithPoison.properties.find((p) => p.statKey === 'item_elemskill_poison');
    const lines = formatSingle('item_elemskill_poison', prop.values, tables);
    assert.ok(lines[0].includes('to Poison Skills'), 'fixture item_elemskill_poison should format with Poison Skills label');
  }
});

test('formats item_skillonequip with skill name resolution', () => {
  const tables = loadPd2Tables();
  // values[0] = skillId, values[1] = level
  assert.deepEqual(
    formatSingle('item_skillonequip', [98, 12], tables),
    ['Level 12 Might When Equipped']
  );
  assert.deepEqual(
    formatSingle('item_skillonequip', [112, 5], tables),
    ['Level 5 Blessed Hammer When Equipped']
  );
  // Unknown skill falls back to Skill N
  assert.deepEqual(
    formatSingle('item_skillonequip', [9999, 3], tables),
    ['Level 3 Skill 9999 When Equipped']
  );
});

test('formats map_mon_skillondeath via descFunc=15 packed encoding', () => {
  const tables = loadPd2Tables();
  // packed = (skillId << 6) | level, values[1] = chance
  // skillId=121 (Fist of the Heavens), level=58, chance=15
  const packed = (121 << 6) | 58;
  assert.deepEqual(
    formatSingleWithMeta('map_mon_skillondeath', [packed, 15],
      { descFunc: 15, descVal: 2, descStringKey: 'Moditemskondeath', descString2Key: '' }, tables),
    ['Monsters 15% Chance to Cast Level 58 Fist of the Heavens on Death']
  );
  // Unknown skill falls back to Skill N
  assert.deepEqual(
    formatSingleWithMeta('map_mon_skillondeath', [(775 << 6) | 17, 1],
      { descFunc: 15, descVal: 2, descStringKey: 'Moditemskondeath', descString2Key: '' }, tables),
    ['Monsters 1% Chance to Cast Level 17 Skill 775 on Death']
  );
});

test('formats remaining simple stat labels correctly', () => {
  // lifedrainmindam — percentage display (left-side, matching D2 "+N% Life Stolen" pattern)
  assert.deepEqual(formatSingle('lifedrainmindam', [8]), ['+8% Minimum Life Stolen Per Hit']);
  // passive_mastery_melee_crit — percentage display
  assert.deepEqual(formatSingle('passive_mastery_melee_crit', [15]), ['+15% Melee Critical Strike']);
  // passive_critical_strike — percentage display
  assert.deepEqual(formatSingle('passive_critical_strike', [10]), ['+10% Critical Strike']);
  // pvp_lld_cd — flat display
  assert.deepEqual(formatSingle('pvp_lld_cd', [6]), ['+6 to PvP Low Level Duel Cooldown']);
});

test('hides transform_dye from display output', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'transform_dye', values: [12651795] },
      { statKey: 'strength', values: [10] }
    ]
  }, null);
  // transform_dye should be hidden (null return), only strength shows
  assert.equal(displayList.displayLines.length, 1);
  assert.equal(displayList.displayLines[0].statKey, 'strength');
});

test('hides internal stat leaks from presentation output', () => {
  const displayList = formatPropertyListForDisplay({
    kind: 'base',
    complete: true,
    error: null,
    properties: [
      { statKey: 'extra_holybolts', values: [3] },
      { statKey: 'corruptor', values: [1650] },
      { statKey: 'transform_dye', values: [12651795] },
      { statKey: 'dclone_clout', values: [5] },
      { statKey: 'maxlevel_clout', values: [0] },
      { statKey: 'dev_clout', values: [4] },
      { statKey: 'rathma_clout', values: [1] },
      { statKey: 'immune_stat', values: [411] },
      { statKey: 'mon_cooldown1', values: [42] },
      { statKey: 'mon_cooldown2', values: [321] },
      { statKey: 'mon_cooldown3', values: [85] },
      { statKey: 'strength', values: [10] }
    ]
  }, null);

  assert.deepEqual(displayList.displayLines.map((line) => line.text), ['+10 to Strength']);
});

test('hides clout, immune, and monster cooldown leaks from real character fixtures', () => {
  const tables = loadPd2Tables();
  const cases = [
    ['demon-crossbow.d2s', 'Full Rejuv Potion', 'rvl', 'dclone_clout', 5],
    ['demon-crossbow.d2s', 'Full Rejuv Potion', 'rvl', 'maxlevel_clout', 0],
    ['fire-bloodraven.d2s', 'Full Rejuv Potion', 'rvl', 'dev_clout', 4],
    ['rathma-spear.d2s', 'Full Rejuv Potion', 'rvl', 'rathma_clout', 1],
    ['demon-crossbow.d2s', 'Full Rejuv Potion', 'rvl', 'immune_stat', 411],
    ['summoner3.d2s', 'Full Rejuv Potion', 'rvl', 'mon_cooldown1', 42],
    ['demon-crossbow.d2s', 'Full Rejuv Potion', 'rvl', 'mon_cooldown2', 321],
    ['fire-bloodraven.d2s', 'Full Rejuv Potion', 'rvl', 'mon_cooldown3', 85]
  ];

  for (const [fileName, displayName, code, statKey, value] of cases) {
    const summary = parseCharacterFile(findFixtureFile(fileName), { pd2Tables: tables });
    const item = summary.topLevelItems.find((candidate) =>
      candidate.displayName === displayName &&
      candidate.code === code &&
      candidate.properties.some((property) =>
        property.statKey === statKey &&
        property.values?.[0] === value
      )
    );

    assert.ok(item, `expected ${fileName} to expose ${statKey} on ${displayName}`);
    const property = item.properties.find((candidate) =>
      candidate.statKey === statKey &&
      candidate.values?.[0] === value
    );
    const displayList = formatPropertyListForDisplay({
      kind: 'base',
      complete: true,
      error: null,
      properties: [property]
    }, tables);

    assert.deepEqual(displayList.displayLines, [], `${statKey} should not render`);
  }
});

test('hides extra_holybolts from real shared-stash fixture items', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });
  const item = summary.pages
    .find((page) => page.name === 'Miscellaneous')
    ?.items?.find(
      (candidate) =>
        candidate.displayName === 'El Rune' &&
        candidate.properties.some((property) => property.statKey === 'extra_holybolts' && property.values?.[0] === 3)
    );

  assert.ok(item, 'expected El Rune in Miscellaneous to expose extra_holybolts in the shared stash fixture');

  const displayList = formatPropertyListForDisplay(
    {
      ...item.propertyLists[0],
      properties: item.propertyLists[0].properties.filter((property) => property.statKey === 'extra_holybolts')
    },
    tables
  );

  assert.deepEqual(displayList.displayLines, []);
});

test('hides corruptor from real shared-stash fixture items', () => {
  const tables = loadPd2Tables();
  const summary = parsePlugyStashFile(path.join(FIXTURE_DIR, '_LOD_SharedStashSave.sss'), { pd2Tables: tables });
  const item = summary.pages
    .find((page) => page.name === 'Rejuvenation')
    ?.items?.find(
      (candidate) =>
        candidate.displayName === 'Full Rejuv Potion' &&
        candidate.properties.some((property) => property.statKey === 'corruptor' && property.values?.[0] === 1650)
    );

  assert.ok(item, 'expected Full Rejuv Potion in Rejuvenation to expose corruptor in the shared stash fixture');

  const displayList = formatPropertyListForDisplay(
    {
      ...item.propertyLists[0],
      properties: item.propertyLists[0].properties.filter((property) => property.statKey === 'corruptor')
    },
    tables
  );

  assert.deepEqual(displayList.displayLines, []);
});
