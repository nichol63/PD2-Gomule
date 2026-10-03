import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { parseLegacyItemSummary } from '../src/lib/legacy-item-parser.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import {
  parseCharacterFile,
  parsePlugyStashFile,
  reconstructParsedSaveBuffer
} from '../src/lib/save-parsers.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const LIBRARY = getFixtureLibraryDir();

function fixture(relativePath, expectedHash) {
  const filePath = path.join(LIBRARY, relativePath);
  const bytes = fs.readFileSync(filePath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash,
    `${relativePath} changed; recheck the bit layout before updating this test`);
  return { filePath, bytes };
}

function readBits(bytes, bitOffset, width) {
  let value = 0;
  for (let bit = 0; bit < width; bit += 1) {
    const sourceBit = bitOffset + bit;
    value |= ((bytes[sourceBit >>> 3] >>> (sourceBit & 7)) & 1) << bit;
  }
  return value;
}

test('old combat items read the 11-bit Deep Wounds value before the item terminator', () => {
  const cases = [
    {
      name: 'Showcase Characters/amazon/cold_arrow.d2s',
      sha256: 'a81baea48eb6d0d74ebb715dd43509ba825d2fc64f6ffe4e0ff3beb661e9051b',
      offset: 3086,
      statBit: 436,
      value: 228,
      code: 'aqv'
    },
    {
      name: 'Showcase Characters/assassin/dragon_tailc.d2s',
      sha256: 'e91934d407475b9ddb19a1776b84d0f45217681f3c9cf7db9cabc201a65470da',
      offset: 1780,
      statBit: 378,
      value: 151,
      code: 'uhb'
    }
  ];

  for (const entry of cases) {
    const { filePath, bytes } = fixture(entry.name, entry.sha256);
    const item = parseCharacterFile(filePath).items.find((candidate) =>
      candidate.byteOffset === entry.offset);
    assert.ok(item, `${entry.name} has the expected item`);
    assert.equal(item.code, entry.code);
    const statBit = entry.offset * 8 + entry.statBit;
    assert.equal(readBits(bytes, statBit, 9), 501);
    assert.equal(readBits(bytes, statBit + 9, 11), entry.value);
    assert.equal(readBits(bytes, statBit + 20, 9), 511,
      'the next nine bits end the property list');
    assert.ok(statBit + 29 <= item.sourceSpan.endOffset * 8);
    assert.equal(item.propertiesComplete, true);
    assert.deepEqual(item.properties.filter((property) => property.statId === 501)
      .map((property) => property.values), [[entry.value]]);
  }
});

test('plain old maps end at their property marker without a stack-count payload', () => {
  const cases = [
    {
      name: 'Showcase Characters/barbarian/werewolf-fury.d2s',
      sha256: '4153242d96ff7b99510a647662d9dc425fbb0748460fcb77965d6c8d2da98dee',
      offset: 3882,
      code: 't39'
    },
    {
      name: 'Showcase Characters/druid/summoner-raven.d2s',
      sha256: '2912dd68b2950b1ae74df32d867e7055cf3da24d08516b5e014d6cbb33c62dd0',
      offset: 3716,
      code: 't37'
    }
  ];

  for (const entry of cases) {
    const { filePath, bytes } = fixture(entry.name, entry.sha256);
    const item = parseCharacterFile(filePath).items.find((candidate) =>
      candidate.byteOffset === entry.offset);
    assert.ok(item, `${entry.name} has the expected map`);
    assert.equal(item.code, entry.code);
    assert.equal(item.qualityLabel, 'normal');
    assert.equal(item.sourceSpan.length, 21);
    assert.equal(readBits(bytes, entry.offset * 8 + 157, 9), 511);
    assert.equal(item.stackSize, null);
    assert.equal(item.propertiesComplete, true);
    assert.deepEqual(item.properties, []);
    assert.equal(item.propertyLists[0].startBitOffset - entry.offset * 8, 157);
  }
});

test('newer Deep Wounds keeps its 16-bit payload and an old item missing its terminator remains incomplete', () => {
  const stashName = '_LOD_SharedStashSave.sss';
  const stash = fixture(stashName,
    'b8f6a79e9a800c085bd63f092559057294addd404bb7e67afc3ed97252e2b5ed');
  const page = parsePlugyStashFile(stash.filePath).pages.find((entry) => entry.name === 'Bows 2,3');
  const bow = page?.items.find((item) => item.byteOffset === 92416);
  assert.ok(bow);
  assert.equal(bow.code, '8hb');
  assert.equal(bow.qualityData.uniqueId, 189);
  assert.equal(readBits(stash.bytes, bow.byteOffset * 8 + 296, 9), 501);
  assert.equal(readBits(stash.bytes, bow.byteOffset * 8 + 305, 16), 50);
  assert.equal(readBits(stash.bytes, bow.byteOffset * 8 + 321, 9), 511);
  assert.equal(bow.propertiesComplete, true);
  assert.deepEqual(bow.properties.filter((property) => property.statId === 501)
    .map((property) => property.values), [[50]]);

  const old = fixture('Showcase Characters/amazon/cold_arrow.d2s',
    'a81baea48eb6d0d74ebb715dd43509ba825d2fc64f6ffe4e0ff3beb661e9051b');
  const oldOffset = 3086;
  const stopOffset = oldOffset + 57;
  const truncated = parseLegacyItemSummary(old.bytes, oldOffset, loadPd2Tables(), {
    requireKnownCode: true,
    stopOffset
  });
  assert.ok(truncated);
  assert.equal(truncated.propertiesComplete, false);
  assert.match(truncated.propertyParseError, /byte boundary/);
  assert.ok(truncated.propertyLists[0].failedBitOffset <= stopOffset * 8);
});

test('an old rare map has a complete property list without stack bits while a newer map keeps its stack count', () => {
  const old = fixture('Showcase Characters/barbarian/werewolf-fury2.d2s',
    'e6cc2927e679a0885cca8a9a01075628c39bd675be6bbbe1a72dc1043913c024');
  const item = parseCharacterFile(old.filePath).items.find((entry) => entry.byteOffset === 2552);
  assert.ok(item);
  assert.equal(item.code, 't32');
  assert.equal(item.qualityLabel, 'rare');
  assert.equal(item.sourceSpan.length, 65);
  assert.equal(readBits(old.bytes, item.byteOffset * 8 + 245, 9), 360);
  assert.equal(readBits(old.bytes, item.byteOffset * 8 + 506, 9), 511);
  assert.equal(item.stackSize, null);
  assert.equal(item.propertiesComplete, true);
  assert.equal(item.propertyLists[0].startBitOffset - item.byteOffset * 8, 245);
  assert.equal(item.propertyLists[0].endBitOffset - item.byteOffset * 8, 515);
  assert.deepEqual(item.properties.map((property) => [property.statId, property.values]), [
    [360, [0, 1]], [361, [1032]], [370, [133]], [371, [133]],
    [372, [313]], [373, [32]], [388, [11]], [402, [1972]],
    [405, [39]], [411, [-31]], [412, [-31]], [449, [20]], [470, [918]]
  ]);

  const newer = fixture('_LOD_SharedStashSave.sss',
    'b8f6a79e9a800c085bd63f092559057294addd404bb7e67afc3ed97252e2b5ed');
  const newPage = parsePlugyStashFile(newer.filePath).pages.find((entry) => entry.name === 'Maps 3');
  const stacked = newPage?.items.find((entry) => entry.byteOffset === 9363);
  assert.ok(stacked);
  assert.equal(stacked.code, 't32');
  assert.equal(stacked.stackSize, 1);
  assert.equal(stacked.propertiesComplete, true);
  assert.equal(stacked.propertyLists[0].startBitOffset - stacked.byteOffset * 8, 254);
  assert.deepEqual(stacked.properties.slice(0, 4).map((property) => [property.statId, property.values]), [
    [370, [59]], [371, [59]], [372, [241]], [373, [25]]
  ]);
});

test('trophy charms consume state parameters before reading their clout stats', () => {
  const { filePath, bytes } = fixture('_LOD_SharedStashSave.sss',
    'b8f6a79e9a800c085bd63f092559057294addd404bb7e67afc3ed97252e2b5ed');
  const page = parsePlugyStashFile(filePath).pages.find((entry) => entry.name === 'Testing 2');
  assert.ok(page);
  const cases = [
    { offset: 145189, uniqueId: 4095, states: [211, 218], clout: [480, 'rathma_clout'], end: 247 },
    { offset: 145220, uniqueId: 414, states: [210], clout: [473, 'maxlevel_clout'], end: 229 },
    { offset: 145249, uniqueId: 413, states: [209], clout: [472, 'dclone_clout'], end: 229 },
    { offset: 145308, uniqueId: 415, states: [211], clout: [474, 'dev_clout'], end: 229 }
  ];

  for (const entry of cases) {
    const item = page.items.find((candidate) => candidate.byteOffset === entry.offset);
    assert.ok(item);
    assert.equal(item.code, 'cm1');
    assert.equal(item.qualityData.uniqueId, entry.uniqueId);
    let bitOffset = entry.offset * 8 + 190;
    for (const state of entry.states) {
      assert.equal(readBits(bytes, bitOffset, 9), 98);
      assert.equal(readBits(bytes, bitOffset + 9, 8), state);
      assert.equal(readBits(bytes, bitOffset + 17, 1), 1);
      bitOffset += 18;
    }
    assert.equal(readBits(bytes, bitOffset, 9), entry.clout[0]);
    assert.equal(readBits(bytes, bitOffset + 9, 3), 1);
    assert.equal(readBits(bytes, bitOffset + 12, 9), 511);
    assert.equal(item.propertiesComplete, true);
    assert.equal(item.propertyLists[0].endBitOffset - entry.offset * 8, entry.end);
    assert.deepEqual(item.properties.map((property) =>
      [property.statId, property.statKey, property.values]), [
      [7, 'maxhp', [20]],
      ...entry.states.map((state) => [98, 'state', [state, 1]]),
      [entry.clout[0], entry.clout[1], [1]]
    ]);
  }
});

test('the final primary item ends before corpse and mercenary sections', () => {
  const { filePath, bytes } = fixture('Showcase Characters/sorceress/multishot.d2s',
    '6865ffdb4197c40e0e7b734999ec734e9b5026f6086d8087743d7d11edc57a3d');
  const character = parseCharacterFile(filePath);
  assert.equal(character.itemCount, 103);
  assert.equal(character.parsedItemCount, 103);
  assert.equal(character.parsedNodeCount, 126);
  const last = character.items.at(-1);
  assert.equal(last.byteOffset, 5893);
  assert.equal(last.code, 'aqv');
  assert.equal(readBits(bytes, last.byteOffset * 8 + 481, 9), 501);
  assert.equal(readBits(bytes, last.byteOffset * 8 + 490, 11), 309);
  assert.equal(readBits(bytes, last.byteOffset * 8 + 501, 9), 511);
  assert.equal(last.propertiesComplete, true);
  assert.deepEqual(last.properties.filter((property) => property.statId === 501)
    .map((property) => property.values), [[309]]);
  assert.equal(last.sourceSpan.endOffset, 5957);
  assert.equal(character.itemRegion.endOffset, 5957);
  assert.equal(bytes.toString('ascii', 5957, 5959), 'JM');
  assert.equal(bytes.readUInt16LE(5959), 0);
  assert.equal(bytes.toString('ascii', 5961, 5963), 'jf');
  assert.equal(bytes.toString('ascii', 5963, 5965), 'JM');
  assert.equal(bytes.readUInt16LE(5965), 6);
  assert.equal(bytes.toString('ascii', 5967, 5969), 'JM');
  assert.deepEqual(reconstructParsedSaveBuffer(bytes, character), bytes);
});

test('a forged section marker inside a later mercenary item cannot extend the primary item region', () => {
  const canonical = fixture('Showcase Characters/sorceress/multishot.d2s',
    '6865ffdb4197c40e0e7b734999ec734e9b5026f6086d8087743d7d11edc57a3d');
  const disposable = Buffer.from(canonical.bytes);
  Buffer.from('4a4d00006a664a4d', 'hex').copy(disposable, 6000);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pd2-parser-boundary-'));
  const filePath = path.join(directory, 'multishot.d2s');
  try {
    fs.writeFileSync(filePath, disposable);
    const parsed = parseCharacterFile(filePath);
    assert.equal(parsed.parsedItemCount, 103);
    assert.equal(parsed.parsedNodeCount, 126);
    assert.equal(parsed.itemRegion.endOffset, 5957);
    assert.equal(parsed.items.at(-1).sourceSpan.endOffset, 5957);
    assert.deepEqual(reconstructParsedSaveBuffer(disposable, parsed), disposable);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
