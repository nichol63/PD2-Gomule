import fs from 'fs';
import { inspectSaveFile } from './src/lib/save-parsers.mjs';

const testFile = String.raw`C:\Codex\GoMuleR4.3.2_1.13\Diablo II\ProjectD2\pd2-singleplayer-fixtures\Diablo II\Save\Library\Bases.d2s`;
const result = inspectSaveFile(testFile);

console.log('File:', 'Bases.d2s');
console.log('Items count:', result.items?.length || 0);

if (result.items && result.items.length > 0) {
  for (let i = 0; i < Math.min(3, result.items.length); i++) {
    const item = result.items[i];
    console.log(`\n--- Item ${i} ---`);
    console.log('Keys:', Object.keys(item).slice(0, 10));
    console.log('Has properties:', !!item.properties);
    if (item.properties) {
      console.log('Properties keys:', Object.keys(item.properties));
      console.log('Properties.properties:', item.properties.properties?.length || 0);
      if (item.properties.properties && item.properties.properties.length > 0) {
        console.log('First prop:', item.properties.properties[0]);
      }
    }
  }
}
