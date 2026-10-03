import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBankArguments } from '../src/bank-cli.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const deposit = ['deposit', '--bank', 'bank.json', '--source', 'copy.d2x', '--page', '2', '--item', '3'];

test('bank deposit defaults to preview and converts displayed indexes exactly once', () => {
  const { request } = parseBankArguments(deposit);
  assert.equal(request.dryRun, true);
  assert.equal(request.pageIndex, 1);
  assert.equal(request.itemIndex, 2);
  assert.equal(parseBankArguments([...deposit, '--experimental-write']).request.dryRun, false);
  assert.equal(parseBankArguments([...deposit, '--experimental-write', '--dry-run']).request.dryRun, true);
});

test('bank commands reject malformed, missing, duplicate, and action-inappropriate options', () => {
  assert.throws(() => parseBankArguments([]), /must be/);
  assert.throws(() => parseBankArguments(['list']), /--bank/);
  assert.throws(() => parseBankArguments(['list', '--bank']), /Missing value/);
  assert.throws(() => parseBankArguments(['list', '--bank', 'a', '--bank', 'b']), /Duplicate/);
  assert.throws(() => parseBankArguments(['list', '--bank', 'a', '--experimental-write']), /Unknown option/);
  assert.throws(() => parseBankArguments([...deposit, '--unknown']), /Unknown option/);
  for (const bad of ['0', '-1', '1.5', '1junk', '9007199254740992']) {
    const args = [...deposit];
    args[args.indexOf('--page') + 1] = bad;
    assert.throws(() => parseBankArguments(args), /--page must be/);
  }
});

test('withdraw requires an explicit item, page, and grid position', () => {
  const args = ['withdraw', '--bank', 'bank.json', '--destination', 'copy.sss', '--item-id', 'saved-item', '--page', '1', '--column', '0', '--row', '9'];
  assert.deepEqual(parseBankArguments(args).request, {
    bankPath: 'bank.json', dryRun: true, destinationPath: 'copy.sss', itemId: 'saved-item', pageIndex: 0, column: 0, row: 9
  });
  assert.throws(() => parseBankArguments(args.slice(0, -2)), /--row/);
  assert.equal(parseBankArguments(['recover', '--bank', 'bank.json']).request.dryRun, true);
});

test('CLI previews, deposits, searches, and withdraws one real item using only disposable stash copies', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pd2-cli-bank-'));
  const sourcePath = path.join(directory, 'source.d2x');
  const destinationPath = path.join(directory, 'destination.d2x');
  const bankPath = path.join(directory, 'bank.json');
  const fixture = path.join(getFixtureLibraryDir(), 'Bases.d2x');
  const original = fs.readFileSync(fixture);
  fs.copyFileSync(fixture, sourcePath);
  fs.copyFileSync(fixture, destinationPath);
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const run = args => JSON.parse(execFileSync(process.execPath, [cli, 'bank', ...args], { encoding: 'utf8' }));
  try {
    const before = inspectSaveFile(sourcePath);
    const item = before.pages[1].topLevelItems[0];
    assert.ok(item, 'real Reg Helm page must contain an item');
    const argumentsForDeposit = ['deposit', '--bank', bankPath, '--source', sourcePath, '--page', '2', '--item', '1'];
    const preview = run(argumentsForDeposit);
    assert.equal(preview.dryRun, true);
    assert.equal(preview.bankItemCountAfter, 1);
    assert.deepEqual(fs.readFileSync(sourcePath), original);
    assert.equal(fs.existsSync(bankPath), false);
    assert.equal(fs.existsSync(bankPath + '.transactions'), false);

    const committed = run([...argumentsForDeposit, '--experimental-write']);
    assert.equal(committed.dryRun, false);
    assert.ok(committed.transactionId);
    assert.ok(committed.backupPaths.every(file => fs.existsSync(file)));
    assert.equal(inspectSaveFile(sourcePath).pages[1].topLevelItems.length, before.pages[1].topLevelItems.length - 1);
    const listed = run(['list', '--bank', bankPath, '--query', item.code]);
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].id, committed.itemId);
    assert.equal(Object.hasOwn(listed.items[0], 'bytesBase64'), false);

    const argumentsForWithdrawal = ['withdraw', '--bank', bankPath, '--item-id', committed.itemId, '--destination', destinationPath, '--page', '1', '--column', '0', '--row', '0'];
    assert.equal(run(argumentsForWithdrawal).dryRun, true);
    assert.deepEqual(fs.readFileSync(destinationPath), original);
    const withdrawn = run([...argumentsForWithdrawal, '--experimental-write']);
    assert.equal(withdrawn.bankItemCountAfter, 0);
    assert.equal(run(['list', '--bank', bankPath]).items.length, 0);
    const destination = inspectSaveFile(destinationPath);
    assert.equal(destination.pages[0].topLevelItems.length, 1);
    assert.equal(destination.pages[0].topLevelItems[0].code, item.code);
    assert.equal(destination.pages[0].topLevelItems[0].column, 0);
    assert.equal(destination.pages[0].topLevelItems[0].row, 0);
    assert.equal(inspectSaveFile(sourcePath).totalItems + destination.totalItems, before.totalItems * 2);
    assert.equal(fs.existsSync(bankPath + '.journal.json'), false);
    assert.equal(fs.existsSync(bankPath + '.lock'), false);
    assert.equal(fs.existsSync(sourcePath + '.pd2-mule.lock'), false);
    assert.equal(fs.existsSync(destinationPath + '.pd2-mule.lock'), false);
    assert.deepEqual(fs.readFileSync(fixture), original);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
