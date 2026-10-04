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

const allStats = {};

function scanForAllStats(properties) {
  for (const property of properties || []) {
    const statKey = property.statKey;
    if (!statKey) continue;

    if (!allStats[statKey]) {
      allStats[statKey] = { count: 0, valueCount: 0 };
    }
    allStats[statKey].count += 1;
    allStats[statKey].valueCount = property.values?.length || 0;
  }
}

function scanItemsRecursive(item) {
  if (!item) return;
  scanForAllStats(item.properties?.properties);
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

const sorted = Object.entries(allStats)
  .sort(([, a], [, b]) => b.count - a.count);

console.log('\n=== ALL STATS ENCOUNTERED (sorted by frequency) ===\n');
console.log(`Files: ${filesScanned}, Items: ${itemsScanned}\n`);
console.log(`Stat Key                          Count  in SIMPLE_STAT_LABELS`);
console.log('-'.repeat(70));

for (const [statKey, info] of sorted) {
  const inSimple = simpleLabels.has(statKey) ? 'YES' : 'NO';
  console.log(`${statKey.padEnd(32)} ${info.count.toString().padEnd(6)} ${inSimple}`);
}

console.log('-'.repeat(70));
console.log(`\nTotal unique stats: ${sorted.length}`);
console.log(`In SIMPLE_STAT_LABELS: ${sorted.filter(([k]) => simpleLabels.has(k)).length}`);
console.log(`NOT in SIMPLE_STAT_LABELS: ${sorted.filter(([k]) => !simpleLabels.has(k)).length}`);
