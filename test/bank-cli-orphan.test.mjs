import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseBankArguments } from '../src/bank-cli.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const FIXTURE = path.join(getFixtureLibraryDir(), 'Bases.d2x');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalHash = hash(fs.readFileSync(FIXTURE));
const deadPID = Number(spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout);

function setup(t) {
  const directory = fs.mkdtempSync(path.join(REPO, '.bank-cli-orphan-'));
  t.after(() => {
    try { assert.equal(hash(fs.readFileSync(FIXTURE)), originalHash); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  const sourcePath = path.join(directory, 'copy.d2x'), bankPath = path.join(directory, 'bank.json');
  fs.copyFileSync(FIXTURE, sourcePath); fs.writeFileSync(bankPath, JSON.stringify({ schemaVersion: 1, revision: 0, items: [] }));
  const orphanPath = sourcePath + '.pd2-mule.lock', owner = { pid: deadPID, token: 'cli-orphan', bankPath, stashPath: sourcePath };
  fs.writeFileSync(orphanPath, JSON.stringify(owner));
  return { directory, sourcePath, bankPath, orphanPath, owner };
}
function snapshot(state) { return fs.readdirSync(state.directory).sort().map(name => [name, hash(fs.readFileSync(path.join(state.directory, name)))]); }
function command(args) { return spawnSync(process.execPath, [CLI, 'bank', ...args], { encoding: 'utf8', timeout: 15000 }); }
function success(args) { const result = command(args); assert.equal(result.status, 0, result.stderr || result.error?.message); return JSON.parse(result.stdout); }

test('recover source parsing is optional, preview-first, and retains dry-run precedence and strict options', () => {
  const basic = ['recover', '--bank', 'bank.json'];
  assert.deepEqual(parseBankArguments(basic).request, { bankPath: 'bank.json', dryRun: true });
  const explicit = [...basic, '--source', 'copy.d2x'];
  assert.deepEqual(parseBankArguments(explicit).request, { bankPath: 'bank.json', sourcePath: 'copy.d2x', dryRun: true });
  assert.equal(parseBankArguments([...explicit, '--experimental-write']).request.dryRun, false);
  assert.equal(parseBankArguments([...explicit, '--experimental-write', '--dry-run']).request.dryRun, true);
  assert.equal(parseBankArguments([...explicit, '--dry-run', '--experimental-write']).request.dryRun, true);
  assert.throws(() => parseBankArguments([...basic, '--source']), /Missing value/i);
  assert.throws(() => parseBankArguments([...explicit, '--source', 'other.d2s']), /Duplicate/i);
  for (const args of [[...basic, '--page', '1'], [...basic, '--destination', 'copy.d2s'],
    [...basic, '--item', '1'], [...basic, '--unknown'], ['list', '--bank', 'bank.json', '--source', 'copy.d2x']]) {
    assert.throws(() => parseBankArguments(args), /Unknown option/i);
  }
  const usage = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.match(usage.stderr + usage.stdout, /bank recover.*\[--source <[^>]+>\]/);
});

test('CLI orphan recovery previews by default, honors explicit dry run, and commits only with write authorization', t => {
  const state = setup(t), args = ['recover', '--bank', state.bankPath], before = snapshot(state);
  assert.equal(success(args).action, undefined);
  assert.deepEqual(snapshot(state), before);
  const explicit = [...args, '--source', state.sourcePath], preview = success(explicit);
  assert.equal(preview.action, 'remove-stale-lock');
  assert.equal(preview.dryRun, true);
  assert.equal(preview.recovered, false);
  assert.deepEqual(snapshot(state), before);
  assert.equal(success([...explicit, '--experimental-write', '--dry-run']).dryRun, true);
  assert.deepEqual(snapshot(state), before);
  const committed = success([...explicit, '--experimental-write']);
  assert.equal(committed.recovered, true);
  assert.equal(committed.dryRun, false);
  assert.equal(committed.action, 'remove-stale-lock');
  assert.deepEqual(snapshot(state), before.filter(([name]) => name !== path.basename(state.orphanPath)));
});

test('CLI refuses active, conflicting, protected, missing, and foreign targets without changing inputs', t => {
  for (const change of ['active', 'conflict', 'protected', 'missing', 'foreign']) {
    const state = setup(t); let sourcePath = state.sourcePath;
    if (change === 'active') fs.writeFileSync(state.orphanPath, JSON.stringify({ ...state.owner, pid: process.pid }));
    if (change === 'conflict') {
      const other = path.join(state.directory, 'other.d2x'); fs.copyFileSync(FIXTURE, other);
      fs.writeFileSync(state.bankPath + '.lock', JSON.stringify({ ...state.owner, stashPath: other }));
    }
    if (change === 'protected') sourcePath = FIXTURE;
    if (change === 'missing') sourcePath = path.join(state.directory, 'missing.d2x');
    if (change === 'foreign') fs.writeFileSync(state.orphanPath, JSON.stringify({ ...state.owner, bankPath: path.join(state.directory, 'foreign.json') }));
    const before = snapshot(state), result = command(['recover', '--bank', state.bankPath, '--source', sourcePath, '--experimental-write']);
    assert.equal(result.status, 1, change);
    if (change === 'conflict') assert.ok(result.stderr.includes('Explicit recovery source conflicts with the interrupted transaction'));
    else assert.match(result.stderr, /active|locked|protected|copy|exist|source|owner|bank|save|path/i);
    assert.deepEqual(snapshot(state), before);
  }
});
