import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const LIB_DIR = path.dirname(CURRENT_FILE);
const SRC_DIR = path.dirname(LIB_DIR);
const PROJECT_ROOT = path.dirname(SRC_DIR);
const WORKSPACE_ROOT = path.dirname(PROJECT_ROOT);

export function getProjectRoot() {
  return PROJECT_ROOT;
}

export function getWorkspaceRoot() {
  return WORKSPACE_ROOT;
}

export function getDefaultPd2DataDir() {
  return path.join(WORKSPACE_ROOT, 'gomule-d2r', 'gomule', 'pd2');
}

export function getFixtureLibraryDir() {
  return path.join(
    WORKSPACE_ROOT,
    'PD2-Singleplayer',
    'Diablo II',
    'Save',
    'Library'
  );
}
