import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGameAcceptance } from '../src/lib/game-acceptance-verification.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';

export function main(args = process.argv.slice(2)) {
  const options = {};
  let help = false;
  const flags = new Map([['--pack', 'packDir'], ['--results', 'resultsDir'], ['--tables', 'tablesDir']]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help') { help = true; continue; }
    if (!flags.has(flag)) throw new Error(`Unknown option: ${flag}`);
    const key = flags.get(flag);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[key] = value;
  }
  if (help) {
    console.log(JSON.stringify({ usage: 'node scripts/verify-game-acceptance.mjs --pack <directory> --results <directory> [--tables <directory>]',
      description: 'Read-only structural comparison of independent saved copies. In-game acceptance remains unverified.' }, null, 2));
    return;
  }
  if (!options.packDir || !options.resultsDir) throw new Error('Both --pack and --results directories are required');
  if (options.tablesDir) options.pd2Tables = loadPd2Tables(options.tablesDir);
  const report = verifyGameAcceptance(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.structuralPassed) process.exitCode = 1;
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
