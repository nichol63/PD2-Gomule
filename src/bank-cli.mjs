import { filterBankItems } from './lib/bank-search.mjs';
import { sortBankItems } from './lib/bank-sort.mjs';

const VALUE_OPTIONS = new Set(['bank', 'source', 'destination', 'page', 'panel', 'item', 'item-id', 'column', 'row', 'query', 'sort']);
const ACTIONS = new Set(['list', 'deposit', 'withdraw', 'recover']);
const ALLOWED_OPTIONS = {
  list: new Set(['bank', 'query', 'sort']),
  deposit: new Set(['bank', 'source', 'page', 'item', 'experimental-write', 'dry-run']),
  withdraw: new Set(['bank', 'destination', 'page', 'panel', 'item-id', 'column', 'row', 'experimental-write', 'dry-run']),
  recover: new Set(['bank', 'source', 'experimental-write', 'dry-run'])
};

function required(options, name) {
  if (!options[name]) throw new Error(`Bank command requires --${name}.`);
  return options[name];
}

function integer(options, name, minimum) {
  const value = required(options, name);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) {
    throw new Error(`--${name} must be an integer of ${minimum} or greater.`);
  }
  return Number(value);
}

export function parseBankArguments(args) {
  const action = args[0];
  if (!ACTIONS.has(action)) throw new Error('Bank command must be list, deposit, withdraw, or recover.');
  const options = {};
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected bank argument: ${argument}`);
    const name = argument.slice(2);
    if (!ALLOWED_OPTIONS[action].has(name)) throw new Error(`Unknown option for bank ${action}: ${argument}`);
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate bank option: ${argument}`);
    if (VALUE_OPTIONS.has(name)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}.`);
      options[name] = value;
    } else {
      options[name] = true;
    }
  }
  const request = { bankPath: required(options, 'bank'), dryRun: options['dry-run'] === true || options['experimental-write'] !== true };
  if (action === 'deposit') {
    request.sourcePath = required(options, 'source');
    if (options.page !== undefined) request.pageIndex = integer(options, 'page', 1) - 1;
    request.itemIndex = integer(options, 'item', 1) - 1;
  }
  if (action === 'withdraw') {
    request.destinationPath = required(options, 'destination');
    request.itemId = required(options, 'item-id');
    if (options.page !== undefined) request.pageIndex = integer(options, 'page', 1) - 1;
    if (options.panel !== undefined) {
      if (!['inventory', 'cube', 'stash'].includes(options.panel)) throw new Error('--panel must be inventory, cube, or stash.');
      request.panel = options.panel;
    }
    request.column = integer(options, 'column', 0);
    request.row = integer(options, 'row', 0);
  }
  if (action === 'recover' && options.source !== undefined) request.sourcePath = options.source;
  const sort = options.sort ?? 'stored';
  if (!['stored', 'name', 'source'].includes(sort)) throw new Error(`Unknown bank sort: ${sort}`);
  return { action, request, query: options.query ?? '', sort };
}

export async function runBankCli(args, pd2Tables) {
  const { action, request, query, sort } = parseBankArguments(args);
  const bank = await import('./lib/item-bank.mjs');
  let result;
  if (action === 'list') {
    result = bank.listBank(request.bankPath);
    result = { ...result, items: sortBankItems(filterBankItems(result.items, query), sort) };
  } else if (action === 'deposit') {
    result = bank.depositItem({ ...request, pd2Tables });
  } else if (action === 'withdraw') {
    result = bank.withdrawItem({ ...request, pd2Tables });
  } else {
    result = bank.recoverBank(request);
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}
