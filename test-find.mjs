import fs from 'fs';
import path from 'path';

const libPath = 'C:\Codex\GoMuleR4.3.2_1.13\Diablo II\ProjectD2\pd2-singleplayer-fixtures\Diablo II\Save\Library';
console.log('Testing path:', libPath);
console.log('Path exists:', fs.existsSync(libPath));

if (fs.existsSync(libPath)) {
  const entries = fs.readdirSync(libPath, { withFileTypes: true });
  console.log('Entries:', entries.map(e => ({ name: e.name, isDir: e.isDirectory() })));

  // Test with Blank Characters subdir
  const blankPath = path.join(libPath, 'Blank Characters');
  if (fs.existsSync(blankPath)) {
    console.log('\nBlank Characters exists');
    const blank = fs.readdirSync(blankPath, { withFileTypes: true });
    console.log('Blank entries:', blank.map(e => e.name));
  }
}
