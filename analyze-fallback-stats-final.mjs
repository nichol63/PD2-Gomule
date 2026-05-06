import fs from 'fs';
import path from 'path';
import { inspectSaveFile } from './src/lib/save-parsers.mjs';

const displayCode = fs.readFileSync('./src/lib/property-display.mjs', 'utf-8');

const simpleLabelsMatch = displayCode.match(/const SIMPLE_STAT_LABELS = \{([\s\S]*?)\};/);
const simpleLabels = new Set();
if (simpleLabelsMatch) {
  const keyMatches = simpleLabelsMatch[1].match(/\s+(\w+):/g);
  if (keyMatches) {
    keyMatches.forEach(m => simpleLabels.add(m.trim().replace(':', '')));
  }
}

const perlevelMatch = displayCode.match(/const PERLEVEL_STAT_RULES = \{([\s\S]*?)\};/);
const perlevelStats = new Set();
if (perlevelMatch) {
  const keyMatches = perlevelMatch[1].match(/\s+(\w+):/g);
  if (keyMatches) {
    keyMatches.forEach(m => {
      const key = m.trim().replace(':', '');
      if (!['label', 'format'].includes(key)) perlevelStats.add(key);
    });
  }
}

const explicitCases = new Set([
  'item_allskills', 'item_singleskill', 'item_nonclassskill', 'item_splashonhit',
  'attack_vs_montype', 'damage_vs_montype', 'item_reanimate', 'extra_spirits',
  'extra_skele_war', 'extra_skele_mage', 'grims_extra_skele_mage', 'extra_skele_archer',
  'extra_hydra', 'extra_golem', 'extra_valk', 'extra_revives', 'extra_bonespears',
  'item_addskill_tab', 'item_knockback', 'item_stupidity', 'item_restinpeace',
  'item_halffreezeduration', 'corrupted', 'mirrored', 'item_indesctructible',
  'item_cannotbefrozen', 'item_preventheal', 'item_ignoretargetac', 'item_throwable',
  'item_slow', 'item_fall', 'item_charged_skill', 'item_aura', 'item_skilloncast',
  'item_skillonhit', 'item_skillongethit', 'item_skillondeath', 'item_skillonattack',
  'item_skillonkill', 'item_skillonlevelup', 'item_addclassskills', 'damageresist',
  'hpregen', 'magic_damage_reduction', 'normal_damage_reduction', 'item_elemskill_cold',
  'item_elemskill_fire', 'item_elemskill_lightning', 'item_elemskill_poison',
  'item_elemskill_magic', 'item_elemskill', 'item_howl', 'item_damagetargetac',
  'item_fractionaltargetac', 'item_freeze', 'item_magicarrow', 'item_explosivearrow',
  'item_replenish_durability', 'item_replenish_quantity', 'item_replenish_charges',
  'item_numsockets_textonly', 'dragonflightreduction', 'joustreduction', 'gustreduction',
  'corpseexplosionradius', 'heroic', 'item_skillonequip'
]);

const groupedPairs = new Set(['poisonmindam', 'poisonmaxdam', 'poisonlength',
  'coldmindam', 'coldmaxdam', 'coldlength', 'firemindam', 'firemaxdam',
  'lightmindam', 'lightmaxdam', 'magicmindam', 'magicmaxdam',
  'lifedrainmindam', 'lifedrainmaxdam', 'manadrainmindam', 'manadrainmaxdam']);

const hiddenMapStats = new Set(['map_mon_coldlength', 'map_mon_poisonlength']);

const knownStats = new Set();
[simpleLabels, perlevelStats, explicitCases, groupedPairs].forEach(s => s.forEach(k => knownStats.add(k)));

const fallbackStats = {};
const allStats = {};

function scanForStats(properties) {
  for (const property of properties || []) {
    const statKey = property.statKey;
    if (!statKey) continue;
    
    if (!allStats[statKey]) allStats[statKey] = { count: 0, valueCount: 0 };
    allStats[statKey].count += 1;
    allStats[statKey].valueCount = property.values?.length || 0;
    
    if (hiddenMapStats.has(statKey) || knownStats.has(statKey) || statKey.startsWith('map_')) return;
    
    if (!fallbackStats[statKey]) fallbackStats[statKey] = { count: 0, valueCount: 0 };
    fallbackStats[statKey].count += 1;
  }
}

function scanItemsRecursive(item) {
  if (!item) return;
  if (item.propertyLists) for (const list of item.propertyLists) scanForStats(list.properties);
  if (item.socketedItems?.length) item.socketedItems.forEach(scanItemsRecursive);
}

function findSaveFilesRecursive(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...findSaveFilesRecursive(fullPath));
      else if (/\.(d2s|d2x|sss)$/i.test(entry.name)) files.push(fullPath);
    }
  } catch (e) {}
  return files;
}

let filesScanned = 0;
let itemsScanned = 0;

const basePaths = [
  '../Diablo II/ProjectD2/pd2-save-editor/fixtures',
  '../Diablo II/ProjectD2/pd2-singleplayer-fixtures/Diablo II/Save/Library'
];

for (const basePath of basePaths) {
  const resolvedPath = path.resolve(basePath);
  if (!fs.existsSync(resolvedPath)) continue;
  
  const saveFiles = findSaveFilesRecursive(resolvedPath);
  
  for (const filePath of saveFiles) {
    try {
      const saveData = inspectSaveFile(filePath);
      filesScanned += 1;
      
      if (saveData.items) {
        itemsScanned += saveData.items.length;
        saveData.items.forEach(scanItemsRecursive);
      }
      
      if (saveData.pages) {
        for (const page of saveData.pages) {
          if (page.items) {
            itemsScanned += page.items.length;
            page.items.forEach(scanItemsRecursive);
          }
        }
      }
    } catch (e) {}
  }
}

const fallbackSorted = Object.entries(fallbackStats).sort(([, a], [, b]) => b.count - a.count);
const allSorted = Object.entries(allStats).sort(([, a], [, b]) => b.count - a.count);

console.log('\n=== STATS ANALYSIS ===\n');
console.log(`Files scanned: ${filesScanned}`);
console.log(`Items parsed: ${itemsScanned}`);
console.log(`Total unique stats found: ${allSorted.length}`);
console.log(`\n=== STATS USING FALLBACK PATH (lines 875-890) ===\n`);

if (fallbackSorted.length === 0) {
  console.log('NONE! All properties use dedicated formatters.\n');
} else {
  console.log(`Stat Key                          Count  Type`);
  console.log('-'.repeat(60));
  
  for (const [statKey, info] of fallbackSorted) {
    const typeLabel = info.valueCount === 1 ? 'single-value' : `multi(${info.valueCount})`;
    console.log(`${statKey.padEnd(32)} ${info.count.toString().padEnd(6)} ${typeLabel}`);
  }
}

console.log(`\n=== TOP 25 STATS BY OCCURRENCE ===\n`);
console.log(`Stat Key                          Count  Type`);
console.log('-'.repeat(60));

for (const [statKey, info] of allSorted.slice(0, 25)) {
  const typeLabel = info.valueCount === 1 ? 'single-value' : `multi(${info.valueCount})`;
  console.log(`${statKey.padEnd(32)} ${info.count.toString().padEnd(6)} ${typeLabel}`);
}
