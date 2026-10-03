import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { depositItem, listBank, recoverBank, withdrawItem } from '../src/lib/item-bank.mjs';
import { parseCharacterFile, parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import { extractCharacterItem } from '../src/lib/character-serialization.mjs';
import { extractStashItem, patchItemLocation } from '../src/lib/safe-serialization.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();
const CHARACTER = path.join(LIBRARY, 'Blank Characters', 'Level 30s', 'Amazon.d2s');
const STASH = path.join(LIBRARY, 'Bases.d2x');
const SOCKETED = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function withDisposableFiles(run) {
  const originalCharacter = fs.readFileSync(CHARACTER);
  const originalStash = fs.readFileSync(STASH);
  const directory = fs.mkdtempSync(path.join(REPO, '.character-bank-test-'));
  const characterPath = path.join(directory, 'working.d2s');
  const stashPath = path.join(directory, 'working.d2x');
  const bankPath = path.join(directory, 'items.json');
  fs.writeFileSync(characterPath, originalCharacter);
  fs.writeFileSync(stashPath, originalStash);
  try {
    run({ directory, characterPath, stashPath, bankPath, originalCharacter, originalStash });
  } finally {
    assert.equal(hash(fs.readFileSync(CHARACTER)), hash(originalCharacter));
    assert.equal(hash(fs.readFileSync(STASH)), hash(originalStash));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('character deposit previews, commits, and withdraws to a PlugY page', () => {
  withDisposableFiles(({ characterPath, stashPath, bankPath, originalCharacter }) => {
    const before = parseCharacterFile(characterPath);
    const extracted = extractCharacterItem(originalCharacter, before, { itemIndex: 0 });
    const preview = depositItem({ bankPath, sourcePath: characterPath, itemIndex: 0 });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.saveKind, 'character');
    assert.equal(preview.stashItemCountAfter, before.itemCount - 1);
    assert.equal(hash(fs.readFileSync(characterPath)), hash(originalCharacter));
    assert.equal(fs.existsSync(bankPath), false);

    const deposited = depositItem({
      bankPath, sourcePath: characterPath, itemIndex: 0, dryRun: false
    });
    assert.equal(deposited.saveKind, 'character');
    assert.equal(listBank(bankPath).items[0].id, deposited.itemId);
    assert.equal(listBank(bankPath).items[0].nodeCount, 1);
    assert.equal(listBank(bankPath).items[0].invWidth, extracted.item.invWidth);
    assert.equal(listBank(bankPath).items[0].invHeight, extracted.item.invHeight);
    const banked = Buffer.from(JSON.parse(fs.readFileSync(bankPath, 'utf8')).items[0].bytesBase64, 'base64');
    assert.deepEqual(banked, extracted.bytes);
    const afterDeposit = parseCharacterFile(characterPath);
    assert.equal(afterDeposit.itemCount, before.itemCount - 1);
    assert.deepEqual(fs.readFileSync(characterPath).subarray(-13), originalCharacter.subarray(-13));

    const withdrawn = withdrawItem({
      bankPath, destinationPath: stashPath, pageIndex: 0,
      itemId: deposited.itemId, column: 0, row: 0, dryRun: false
    });
    assert.equal(withdrawn.saveKind, 'plugy-personal-stash');
    assert.equal(listBank(bankPath).items.length, 0);
    const final = parsePlugyStashFile(stashPath);
    assert.equal(final.pages[0].itemCount, 1);
    assert.equal(final.pages[0].topLevelItems[0].code, 'tbk');
    assert.deepEqual(extractStashItem(fs.readFileSync(stashPath), final,
      { pageIndex: 0, itemIndex: 0 }).bytes,
    patchItemLocation(banked, { column: 0, row: 0 }));
  });
});

test('PlugY deposit withdraws to a character inventory with checksum and suffix preserved', () => {
  withDisposableFiles(({ characterPath, stashPath, bankPath, originalCharacter }) => {
    const originalSave = parseCharacterFile(characterPath);
    const deposited = depositItem({
      bankPath, sourcePath: stashPath, pageIndex: 1, itemIndex: 0, dryRun: false
    });
    const withdrawPreview = withdrawItem({
      bankPath, destinationPath: characterPath, itemId: deposited.itemId,
      panel: 'inventory', column: 4, row: 0
    });
    assert.equal(withdrawPreview.dryRun, true);
    assert.equal(withdrawPreview.saveKind, 'character');
    assert.equal(hash(fs.readFileSync(characterPath)), hash(originalCharacter));
    assert.equal(listBank(bankPath).items.length, 1);

    withdrawItem({
      bankPath, destinationPath: characterPath, itemId: deposited.itemId,
      panel: 'inventory', column: 4, row: 0, dryRun: false
    });
    const bytes = fs.readFileSync(characterPath);
    const final = parseCharacterFile(characterPath);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.equal(bytes.readUInt32LE(12), (() => {
      let sum = 0;
      for (let i = 0; i < bytes.length; i += 1)
        sum = (((sum << 1) | (sum >>> 31)) + (i >= 12 && i < 16 ? 0 : bytes[i])) >>> 0;
      return sum;
    })());
    assert.deepEqual(bytes.subarray(-13), originalCharacter.subarray(-13));
    assert.equal(final.itemCount, originalSave.itemCount + 1);
    assert.ok(final.topLevelItems.some((item) => item.code === 'ci3' &&
      item.location === 0 && item.panel === 1 && item.column === 4 && item.row === 0));
    assert.equal(listBank(bankPath).items.length, 0);
  });
});

test('mixed selectors and occupied character destinations fail before any file change', () => {
  withDisposableFiles(({ characterPath, stashPath, bankPath, originalCharacter, originalStash }) => {
    assert.throws(() => depositItem({
      bankPath, sourcePath: characterPath, pageIndex: 0, itemIndex: 0
    }), /pageIndex/i);
    assert.throws(() => depositItem({
      bankPath, sourcePath: stashPath, pageIndex: 1, panel: 'inventory', itemIndex: 0
    }), /panel/i);
    const deposited = depositItem({
      bankPath, sourcePath: stashPath, pageIndex: 1, itemIndex: 0, dryRun: false
    });
    const characterHash = hash(fs.readFileSync(characterPath));
    assert.throws(() => withdrawItem({
      bankPath, destinationPath: characterPath, pageIndex: 0,
      itemId: deposited.itemId, panel: 'inventory', column: 4, row: 0
    }), /pageIndex/i);
    assert.throws(() => withdrawItem({
      bankPath, destinationPath: characterPath, itemId: deposited.itemId,
      panel: 'inventory', column: 0, row: 0
    }), /occup|overlap|conflict/i);
    assert.equal(hash(fs.readFileSync(characterPath)), characterHash);
    assert.equal(listBank(bankPath).items.length, 1);
    assert.equal(hash(originalCharacter), characterHash);
    assert.notEqual(hash(fs.readFileSync(stashPath)), hash(originalStash));
  });
});

test('interrupted character transaction rolls back from a backed-up d2s copy', () => {
  withDisposableFiles(({ characterPath, bankPath, originalCharacter }) => {
    const deposited = depositItem({
      bankPath, sourcePath: characterPath, itemIndex: 0, dryRun: false
    });
    const journalDirectory = path.join(bankPath + '.transactions', deposited.transactionId);
    const committed = JSON.parse(fs.readFileSync(path.join(journalDirectory, 'committed.json'), 'utf8'));
    assert.equal(committed.entries[0].beforeSha256, hash(originalCharacter));
    assert.equal(committed.entries[1].beforeSha256, null);
    fs.writeFileSync(bankPath + '.journal.json', JSON.stringify({ ...committed, status: 'prepared' }));
    fs.unlinkSync(bankPath);
    assert.throws(() => listBank(bankPath), /interrupted transaction/i);
    assert.equal(recoverBank({ bankPath }).action, 'rollback');
    assert.notEqual(hash(fs.readFileSync(characterPath)), hash(originalCharacter));
    const recovered = recoverBank({ bankPath, dryRun: false });
    assert.equal(recovered.recovered, true);
    assert.equal(hash(fs.readFileSync(characterPath)), hash(originalCharacter));
    assert.equal(fs.existsSync(bankPath), false);
    assert.equal(fs.existsSync(bankPath + '.journal.json'), false);
  });
});

test('a real socketed character item passes through the bank and retains every child record', () => {
  const original = fs.readFileSync(SOCKETED);
  withDisposableFiles(({ characterPath, stashPath, bankPath }) => {
    fs.writeFileSync(characterPath, original);
    const save = parseCharacterFile(characterPath);
    const itemIndex = save.topLevelItems.findIndex(item => item.code === 'amc' && item.panel === 5 &&
      item.children.map(child => child.code).join(',') === 'r03,r07,r11');
    assert.ok(itemIndex >= 0);
    const extracted = extractCharacterItem(original, save, { itemIndex });
    const deposited = depositItem({ bankPath, sourcePath: characterPath, itemIndex, dryRun: false });
    const entry = listBank(bankPath).items[0];
    assert.equal(entry.nodeCount, 4);
    assert.equal(entry.invWidth, extracted.item.invWidth);
    assert.equal(entry.invHeight, extracted.item.invHeight);
    const stored = JSON.parse(fs.readFileSync(bankPath, 'utf8')).items[0];
    assert.deepEqual(Buffer.from(stored.bytesBase64, 'base64'), extracted.bytes);
    withdrawItem({ bankPath, destinationPath: stashPath, pageIndex: 0,
      itemId: deposited.itemId, column: 0, row: 0, dryRun: false });
    const destination = parsePlugyStashFile(stashPath);
    assert.equal(destination.pages[0].itemCount, 1);
    assert.equal(destination.pages[0].parsedNodeCount, 4);
    assert.deepEqual(destination.pages[0].topLevelItems[0].children.map(child => child.code), ['r03', 'r07', 'r11']);
    const moved = extractStashItem(fs.readFileSync(stashPath), destination, { pageIndex: 0, itemIndex: 0 });
    assert.deepEqual(moved.bytes, patchItemLocation(extracted.bytes, { column: 0, row: 0 }));
    const bankedAgain = depositItem({ bankPath, sourcePath: stashPath, pageIndex: 0, itemIndex: 0, dryRun: false });
    withdrawItem({ bankPath, destinationPath: characterPath, itemId: bankedAgain.itemId,
      panel: 'stash', column: extracted.item.column, row: extracted.item.row, dryRun: false });
    const restored = parseCharacterFile(characterPath);
    assert.equal(restored.itemCount, save.itemCount);
    assert.equal(restored.parsedNodeCount, save.parsedNodeCount);
    const returned = extractCharacterItem(fs.readFileSync(characterPath), restored,
      { itemIndex: restored.topLevelItems.length - 1 });
    assert.deepEqual(returned.bytes, extracted.bytes);
    assert.equal(listBank(bankPath).items.length, 0);
  });
  assert.equal(hash(fs.readFileSync(SOCKETED)), hash(original));
});
