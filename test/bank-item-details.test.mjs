import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';
import { depositItem, inspectBankItem } from '../src/lib/item-bank.mjs';
import { inspectSaveFile } from '../src/lib/save-parsers.mjs';
import { parseLegacyItemList } from '../src/lib/legacy-item-parser.mjs';
import { startInspectorServer } from '../src/lib/inspector-server.mjs';
import { getDefaultPd2DataDir, getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = getFixtureLibraryDir(), TABLE_DIR = getDefaultPd2DataDir();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtureNames = ['Bases.d2x', 'Showcase Characters/amazon/freezing-arrow.d2s', 'Blank Characters/Level 30s/Amazon.d2s'];
const fixtureHashes = () => fixtureNames.map(name => [name, hash(fs.readFileSync(path.join(FIXTURES, name)))]);
const canonicalHashes = fixtureHashes();
let directory, tablesDir, bankPath, sourcePath, tables, ids, originalBank, buildBankItemDetails;

function snapshot(root) {
  const stat = fs.statSync(root);
  const own = [root, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs];
  if (!stat.isDirectory()) own.push(hash(fs.readFileSync(root)));
  return [own, ...(stat.isDirectory() ? fs.readdirSync(root).sort().flatMap(name => snapshot(path.join(root, name))) : [])];
}
const canonicalTables = snapshot(TABLE_DIR);

before(async () => {
  ({ buildBankItemDetails } = await import('../src/lib/bank-detail-model.mjs'));
  directory = fs.mkdtempSync(path.join(REPO, '.bank-details-test-'));
  tablesDir = path.join(directory, 'tables'); fs.cpSync(TABLE_DIR, tablesDir, { recursive: true });
  tables = loadPd2Tables(tablesDir);
  bankPath = path.join(directory, 'bank.json');
  sourcePath = path.join(directory, 'Bases.d2x'); fs.copyFileSync(path.join(FIXTURES, 'Bases.d2x'), sourcePath);
  const first = inspectSaveFile(sourcePath, { pd2Tables: tables }).pages[12].topLevelItems;
  assert.equal(first[15].fingerprint, 491820749);
  assert.equal(first[12].fingerprint, 2598800324);
  ids = {
    wolf: depositItem({ bankPath, sourcePath, pageIndex: 12, itemIndex: 15, dryRun: false, pd2Tables: tables }).itemId,
    hunger: depositItem({ bankPath, sourcePath, pageIndex: 12, itemIndex: 12, dryRun: false, pd2Tables: tables }).itemId
  };
  for (const [key, name, fingerprint] of [['bow', fixtureNames[1], 70879556], ['tome', fixtureNames[2], 28610618]]) {
    const copy = path.join(directory, path.basename(name)); fs.copyFileSync(path.join(FIXTURES, name), copy);
    const save = inspectSaveFile(copy, { pd2Tables: tables });
    const itemIndex = save.topLevelItems.findIndex(item => item.fingerprint === fingerprint);
    assert.ok(itemIndex >= 0);
    ids[key] = depositItem({ bankPath, sourcePath: copy, itemIndex, dryRun: false, pd2Tables: tables }).itemId;
  }
  originalBank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
});

after(() => {
  try {
    assert.deepEqual(fixtureHashes(), canonicalHashes);
    assert.deepEqual(snapshot(TABLE_DIR), canonicalTables);
  } finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }); }
});

function readOnly(run) {
  const beforeDirectory = snapshot(directory);
  const mutators = ['mkdtempSync', 'mkdirSync', 'writeFileSync', 'renameSync', 'unlinkSync', 'rmSync'];
  const originals = new Map(mutators.map(name => [name, fs[name]]));
  for (const name of mutators) fs[name] = () => { throw new Error(`Details must not call ${name}`); };
  try { return run(); }
  finally {
    for (const [name, method] of originals) fs[name] = method;
    assert.deepEqual(snapshot(directory), beforeDirectory, 'read-only details must preserve file hashes and directory metadata');
    assert.deepEqual(fixtureHashes(), canonicalHashes);
  }
}

const inspect = (id, file = bankPath, active = tables) => readOnly(() => inspectBankItem(file, id, { pd2Tables: active }));
const lines = detail => detail.propertyLists.flatMap(list => list.displayLines.map(line => line.text));

test('real bank Wolf Heads expose different decoded properties without leaking stored bytes', () => {
  for (const [id, fingerprint, expected, forbidden] of [
    [ids.wolf, 491820749, ['+2 to Oak Sage', '+2 to Summon Spirit Wolf'], '+2 to Hunger'],
    [ids.hunger, 2598800324, ['+2 to Hunger'], '+2 to Oak Sage']
  ]) {
    const inspection = inspect(id), detail = buildBankItemDetails(inspection, tables);
    assert.equal(inspection.metadata.id, id);
    assert.ok(!Object.hasOwn(inspection.metadata, 'bytesBase64'));
    assert.equal(inspection.item.fingerprint, fingerprint);
    assert.equal(detail.itemId, id);
    assert.equal(detail.code, 'dr1');
    assert.equal(detail.displayName, 'Wolf Head');
    for (const text of expected) assert.ok(lines(detail).includes(text), text);
    assert.ok(!lines(detail).includes(forbidden));
    assert.deepEqual(detail.source, inspection.metadata.source);
    assert.equal(detail.depositedAt, inspection.metadata.depositedAt);
    assert.ok(!JSON.stringify(detail).includes('bytesBase64'));
  }
});

test('socketed Edge and the twenty-scroll tome retain their decoded detail fields', () => {
  const bowInspection = inspect(ids.bow), bow = buildBankItemDetails(bowInspection, tables);
  assert.equal(bowInspection.item.fingerprint, 70879556);
  assert.equal(bow.displayName, 'Edge');
  assert.equal(bow.baseName, 'Grand Matron Bow');
  assert.equal(bow.code, 'amc');
  assert.equal(bow.dimensions, '2 x 4');
  assert.equal(bow.socketsFilled, 3);
  assert.equal(bow.totalSockets, 3);
  assert.ok(bow.flags.includes('Runeword'));
  assert.deepEqual(bow.children.map(child => child.code), ['r03', 'r07', 'r11']);
  assert.deepEqual(bow.children.map(child => child.displayName), ['Tir Rune', 'Tal Rune', 'Amn Rune']);
  assert.deepEqual(bow.children.map(child => child.propertyLists), [[], [], []],
    'simple rune records have names but encode no property lists');
  assert.ok(lines(bow).length > 0);
  const tome = buildBankItemDetails(inspect(ids.tome), tables);
  assert.equal(tome.code, 'tbk');
  assert.equal(tome.stackSize, 20);
  assert.equal(tome.dimensions, '1 x 2');
  assert.equal(tome.socketsFilled, 0);
  assert.deepEqual(tome.children, []);
});

function cloneBank(name, edit) {
  const bank = structuredClone(originalBank); edit(bank);
  const file = path.join(directory, name + '.json'); fs.writeFileSync(file, JSON.stringify(bank));
  return file;
}

test('item presentation comes from decoded bytes even when saved summary metadata is forged', () => {
  const file = cloneBank('forged-summary', bank => {
    const item = bank.items.find(item => item.id === ids.wolf);
    Object.assign(item, { displayName: 'Forged Bow', baseName: 'Forged Base', code: 'amc', quality: 'unique', invWidth: 9, invHeight: 9 });
  });
  const inspection = inspect(ids.wolf, file), detail = buildBankItemDetails(inspection, tables);
  assert.equal(detail.code, 'dr1');
  assert.equal(detail.displayName, 'Wolf Head');
  assert.equal(detail.baseName, 'Wolf Head');
  assert.equal(detail.qualityLabel, 'normal');
  assert.equal(detail.dimensions, '2 x 2');
  assert.ok(lines(detail).includes('+2 to Oak Sage'));
});

test('rehashed malformed tree payloads cannot bypass strict root, node, profile, and partition checks', () => {
  const bow = originalBank.items.find(item => item.id === ids.bow), wolf = originalBank.items.find(item => item.id === ids.wolf);
  const original = Buffer.from(bow.bytesBase64, 'base64');
  const decoded = inspect(ids.bow).item;
  const childOffset = decoded.children[0].byteOffset;
  const lastChildOffset = decoded.children.at(-1).byteOffset;
  const changes = [
    ['truncated', bytes => bytes.subarray(0, bytes.length - 1)],
    ['trailing-gap', bytes => Buffer.concat([bytes, Buffer.from([0])])],
    ['leading-gap', bytes => Buffer.concat([Buffer.from([0]), bytes])],
    ['extra-root', bytes => Buffer.concat([bytes, Buffer.from(wolf.bytesBase64, 'base64')])],
    ['missing-child', bytes => bytes.subarray(0, lastChildOffset)],
    ['child-before-root', bytes => Buffer.concat([bytes.subarray(childOffset), bytes.subarray(0, childOffset)])],
    ['unsupported-version', bytes => { bytes[6] = 99; return bytes; }]
  ];
  for (const [name, mutate] of changes) {
    const file = cloneBank(name, bank => {
      const entry = bank.items.find(item => item.id === ids.bow), bytes = mutate(Buffer.from(original));
      entry.bytesBase64 = bytes.toString('base64'); entry.sha256 = hash(bytes);
      if (name === 'extra-root') entry.nodeCount = 5;
    });
    assert.throws(() => inspect(ids.bow, file), /item|tree|node|root|boundary|partition|profile|version|span|bytes/i, name);
  }
  const wrongCount = cloneBank('wrong-node-count', bank => { bank.items.find(item => item.id === ids.bow).nodeCount = 3; });
  assert.throws(() => inspect(ids.bow, wrongCount), /node|tree|count|item/i);
});

test('invalid banks, checksums, profiles, missing IDs, and pending recovery are refused without writes', () => {
  for (const [name, edit] of [
    ['schema', bank => { bank.schemaVersion = 2; }],
    ['checksum', bank => { bank.items[0].sha256 = '0'.repeat(64); }],
    ['base64', bank => { bank.items[0].bytesBase64 += '!'; }],
    ['profile', bank => { bank.items[0].tableFingerprint = '0'.repeat(64); }],
    ['duplicate-id', bank => { bank.items[1].id = bank.items[0].id; }]
  ]) {
    const file = cloneBank('invalid-' + name, edit);
    assert.throws(() => inspect(ids.wolf, file), /bank|checksum|profile|provenance|item/i, name);
  }
  for (const id of [undefined, '', 'unknown']) assert.throws(() => inspect(id), /item|choose|required|found/i);
  assert.throws(() => inspect(ids.wolf, path.join(directory, 'missing-bank.json')), /bank|item|found|exist/i);
  fs.writeFileSync(bankPath + '.journal.json', '{}');
  try { assert.throws(() => inspect(ids.wolf), /interrupted|recover|pending/i); }
  finally { fs.unlinkSync(bankPath + '.journal.json'); }
  fs.writeFileSync(bankPath + '.lock', '{}');
  try { assert.throws(() => inspect(ids.wolf), /locked/i); }
  finally { fs.unlinkSync(bankPath + '.lock'); }
});

test('a rehashed impossible declared socket capacity is refused even when the parser normalizes its display', () => {
  const decoded = inspect(ids.bow).item;
  assert.equal(decoded.quality, 3, 'the real Edge bow has superior quality');
  const offset = decoded.propertyLists[0].startBitOffset - 4;
  const file = cloneBank('impossible-socket-capacity', bank => {
    const entry = bank.items.find(item => item.id === ids.bow), bytes = Buffer.from(entry.bytesBase64, 'base64');
    for (let bit = 0; bit < 4; bit += 1) {
      const index = offset + bit, mask = 1 << (index & 7);
      bytes[index >>> 3] = (bytes[index >>> 3] & ~mask) | (((2 >>> bit) & 1) ? mask : 0);
    }
    const parsed = parseLegacyItemList(bytes, 0, 1, bytes.length, tables);
    assert.equal(parsed.topLevelItems[0].socketsFilled, 3);
    assert.equal(parsed.topLevelItems[0].totalSockets, 3, 'permissive presentation normalization masks the raw capacity');
    entry.bytesBase64 = bytes.toString('base64'); entry.sha256 = hash(bytes);
  });
  assert.throws(() => inspect(ids.bow, file), /Invalid bank item tree/i);
});

test('details reject stale core or identity definitions and a fresh incompatible table profile', () => {
  inspect(ids.bow); // Populate the real identity cache before optional mutation.
  for (const name of ['armor.txt', 'Runes.txt']) {
    const file = path.join(tablesDir, name), bytes = fs.readFileSync(file);
    fs.appendFileSync(file, '\n');
    try {
      assert.throws(() => inspect(ids.bow), /PD2.*tables.*reload/i);
      if (name === 'armor.txt') {
        const fresh = loadPd2Tables(tablesDir);
        assert.throws(() => inspect(ids.bow, bankPath, fresh), /profile|provenance/i);
      }
    } finally { fs.writeFileSync(file, bytes); }
  }
});

function request(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, response => {
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => { try { resolve({ status: response.statusCode, body: JSON.parse(body) }); } catch (error) { reject(error); } });
    }).on('error', reject);
  });
}

test('configured preview-only HTTP details use bank IDs and retain local host/origin guards', async () => {
  const { server, url } = await startInspectorServer([sourcePath], { bankPath, experimentalWrite: false, pd2Tables: tables,
    host: '127.0.0.1', port: 0 });
  const before = snapshot(directory);
  try {
    const status = await request(url + '/api/bank'); assert.equal(status.body.enabled, false);
    const route = url + '/api/bank/item?itemId=' + encodeURIComponent(ids.wolf);
    const response = await request(route + '&bankPath=/not-the-configured-bank&filePath=/not-a-save');
    assert.equal(response.status, 200);
    assert.equal(response.body.item.itemId, ids.wolf);
    assert.ok(lines(response.body.item).includes('+2 to Oak Sage'));
    assert.equal((await request(url + '/api/bank/item')).status, 400);
    assert.equal((await request(url + '/api/bank/item?itemId=unknown')).status, 400);
    assert.equal((await request(route, { Origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await request(route, { Host: 'elsewhere.example' })).status, 403);
    assert.equal((await request(route, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.deepEqual(snapshot(directory), before);
  }
});

test('unconfigured and missing-bank HTTP details cannot select an arbitrary browser-supplied bank', async () => {
  for (const options of [{}, { bankPath: path.join(directory, 'missing-http-bank.json') }]) {
    const { server, url } = await startInspectorServer([sourcePath], { ...options, pd2Tables: tables, host: '127.0.0.1', port: 0 });
    const before = snapshot(directory);
    try {
      const response = await request(url + '/api/bank/item?' + new URLSearchParams({ itemId: ids.wolf, bankPath }));
      assert.equal(response.status, 400);
      assert.match(response.body.error, /bank|item|launch|configure|found/i);
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      assert.deepEqual(snapshot(directory), before);
    }
  }
});
