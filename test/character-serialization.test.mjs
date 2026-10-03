import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { parseCharacterFile } from '../src/lib/save-parsers.mjs';
import {
  calculateCharacterChecksum,
  inspectCharacterTransferSupport,
  extractCharacterItem,
  removeCharacterItem,
  insertCharacterItem
} from '../src/lib/character-serialization.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = getFixtureLibraryDir();
const BLANK = path.join(LIBRARY, 'Blank Characters', 'Level 30s', 'Amazon.d2s');
const SHOWCASE = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'cold_arrow.d2s');
const SOCKETED = path.join(LIBRARY, 'Showcase Characters', 'amazon', 'freezing-arrow.d2s');
const SIMPLE = path.join(LIBRARY, 'Bases.d2s');
const HISTORICAL = path.join(LIBRARY, 'Showcase Characters', 'barbarian', 'werewolf-fury.d2s');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Independent copy of the algorithm in GoMule's D2Character.calculateCheckSum.
function referenceChecksum(bytes) {
  let checksum = 0;
  for (let offset = 0; offset < bytes.length; offset += 1) {
    const value = offset >= 12 && offset < 16 ? 0 : bytes[offset];
    checksum = (((checksum << 1) | (checksum >>> 31)) + value) >>> 0;
  }
  return checksum;
}

function withCharacter(sourcePath, run) {
  const original = fs.readFileSync(sourcePath);
  const directory = fs.mkdtempSync(path.join(REPO, '.character-serialization-test-'));
  const file = path.join(directory, 'working.d2s');
  fs.writeFileSync(file, original);
  try {
    return run({ file, original, save: parseCharacterFile(file) });
  } finally {
    assert.equal(sha256(fs.readFileSync(sourcePath)), sha256(original),
      'the canonical character fixture must remain unchanged');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function reparse(file, bytes) {
  fs.writeFileSync(file, bytes);
  return parseCharacterFile(file);
}

function assertValidHeader(bytes) {
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(12), referenceChecksum(bytes));
  assert.equal(calculateCharacterChecksum(bytes), referenceChecksum(bytes));
}

function assertOnlyLocationBitsChanged(before, after) {
  assert.equal(after.length, before.length);
  for (let bit = 0; bit < before.length * 8; bit += 1) {
    if (bit >= 58 && bit < 76) continue;
    assert.equal((after[bit >>> 3] >>> (bit & 7)) & 1,
      (before[bit >>> 3] >>> (bit & 7)) & 1, `untouched item bit ${bit}`);
  }
}

function repairHeader(bytes) {
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(referenceChecksum(bytes), 12);
  return bytes;
}

test('real character fixtures have independently valid size and checksum', () => {
  for (const source of [SIMPLE, BLANK, SHOWCASE]) {
    const bytes = fs.readFileSync(source);
    assertValidHeader(bytes);
  }
});

test('removing an inventory item preserves a following character section and updates the header', () => {
  withCharacter(BLANK, ({ file, original, save }) => {
    assert.equal(save.itemRegion.endOffset, 924);
    assert.equal(original.length, 937);
    assert.equal(inspectCharacterTransferSupport(original, save).supported, true);
    const itemIndex = save.topLevelItems.findIndex((item) =>
      item.code === 'tbk' && item.location === 0 && item.panel === 1);
    assert.ok(itemIndex >= 0);
    const extracted = extractCharacterItem(original, save, { itemIndex });
    assert.equal(extracted.item.code, 'tbk');
    assert.equal(extracted.sha256, sha256(extracted.bytes));
    assert.equal(extracted.nodeCount, 1);

    const changed = removeCharacterItem(original, save, { itemIndex });
    assertValidHeader(changed.buffer);
    assert.deepEqual(changed.extracted.bytes, extracted.bytes);
    assert.deepEqual(changed.buffer.subarray(16, save.itemListOffset + 2),
      original.subarray(16, save.itemListOffset + 2));
    assert.deepEqual(changed.buffer.subarray(-13), original.subarray(-13));
    assert.equal(changed.buffer.readUInt16LE(save.itemListOffset + 2), save.itemCount - 1);
    const after = reparse(file, changed.buffer);
    assert.equal(after.itemCount, save.itemCount - 1);
    assert.equal(after.parsedNodeCount, save.parsedNodeCount - 1);
    assert.deepEqual(after.topLevelItems.map((item) => item.code), ['box', 'ibk']);
  });
});

test('socketed stash item extraction and removal keep its child tree intact', () => {
  withCharacter(SOCKETED, ({ file, original, save }) => {
    const itemIndex = save.topLevelItems.findIndex((item) =>
      item.code === 'amc' && item.location === 0 && item.panel === 5 &&
      item.children.map((child) => child.code).join(',') === 'r03,r07,r11');
    assert.ok(itemIndex >= 0, 'fixture must contain the known socketed bow');
    const extracted = extractCharacterItem(original, save, { itemIndex });
    assert.equal(extracted.nodeCount, 4);
    assert.equal(extracted.bytes.subarray(0, 2).toString('ascii'), 'JM');
    assert.equal(extracted.sha256, sha256(extracted.bytes));
    const changed = removeCharacterItem(original, save, { itemIndex });
    assertValidHeader(changed.buffer);
    assert.deepEqual(changed.buffer.subarray(-(original.length - save.itemRegion.endOffset)),
      original.subarray(save.itemRegion.endOffset));
    const after = reparse(file, changed.buffer);
    assert.equal(after.itemCount, save.itemCount - 1);
    assert.equal(after.parsedNodeCount, save.parsedNodeCount - 4);
    assert.equal(after.topLevelItems.filter((item) => item.code === 'amc').length,
      save.topLevelItems.filter((item) => item.code === 'amc').length - 1);
    const inserted = insertCharacterItem(changed.buffer, after, {
      itemBytes: extracted.bytes, nodeCount: extracted.nodeCount,
      panel: 'stash', column: extracted.item.column, row: extracted.item.row
    });
    assertValidHeader(inserted.buffer);
    assertOnlyLocationBitsChanged(extracted.bytes, inserted.itemBytes);
    const restored = reparse(file, inserted.buffer);
    const bow = restored.topLevelItems.at(-1);
    assert.equal(restored.itemCount, save.itemCount);
    assert.equal(restored.parsedNodeCount, save.parsedNodeCount);
    assert.deepEqual(bow.children.map((child) => child.code), ['r03', 'r07', 'r11']);
    assert.deepEqual(inserted.itemBytes.subarray(extracted.item.nextOffset - extracted.startOffset),
      extracted.bytes.subarray(extracted.item.nextOffset - extracted.startOffset));
    assert.deepEqual(inserted.buffer.subarray(restored.itemRegion.endOffset),
      original.subarray(save.itemRegion.endOffset));
  });
});

test('insertion preserves the trailing section and rejects conflicts and unsupported placements', () => {
  withCharacter(BLANK, ({ file, original, save }) => {
    const itemBytes = extractCharacterItem(original, save, { itemIndex: 0 }).bytes;
    const inserted = insertCharacterItem(original, save, {
      itemBytes, nodeCount: 1, panel: 'inventory', column: 4, row: 0
    });
    assertValidHeader(inserted.buffer);
    assert.deepEqual(inserted.buffer.subarray(-13), original.subarray(-13));
    const after = reparse(file, inserted.buffer);
    assert.equal(after.itemCount, save.itemCount + 1);
    assertOnlyLocationBitsChanged(itemBytes, inserted.itemBytes);
    assert.deepEqual(inserted.buffer.subarray(16, save.itemListOffset + 2),
      original.subarray(16, save.itemListOffset + 2));
    assert.deepEqual(inserted.buffer.subarray(save.itemRegion.startOffset, save.itemRegion.endOffset),
      original.subarray(save.itemRegion.startOffset, save.itemRegion.endOffset));
    assert.ok(after.topLevelItems.some((item) => item.code === 'tbk' &&
      item.panel === 1 && item.column === 4 && item.row === 0));

    assert.throws(() => insertCharacterItem(original, save, {
      itemBytes, panel: 'inventory', column: 0, row: 0
    }), /occup|overlap|conflict/i);
    assert.throws(() => insertCharacterItem(original, save, {
      itemBytes, panel: 'inventory', column: 9, row: 7
    }), /bound|grid|fit|row/i);
    const withoutCube = removeCharacterItem(original, save, { itemIndex: 1 }).buffer;
    const noCubeSave = reparse(file, withoutCube);
    assert.throws(() => insertCharacterItem(withoutCube, noCubeSave, {
      itemBytes, panel: 'cube', column: 0, row: 0
    }), /cube/i);
  });
});

test('invalid checksum, declared size, truncation, and ambiguous item partition are rejected', () => {
  withCharacter(BLANK, ({ file, original, save }) => {
    const badChecksum = Buffer.from(original);
    badChecksum[12] ^= 1;
    assert.equal(inspectCharacterTransferSupport(badChecksum, save).supported, false);
    assert.throws(() => extractCharacterItem(badChecksum, save, { itemIndex: 0 }));
    assert.match(inspectCharacterTransferSupport(badChecksum, reparse(file, badChecksum)).reason, /checksum/i);

    const badSize = Buffer.from(original);
    badSize.writeUInt32LE(original.length + 1, 8);
    badSize.writeUInt32LE(referenceChecksum(badSize), 12);
    assert.equal(inspectCharacterTransferSupport(badSize, save).supported, false);
    assert.throws(() => removeCharacterItem(badSize, save, { itemIndex: 0 }));
    assert.match(inspectCharacterTransferSupport(badSize, reparse(file, badSize)).reason, /declared size/i);

    const truncated = original.subarray(0, original.length - 1);
    assert.equal(inspectCharacterTransferSupport(truncated, save).supported, false);
    assert.throws(() => removeCharacterItem(truncated, save, { itemIndex: 0 }));

    const ambiguous = structuredClone(save);
    ambiguous.items[0].nextOffset += 1;
    assert.equal(inspectCharacterTransferSupport(original, ambiguous).supported, false);
    assert.throws(() => extractCharacterItem(original, ambiguous, { itemIndex: 0 }));

    const ambiguousLast = structuredClone(save);
    ambiguousLast.items.at(-1).nextOffset += 1;
    assert.equal(inspectCharacterTransferSupport(original, ambiguousLast).supported, false);
    assert.throws(() => extractCharacterItem(original, ambiguousLast, { itemIndex: 0 }));
  });
});

test('character names and header marker decoys cannot select a false primary item list', () => {
  withCharacter(BLANK, ({ file, original, save }) => {
    const renamed = Buffer.from(original);
    renamed.fill(0, 20, 36);
    renamed.write('ifJMHero', 20, 'ascii');
    const changed = repairHeader(renamed);
    const after = reparse(file, changed);
    assert.equal(after.name, 'ifJMHero');
    assert.equal(after.skillsBlockOffset, save.skillsBlockOffset);
    assert.equal(after.itemListOffset, save.itemListOffset);
    assert.equal(after.itemCount, save.itemCount);
    assert.equal(inspectCharacterTransferSupport(changed, after).supported, true);
    const extracted = extractCharacterItem(changed, after, { itemIndex: 0 });
    assert.deepEqual(extracted.bytes, extractCharacterItem(original, save, { itemIndex: 0 }).bytes);
    const forged = Buffer.from(changed);
    forged.write('xx', after.skillsBlockOffset, 'ascii');
    repairHeader(forged);
    assert.throws(() => reparse(file, forged), /statistics or skills boundary.*invalid|truncated/i);
    const stale = { ...after, sourceSha256: sha256(forged) };
    assert.match(inspectCharacterTransferSupport(forged, stale).reason, /skills boundary/i);
  });
});

test('every character transfer entry point honors explicitly selected decoding tables', () => {
  withCharacter(BLANK, ({ original, save }) => {
    const tables = loadPd2Tables();
    const firstStat = (original[767] | (original[768] << 8)) & 511;
    const customStats = new Map(tables.itemStatsById);
    customStats.set(firstStat, { ...customStats.get(firstStat), csvBits: 0 });
    const incompatible = { ...tables, itemStatsById: customStats };
    const itemBytes = extractCharacterItem(original, save, { itemIndex: 0 }).bytes;
    assert.equal(inspectCharacterTransferSupport(original, save).supported, true);
    assert.match(inspectCharacterTransferSupport(original, save, { pd2Tables: incompatible }).reason, /skills boundary/i);
    assert.throws(() => extractCharacterItem(original, save,
      { itemIndex: 0, pd2Tables: incompatible }), /skills boundary/i);
    assert.throws(() => removeCharacterItem(original, save,
      { itemIndex: 0, pd2Tables: incompatible }), /skills boundary/i);
    assert.throws(() => insertCharacterItem(original, save,
      { itemBytes, panel: 'inventory', column: 4, row: 0, pd2Tables: incompatible }), /skills boundary/i);
  });
});

test('real ear records are preserved, block their occupied cells, and cannot themselves be transferred', () => {
  const blankBytes = fs.readFileSync(BLANK);
  const tomeBytes = extractCharacterItem(blankBytes, parseCharacterFile(BLANK), { itemIndex: 0 }).bytes;
  for (const [className, name] of [
    ['necromancer', 'summoner-skele2'], ['sorceress', 'combustion3'],
    ['sorceress', 'frost-nova'], ['sorceress', 'zeal-enchanter']
  ]) {
    withCharacter(path.join(LIBRARY, 'Showcase Characters', className, name + '.d2s'),
      ({ file, original, save }) => {
        const earIndex = save.topLevelItems.findIndex(item => item.isEar);
        assert.ok(earIndex >= 0);
        const ear = save.topLevelItems[earIndex];
        assert.equal(ear.panel, 5);
        assert.equal(inspectCharacterTransferSupport(original, save).supported, true);
        assert.throws(() => extractCharacterItem(original, save, { itemIndex: earIndex }), /unsupported/i);
        assert.throws(() => insertCharacterItem(original, save, {
          itemBytes: tomeBytes, panel: 'stash', column: ear.column, row: ear.row
        }), /occupied/i);
        const selectedIndex = save.topLevelItems.findIndex(item =>
          item.location === 0 && [1, 4, 5].includes(item.panel) && !item.isEar &&
          !item.parseRecovery && item.code !== 'box');
        assert.ok(selectedIndex >= 0);
        const changed = removeCharacterItem(original, save, { itemIndex: selectedIndex });
        const after = reparse(file, changed.buffer);
        assertValidHeader(changed.buffer);
        assert.equal(inspectCharacterTransferSupport(changed.buffer, after).supported, true);
        const restoredIndex = after.topLevelItems.findIndex(item => item.isEar);
        const restoredEar = after.topLevelItems[restoredIndex];
        const beforeEnd = save.topLevelItems[earIndex + 1]?.byteOffset ?? save.itemRegion.endOffset;
        const afterEnd = after.topLevelItems[restoredIndex + 1]?.byteOffset ?? after.itemRegion.endOffset;
        assert.deepEqual(changed.buffer.subarray(restoredEar.byteOffset, afterEnd),
          original.subarray(ear.byteOffset, beforeEnd));
      });
  }
});

test('real nonempty golem and mercenary trees are preserved exactly during primary edits', () => {
  for (const [className, name] of [['necromancer', 'explosn-poison'], ['paladin', 'return-damage']]) {
    withCharacter(path.join(LIBRARY, 'Showcase Characters', className, name + '.d2s'),
      ({ file, original, save }) => {
        assert.equal(save.characterSections.golem.present, true);
        assert.ok(save.characterSections.golem.itemRegion.length > 0);
        assert.equal(inspectCharacterTransferSupport(original, save).supported, true);
        const index = save.topLevelItems.findIndex((item) =>
          item.location === 0 && [1, 4, 5].includes(item.panel) && item.code !== 'box' && !item.parseRecovery);
        assert.ok(index >= 0);
        const changed = removeCharacterItem(original, save, { itemIndex: index });
        const after = reparse(file, changed.buffer);
        assertValidHeader(changed.buffer);
        assert.equal(inspectCharacterTransferSupport(changed.buffer, after).supported, true);
        assert.deepEqual(changed.buffer.subarray(after.itemRegion.endOffset),
          original.subarray(save.itemRegion.endOffset));
        const truncated = repairHeader(Buffer.from(original.subarray(0, original.length - 1)));
        assert.equal(inspectCharacterTransferSupport(truncated, reparse(file, truncated)).supported, false);
      });
  }
});

test('equipped and historical-profile items are refused for extraction', () => {
  withCharacter(SHOWCASE, ({ original, save }) => {
    const equipped = save.topLevelItems.findIndex((item) => item.location === 1);
    assert.ok(equipped >= 0);
    assert.throws(() => extractCharacterItem(original, save, { itemIndex: equipped }),
      /stored inventory|equip|location|unsupported/i);
  });
  withCharacter(HISTORICAL, ({ original, save }) => {
    const historical = save.topLevelItems.findIndex((item) =>
      item.parseRecovery && item.location === 0 && item.panel === 5);
    assert.ok(historical >= 0, 'historical fixture must exercise a supported stored panel');
    assert.throws(() => extractCharacterItem(original, save, { itemIndex: historical }),
      /historical|profile|unsupported/i);
  });
});

test('cube presence, empty removal, cube contents, duplicate cubes, and cube self-placement are guarded', () => {
  withCharacter(BLANK, ({ file, original, save }) => {
    const cubeIndex = save.topLevelItems.findIndex((item) => item.code === 'box');
    const cube = extractCharacterItem(original, save, { itemIndex: cubeIndex });
    const tome = extractCharacterItem(original, save, { itemIndex: 0 });
    assert.throws(() => insertCharacterItem(original, save, {
      itemBytes: cube.bytes, panel: 'stash', column: 0, row: 0
    }), /already.*cube|duplicate/i);
    assert.throws(() => insertCharacterItem(original, save, {
      itemBytes: cube.bytes, panel: 'cube', column: 0, row: 0
    }), /cube/i);
    const withoutCube = removeCharacterItem(original, save, { itemIndex: cubeIndex });
    const noCube = reparse(file, withoutCube.buffer);
    assert.equal(noCube.topLevelItems.some((item) => item.code === 'box'), false);
    assert.throws(() => insertCharacterItem(withoutCube.buffer, noCube, {
      itemBytes: cube.bytes, panel: 'cube', column: 0, row: 0
    }), /cube/i);
    const filled = insertCharacterItem(original, save, {
      itemBytes: tome.bytes, panel: 'cube', column: 3, row: 2
    });
    const filledSave = reparse(file, filled.buffer);
    assert.ok(filledSave.topLevelItems.some((item) => item.panel === 4 && item.column === 3 && item.row === 2));
    assert.throws(() => extractCharacterItem(filled.buffer, filledSave, { itemIndex: cubeIndex }),
      /cube.*contain/i);
    assert.throws(() => insertCharacterItem(original, save, {
      itemBytes: tome.bytes, panel: 'cube', column: 3, row: 3
    }), /fit|bound/i);
  });
});

test('checksum-valid damaged or forged following sections remain transfer-blocked', () => {
  withCharacter(BLANK, ({ file, original, save }) => {
    const forged = structuredClone(save);
    forged.characterSections.golem.markerOffset -= 1;
    assert.equal(inspectCharacterTransferSupport(original, forged).supported, false);
    for (const [offset, value] of [
      [save.itemRegion.endOffset + 2, 1], // Nonempty corpse declaration.
      [save.characterSections.mercenary.markerOffset, 0],
      [save.characterSections.golem.markerOffset, 0],
      [save.characterSections.golem.markerOffset + 2, 1] // Golem declared without its item.
    ]) {
      const bytes = Buffer.from(original);
      bytes[offset] = value;
      repairHeader(bytes);
      assertValidHeader(bytes);
      const parsed = reparse(file, bytes);
      assert.equal(inspectCharacterTransferSupport(bytes, parsed).supported, false);
      assert.throws(() => removeCharacterItem(bytes, parsed, { itemIndex: 0 }));
    }
    const truncated = repairHeader(Buffer.from(original.subarray(0, original.length - 1)));
    assertValidHeader(truncated);
    assert.equal(inspectCharacterTransferSupport(truncated, reparse(file, truncated)).supported, false);
  });
});

test('all real panel-six records are mixed gear and remain byte-identical during supported removal', () => {
  const relativeFiles = [
    ['amazon', 'cold_arrow'], ['assassin', 'dragon_tailc'], ['assassin', 'whirlwindb'],
    ['barbarian', 'leap_attackb'], ['barbarian', 'war_cryb'], ['druid', 'fury_rathma'],
    ['necromancer', 'golems'], ['paladin', 'holy_bolt'], ['sorceress', 'frost_novad'],
    ['sorceress', 'multishot']
  ];
  let count = 0;
  let hasNonCharm = false;
  for (const [className, name] of relativeFiles) {
    withCharacter(path.join(LIBRARY, 'Showcase Characters', className, name + '.d2s'),
      ({ file, original, save }) => {
        const panelSix = save.topLevelItems.filter((item) => item.location === 0 && item.panel === 6);
        count += panelSix.length;
        hasNonCharm ||= panelSix.some((item) => !['cm1', 'cm2', 'cm3'].includes(item.code));
        for (const item of panelSix) {
          assert.ok(item.column + item.invWidth <= 10 && item.row + item.invHeight <= 15);
        }
        const index = save.topLevelItems.findIndex((item) =>
          item.location === 0 && [1, 4, 5].includes(item.panel) && !item.parseRecovery && item.code !== 'box');
        assert.ok(index >= 0);
        assert.throws(() => extractCharacterItem(original, save, {
          itemIndex: save.topLevelItems.indexOf(panelSix[0])
        }), /stored inventory|unsupported.*location/i);
        const changed = removeCharacterItem(original, save, { itemIndex: index });
        const after = reparse(file, changed.buffer);
        const remaining = after.topLevelItems.filter((item) => item.location === 0 && item.panel === 6);
        assert.equal(remaining.length, panelSix.length);
        for (let index = 0; index < panelSix.length; index += 1) {
          const beforeItem = panelSix[index];
          const afterItem = remaining[index];
          const beforeEnd = save.topLevelItems[save.topLevelItems.indexOf(beforeItem) + 1]?.byteOffset ?? save.itemRegion.endOffset;
          const afterEnd = after.topLevelItems[after.topLevelItems.indexOf(afterItem) + 1]?.byteOffset ?? after.itemRegion.endOffset;
          assert.deepEqual(changed.buffer.subarray(afterItem.byteOffset, afterEnd),
            original.subarray(beforeItem.byteOffset, beforeEnd));
        }
      });
  }
  assert.equal(count, 482);
  assert.equal(hasNonCharm, true);
});
