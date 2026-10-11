// Pure presentation helpers for the shared-fingerprint report. Served unchanged
// to the browser (see inspector-server.mjs), so this module must not import anything.

const SHOW_FILTERS = new Set(['all', 'identical', 'differing']);

/**
 * Selects shared-fingerprint groups. `show` is all, identical or differing;
 * every space-separated query term must match an item name or the fingerprint.
 */
export function sharedFingerprintGroups(report, { show = 'all', query = '' } = {}) {
  if (!SHOW_FILTERS.has(show)) throw new Error(`Unknown duplicate filter: ${show}`);
  const tokens = `${query}`.toLowerCase().split(/\s+/).filter(Boolean);
  return report.groups.filter(group => {
    const text = [...group.displayNames, String(group.fingerprint)].join(' ').toLowerCase();
    return (show === 'all' || (show === 'identical') === group.identical) && tokens.every(token => text.includes(token));
  });
}

/** One-line verdict for a group; incompletely decoded copies are named because they block "identical". */
export function describeGroupVerdict(group) {
  if (group.identical) return 'identical copies';
  return group.incompleteCopies > 0 ? `differs or not comparable (${group.incompleteCopies} not fully decoded)` : 'copies differ';
}
