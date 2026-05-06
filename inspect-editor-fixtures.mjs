import fs from 'fs';
import { inspectSaveFile } from './src/lib/save-parsers.mjs';

const testFile = String.raw`C:\Codex\GoMuleR4.3.2_1.13\Diablo II\ProjectD2\pd2-save-editor\fixtures\played-cold-arrow.d2s`;
const result = inspectSaveFile(testFile);

console.log(`File: played-cold-arrow.d2s`);
console.log('Items:', result.items?.length || 0);

if (result.items && result.items.length > 0) {
  for (let i = 0; i < Math.min(3, result.items.length); i++) {
    const item = result.items[i];
    console.log(`\nItem ${i}:`);
    console.log('Has propertyLists:', !!item.propertyLists);
    if (item.propertyLists && item.propertyLists.length > 0) {
      for (let j = 0; j < item.propertyLists.length; j++) {
        const list = item.propertyLists[j];
        console.log(`  List ${j}: ${list.properties?.length || 0} properties`);
        if (list.properties && list.properties.length > 0) {
          console.log(`    First: statKey="${list.properties[0].statKey}"`);
        }
      }
    }
  }
}
