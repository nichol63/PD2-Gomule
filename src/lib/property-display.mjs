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
  passive_fire_pierce: 'Enemy Fire Resistance',
  passive_phys_pierce: 'Enemy Physical Resistance',
  passive_mag_pierce: 'Enemy Magic Resistance',
  passive_mag_mastery: 'Magic Skill Damage',
  item_pierce_fire: 'Enemy Fire Resistance',
  item_pierce_ltng: 'Enemy Lightning Resistance',
  item_pierce_cold: 'Enemy Cold Resistance',
  item_pierce_pois: 'Enemy Poison Resistance',
  curse_resistance: 'Curse Duration Reduced',
  item_normaldamage: 'Normal Damage',
  item_extra_stack: 'Increased Stack Size',
  max_curses: 'Maximum Curses',
  inc_splash_radius: 'Increased Splash Radius',
  item_pierce: 'Chance of Piercing Attack',
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
  statpts: 'Stat Points',
  lifedrainmindam: 'Minimum Life Stolen Per Hit',
  passive_mastery_melee_crit: 'Melee Critical Strike',
  passive_critical_strike: 'Critical Strike',
  pvp_lld_cd: 'PvP Low Level Duel Cooldown'
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
  'passive_fire_pierce',
  'passive_phys_pierce',
  'passive_mag_pierce',
  'passive_mag_mastery',
  'item_pierce_fire',
  'item_pierce_ltng',
  'item_pierce_cold',
  'item_pierce_pois',
  'curse_resistance',
  'item_pierce',
  'inc_splash_radius',
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
  'item_req_percent',
  'lifedrainmindam',
  'passive_mastery_melee_crit',
  'passive_critical_strike'
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

const BYTIME_PEAK_PERIODS = ['Day', 'Dusk', 'Night', 'Dawn'];

const BYTIME_STAT_RULES = {
  item_armor_bytime: { label: 'Defense', format: 'flat' },
  item_armorpercent_bytime: { label: 'Enhanced Defense', format: 'percent' },
  item_hp_bytime: { label: 'Life', format: 'flat' },
  item_mana_bytime: { label: 'Mana', format: 'flat' },
  item_maxdamage_bytime: { label: 'Maximum Damage', format: 'flat' },
  item_maxdamage_percent_bytime: { label: 'Enhanced Maximum Damage', format: 'percent' },
  item_strength_bytime: { label: 'Strength', format: 'flat' },
  item_dexterity_bytime: { label: 'Dexterity', format: 'flat' },
  item_energy_bytime: { label: 'Energy', format: 'flat' },
  item_vitality_bytime: { label: 'Vitality', format: 'flat' },
  item_tohit_bytime: { label: 'Attack Rating', format: 'flat' },
  item_tohitpercent_bytime: { label: 'Bonus to Attack Rating', format: 'percent' },
  item_cold_damagemax_bytime: { label: 'Maximum Cold Damage', format: 'flat' },
  item_fire_damagemax_bytime: { label: 'Maximum Fire Damage', format: 'flat' },
  item_ltng_damagemax_bytime: { label: 'Maximum Lightning Damage', format: 'flat' },
  item_pois_damagemax_bytime: { label: 'Maximum Poison Damage', format: 'flat' },
  item_resist_cold_bytime: { label: 'Cold Resist', format: 'percent' },
  item_resist_fire_bytime: { label: 'Fire Resist', format: 'percent' },
  item_resist_ltng_bytime: { label: 'Lightning Resist', format: 'percent' },
  item_resist_pois_bytime: { label: 'Poison Resist', format: 'percent' },
  item_absorb_cold_bytime: { label: 'Cold Absorb', format: 'flat' },
  item_absorb_fire_bytime: { label: 'Fire Absorb', format: 'flat' },
  item_absorb_ltng_bytime: { label: 'Lightning Absorb', format: 'flat' },
  item_absorb_pois_bytime: { label: 'Poison Absorb', format: 'flat' },
  item_find_gold_bytime: { label: 'Gold Find', format: 'percent' },
  item_find_magic_bytime: { label: 'Magic Find', format: 'percent' },
  item_find_gems_bytime: { label: 'Chance of Finding Gems', format: 'percent' },
  item_regenstamina_bytime: { label: 'Stamina Recovery', format: 'percent' },
  item_stamina_bytime: { label: 'Stamina', format: 'flat' },
  item_damage_demon_bytime: { label: 'Damage to Demons', format: 'percent' },
  item_damage_undead_bytime: { label: 'Damage to Undead', format: 'percent' },
  item_tohit_demon_bytime: { label: 'Attack Rating against Demons', format: 'flat' },
  item_tohit_undead_bytime: { label: 'Attack Rating against Undead', format: 'flat' },
  item_crushingblow_bytime: { label: 'Crushing Blow', format: 'percent' },
  item_openwounds_bytime: { label: 'Open Wounds', format: 'percent' },
  item_kick_damage_bytime: { label: 'Kick Damage', format: 'flat' },
  item_deadlystrike_bytime: { label: 'Deadly Strike', format: 'percent' }
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

function formatBytimeValue(value, format) {
  const numericValue = Number.isFinite(value) ? value : 0;
  if (format === 'percent') {
    return `${formatSignedNumber(numericValue)}%`;
  }

  return formatSignedNumber(numericValue);
}

function formatBytimeProperty(property) {
  const statKey = property.statKey ?? '';
  const rule = BYTIME_STAT_RULES[statKey];
  if (!rule) {
    return null;
  }

  const packedValue = property.values?.[0];
  const numericPackedValue = Number.isFinite(packedValue) ? packedValue : 0;
  const peakPeriodIndex = (numericPackedValue >> 20) & 3;
  const minValue = (numericPackedValue >> 10) & 1023;
  const maxValue = numericPackedValue & 1023;
  const peakPeriod = BYTIME_PEAK_PERIODS[peakPeriodIndex] ?? `Period ${peakPeriodIndex}`;

  return `${rule.label} (Varies by Time of Day, peaks near ${peakPeriod}): min ${formatBytimeValue(minValue, rule.format)}, max ${formatBytimeValue(maxValue, rule.format)}`;
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

const SUMMON_CAP_LABELS = {
  extra_skele_war: ['Skeleton Warrior', 'Skeleton Warriors'],
  extra_skele_mage: ['Skeletal Mage', 'Skeletal Mages'],
  grims_extra_skele_mage: ['Skeletal Mage', 'Skeletal Mages'],
  extra_skele_archer: ['Skeleton Archer', 'Skeleton Archers'],
  extra_hydra: ['Hydra', 'Hydras'],
  extra_golem: ['Golem', 'Golems'],
  extra_valk: ['Valkyrie', 'Valkyries']
};

function formatSummonCapProperty(statKey, value) {
  const count = Number.isFinite(value) ? value : 0;

  if (statKey === 'extra_spirits') {
    return `${formatSignedNumber(count)} to Maximum Spirits`;
  }

  const labelPair = SUMMON_CAP_LABELS[statKey];
  if (!labelPair) {
    return null;
  }

  const [singularLabel, pluralLabel] = labelPair;
  const label = count === 1 ? singularLabel : pluralLabel;
  return `You may summon ${count} extra ${label}`;
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

// ── Map stat data-driven formatter ──────────────────────────────────
// PD2 string table — maps descstrpos and descstr2 keys to display text.
// Standard ModStr* keys verified from .tbl files; Map*/PD2-custom keys
// inferred from key names, stat semantics, and PD2 community wording.
const MAP_STAT_STRINGS = {
  // descstrpos keys (prefix labels)
  MapMonHave: 'Monsters Have',
  MapPlayHave: 'Players Have',
  MapMonIgnore: 'Monsters Ignore',
  MapMonTake: 'Monsters Take',
  MapMon: 'Monsters',
  MapGlobMF: 'Magic Find',
  MapGlobGF: 'Gold Find',
  MapGlobDensity: 'Monster Density',
  MapGlobExp: 'Experience Gained',
  MapGlobLevel: 'Area Level',
  MapGlobMonRarity: 'Monster Rarity',
  MapGlobExtraBoss: 'Extra Boss',
  MapGlobSkirmishMode: 'Skirmish Mode',
  MapBossSkillers: 'Boss Drops Skiller Grand Charms',
  MapBossCorruptedUnique: 'Boss Drops Corrupted Unique',
  MapBossFacet: 'Boss Drops Facet',
  MapAddMonDoll: 'Additional Monster Type: Dolls',
  MapAddMonSucc: 'Additional Monster Type: Succubi',
  MapAddMonVamp: 'Additional Monster Type: Vampires',
  MapAddMonCow: 'Additional Monster Type: Cows',
  MapAddMonHorde: 'Additional Monster Type: Horde',
  MapAddMonGhost: 'Additional Monster Type: Ghosts',
  MapAddMonSouls: 'Additional Monster Type: Souls',
  MapAddMonFetish: 'Additional Monster Type: Fetish',
  MapAddMonShriek: 'Additional Monster Type: Shriek',
  StrCorruptNum: 'Defense',
  StrForceMapEvent: 'Force Map Event',
  // descstr2 keys — verified from .tbl files
  ModStr1h: 'Attack Rating',
  ModStr1j: 'Fire Resist',
  ModStr1k: 'Cold Resist',
  ModStr1l: 'Lightning Resist',
  ModStr1n: 'Poison Resist',
  ModStr1o: 'Maximum Fire Damage',
  ModStr1p: 'Minimum Fire Damage',
  ModStr1q: 'Maximum Lightning Damage',
  ModStr1r: 'Minimum Lightning Damage',
  ModStr1s: 'Maximum Cold Damage',
  ModStr1t: 'Minimum Cold Damage',
  ModStr2g: 'Maximum Life',
  ModStr2h: 'Maximum Mana',
  ModStr2l: 'Replenish Life',
  Modstr2v: 'Enhanced Defense',
  ModStr2w: 'Drain Life',
  ModStr2z: 'Life Stolen per Hit',
  ModStr3m: 'Open Wounds',
  ModStr4h: 'Maximum Poison Damage',
  ModStr4i: 'Minimum Poison Damage',
  ModStr4m: 'Increased Attack Speed',
  ModStr4p: 'Faster Hit Recovery',
  ModStr4v: 'Faster Cast Rate',
  ModStr5c: 'Crushing Blow',
  ModStr5g: 'Fire Absorb',
  ModStr5i: 'Lightning Absorb',
  ModStr5k: 'Magic Absorb',
  ModStr5m: 'Cold Absorb',
  ModStr5q: 'Deadly Strike',
  ModStr5u: 'Maximum Fire Resist',
  ModStr5v: 'Maximum Cold Resist',
  ModStr5w: 'Maximum Lightning Resist',
  ModStr5y: 'Maximum Poison Resist',
  ModStr5z: 'Cannot Be Frozen',
  strModMagicDamage: 'Magic Damage',
  ModitemdamFiresk: 'Fire Skill Damage',
  ModitemdamLtngsk: 'Lightning Skill Damage',
  ModitemdamColdsk: 'Cold Skill Damage',
  ModitemdamPoissk: 'Poison Skill Damage',
  // descstr2 keys — PD2-custom (inferred from stat semantics)
  MapEnhancedDmg: 'Enhanced Damage',
  MapFlatPhysRed: 'Physical Damage Reduction',
  MapMaxHP: 'Maximum Life',
  MapMonCurse: 'Curse Resistance',
  MapMonSplash: 'Melee Splash',
  MapMonVelocity: 'Faster Run/Walk',
  MapPlayBlock: 'Chance to Block',
  MapMonFirePierce: 'Fire Resistance',
  MapMonLtngPierce: 'Lightning Resistance',
  MapMonColdPierce: 'Cold Resistance',
  MapMonPoisPierce: 'Poison Resistance',
  MapPhysExtraFire: 'Physical Damage as Extra Fire',
  MapPhysExtraLtng: 'Physical Damage as Extra Lightning',
  MapPhysExtraCold: 'Physical Damage as Extra Cold',
  MapPhysExtraPois: 'Physical Damage as Extra Poison',
  MapPhysExtraMag: 'Physical Damage as Extra Magic',
  MapMonIncreasedJewelry: 'Increased Jewelry Drops',
  MapMonIncreasedWeapons: 'Increased Weapon Drops',
  MapMonIncreasedArmor: 'Increased Armor Drops',
  MapMonIncreasedCrafting: 'Increased Crafting Material Drops',
  MapMonIncreasedCharms: 'Increased Charm Drops',
  MapMonIncreasedCorrupted: 'Increased Corrupted Drops',
  MapMonIncreasedJewels: 'Increased Jewel Drops',
  ModStr2u_PD2: 'Damage Reduced',
  ModVelocity: 'Faster Run/Walk',
  ModPierceChance: 'Chance of Piercing Attack',
  StrMapLightRadius: 'Light Radius'
};

// Hidden map stats that are supporting values for grouped damage pairs
const MAP_HIDDEN_STATS = new Set(['map_mon_coldlength', 'map_mon_poisonlength']);

function resolveMapString(key) {
  return MAP_STAT_STRINGS[key] ?? key;
}

function formatMapStat(property, pd2Tables) {
  const statKey = property.statKey ?? '';

  // Hidden supporting stats produce no display line
  if (MAP_HIDDEN_STATS.has(statKey)) {
    return null;
  }

  const descFunc = property.descFunc;
  const descVal = property.descVal ?? 2;
  const label = resolveMapString(property.descStringKey);
  const label2 = resolveMapString(property.descString2Key);
  const value = property.values?.[0] ?? 0;

  // descFunc determines the value formatting:
  //   1: +val label           6: +val label label2
  //   2: val% label           7: val% label label2
  //   3: val label             8: +val% label label2
  //   4: +val% label          9: val label label2
  switch (descFunc) {
    case 1:
      return descVal === 1
        ? `${formatSignedNumber(value)} ${label}`
        : `${label} ${formatSignedNumber(value)}`;
    case 2:
      return descVal === 1
        ? `${value}% ${label}`
        : `${label} ${value}%`;
    case 3:
      return descVal === 1
        ? `${value} ${label}`
        : `${label}`;
    case 4:
      return descVal === 1
        ? `${formatSignedNumber(value)}% ${label}`
        : `${label} ${formatSignedNumber(value)}%`;
    case 6:
      return descVal === 2
        ? `${label} ${formatSignedNumber(value)} ${label2}`
        : `${formatSignedNumber(value)} ${label} ${label2}`;
    case 7:
      return descVal === 2
        ? `${label} ${label2} ${value}%`
        : `${value}% ${label} ${label2}`;
    case 8:
      return descVal === 2
        ? `${label} ${label2} ${formatSignedNumber(value)}%`
        : `${formatSignedNumber(value)}% ${label} ${label2}`;
    case 9:
      return descVal === 2
        ? `${label} ${label2}`
        : `${label} ${label2}`;
    case 15: {
      // Skill-on-event: packed value = (skillId << 6) | level, chance = values[1]
      const packed = property.values?.[0] ?? 0;
      const chance = property.values?.[1] ?? 0;
      const skillId = packed >> 6;
      const level = packed & 63;
      const skillName = getSkillName(skillId, pd2Tables);
      return `Monsters ${chance}% Chance to Cast Level ${level} ${skillName} on Death`;
    }
    default:
      // Fallback for stats without a descFunc (hidden or unrecognized)
      return `${label} ${value}`;
  }
}

function formatSingleProperty(property, pd2Tables) {
  const statKey = property.statKey ?? '';
  const firstValue = property.values?.[0];
  const secondValue = property.values?.[1];

  // Map stats use a data-driven formatter based on descFunc/descVal/descstr2.
  // Hidden supporting stats (e.g. map_mon_coldlength) return null and are
  // suppressed from display entirely via the filter in formatPropertiesForDisplay.
  if (statKey.startsWith('map_')) {
    return formatMapStat(property, pd2Tables);
  }

  const perlevelLine = formatPerlevelProperty(statKey, firstValue);
  if (perlevelLine !== null) {
    return perlevelLine;
  }

  const bytimeLine = formatBytimeProperty(property);
  if (bytimeLine !== null) {
    return bytimeLine;
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
    case 'extra_spirits':
    case 'extra_skele_war':
    case 'extra_skele_mage':
    case 'grims_extra_skele_mage':
    case 'extra_skele_archer':
    case 'extra_hydra':
    case 'extra_golem':
    case 'extra_valk':
      return formatSummonCapProperty(statKey, firstValue);
    case 'extra_revives':
      return `${formatSignedNumber(firstValue ?? 0)} to Maximum Revives`;
    case 'extra_bonespears':
      return `${formatSignedNumber(firstValue ?? 0)} to Bone Spear Missiles`;
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
    case 'item_elemskill_cold':
      return `${formatSignedNumber(secondValue ?? 0)} to Cold Skills`;
    case 'item_elemskill_fire':
      return `${formatSignedNumber(secondValue ?? 0)} to Fire Skills`;
    case 'item_elemskill_lightning':
      return `${formatSignedNumber(secondValue ?? 0)} to Lightning Skills`;
    case 'item_elemskill_poison':
      return `${formatSignedNumber(secondValue ?? 0)} to Poison Skills`;
    case 'item_elemskill_magic':
      return `${formatSignedNumber(secondValue ?? 0)} to Magic Skills`;
    case 'item_elemskill':
      return `${formatSignedNumber(secondValue ?? 0)} to Elemental Skills`;
    case 'item_howl':
      return `Hit Causes Monster to Flee ${firstValue ?? 0}%`;
    case 'item_damagetargetac':
      return `-${Math.abs(firstValue ?? 0)} to Target's Defense`;
    case 'item_fractionaltargetac':
      return `-${Math.abs(firstValue ?? 0)}% Target Defense`;
    case 'item_freeze':
      return `Freezes Target +${firstValue ?? 0}`;
    case 'item_magicarrow':
      return 'Fires Magic Arrows';
    case 'item_explosivearrow':
      return 'Fires Explosive Arrows/Bolts';
    case 'item_replenish_durability':
      return `Repairs 1 Durability in ${firstValue ?? 0} Seconds`;
    case 'item_replenish_quantity':
      return 'Replenishes Quantity';
    case 'item_replenish_charges':
      return 'Replenishes Charges';
    case 'item_numsockets_textonly':
      return `Socketed (${firstValue ?? 0})`;
    case 'dragonflightreduction':
      return `${formatSignedNumber(firstValue ?? 0)}% Dragon Flight Cooldown Reduction`;
    case 'joustreduction':
      return `${formatSignedNumber(firstValue ?? 0)}% Joust Cooldown Reduction`;
    case 'gustreduction':
      return `${formatSignedNumber(firstValue ?? 0)}% Gust Cooldown Reduction`;
    case 'corpseexplosionradius':
      return `${formatSignedNumber(firstValue ?? 0)}% Increased Corpse Explosion Radius`;
    case 'heroic':
      return 'Heroic';
    case 'item_skillonequip': {
      const values = property.values ?? [];
      return `Level ${values[1] ?? 0} ${getSkillName(values[0], pd2Tables)} When Equipped`;
    }
    case 'transform_dye':
      return null; // internal cosmetic dye color — hide from display
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
    const text = formatSingleProperty(property, pd2Tables);
    // null means the stat is intentionally hidden (e.g. map supporting stats)
    if (text === null) {
      continue;
    }
    lines.push({
      text,
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
