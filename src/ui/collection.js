import { collectionProgress, collectionRows, describeCopyLocation } from './collection-view.mjs';

const escapeHtml = value => `${value ?? ''}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function ownershipText(owned) {
  const parts = [`${owned.total} owned`];
  if (owned.character) parts.push(`${owned.character} on characters`);
  if (owned.stash) parts.push(`${owned.stash} in stashes`);
  if (owned.ethereal) parts.push(`${owned.ethereal} ethereal`);
  return parts.join(', ');
}

function renderRow(entry) {
  const base = entry.baseName ? ` <span class="muted-copy">${escapeHtml(entry.baseName)}</span>` : '';
  if (entry.owned.total === 0) return `<li class="collection-row missing"><strong>${escapeHtml(entry.label)}</strong>${base}</li>`;
  const copies = entry.copies.map(copy => `<li>${escapeHtml(describeCopyLocation(copy))}</li>`).join('');
  return `<li class="collection-row owned"><strong>${escapeHtml(entry.label)}</strong>${base}`
    + `<span class="collection-owned">${escapeHtml(ownershipText(entry.owned))}</span><ul class="collection-copies">${copies}</ul></li>`;
}

function renderRows(rows, category) {
  if (category !== 'sets') return rows.map(renderRow).join('');
  let currentSet = null;
  return rows.map(entry => {
    const heading = entry.setName === currentSet ? '' : `<li class="collection-set-heading">${escapeHtml(entry.setName)}</li>`;
    currentSet = entry.setName;
    return heading + renderRow(entry);
  }).join('');
}

/** Read-only collection panel: progress, per-set completion and owned/missing lists. */
export function createCollectionUi() {
  const el = id => document.getElementById(`collection-${id}`);
  let report = null;
  let generation = 0;

  function renderProgress() {
    el('progress').innerHTML = collectionProgress(report).map(line => {
      const sets = line.id === 'sets' ? `, ${line.completeSets}/${line.setCount} complete sets` : '';
      return `<li><strong>${escapeHtml(line.label)}</strong> ${line.found}/${line.total} (${line.percent}%)${escapeHtml(sets)}</li>`;
    }).join('');
  }

  function renderList() {
    const category = el('category').value || 'uniques';
    const rows = collectionRows(report, { category, show: el('show').value || 'missing', query: el('query').value });
    el('count').textContent = `${rows.length}`;
    el('list').innerHTML = rows.length > 0 ? renderRows(rows, category) : '<li class="muted-copy">No matching entries.</li>';
  }

  function render() {
    renderProgress();
    renderList();
    const notes = [];
    if (report.unavailableOwned.length > 0) notes.push(`${report.unavailableOwned.length} owned uniques use disabled table rows and are not counted.`);
    if (report.unresolved.length > 0) notes.push(`${report.unresolved.length} unique or set items have no catalogue row.`);
    el('status').textContent = notes.join(' ');
  }

  for (const id of ['category', 'show']) el(id).addEventListener('change', () => { if (report) renderList(); });
  el('query').addEventListener('input', () => { if (report) renderList(); });
  // Filtering is live; implicit form submission would reload the inspector.
  el('form').addEventListener('submit', event => event.preventDefault());

  return {
    /** Fetches the current report; only the latest request may render. Never throws. */
    async load() {
      const requestGeneration = ++generation;
      el('status').textContent = 'Loading collection...';
      try {
        const response = await fetch('/api/collection');
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Collection request failed (${response.status})`);
        if (requestGeneration !== generation) return;
        report = body;
        render();
      } catch (error) {
        if (requestGeneration !== generation) return;
        report = null;
        el('progress').textContent = '';
        el('list').textContent = '';
        el('count').textContent = '0';
        el('status').textContent = `Collection unavailable: ${error.message}`;
      }
    }
  };
}
