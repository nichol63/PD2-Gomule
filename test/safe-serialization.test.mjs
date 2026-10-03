import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { parsePlugyStashFile } from '../src/lib/save-parsers.mjs';
import {
  extractStashItem,
  insertStashItem,
  inspectTransferSupport,
  patchItemLocation,
  removeStashItem
} from '../src/lib/safe-serialization.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const LIBRARY = getFixtureLibraryDir();
const BASES_HASH = '1f41e9a06137ddcf6d67d9da67703c717baeb3ed9ca4fe1e9fe0dad6bde36884';
const SHARED_HASH = 'b8f6a79e9a800c085bd63f092559057294addd404bb7e67afc3ed97252e2b5ed';

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readBits(bytes, offset, width) {
  let value = 0;
  for (let bit = 0; bit < width; bit += 1) {
    const absolute = offset + bit;
    value |= ((bytes[absolute >>> 3] >>> (absolute & 7)) & 1) << bit;
  }
  return value;
}

test('location patch changes only the allowed item header bits on a disposable byte copy', () => {
  const fixturePath = path.join(LIBRARY, 'Bases.d2x');
  const original = fs.readFileSync(fixturePath);
  assert.equal(hash(original), BASES_HASH, 'fixture changed; recheck the item sample');
  const summary = parsePlugyStashFile(fixturePath);
  const item = summary.pages.find((page) => page.name === 'Reg Helm')?.items[0];
  assert.ok(item);
  const sourceBytes = Buffer.from(original.subarray(item.sourceSpan.startOffset, item.sourceSpan.endOffset));
  const sourceHash = hash(sourceBytes);

  const patched = patchItemLocation(sourceBytes, { column: 4, row: 6 });
  assert.notStrictEqual(patched, sourceBytes);
  assert.equal(hash(sourceBytes), sourceHash, 'source item bytes remain unchanged');
  assert.equal(readBits(patched, 58, 3), 0);
  assert.equal(readBits(patched, 61, 4), 0);
  assert.equal(readBits(patched, 65, 4), 4);
  assert.equal(readBits(patched, 69, 4), 6);
  assert.equal(readBits(patched, 73, 3), 5);

  for (let bit = 0; bit < sourceBytes.length * 8; bit += 1) {
    if (bit >= 58 && bit < 76) continue;
    assert.equal(readBits(patched, bit, 1), readBits(sourceBytes, bit, 1),
      `unapproved bit ${bit} changed`);
  }
  assert.equal(hash(fs.readFileSync(fixturePath)), BASES_HASH);
});

test('a mismatched page count is rejected before any removal', () => {
  const fixturePath = path.join(LIBRARY, '_LOD_SharedStashSave.sss');
  const original = fs.readFileSync(fixturePath);
  assert.equal(hash(original), SHARED_HASH);
  const summary = parsePlugyStashFile(fixturePath);
  const pageIndex = summary.pages.findIndex((page) => page.name === 'Miscellaneous');
  assert.ok(pageIndex >= 0);
  const mismatched = {
    ...summary,
    pages: summary.pages.map((page, index) =>
      index === pageIndex ? { ...page, itemCount: page.itemCount + 1 } : page
    )
  };
  const support = inspectTransferSupport(original, mismatched)[pageIndex];
  assert.equal(support.supported, false);
  assert.match(support.reason, /count|uncertain/i);
  assert.throws(() => removeStashItem(Buffer.from(original), mismatched, { pageIndex, itemIndex: 0 }),
    /count|uncertain/i);
  assert.equal(hash(fs.readFileSync(fixturePath)), SHARED_HASH);
});

test('a parsed save cannot authorize mutation of different same-length bytes', () => {
  const fixturePath = path.join(LIBRARY, 'Bases.d2x');
  const original = fs.readFileSync(fixturePath);
  const parsed = parsePlugyStashFile(fixturePath);
  assert.equal(parsed.sourceSha256, hash(original));
  const altered = Buffer.from(original);
  altered[10] ^= 1;
  assert.equal(altered.length, original.length);
  assert.throws(() => removeStashItem(altered, parsed, { pageIndex: 1, itemIndex: 0 }),
    /does not match source bytes/i);
  assert.equal(hash(original), BASES_HASH);
  assert.equal(hash(fs.readFileSync(fixturePath)), BASES_HASH);
});

test('undeclared trailing key bytes keep Legacy Season 6 Extra transfer disabled', () => {
  const fixturePath = path.join(LIBRARY, 'Legacy.d2x');
  const original = fs.readFileSync(fixturePath);
  const parsed = parsePlugyStashFile(fixturePath);
  const pageIndex = parsed.pages.findIndex((page) => page.name === 'Season 6 Extra');
  assert.ok(pageIndex >= 0);
  const page = parsed.pages[pageIndex];
  assert.equal(page.itemCount, 9);
  assert.equal(page.parsedNodeCount, 37);
  assert.equal(page.itemRegion.endOffset - page.items.at(-1).sourceSpan.endOffset, 22);
  const support = inspectTransferSupport(original, parsed)[pageIndex];
  assert.equal(support.supported, false);
  assert.match(support.reason, /not contiguous|unparsed bytes/i);
  assert.throws(() => removeStashItem(Buffer.from(original), parsed, { pageIndex, itemIndex: 0 }),
    /not contiguous|unparsed bytes/i);
});

test('15-row stash grid accepts one-high item on row 14 and rejects two-high or overwide placement', () => {
  const basesPath = path.join(LIBRARY, 'Bases.d2x');
  const sharedPath = path.join(LIBRARY, '_LOD_SharedStashSave.sss');
  const basesBytes = fs.readFileSync(basesPath);
  const sharedBytes = fs.readFileSync(sharedPath);
  const bases = parsePlugyStashFile(basesPath);
  const shared = parsePlugyStashFile(sharedPath);
  const rune = extractStashItem(sharedBytes, shared, { pageIndex: 1, itemIndex: 0 });
  const diadem = extractStashItem(basesBytes, bases, { pageIndex: 1, itemIndex: 0 });
  assert.deepEqual([rune.item.invWidth, rune.item.invHeight], [1, 1]);
  assert.deepEqual([diadem.item.invWidth, diadem.item.invHeight], [2, 2]);

  const inserted = insertStashItem(Buffer.from(basesBytes), bases, {
    pageIndex: 0, itemBytes: rune.bytes, column: 0, row: 14
  });
  assert.equal(inserted.buffer.readUInt16LE(bases.pages[0].itemRegion.startOffset - 2), 1);
  assert.notEqual(hash(inserted.buffer), hash(basesBytes));
  assert.throws(() => insertStashItem(Buffer.from(basesBytes), bases, {
    pageIndex: 0, itemBytes: diadem.bytes, column: 0, row: 14
  }), /does not fit/i);
  assert.throws(() => insertStashItem(Buffer.from(basesBytes), bases, {
    pageIndex: 0, itemBytes: diadem.bytes, column: 9, row: 0
  }), /does not fit/i);
  assert.equal(hash(fs.readFileSync(basesPath)), BASES_HASH);
  assert.equal(hash(fs.readFileSync(sharedPath)), SHARED_HASH);
});
