import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { depositItem, listBank, recoverBank, withdrawItem } from '../src/lib/item-bank.mjs';
import { parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { extractStashItem, patchItemLocation } from '../src/lib/safe-serialization.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(getFixtureLibraryDir(), 'Bases.d2x');
const SOURCE_HASH = '1f41e9a06137ddcf6d67d9da67703c717baeb3ed9ca4fe1e9fe0dad6bde36884';

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function withDisposableStash(run, sourcePath = SOURCE) {
  const directory = fs.mkdtempSync(path.join(REPO, '.bank-test-'));
  assert.equal(path.dirname(path.resolve(directory)), REPO);
  const stashPath = path.join(directory, 'working.d2x');
  const bankPath = path.join(directory, 'items.json');
  const originalHash = hash(fs.readFileSync(sourcePath));
  if (sourcePath === SOURCE) assert.equal(originalHash, SOURCE_HASH);
  fs.copyFileSync(sourcePath, stashPath);
  try {
    run({ directory, stashPath, bankPath });
  } finally {
    assert.equal(hash(fs.readFileSync(sourcePath)), originalHash,
      'the canonical fixture must remain unchanged');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('bank previews leave files unchanged and committed deposit and withdraw preserve item counts', () => {
  withDisposableStash(({ stashPath, bankPath }) => {
    const before = fs.readFileSync(stashPath);
    const preview = depositItem({ bankPath, sourcePath: stashPath, pageIndex: 1, itemIndex: 0 });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.bankItemCountAfter, 1);
    assert.equal(preview.stashItemCountAfter, preview.stashItemCountBefore - 1);
    assert.equal(hash(fs.readFileSync(stashPath)), hash(before));
    assert.equal(fs.existsSync(bankPath), false);

    const deposited = depositItem({ bankPath, sourcePath: stashPath, pageIndex: 1, itemIndex: 0, dryRun: false });
    assert.equal(deposited.dryRun, false);
    assert.equal(listBank(bankPath).items.length, 1);
    assert.equal(listBank(bankPath).items[0].id, deposited.itemId);
    const afterDeposit = parsePlugyStashFile(stashPath);
    assert.equal(afterDeposit.pages[1].itemCount, 27);
    assert.equal(afterDeposit.pages[0].itemCount, 0);

    const withdrawPreview = withdrawItem({
      bankPath, destinationPath: stashPath, pageIndex: 0,
      itemId: deposited.itemId, column: 0, row: 0
    });
    assert.equal(withdrawPreview.dryRun, true);
    assert.equal(listBank(bankPath).items.length, 1);
    const withdrawn = withdrawItem({
      bankPath, destinationPath: stashPath, pageIndex: 0,
      itemId: deposited.itemId, column: 0, row: 0, dryRun: false
    });
    assert.equal(withdrawn.bankItemCountAfter, 0);
    assert.equal(listBank(bankPath).items.length, 0);
    const final = parsePlugyStashFile(stashPath);
    assert.equal(final.pages[1].itemCount, 27);
    assert.equal(final.pages[0].itemCount, 1);
    assert.equal(final.pages[0].topLevelItems[0].code, 'ci3');
    assert.equal(final.parsedItemCount, afterDeposit.parsedItemCount + 1);
  });
});

test('socketed item transfer moves one root and all four child nodes', () => {
  const legacySource = path.join(getFixtureLibraryDir(), 'Legacy.d2x');
  withDisposableStash(({ stashPath, bankPath }) => {
    const before = parsePlugyStashFile(stashPath);
    const pageIndex = before.pages.findIndex((page) => page.name === 'Season 5 Armor');
    const page = before.pages[pageIndex];
    const itemIndex = page.topLevelItems.findIndex((item) =>
      item.code === 'uit' && item.children.length === 4
    );
    assert.ok(itemIndex >= 0);
    assert.deepEqual([page.itemCount, page.parsedNodeCount], [13, 21]);

    const deposited = depositItem({
      bankPath, sourcePath: stashPath, pageIndex, itemIndex, dryRun: false
    });
    assert.equal(listBank(bankPath).items[0].nodeCount, 5);
    const bankedBytes = Buffer.from(JSON.parse(fs.readFileSync(bankPath, 'utf8')).items[0].bytesBase64, 'base64');
    const afterDeposit = parsePlugyStashFile(stashPath);
    assert.deepEqual([afterDeposit.pages[pageIndex].itemCount,
      afterDeposit.pages[pageIndex].parsedNodeCount], [12, 16]);

    withdrawItem({ bankPath, destinationPath: stashPath, pageIndex: 0,
      itemId: deposited.itemId, column: 0, row: 0, dryRun: false });
    const final = parsePlugyStashFile(stashPath);
    assert.deepEqual([final.pages[0].itemCount, final.pages[0].parsedNodeCount], [1, 5]);
    assert.equal(final.pages[0].topLevelItems[0].code, 'uit');
    assert.deepEqual(final.pages[0].topLevelItems[0].children.map((child) => child.code),
      ['r26', 'r26', 'r28', 'r31']);
    const inserted = extractStashItem(fs.readFileSync(stashPath), final, { pageIndex: 0, itemIndex: 0 });
    assert.deepEqual(inserted.bytes, patchItemLocation(bankedBytes, { column: 0, row: 0 }));
    assert.equal(listBank(bankPath).items.length, 0);
  }, legacySource);
});

test('recovery rolls back a crash after stash replacement and before bank replacement', () => {
  withDisposableStash(({ stashPath, bankPath }) => {
    const originalHash = hash(fs.readFileSync(stashPath));
    const deposited = depositItem({ bankPath, sourcePath: stashPath, pageIndex: 1, itemIndex: 0, dryRun: false });
    const journalDirectory = path.join(bankPath + '.transactions', deposited.transactionId);
    const committed = JSON.parse(fs.readFileSync(path.join(journalDirectory, 'committed.json'), 'utf8'));
    assert.equal(committed.status, 'committed');
    assert.equal(committed.entries[0].beforeSha256, originalHash);
    assert.equal(committed.entries[1].beforeSha256, null);

    // Recreate the durable state of an interruption after the stash write.
    const interrupted = { ...committed, status: 'prepared' };
    fs.writeFileSync(bankPath + '.journal.json', JSON.stringify(interrupted));
    fs.unlinkSync(bankPath);
    assert.throws(() => listBank(bankPath), /interrupted transaction/i);
    const preview = recoverBank({ bankPath });
    assert.equal(preview.action, 'rollback');
    assert.equal(preview.recovered, false);
    assert.notEqual(hash(fs.readFileSync(stashPath)), originalHash);

    const recovery = recoverBank({ bankPath, dryRun: false });
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.action, 'rollback');
    assert.equal(hash(fs.readFileSync(stashPath)), originalHash);
    assert.equal(fs.existsSync(bankPath), false);
    assert.equal(listBank(bankPath).items.length, 0);
    assert.equal(fs.existsSync(bankPath + '.journal.json'), false);
  });
});

test('another bank lock and a hardlinked stash are rejected before transfer', () => {
  withDisposableStash(({ directory, stashPath, bankPath }) => {
    const beforeHash = hash(fs.readFileSync(stashPath));
    const hardlink = path.join(directory, 'linked.d2x');
    fs.linkSync(stashPath, hardlink);
    assert.throws(() => depositItem({
      bankPath, sourcePath: hardlink, pageIndex: 1, itemIndex: 0
    }), /hardlink/i);
    fs.unlinkSync(hardlink);

    const lockPath = stashPath + '.pd2-mule.lock';
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      token: 'other-bank-token',
      bankPath: path.join(directory, 'another-bank.json'),
      stashPath,
      createdAt: new Date().toISOString()
    }));
    try {
      assert.throws(() => depositItem({
        bankPath, sourcePath: stashPath, pageIndex: 1, itemIndex: 0, dryRun: false
      }), /locked|lock/i);
      assert.equal(fs.existsSync(bankPath), false);
      assert.equal(hash(fs.readFileSync(stashPath)), beforeHash);
    } finally {
      fs.unlinkSync(lockPath);
    }
  });
});

test('recovery refuses an externally changed stash without overwriting it', () => {
  withDisposableStash(({ stashPath, bankPath }) => {
    const deposited = depositItem({ bankPath, sourcePath: stashPath, pageIndex: 1, itemIndex: 0, dryRun: false });
    const journalDirectory = path.join(bankPath + '.transactions', deposited.transactionId);
    const committed = JSON.parse(fs.readFileSync(path.join(journalDirectory, 'committed.json'), 'utf8'));
    fs.writeFileSync(bankPath + '.journal.json', JSON.stringify({ ...committed, status: 'prepared' }));
    const changed = fs.readFileSync(stashPath);
    changed[0] ^= 1;
    fs.writeFileSync(stashPath, changed);
    const changedHash = hash(changed);

    assert.throws(() => recoverBank({ bankPath }), /externally modified/i);
    assert.throws(() => recoverBank({ bankPath, dryRun: false }), /externally modified/i);
    assert.equal(hash(fs.readFileSync(stashPath)), changedHash);
    assert.equal(fs.existsSync(bankPath + '.journal.json'), true);
  });
});

test('withdrawal refuses a bank item recorded against a different table profile', () => {
  withDisposableStash(({ stashPath, bankPath }) => {
    const deposited = depositItem({ bankPath, sourcePath: stashPath,
      pageIndex: 1, itemIndex: 0, dryRun: false });
    const stashHash = hash(fs.readFileSync(stashPath));
    const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    assert.match(bank.items[0].tableFingerprint, /^[0-9a-f]{64}$/);
    bank.items[0].tableFingerprint = '0'.repeat(64);
    fs.writeFileSync(bankPath, JSON.stringify(bank));

    assert.throws(() => withdrawItem({ bankPath, destinationPath: stashPath,
      pageIndex: 0, itemId: deposited.itemId, column: 0, row: 0 }),
    /table profile differs/i);
    assert.equal(hash(fs.readFileSync(stashPath)), stashHash);
    assert.equal(listBank(bankPath).items.length, 1);
  });
});
