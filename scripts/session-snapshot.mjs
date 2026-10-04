import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const workspaceRoot = path.resolve(repoRoot, '..');
const queuePath = path.join(repoRoot, 'docs', 'autopilot', 'WORK_QUEUE.md');
const bootstrapPath = path.join(repoRoot, 'docs', 'BOOTSTRAP.md');
const fixturePath = path.join(workspaceRoot, 'PD2-Singleplayer', 'Diablo II', 'Save', 'Library');

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trimEnd();
  } catch (error) {
    return `ERROR: ${error.stderr?.toString().trim() || error.message}`;
  }
}

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseQueueItems(queueText) {
  const items = [];
  const heading = /^### \[(?<status>[^\]]+)\] (?<id>[A-Z0-9-]+) - (?<title>.+)$/gm;
  let match;
  while ((match = heading.exec(queueText)) !== null) {
    items.push(match.groups);
  }
  return items;
}

function printSection(title, body = '') {
  console.log(`\n## ${title}`);
  if (body) {
    console.log(body);
  }
}

const queueText = readIfExists(queuePath);
const bootstrapText = readIfExists(bootstrapPath);
const queueItems = parseQueueItems(queueText);
const readyItems = queueItems.filter((item) => item.status === 'ready');
const blockedItems = queueItems.filter((item) => item.status === 'blocked');
const needsResearchItems = queueItems.filter((item) => item.status === 'needs-research');
const acceptanceItems = queueItems.filter((item) => item.status.includes('acceptance pending'));
const nextItems = queueItems.filter((item) => item.status === 'next');
const baseline = bootstrapText.match(/Latest known full test baseline: `([^`]+)` passing, `([^`]+)` failing/)?.slice(1, 3);

console.log('# PD2 Mule Session Snapshot');
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Workspace: ${workspaceRoot}`);
console.log(`Repo: ${repoRoot}`);
console.log(`Fixture library exists: ${fs.existsSync(fixturePath)}`);
if (baseline) {
  console.log(`Known test baseline: ${baseline[0]} passing, ${baseline[1]} failing`);
}

printSection('Git Status', runGit(['status', '--short', '--branch']) || '(clean)');
printSection('Recent Commits', runGit(['log', '--oneline', '-8']));

printSection(
  'Ready Queue',
  readyItems.length
    ? readyItems.map((item, index) => `${index + 1}. ${item.id} - ${item.title}`).join('\n')
    : '(none)'
);

if (acceptanceItems.length || nextItems.length) {
  printSection(
    'Acceptance Gates And Next Milestones',
    [...acceptanceItems, ...nextItems]
      .map((item) => `[${item.status}] ${item.id} - ${item.title}`).join('\n')
  );
}

if (blockedItems.length || needsResearchItems.length) {
  printSection(
    'Blocked Or Research',
    [
      ...blockedItems.map((item) => `[blocked] ${item.id} - ${item.title}`),
      ...needsResearchItems.map((item) => `[needs-research] ${item.id} - ${item.title}`)
    ].join('\n')
  );
}

printSection('Bootstrap', bootstrapPath);
printSection('Queue', queuePath);
