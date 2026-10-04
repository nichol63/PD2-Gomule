import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { discoverSaveFiles, loadInspectorWorkspace } from '../src/lib/inspector-model.mjs';
import { depositItem } from '../src/lib/item-bank.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();
const BASES = path.join(LIBRARY, 'Bases.d2x');
const original = fs.readFileSync(BASES);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function setup(t) {
  const directory = fs.mkdtempSync(path.join(REPO, '.inspector-discovery-test-'));
  t.after(() => {
    try { assert.equal(hash(fs.readFileSync(BASES)), hash(original)); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const copy = relative => {
    const file = path.join(directory, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, original);
    return file;
  };
  return { directory, copy };
}

test('self-linked directories and two-directory cycles terminate without loading aliases twice', t => {
  const { directory, copy } = setup(t);
  const selfFile = copy('self/copy.d2x');
  const self = path.dirname(selfFile);
  fs.symlinkSync(self, path.join(self, 'a-self-link'), 'dir');
  assert.deepEqual(discoverSaveFiles([self]), [selfFile]);
  assert.equal(loadInspectorWorkspace([self]).sourceCount, 1);

  const firstFile = copy('one/a.d2x'), secondFile = copy('two/b.d2x');
  const first = path.dirname(firstFile), second = path.dirname(secondFile);
  fs.symlinkSync(second, path.join(first, 'to-two'), 'dir');
  fs.symlinkSync(first, path.join(second, 'to-one'), 'dir');
  const expected = [firstFile, path.join(first, 'to-two', 'b.d2x')];
  assert.deepEqual(discoverSaveFiles([first, second]), expected);
  const workspace = loadInspectorWorkspace([first, second]);
  assert.equal(workspace.sourceCount, 2);
  assert.deepEqual(workspace.sources.map(source => source.summary.filePath), expected);
  assert.equal(workspace.totalTopLevelItemCount, 5172);
  assert.ok(expected.every(file => file.startsWith(directory + path.sep)));
});

test('explicit leaf aliases prefer a direct path in the first physical-file slot in either argument order', t => {
  const { directory, copy } = setup(t);
  const direct = copy('direct.d2x'), unrelated = copy('other.d2x');
  const alias = path.join(directory, 'leaf-alias.d2x');
  fs.symlinkSync(direct, alias);
  for (const inputs of [[alias, unrelated, direct], [direct, unrelated, alias]]) {
    assert.deepEqual(discoverSaveFiles(inputs), [direct, unrelated]);
    const workspace = loadInspectorWorkspace(inputs);
    assert.equal(workspace.sourceCount, 2);
    assert.deepEqual(workspace.sources.map(source => source.summary.filePath), [direct, unrelated]);
  }
  assert.deepEqual(discoverSaveFiles([direct, alias]), [direct]);
  assert.deepEqual(discoverSaveFiles([alias, direct]), [direct]);
});

test('directory aliases retain their first requested representation while direct, leaf, and directory aliases load once', t => {
  const { directory, copy } = setup(t);
  const direct = copy('real/copy.d2x');
  const real = path.dirname(direct), aliasDirectory = path.join(directory, 'directory-alias');
  const leaf = path.join(directory, 'leaf-alias.d2x');
  fs.symlinkSync(real, aliasDirectory, 'dir');
  fs.symlinkSync(direct, leaf);
  assert.deepEqual(discoverSaveFiles([direct, leaf, aliasDirectory]), [direct]);
  assert.deepEqual(discoverSaveFiles([aliasDirectory, real]), [path.join(aliasDirectory, 'copy.d2x')]);
  assert.deepEqual(discoverSaveFiles([aliasDirectory, direct]), [path.join(aliasDirectory, 'copy.d2x')]);
  assert.equal(loadInspectorWorkspace([direct, leaf, aliasDirectory]).sourceCount, 1);
});

test('overlapping parents, subdirectories, and repeated inputs deduplicate but identical independent copies stay distinct', t => {
  const { directory, copy } = setup(t);
  const first = copy('parent/a.d2x'), nested = copy('parent/sub/b.d2x');
  const parent = path.dirname(first), sub = path.dirname(nested);
  assert.deepEqual(discoverSaveFiles([parent, sub, first, parent, nested]), [first, nested]);
  assert.deepEqual(discoverSaveFiles([sub, parent, sub]), [nested, first]);
  assert.equal(hash(fs.readFileSync(first)), hash(fs.readFileSync(nested)));
  const statA = fs.statSync(first), statB = fs.statSync(nested);
  assert.notEqual(`${statA.dev}:${statA.ino}`, `${statB.dev}:${statB.ino}`);
  const workspace = loadInspectorWorkspace([first, nested]);
  assert.equal(workspace.sourceCount, 2);
  assert.equal(workspace.totalTopLevelItemCount, 5172);
  assert.ok(directory);
});

test('input order and sorted directory traversal produce deterministic absolute requested paths', t => {
  const { directory, copy } = setup(t);
  const explicit = copy('first-explicit.d2x');
  const zeta = copy('tree/zeta.d2x'), alpha = copy('tree/alpha.D2X'), nested = copy('tree/middle/omega.d2x');
  fs.writeFileSync(path.join(directory, 'tree', 'ignore.txt'), 'not a save');
  const inputs = [explicit, path.join(directory, 'tree')];
  const expected = [explicit, alpha, nested, zeta];
  assert.deepEqual(discoverSaveFiles(inputs), expected);
  assert.deepEqual(discoverSaveFiles(inputs), expected);
  assert.ok(discoverSaveFiles(inputs).every(path.isAbsolute));
});

test('filesystem identity uses bigint device and inode values without unsafe numeric rounding', t => {
  const { copy } = setup(t);
  const first = copy('first.d2x'), second = copy('second.d2x');
  const nativeStat = fs.statSync;
  const seen = [];
  fs.statSync = function (file, options) {
    const stat = nativeStat.call(fs, file, options);
    if (file !== first && file !== second) return stat;
    seen.push(options);
    // These distinct physical keys collapse if coerced to Number.
    return { ...stat, dev: 1n, ino: file === first ? 9007199254740992n : 9007199254740993n,
      isDirectory: () => false, isFile: () => true };
  };
  try { assert.deepEqual(discoverSaveFiles([first, second]), [first, second]); }
  finally { fs.statSync = nativeStat; }
  assert.equal(seen.length, 2);
  assert.ok(seen.every(options => options?.bigint === true));
});

test('read-only inspection preserves alias-only paths and bank previews still refuse symbolic or hardlinked saves', t => {
  const { directory, copy } = setup(t);
  const direct = copy('direct.d2x');
  const alias = path.join(directory, 'alias.d2x');
  fs.symlinkSync(direct, alias);
  assert.deepEqual(discoverSaveFiles([alias]), [alias]);
  const aliasWorkspace = loadInspectorWorkspace([alias]);
  assert.equal(aliasWorkspace.sources[0].summary.filePath, alias);
  assert.equal(aliasWorkspace.sources[0].summary.fileName, 'alias.d2x');
  const bankPath = path.join(directory, 'bank.json');
  assert.throws(() => depositItem({ bankPath, sourcePath: alias, pageIndex: 1, itemIndex: 0 }), /symbolic link/i);
  const hardlink = path.join(directory, 'hardlink.d2x');
  fs.linkSync(direct, hardlink);
  assert.deepEqual(discoverSaveFiles([hardlink, direct]), [hardlink]);
  assert.equal(loadInspectorWorkspace([direct, hardlink]).sourceCount, 1);
  for (const sourcePath of [hardlink, direct]) {
    assert.throws(() => depositItem({ bankPath, sourcePath, pageIndex: 1, itemIndex: 0 }), /hardlink/i);
  }
  assert.equal(fs.existsSync(bankPath), false);
  assert.equal(fs.existsSync(bankPath + '.lock'), false);
  assert.equal(fs.existsSync(bankPath + '.transactions'), false);
  assert.deepEqual(fs.readFileSync(direct), original);
});

test('missing and broken explicit inputs retain their exact errors and recursive broken links fail fast', t => {
  const { directory, copy } = setup(t);
  const missing = path.join(directory, 'missing.d2x'), broken = path.join(directory, 'broken.d2x');
  fs.symlinkSync(missing, broken);
  for (const file of [missing, broken]) {
    assert.throws(() => discoverSaveFiles([file]), error => {
      assert.equal(error.message, `Save path does not exist: ${path.resolve(file)}`);
      return true;
    });
  }
  const existing = copy('recursive/copy.d2x');
  fs.symlinkSync(missing, path.join(path.dirname(existing), 'broken.d2x'));
  assert.throws(() => discoverSaveFiles([path.dirname(existing)]), error => {
    assert.equal(error.code, 'ENOENT');
    return true;
  });
});

test('canonical discovery and parsing retain all 134 files, 19778 roots, and 22072 physical records', () => {
  const discovered = discoverSaveFiles([LIBRARY]);
  assert.equal(discovered.length, 134);
  assert.equal(new Set(discovered).size, 134);
  const before = discovered.map(file => [file, hash(fs.readFileSync(file))]);
  const workspace = loadInspectorWorkspace([LIBRARY]);
  assert.equal(workspace.sourceCount, 134);
  assert.equal(workspace.totalTopLevelItemCount, 19778);
  assert.equal(workspace.sources.reduce((total, source) => total + source.summary.parsedNodeCount, 0), 22072);
  assert.deepEqual(workspace.sources.map(source => source.summary.filePath), discovered);
  assert.deepEqual(discovered.map(file => [file, hash(fs.readFileSync(file))]), before);
});
