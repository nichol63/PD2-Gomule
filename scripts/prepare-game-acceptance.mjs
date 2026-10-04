import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareGameAcceptance } from '../src/lib/game-acceptance.mjs';
import { loadPd2Tables } from '../src/lib/pd2-data.mjs';

const HELP = `Usage: node scripts/prepare-game-acceptance.mjs --output <new-directory> [--fixtures <library>] [--tables <directory>]\n\nPrepare independent disposable tome and socketed acceptance cases.\nStatus: prepared; in-game acceptance pending\n`;

export function main(args = process.argv.slice(2)) {
  let help = false;
  const options = {};
  const keys = new Map([['--output', 'outputDir'], ['--fixtures', 'fixtureDir'], ['--tables', 'tablesDir']]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help') { help = true; continue; }
    if (!keys.has(flag)) throw new Error(`Unknown option: ${flag}`);
    const key = keys.get(flag);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate option: ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[key] = value;
    index += 1;
  }
  if (help) { console.log(HELP); return; }
  if (!options.outputDir) throw new Error('Output directory is required (--output)');
  if (options.tablesDir) options.pd2Tables = loadPd2Tables(options.tablesDir);
  const manifest = prepareGameAcceptance(options);
  console.log(`Output: ${path.resolve(options.outputDir)}`);
  console.log(manifest.status);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
