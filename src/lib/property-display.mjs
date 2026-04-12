const CLASS_NAMES = {
  0: 'Amazon',
  1: 'Sorceress',
  2: 'Necromancer',
  3: 'Paladin',
  4: 'Barbarian',
  5: 'Druid',
  6: 'Assassin'
};

const CLASS_TAB_NAMES = {
  0: ['Bow and Crossbow Skills', 'Passive and Magic Skills', 'Javelin and Spear Skills'],
  1: ['Fire Skills', 'Lightning Skills', 'Cold Skills'],
  2: ['Curses', 'Poison and Bone Skills', 'Summoning Skills'],
  3: ['Combat Skills', 'Offensive Aura Skills', 'Defensive Aura Skills'],
  4: ['Combat Skills', 'Combat Masteries', 'Warcries'],
  5: ['Summoning Skills', 'Shape Shifting Skills', 'Elemental Skills'],
  6: ['Traps', 'Shadow Disciplines', 'Martial Arts']
};

const SIMPLE_STAT_LABELS = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  vitality: 'Vitality',
  energy: 'Energy',
  maxhp: 'Life',
  hitpoints: 'Life',
  mana: 'Mana',
  maxmana: 'Mana',
  tohit: 'Attack Rating',
  armorclass: 'Defense',
  armorclass_vs_missile: 'Defense vs. Missile',
  armorclass_vs_hth: 'Defense vs. Melee',
  item_armor_percent: 'Enhanced Defense',
  damagepercent: 'Enhanced Damage',
  item_mindamage_percent: 'Minimum Damage',
  item_maxdamage_percent: 'Maximum Damage',
  mindamage: 'Minimum Damage',
  maxdamage: 'Maximum Damage',
  secondary_mindamage: 'Secondary Minimum Damage',
  secondary_maxdamage: 'Secondary Maximum Damage',
  item_throw_maxdamage: 'Throw Damage',
  item_throw_mindamage: 'Throw Minimum Damage',
  item_slash_damage: 'Slash Damage',
  item_thrust_damage: 'Thrust Damage',
  item_magicbonus: 'Magic Find',
  item_damagetomana: 'Damage Taken Goes To Mana',
  fireresist: 'Fire Resist',
  coldresist: 'Cold Resist',
  lightresist: 'Lightning Resist',
  poisonresist: 'Poison Resist',
  maxfireresist: 'Maximum Fire Resist',
  maxcoldresist: 'Maximum Cold Resist',
  maxlightresist: 'Maximum Lightning Resist',
  maxpoisonresist: 'Maximum Poison Resist',
  item_fastercastrate: 'Faster Cast Rate',
  item_fastergethitrate: 'Faster Hit Recovery',
  item_fastermovevelocity: 'Faster Run/Walk',
  item_fasterattackrate: 'Increased Attack Speed',
  item_fasterblockrate: 'Faster Block Rate',
  item_attackertakesdamage: 'Attacker Takes Damage',
  item_attackertakeslightdamage: 'Attacker Takes Lightning Damage',
  item_splashonhit: 'Melee Splash',
  toblock: 'Chance to Block',
  map_play_toblock: 'Chance to Block',
  item_allskills: 'All Skills',
  item_addexperience: 'Experience Gained',
  item_goldbonus: 'Gold Find',
  item_lightradius: 'Light Radius',
  maxstamina: 'Stamina',
  item_lifeleech: 'Life Stolen per Hit',
  item_manaleech: 'Mana Stolen per Hit',
  piercefire: 'Pierces Fire Resistance',
  piercecold: 'Pierces Cold Resistance',
  pierceltn: 'Pierces Lightning Resistance',
  piercepois: 'Pierces Poison Resistance',
  item_crushingblow: 'Crushing Blow',
  crushingblow: 'Crushing Blow',
  item_openwounds: 'Open Wounds',
  openwounds: 'Open Wounds',
  item_deadlystrike: 'Deadly Strike',
  deadlystrike: 'Deadly Strike',
  item_absorbcold_percent: 'Cold Absorb',
  item_absorbfire_percent: 'Fire Absorb',
  item_absorblight_percent: 'Lightning Absorb',
  item_absorbcold: 'Cold Absorb',
  item_absorbfire: 'Fire Absorb',
  item_absorblight: 'Lightning Absorb',
  item_absorbmagic: 'Magic Absorb',
  staminarecoverybonus: 'Faster Stamina Recovery',
  manarecoverybonus: 'Regenerate Mana',
  passive_fire_mastery: 'Fire Skill Damage',
  passive_ltng_mastery: 'Lightning Skill Damage',
  passive_cold_mastery: 'Cold Skill Damage',
  passive_pois_mastery: 'Poison Skill Damage',
  passive_ltng_pierce: 'Enemy Lightning Resistance',
  passive_cold_pierce: 'Enemy Cold Resistance',
  passive_pois_pierce: 'Enemy Poison Resistance',
  item_hp_percent: 'Life',
  item_maxmana_percent: 'Mana',
  item_maxhp_percent: 'Life',
  item_kickdamage: 'Kick Damage',
  item_healafterkill: 'Life After Each Kill',
  item_healafterdemonkill: 'Life After Each Demon Kill',
  item_healafterhit: 'Life After Each Hit',
  item_manaafterkill: 'Mana After Each Kill',
  item_demon_tohit: 'Attack Rating against Demons',
  item_undead_tohit: 'Attack Rating against Undead',
  magicmindam: 'Magic Minimum Damage',
  magicmaxdam: 'Magic Maximum Damage',
  item_maxdurability_percent: 'Increase Maximum Durability',
  item_reducedprices: 'Reduces All Vendor Prices',
  item_tohit_percent: 'Bonus to Attack Rating',
  item_absorbmagic_percent: 'Magic Absorb',
  item_staminadrainpct: 'Slower Stamina Drain',
  item_poisonlengthresist: 'Poison Length Reduced',
  item_demondamage_percent: 'Damage to Demons',
  item_undeaddamage_percent: 'Damage to Undead',
  maxmagicresist: 'Maximum Magic Resist',
  magicresist: 'Magic Resist',
  item_req_percent: 'Requirements',
  gold: 'Gold',
  level: 'Level',
  statpts: 'Stat Points'
};

const PERCENT_LABEL_KEYS = new Set([
  'item_armor_percent',
  'damagepercent',
  'item_mindamage_percent',
  'item_maxdamage_percent',
  'item_magicbonus',
  'item_goldbonus',
  'item_damagetomana',
  'fireresist',
  'coldresist',
  'lightresist',
  'poisonresist',
  'maxfireresist',
  'maxcoldresist',
  'maxlightresist',
  'maxpoisonresist',
  'item_fastercastrate',
  'item_fastergethitrate',
  'item_fastermovevelocity',
  'item_fasterattackrate',
  'item_fasterblockrate',
  'item_crushingblow',
  'crushingblow',
  'item_openwounds',
  'openwounds',
  'item_deadlystrike',
  'deadlystrike',
  'item_lifeleech',
  'item_manaleech',
  'piercefire',
  'piercecold',
  'pierceltn',
  'piercepois',
  'item_absorbcold_percent',
  'item_absorbfire_percent',
  'item_absorblight_percent',
  'staminarecoverybonus',
  'manarecoverybonus',
  'passive_fire_mastery',
  'passive_ltng_mastery',
  'passive_cold_mastery',
  'passive_pois_mastery',
  'passive_ltng_pierce',
  'passive_cold_pierce',
  'passive_pois_pierce',
  'item_addexperience',
  'toblock',
  'item_maxmana_percent',
  'item_maxhp_percent',
  'item_maxdurability_percent',
  'item_reducedprices',
  'item_tohit_percent',
  'item_absorbmagic_percent',
  'item_staminadrainpct',
  'item_poisonlengthresist',
  'item_demondamage_percent',
  'item_undeaddamage_percent',
  'curse_effectiveness',
  'item_leap_speed',
  'maxmagicresist',
  'magicresist',
  'item_req_percent'
]);

const RIGHT_VALUE_LABEL_KEYS = new Set([
  'fireresist',
  'coldresist',
  'lightresist',
  'poisonresist',
  'maxfireresist',
  'maxcoldresist',
  'maxlightresist',
  'maxpoisonresist',
  'item_damagetomana',
  'item_magicbonus',
  'item_goldbonus',
  'item_fastercastrate',
  'item_fastergethitrate',
  'item_fastermovevelocity',
  'item_fasterattackrate',
  'item_fasterblockrate',
  'item_crushingblow',
  'crushingblow',
  'item_openwounds',
  'openwounds',
  'item_deadlystrike',
  'deadlystrike',
  'item_lifeleech',
  'item_manaleech',
  'piercefire',
  'piercecold',
  'pierceltn',
  'piercepois',
  'staminarecoverybonus',
  'manarecoverybonus',
  'item_addexperience',
  'toblock',
  'damagepercent',
  'item_armor_percent',
  'item_maxdurability_percent',
  'item_reducedprices',
  'item_tohit_percent',
  'item_absorbmagic_percent',
  'item_staminadrainpct',
  'item_poisonlengthresist',
  'curse_effectiveness',
  'item_leap_speed',
  'item_req_percent'
]);

const PERLEVEL_STAT_RULES = {
  item_armor_perlevel: { label: 'Defense', format: 'flat' },
  item_armorpercent_perlevel: { label: 'Enhanced Defense', format: 'percent_signed' },
  item_hp_perlevel: { label: 'Life', format: 'flat' },
  item_mana_perlevel: { label: 'Mana', format: 'flat' },
  item_maxdamage_perlevel: { label: 'Maximum Damage', format: 'flat' },
  item_maxdamage_percent_perlevel: { label: 'Enhanced Maximum Damage', format: 'percent_signed' },
  item_strength_perlevel: { label: 'Strength', format: 'flat' },
  item_dexterity_perlevel: { label: 'Dexterity', format: 'flat' },
  item_energy_perlevel: { label: 'Energy', format: 'flat' },
  item_vitality_perlevel: { label: 'Vitality', format: 'flat' },
  item_tohit_perlevel: { label: 'Attack Rating', format: 'flat' },
  item_tohitpercent_perlevel: { label: 'Bonus to Attack Rating', format: 'percent' },
  item_cold_damagemax_perlevel: { label: 'Maximum Cold Damage', format: 'flat' },
  item_fire_damagemax_perlevel: { label: 'Maximum Fire Damage', format: 'flat' },
  item_ltng_damagemax_perlevel: { label: 'Maximum Lightning Damage', format: 'flat' },
  item_pois_damagemax_perlevel: { label: 'Maximum Poison Damage', format: 'flat' },
  item_resist_cold_perlevel: { label: 'Cold Resist', format: 'percent' },
  item_resist_fire_perlevel: { label: 'Fire Resist', format: 'percent' },
  item_resist_ltng_perlevel: { label: 'Lightning Resist', format: 'percent' },
  item_resist_pois_perlevel: { label: 'Poison Resist', format: 'percent' },
  item_absorb_cold_perlevel: { label: 'Cold Absorb', format: 'flat' },
  item_absorb_fire_perlevel: { label: 'Fire Absorb', format: 'flat' },
  item_absorb_ltng_perlevel: { label: 'Lightning Absorb', format: 'flat' },
  item_absorb_pois_perlevel: { label: 'Poison Absorb', format: 'flat' },
  item_thorns_perlevel: { label: 'Thorns', format: 'flat_unsigned' },
  item_find_gold_perlevel: { label: 'Gold Find', format: 'percent' },
  item_find_magic_perlevel: { label: 'Magic Find', format: 'percent' },
  item_regenstamina_perlevel: { label: 'Stamina Recovery', format: 'percent_signed' },
  item_stamina_perlevel: { label: 'Stamina', format: 'flat' },
  item_damage_demon_perlevel: { label: 'Damage to Demons', format: 'percent_signed' },
  item_damage_undead_perlevel: { label: 'Damage to Undead', format: 'percent_signed' },
  item_tohit_demon_perlevel: { label: 'Attack Rating against Demons', format: 'flat' },
  item_tohit_undead_perlevel: { label: 'Attack Rating against Undead', format: 'flat' },
  item_crushingblow_perlevel: { label: 'Crushing Blow', format: 'percent' },
  item_openwounds_perlevel: { label: 'Open Wounds', format: 'percent' },
  item_kick_damage_perlevel: { label: 'Kick Damage', format: 'flat' },
  item_deadlystrike_perlevel: { label: 'Deadly Strike', format: 'percent' }
};

function formatSignedNumber(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatPerlevelProperty(statKey, value) {
  const rule = PERLEVEL_STAT_RULES[statKey];
  if (!rule) {
    return null;
  }

  const numericValue = Number.isFinite(value) ? value : 0;
  const label = rule.label;
  const suffix = '(Based on Character Level)';

  switch (rule.format) {
    case 'flat':
      return `${formatSignedNumber(numericValue)} ${label} ${suffix}`;
    case 'percent':
      return `${numericValue}% ${label} ${suffix}`;
    case 'percent_signed':
      return `${formatSignedNumber(numericValue)}% ${label} ${suffix}`;
    case 'flat_unsigned':
      return `${numericValue} ${label} ${suffix}`;
    default:
      return null;
  }
}

function humanizeStatKey(statKey) {
  const trimmed = `${statKey ?? ''}`.trim();
  if (!trimmed) {
    return 'Unknown Stat';
  }

  const withoutPrefix = trimmed
    .replace(/^item_/, '')
    .replace(/^passive_/, '')
    .replace(/^map_play_/, '')
    .replace(/^map_mon_/, '')
    .replace(/^skill_/, '');

  return withoutPrefix
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getSkillName(skillId, pd2Tables) {
  const skill = pd2Tables?.resolveSkill?.(skillId);
  return skill?.name ?? `Skill ${skillId}`;
}

function formatSimpleLabel(statKey) {
  return SIMPLE_STAT_LABELS[statKey] ?? humanizeStatKey(statKey);
}

function formatMonsterIdentifier(property) {
  return property.monsterName ?? property.values?.[0] ?? 'Unknown Monster';
}

function formatMonsterLinkedProperty(property, amountLabel, amountValue) {
  return `${formatSignedNumber(amountValue ?? 0)} ${amountLabel} ${formatMonsterIdentifier(property)}`;
}

function formatSkillOnCastProperty(property, pd2Tables) {
  const values = property.values ?? [];
  const packedValue = values[0] ?? 0;
  const rawChance = values[1] ?? 0;
  const rawSkillId = packedValue >> 6;
  const rawLevel = packedValue & 63;
  const hasCastMetadata =
    property.castChance !== undefined ||
    property.castSkillLevel !== undefined ||
    property.castSkillId !== undefined ||
    property.castSkillName !== undefined;

  if (hasCastMetadata) {
    const chance = property.castChance ?? rawChance;
    const level = property.castSkillLevel ?? rawLevel;
    const skillName = property.castSkillName
      ?? getSkillName(property.castSkillId ?? rawSkillId, pd2Tables);
    return `${chance}% Chance to Cast Level ${level} ${skillName} on Casting`;
  }

  return `${rawChance}% Chance to Cast Level ${rawLevel} ${getSkillName(rawSkillId, pd2Tables)} on Casting`;
}

function decodeSkillTab(tabCode) {
  if (!Number.isInteger(tabCode) || tabCode < 0) {
    return null;
  }

  const classId = Math.floor(tabCode / 8);
  const tabIndex = tabCode % 8;
  const className = CLASS_NAMES[classId];
  const tabName = CLASS_TAB_NAMES[classId]?.[tabIndex];

  if (!className || !tabName) {
    return null;
  }

  return {
    classId,
    className,
    tabIndex,
    tabName
  };
}

function formatElementalDamagePair(minProperty, maxProperty, label) {
  const minValue = minProperty.values?.[0];
  const maxValue = maxProperty.values?.[0];
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return null;
  }

  return `${label}: ${minValue}-${maxValue}`;
}

function tryFormatGroupedProperty(properties, index) {
  const property = properties[index];
  const nextProperty = properties[index + 1];

  if (!property || !nextProperty) {
    return null;
  }

  const thirdProperty = properties[index + 2];

  if (property.statKey === 'poisonmindam' && nextProperty.statKey === 'poisonmaxdam' && thirdProperty?.statKey === 'poisonlength') {
    const minValue = property.values?.[0];
    const maxValue = nextProperty.values?.[0];
    const lengthValue = thirdProperty.values?.[0];
    if (Number.isFinite(minValue) && Number.isFinite(maxValue)) {
      return {
        lines: [{
          text: `Adds Poison Damage: ${minValue}-${maxValue} over ${Math.round((lengthValue ?? 0) / 25)} seconds`,
          statKey: 'poisonmindam:poisonmaxdam:poisonlength',
          values: [minValue, maxValue, lengthValue]
        }],
        consumed: 3
      };
    }
  }

  if (property.statKey === 'coldmindam' && nextProperty.statKey === 'coldmaxdam' && thirdProperty?.statKey === 'coldlength') {
    const minValue = property.values?.[0];
    const maxValue = nextProperty.values?.[0];
    const lengthValue = thirdProperty.values?.[0];
    if (Number.isFinite(minValue) && Number.isFinite(maxValue)) {
      return {
        lines: [{
          text: `Adds Cold Damage: ${minValue}-${maxValue} (${Math.round((lengthValue ?? 0) / 25)} sec. freeze)`,
          statKey: 'coldmindam:coldmaxdam:coldlength',
          values: [minValue, maxValue, lengthValue]
        }],
        consumed: 3
      };
    }
  }

  const groupedPairs = [
    ['firemindam', 'firemaxdam', 'Adds Fire Damage'],
    ['lightmindam', 'lightmaxdam', 'Adds Lightning Damage'],
    ['coldmindam', 'coldmaxdam', 'Adds Cold Damage'],
    ['poisonmindam', 'poisonmaxdam', 'Adds Poison Damage'],
    ['magicmindam', 'magicmaxdam', 'Adds Magic Damage'],
    ['lifedrainmindam', 'lifedrainmaxdam', 'Drain Life'],
    ['manadrainmindam', 'manadrainmaxdam', 'Drain Mana']
  ];

  for (const [minKey, maxKey, label] of groupedPairs) {
    if (property.statKey === minKey && nextProperty.statKey === maxKey) {
      const text = formatElementalDamagePair(property, nextProperty, label);
      if (!text) {
        return null;
      }

      return {
        lines: [{
          text,
          statKey: `${minKey}:${maxKey}`,
          values: [property.values?.[0], nextProperty.values?.[0]]
        }],
        consumed: 2
      };
    }
  }

  return null;
}

function formatSingleProperty(property, pd2Tables) {
  const statKey = property.statKey ?? '';
  const firstValue = property.values?.[0];
  const secondValue = property.values?.[1];

  const perlevelLine = formatPerlevelProperty(statKey, firstValue);
  if (perlevelLine !== null) {
    return perlevelLine;
  }

  switch (statKey) {
    case 'item_allskills':
      return `${formatSignedNumber(firstValue ?? 0)} to All Skills`;
    case 'item_singleskill':
      return `${formatSignedNumber(secondValue ?? 0)} to ${getSkillName(firstValue, pd2Tables)}`;
    case 'item_nonclassskill':
      return `${formatSignedNumber(secondValue ?? 0)} to ${getSkillName(firstValue, pd2Tables)} (Oskill)`;
    case 'item_splashonhit':
      return `Melee Splash ${secondValue ?? firstValue ?? 0}%`;
    case 'attack_vs_montype':
      return formatMonsterLinkedProperty(property, 'to Attack Rating versus', secondValue);
    case 'damage_vs_montype':
      return formatMonsterLinkedProperty(property, 'to Damage versus', secondValue);
    case 'item_reanimate':
      return `${secondValue ?? 0}% Reanimate as: ${formatMonsterIdentifier(property)}`;
    case 'item_addskill_tab': {
      const decodedTab = decodeSkillTab(firstValue);
      if (!decodedTab) {
        return `${formatSignedNumber(secondValue ?? 0)} to Skill Tab ${firstValue}`;
      }

      return `${formatSignedNumber(secondValue ?? 0)} to ${decodedTab.tabName} (${decodedTab.className} Only)`;
    }
    case 'item_knockback':
      return 'Knockback';
    case 'item_stupidity':
      return 'Hit Blinds Target';
    case 'item_restinpeace':
      return 'Slain Monsters Rest in Peace';
    case 'item_halffreezeduration':
      return 'Half Freeze Duration';
    case 'corrupted':
      return 'Corrupted';
    case 'mirrored':
      return 'Mirrored';
    case 'item_indesctructible':
      return 'Indestructible';
    case 'item_cannotbefrozen':
      return 'Cannot Be Frozen';
    case 'item_preventheal':
      return 'Prevent Monster Heal';
    case 'item_ignoretargetac':
      return "Ignores Target's Defense";
    case 'item_throwable':
      return 'Throwable';
    case 'item_slow':
      return `Slows Target by ${firstValue ?? 0}%`;
    case 'item_fall':
      return `Hit Causes Monster to Flee ${firstValue ?? 0}%`;
    case 'item_charged_skill': {
      const values = property.values ?? [];
      return `Level ${values[1] ?? 0} ${getSkillName(values[0], pd2Tables)} (${values[2] ?? 0}/${values[3] ?? 0} Charges)`;
    }
    case 'item_aura': {
      const values = property.values ?? [];
      return `Aura When Equipped: ${getSkillName(values[0], pd2Tables)} (Level ${values[1] ?? 0})`;
    }
    case 'item_skilloncast':
      return formatSkillOnCastProperty(property, pd2Tables);
    case 'item_skillonhit': {
      const values = property.values ?? [];
      return `${values[2] ?? 0}% Chance to Cast Level ${values[0] ?? 0} ${getSkillName(values[1], pd2Tables)} on Striking`;
    }
    case 'item_skillongethit': {
      const values = property.values ?? [];
      return `${values[2] ?? 0}% Chance to Cast Level ${values[0] ?? 0} ${getSkillName(values[1], pd2Tables)} When Struck`;
    }
    case 'item_skillondeath': {
      const values = property.values ?? [];
      return `${values[2] ?? 0}% Chance to Cast Level ${values[0] ?? 0} ${getSkillName(values[1], pd2Tables)} on Death`;
    }
    case 'item_skillonattack': {
      const values = property.values ?? [];
      return `${values[2] ?? 0}% Chance to Cast Level ${values[0] ?? 0} ${getSkillName(values[1], pd2Tables)} on Attack`;
    }
    case 'item_skillonkill': {
      const values = property.values ?? [];
      return `${values[2] ?? 0}% Chance to Cast Level ${values[0] ?? 0} ${getSkillName(values[1], pd2Tables)} on Kill`;
    }
    case 'item_skillonlevelup': {
      const values = property.values ?? [];
      return `${values[2] ?? 0}% Chance to Cast Level ${values[0] ?? 0} ${getSkillName(values[1], pd2Tables)} on Level Up`;
    }
    case 'item_addclassskills': {
      const values = property.values ?? [];
      const classId = values[0];
      const className = CLASS_NAMES[classId] ?? `Class ${classId}`;
      return `${formatSignedNumber(values[1] ?? 0)} to ${className} Skill Levels`;
    }
    case 'damageresist':
      return `Damage Reduced by ${firstValue ?? 0}%`;
    case 'hpregen':
      return `Replenish Life ${formatSignedNumber(firstValue ?? 0)}`;
    case 'magic_damage_reduction':
      return `Magic Damage Reduced by ${firstValue ?? 0}`;
    case 'normal_damage_reduction':
      return `Damage Reduced by ${firstValue ?? 0}`;
    default:
      break;
  }

  const label = formatSimpleLabel(statKey);
  const valueText = property.values?.join(', ') ?? 'n/a';

  if (PERCENT_LABEL_KEYS.has(statKey)) {
    if (RIGHT_VALUE_LABEL_KEYS.has(statKey)) {
      return `${label} ${formatSignedNumber(firstValue ?? 0)}%`;
    }

    return `${formatSignedNumber(firstValue ?? 0)}% ${label}`;
  }

  if (typeof firstValue === 'number' && property.values?.length === 1) {
    return `${formatSignedNumber(firstValue)} to ${label}`;
  }

  return `${label}: ${valueText}`;
}

function formatPropertiesForDisplay(properties, pd2Tables) {
  const lines = [];

  for (let index = 0; index < properties.length; index += 1) {
    const grouped = tryFormatGroupedProperty(properties, index);
    if (grouped) {
      lines.push(...grouped.lines);
      index += grouped.consumed - 1;
      continue;
    }

    const property = properties[index];
    lines.push({
      text: formatSingleProperty(property, pd2Tables),
      statKey: property.statKey,
      values: property.values
    });
  }

  return lines;
}

function isParserNoiseProperty(property) {
  // ItemStatCost rows with an empty "Save Bits" column land with saveBits === 0
  // after the `?? 0` fallback in pd2-data.mjs. The parser reads zero bits and
  // emits a [0] value for these stats — always parser noise from bit-walk
  // over-read. Drop them at display time until the parser is fixed.
  // NOTE: test-constructed properties without a saveBits field have
  // property.saveBits === undefined, which strict-!== 0 keeps untouched.
  return property.saveBits === 0;
}

function partitionNoiseProperties(properties) {
  const real = [];
  let noiseCount = 0;
  for (const property of properties) {
    if (isParserNoiseProperty(property)) {
      noiseCount += 1;
    } else {
      real.push(property);
    }
  }
  return { real, noiseCount };
}

export function formatPropertyListForDisplay(propertyList, pd2Tables) {
  const rawProperties = propertyList.properties ?? [];
  const { real, noiseCount } = partitionNoiseProperties(rawProperties);
  return {
    kind: propertyList.kind,
    complete: propertyList.complete !== false,
    error: propertyList.error ?? null,
    propertyCount: real.length,
    noiseCount,
    properties: real,
    displayLines: formatPropertiesForDisplay(real, pd2Tables)
  };
}
