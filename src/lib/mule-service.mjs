import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { depositItem, withdrawItem, listBank, recoverBank, inspectBankItem } from './item-bank.mjs';
import { buildBankItemDetails } from './bank-detail-model.mjs';
import { collectBrowseEntries } from './browser-index.mjs';
import { getItemKey, loadInspectorWorkspace } from './inspector-model.mjs';
import { sha256 } from './safe-serialization.mjs';

const fileHash = file => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;

function readPinnedJson(file, expectedHash) {
  const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if ((bytes === null ? null : sha256(bytes)) !== expectedHash) {
    throw new Error('Recovery metadata changed during preview. Refresh and preview again.');
  }
  return bytes === null ? null : JSON.parse(bytes.toString('utf8'));
}

function firstSpace(save, input, item, tables) {
  const containers = { inventory: { panel: 1, columns: 10, rows: 8 }, cube: { panel: 4, columns: 4, rows: 4 }, stash: { panel: 5, columns: 10, rows: 15 } };
  const grid = save.pages ? containers.stash : containers[input.panel];
  if (!grid) throw new Error('Choose a destination container.');
  const width = item.invWidth;
  const height = item.invHeight;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('This older bank entry has no item dimensions. Turn off automatic placement and choose a position.');
  }
  const existing = (save.pages ? save.pages[input.pageIndex].topLevelItems : save.topLevelItems)
    .filter(root => root.location === 0 && root.panel === grid.panel)
    .map(root => {
      const definition = root.itemInfo ?? tables.resolveItemCode(root.code);
      return { ...root, invWidth: root.invWidth ?? definition?.invWidth, invHeight: root.invHeight ?? definition?.invHeight };
    });
  for (let row = 0; row <= grid.rows - height; row += 1) {
    for (let column = 0; column <= grid.columns - width; column += 1) {
      if (existing.every(root => column + width <= root.column || column >= root.column + root.invWidth
        || row + height <= root.row || row >= root.row + root.invHeight)) return { column, row };
    }
  }
  throw new Error('This container has no space for the selected item.');
}

// Requests select only sources loaded at startup. Paths never come from the browser.
export function createMuleService(workspace, options = {}) {
  const bankPath = options.bankPath ? path.resolve(options.bankPath) : null;
  const enabled = Boolean(bankPath && options.experimentalWrite);
  const sessionToken = randomUUID();
  const previews = new Map();
  const sourcePaths = workspace.sources.map(source => source.summary.filePath);
  if (options.experimentalWrite && !bankPath) throw new Error('Transfer mode requires --bank <bank.json>.');
  if (bankPath && sourcePaths.some(file => path.resolve(file).toLowerCase() === bankPath.toLowerCase())) {
    throw new Error('The bank must be separate from loaded save files.');
  }

  function refresh() {
    const current = loadInspectorWorkspace(sourcePaths, { pd2Tables: workspace.pd2Tables });
    Object.assign(workspace, current);
    previews.clear();
    return status();
  }

  function status() {
    let bank = { revision: 0, items: [] };
    let error = null;
    if (bankPath) {
      try { bank = listBank(bankPath); } catch (cause) { error = cause.message; }
    }
    return { configured: Boolean(bankPath), enabled, sessionToken,
      bankName: bankPath ? path.basename(bankPath) : null, bank, error };
  }

  function source(id) {
    const found = workspace.sources.find(entry => entry.id === id);
    if (!found) throw new Error('Choose a loaded character or stash file.');
    if (fileHash(found.summary.filePath) !== found.summary.sourceSha256) {
      throw new Error('The save changed. Refresh the library and select the item again.');
    }
    return found;
  }

  function preview(input) {
    if (!bankPath) throw new Error('Launch with --bank <bank.json> to use an item bank.');
    const action = input.action;
    const fileHashes = [bankPath, bankPath + '.journal.json', bankPath + '.lock'].map(file => [file, fileHash(file)]);
    let request = { bankPath, pd2Tables: workspace.pd2Tables, dryRun: true, expectedBankSha256: fileHashes[0][1] };
    let savePath = null;
    let label;
    if (action === 'recover') {
      label = 'Recover interrupted transfer';
      if (input.sourceId !== undefined) {
        const selected = source(input.sourceId);
        request.sourcePath = selected.summary.filePath;
        request.expectedSourceSha256 = selected.summary.sourceSha256;
      }
    } else if (action === 'deposit') {
      const selected = source(input.sourceId);
      const entry = collectBrowseEntries(selected.summary).find(entry => getItemKey(entry) === input.itemKey);
      if (!entry) throw new Error('The selected item is no longer in this source. Refresh and select it again.');
      savePath = selected.summary.filePath;
      request = { ...request, sourcePath: savePath, expectedSourceSha256: selected.summary.sourceSha256,
        ...(selected.summary.pages ? { pageIndex: entry.pageIndex } : {}), itemIndex: entry.itemIndex };
      label = `Deposit ${entry.displayName} from ${path.basename(savePath)}`;
    } else if (action === 'withdraw') {
      const selected = source(input.sourceId);
      savePath = selected.summary.filePath;
      if (typeof input.itemId !== 'string') throw new Error('Choose a bank item.');
      for (const field of ['column', 'row']) {
        if (!Number.isInteger(input[field]) || input[field] < 0 || input[field] > 15) throw new Error(`Invalid ${field}.`);
      }
      if (selected.summary.pages && (!Number.isInteger(input.pageIndex) || !selected.summary.pages[input.pageIndex])) throw new Error('Choose a destination page.');
      request = { ...request, destinationPath: savePath, pageIndex: input.pageIndex, itemId: input.itemId,
        column: input.column, row: input.row, panel: input.panel, expectedSourceSha256: selected.summary.sourceSha256 };
      const item = listBank(bankPath, { expectedBankSha256: request.expectedBankSha256 }).items.find(item => item.id === input.itemId);
      if (!item) throw new Error('Bank item not found.');
      if (input.autoPlace === true) request = { ...request, ...firstSpace(selected.summary, input, item, workspace.pd2Tables) };
      label = `Withdraw ${item.displayName ?? item.baseName ?? item.code} to ${path.basename(savePath)}`;
    } else {
      throw new Error('Unknown transfer action.');
    }
    if (savePath) fileHashes.push([savePath, request.expectedSourceSha256], [savePath + '.pd2-mule.lock', fileHash(savePath + '.pd2-mule.lock')]);
    if (action === 'recover') {
      const journalFile = bankPath + '.journal.json';
      const journal = readPinnedJson(journalFile, fileHashes[1][1]);
      const lockFile = bankPath + '.lock';
      const lock = readPinnedJson(lockFile, fileHashes[2][1]);
      const recoverySave = journal?.entries?.[0]?.path ?? lock?.stashPath ?? request.sourcePath;
      request.expectedBankLockSha256 = fileHashes[2][1];
      request.expectedSourceLockSha256 = null;
      if (recoverySave) {
        if (!sourcePaths.some(file => path.resolve(file).toLowerCase() === path.resolve(recoverySave).toLowerCase())) {
          throw new Error('Load the interrupted transaction save in this app before recovering it.');
        }
        request.expectedSourceLockSha256 = fileHash(recoverySave + '.pd2-mule.lock');
        fileHashes.push([recoverySave, fileHash(recoverySave)], [recoverySave + '.pd2-mule.lock', request.expectedSourceLockSha256]);
      }
      for (const [index, entry] of (journal?.entries ?? []).entries()) {
        if (!entry.backupPath) continue;
        if (!/^[0-9a-f-]{36}$/i.test(journal.transactionId)) throw new Error('Invalid recovery transaction.');
        const expectedPath = path.join(bankPath + '.transactions', journal.transactionId, index === 0 ? 'stash.before' : 'bank.before');
        if (entry.backupPath !== expectedPath) throw new Error('Invalid recovery backup.');
        fileHashes.push([entry.backupPath, entry.beforeSha256]);
      }
      request.expectedJournalSha256 = fileHashes[1][1];
      const metadataLocks = new Set([bankPath + '.lock', ...(recoverySave ? [recoverySave + '.pd2-mule.lock'] : [])]);
      request.expectedRecoveryFileHashes = fileHashes.filter(([file]) => file !== journalFile && !metadataLocks.has(file));
    }
    const run = action === 'deposit' ? depositItem : action === 'withdraw' ? withdrawItem : recoverBank;
    if (fileHashes.some(([file, hash]) => fileHash(file) !== hash)) throw new Error('The bank or save changed during preview. Refresh and preview again.');
    const result = run(request);
    if (fileHashes.some(([file, hash]) => fileHash(file) !== hash)) throw new Error('The bank or save changed during preview. Refresh and preview again.');
    // Keep bounded, short-lived plans. Commit receives only this opaque ticket.
    for (const [id, plan] of previews) if (plan.expires < Date.now()) previews.delete(id);
    if (previews.size >= 32) previews.delete(previews.keys().next().value);
    const ticket = randomUUID();
    previews.set(ticket, { action, request, run, fileHashes, expires: Date.now() + 300000 });
    return { ticket, label, result, placement: action === 'withdraw' ? { column: request.column, row: request.row } : null, canCommit: enabled };
  }

  function commit(ticket) {
    if (!enabled) throw new Error('Transfers are disabled. Launch with --experimental-write to commit moves on disposable copies.');
    const plan = previews.get(ticket);
    previews.delete(ticket);
    if (!plan || plan.expires < Date.now()) throw new Error('This preview expired. Preview the transfer again.');
    if (plan.fileHashes.some(([file, hash]) => fileHash(file) !== hash)) {
      throw new Error('The bank or save changed after preview. Refresh and preview again.');
    }
    const result = plan.run({ ...plan.request, dryRun: false });
    refresh();
    return result;
  }

  function itemDetails(itemId) {
    if (!bankPath) throw new Error('No bank is configured. Start with --bank <bank.json>.');
    return buildBankItemDetails(inspectBankItem(bankPath, itemId, { pd2Tables: workspace.pd2Tables }), workspace.pd2Tables);
  }

  return { status, preview, commit, refresh, itemDetails, sessionToken };
}
