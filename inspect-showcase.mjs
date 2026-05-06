import fs from 'fs';
import { inspectSaveFile } from './src/lib/save-parsers.mjs';

const testFile = String.raw`C:\Codex\GoMuleR4.3.2_1.13\Diablo II\ProjectD2\pd2-singleplayer-fixtures\Diablo II\Save\Library\Showcase Characters\amazon\cold_arrow.d2s`;
const result = inspectSaveFile(testFile);

console.log(`File: cold_arrow.d2s`);
console.log('Items:', result.items?.length || 0);

if (result.items && result.items.length > 0) {
  const item = result.items[0];
  console.log('\nFirst item:');
  console.log('Has propertyLists:', !!item.propertyLists);
  if (item.propertyLists && item.propertyLists.length > 0) {
    console.log('Property lists count:', item.propertyLists.length);
    const list = item.propertyLists[0];
    console.log('First list properties:', list.properties?.length || 0);
    if (list.properties && list.properties.length > 0) {
      console.log('First prop:', JSON.stringify(list.properties[0], null, 2).slice(0, 200));
    }
  }
}
