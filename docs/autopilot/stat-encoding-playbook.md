# Stat Encoding Playbook

Use this before changing any formatter for a stat where `values.length >= 2`.

## Required Checks

1. Read `src/lib/legacy-item-parser.mjs` at `parseLegacyProperty`.
2. Record the exact bit widths used for each value slot.
3. Cross-check `gomule-d2r\gomule\src\gomule\item\D2Prop.java`, especially the `generateDisplay` switch on `descfunc`.
4. Run a fixture one-liner that prints raw `values` and formatted output for real items.
5. Only then add or change unit tests.

## Important Existing Contracts

- Skill-proc triplets such as `item_skillonhit`: `values = [level, skillId, chance]`.
- `item_skilloncast`: `values = [packedValue, chance]`, where `packedValue = (skillId << 6) | level`.
- `map_mon_skillondeath`: descFunc 15 packed formula, currently rendered as `Monsters N% Chance to Cast Level L SkillName on Death`.
- `item_elemskill_*`: use `values[1]` for the displayed bonus; `values[0]` is the element param.
- `item_*_bytime`: current presentation contract treats one 22-bit value as top 2 bits peak period, next 10 bits min, low 10 bits max.

## Fixture Check Template

From `C:\Codex\GoMuleR4.3.2_1.13\pd2-mule`:

```powershell
@'
import path from 'node:path';
import { loadPd2Tables } from './src/lib/pd2-data.mjs';
import { parsePlugyStashFile } from './src/lib/save-parsers.mjs';
import { formatPropertyListForDisplay } from './src/lib/property-display.mjs';
import { getFixtureLibraryDir } from './src/lib/workspace-paths.mjs';

const statKey = 'TARGET_STAT';
const tables = loadPd2Tables();
const summary = parsePlugyStashFile(path.join(getFixtureLibraryDir(), '_LOD_SharedStashSave.sss'), { pd2Tables: tables });
for (const page of summary.pages) {
  for (const item of page.topLevelItems ?? []) {
    for (const list of item.propertyLists ?? []) {
      for (const property of list.properties ?? []) {
        if (property.statKey !== statKey) continue;
        const display = formatPropertyListForDisplay({ ...list, properties: [property] }, tables);
        console.log(`${page.name} | ${item.displayName} | ${JSON.stringify(property.values)} => ${display.displayLines.map((line) => line.text).join(' || ') || '<hidden>'}`);
      }
    }
  }
}
'@ | node --input-type=module
```

## Failure Smells

- A chance value over 100% when the stat should be a proc.
- A skill name that is a basic attack or unrelated placeholder.
- A 6-bit slot being treated as a skill id.
- Unit tests that assert only synthetic values and never fixture output.
