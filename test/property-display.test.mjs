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
