import { describeCopyLocation } from './collection-view.mjs';
import { describeGroupVerdict, sharedFingerprintGroups } from './dupes-view.mjs';

// Rendering every group of a large library at once makes the page sluggish;
// Find narrows the list instead.
const RENDER_LIMIT = 200;

const escapeHtml = value => `${value ?? ''}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function renderGroup(group) {
  // When copies carry different names, each location must say which item it holds.
  const mixedNames = group.displayNames.length > 1;
  const copies = group.copies.map(copy => {
    const location = describeCopyLocation(copy);
    return `<li>${escapeHtml(mixedNames ? `${copy.displayName}: ${location}` : location)}</li>`;
  }).join('');
  const verdictClass = group.identical ? 'is-identical' : 'is-differing';
  return `<li class="collection-row"><strong>${escapeHtml(group.displayNames.join(' / '))}</strong>`
    + ` <span class="muted-copy">x${group.copies.length}, fingerprint ${escapeHtml(group.fingerprint)}</span>`
    + `<span class="dupes-verdict ${verdictClass}">${escapeHtml(describeGroupVerdict(group))}</span>`
    + `<ul class="collection-copies">${copies}</ul></li>`;
}

/** Read-only panel listing items that share a fingerprint across the loaded saves. */
export function createDupesUi() {
  const el = id => document.getElementById(`dupes-${id}`);
  let report = null;
  let generation = 0;

  function renderList() {
    const groups = sharedFingerprintGroups(report, { show: el('show').value || 'all', query: el('query').value });
    el('count').textContent = `${groups.length}`;
    const hidden = groups.length - RENDER_LIMIT;
    el('list').innerHTML = groups.length === 0 ? '<li class="muted-copy">No matching groups.</li>'
      : groups.slice(0, RENDER_LIMIT).map(renderGroup).join('')
        + (hidden > 0 ? `<li class="muted-copy">${hidden} more groups. Use Find to narrow the list.</li>` : '');
  }

  function render() {
    el('summary').textContent = `${report.groupCount} shared fingerprints across ${report.sharedRecordCount} records; `
      + `${report.identicalGroupCount} groups have identical copies.`;
    el('status').textContent = '';
    renderList();
  }

  el('show').addEventListener('change', () => { if (report) renderList(); });
  el('query').addEventListener('input', () => { if (report) renderList(); });
  // Filtering is live; implicit form submission would reload the inspector.
  el('form').addEventListener('submit', event => event.preventDefault());

  return {
    /** Fetches the current report; only the latest request may render. Never throws. */
    async load() {
      const requestGeneration = ++generation;
      el('status').textContent = 'Loading duplicates...';
      try {
        const response = await fetch('/api/dupes');
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Duplicates request failed (${response.status})`);
        if (requestGeneration !== generation) return;
        report = body;
        render();
      } catch (error) {
        if (requestGeneration !== generation) return;
        report = null;
        el('summary').textContent = '';
        el('list').textContent = '';
        el('count').textContent = '0';
        el('status').textContent = `Duplicates unavailable: ${error.message}`;
      }
    }
  };
}
