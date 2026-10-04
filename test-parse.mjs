import fs from 'fs';
import { inspectSaveFile } from './src/lib/save-parsers.mjs';

const testFile = String.raw`C:\Codex\GoMuleR4.3.2_1.13\Diablo II\ProjectD2\pd2-singleplayer-fixtures\Diablo II\Save\Library\Bases.d2s`;
console.log('Testing:', testFile);
console.log('Exists:', fs.existsSync(testFile));

try {
  const result = inspectSaveFile(testFile);
  console.log('Success!');
  console.log('Items:', result.items?.length || 0);
  if (result.items && result.items.length > 0) {
    const item = result.items[0];
    console.log('First item props:', item.properties?.properties?.length || 0);
    if (item.properties?.properties?.length > 0) {
      console.log('Sample prop:', item.properties.properties[0]);
    }
  }
} catch (e) {
  console.error('Error:', e.message);
}
