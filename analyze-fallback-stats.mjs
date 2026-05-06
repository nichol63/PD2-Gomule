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
      if (!['label', 'format'].includes(key)) {
        perlevelStats.add(key);
      }
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

const groupedPairs = new Set([
  'poisonmindam', 'poisonmaxdam', 'poisonlength',
  'coldmindam', 'coldmaxdam', 'coldlength',
  'firemindam', 'firemaxdam',
  'lightmindam', 'lightmaxdam',
  'magicmindam', 'magicmaxdam',
  'lifedrainmindam', 'lifedrainmaxdam',
  'manadrainmindam', 'manadrainmaxdam'
]);

const hiddenMapStats = new Set(['map_mon_coldlength', 'map_mon_poisonlength']);

const knownStats = new Set();
simpleLabels.forEach(s => knownStats.add(s));
perlevelStats.forEach(s => knownStats.add(s));
explicitCases.forEach(s => knownStats.add(s));
groupedPairs.forEach(s => knownStats.add(s));

const fallbackStats = {};

function scanForFallbackStats(properties) {
  for (const property of properties || []) {
    const statKey = property.statKey;
    
    if (!statKey || hiddenMapStats.has(statKey)) continue;
    if (knownStats.has(statKey)) continue;
    if (statKey.startsWith('map_')) continue;
    
    if (!fallbackStats[statKey]) {
      fallbackStats[statKey] = { count: 0, valueCount: 0 };
    }
    fallbackStats[statKey].count += 1;
    fallbackStats[statKey].valueCount = property.values?.length || 0;
  }
}

function scanItemsRecursive(item) {
  if (!item) return;
  scanForFallbackStats(item.properties?.properties);
  if (item.socketedItems?.length) {
    item.socketedItems.forEach(scanItemsRecursive);
  }
}

function findSaveFilesRecursive(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findSaveFilesRecursive(fullPath));
      } else if (/\.(d2s|d2x|sss)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // ignore
  }
  return files;
}

const basePath = String.raw`C:\Codex\GoMuleR4.3.2_1.13\Diablo II\ProjectD2\pd2-singleplayer-fixtures\Diablo II\Save\Library`;

let filesScanned = 0;
let itemsScanned = 0;

if (fs.existsSync(basePath)) {
  const saveFiles = findSaveFilesRecursive(basePath);
  
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
    } catch (e) {
      // skip
    }
  }
}

const sorted = Object.entries(fallbackStats).sort(([, a], [, b]) => b.count - a.count);

console.log('\n=== STATS USING FALLBACK PATH (property-display.mjs lines 875-890) ===\n');
console.log(`Files scanned: ${filesScanned}`);
console.log(`Items parsed: ${itemsScanned}`);
console.log(`\nStat Key                          Count  Value Type`);
console.log('-'.repeat(65));

for (const [statKey, info] of sorted) {
  const typeLabel = info.valueCount === 1 ? 'single-value' : info.valueCount > 1 ? `multi-value(${info.valueCount})` : 'no-value';
  console.log(`${statKey.padEnd(32)} ${info.count.toString().padEnd(6)} ${typeLabel}`);
}

console.log('-'.repeat(65));
if (sorted.length === 0) {
  console.log('No fallback stats found.');
} else {
  console.log(`\nTotal unique fallback stats: ${sorted.length}`);
}
