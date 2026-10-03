const escapeHtml = value => `${value ?? ''}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function createBankUi(state, reload) {
  const el = id => document.getElementById(`bank-${id}`);
  let status;
  let busy = false;
  let preview = null;

  async function request(route, input) {
    const response = await fetch(route, input === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PD2-Mule-Token': status.sessionToken }, body: JSON.stringify(input)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
    return body;
  }

  function message(text, error = false) {
    el('message').textContent = text;
    el('message').className = error ? 'bank-message is-error' : 'bank-message';
  }

  function invalidatePreview() {
    preview = null;
    el('preview').hidden = true;
    el('preview').replaceChildren();
  }

  async function perform(action) {
    if (busy) return;
    busy = true;
    el('panel').setAttribute('aria-busy', 'true');
    for (const control of el('panel').querySelectorAll('button, input, select')) control.disabled = true;
    try { await action(); }
    catch (error) { invalidatePreview(); message(error.message, true); }
    finally {
      busy = false;
      el('panel').removeAttribute('aria-busy');
      for (const control of el('panel').querySelectorAll('button, input, select')) control.disabled = false;
      selectionChanged();
      el('withdraw').disabled = !el('item').value;
    }
  }

  function showItems() {
    const selected = el('item').value;
    const terms = el('query').value.toLowerCase().split(/\s+/).filter(Boolean);
    const items = (status.bank.items ?? []).filter(item => terms.every(term =>
      [item.displayName, item.baseName, item.code, item.quality].join(' ').toLowerCase().includes(term)));
    el('count').textContent = `Bank items (${items.length} of ${status.bank.items.length})`;
    el('item').innerHTML = items.length ? items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.displayName ?? item.baseName ?? item.code)} [${escapeHtml(item.code)}] · ${escapeHtml(item.source?.fileName)}</option>`).join('') : '<option value="">Bank is empty</option>';
    if (items.some(item => item.id === selected)) el('item').value = selected;
    el('withdraw').disabled = !items.length || busy;
  }

  function showContainers() {
    const source = state.catalog.sources.find(source => source.id === el('destination').value);
    el('container').innerHTML = source?.kind === 'character'
      ? '<option value="inventory">Inventory</option><option value="cube">Cube</option><option value="stash">Personal stash</option>'
      : (source?.pages ?? []).map(page => `<option value="${page.index}">${page.index + 1}. ${escapeHtml(page.name)}</option>`).join('');
  }

  function showSources() {
    const selected = el('destination').value;
    const sources = state.catalog.sources.filter(source => source.kind !== 'workspace-library');
    el('destination').innerHTML = sources.map(source => `<option value="${escapeHtml(source.id)}">${escapeHtml(source.label)} (${escapeHtml(source.fileName)})</option>`).join('');
    if (sources.some(source => source.id === selected)) el('destination').value = selected;
    showContainers();
  }

  function selectionChanged() {
    if (!status?.configured) return;
    const item = state.view?.selectedItem;
    if (preview?.action === 'deposit' && preview.itemKey !== item?.itemKey) {
      invalidatePreview();
      message('Selection changed. Preview the new item before committing.');
    }
    el('deposit').disabled = busy || !item;
    el('selection').textContent = item ? `Selected: ${item.displayName} in ${item.sourceLabel}` : 'Select an item in the browser to deposit it.';
  }

  async function load() {
    status = await request('/api/bank');
    el('panel').hidden = !status.configured;
    if (!status.configured) return;
    el('mode').textContent = status.enabled ? 'Copy transfers' : 'Preview only';
    el('description').textContent = `${status.bankName} · ${status.bank.items.length} items. ${status.enabled ? 'Moves save immediately after you review and commit. Backups are kept for every move. Game loading is not yet verified.' : 'Previews leave the bank and saves unchanged.'}`;
    showItems();
    showSources();
    selectionChanged();
    if (status.error) message(status.error, true);
  }

  async function makePreview(input) {
    invalidatePreview();
    message('Checking item placement and save contents...');
    preview = { ...await request('/api/bank/preview', input), action: input.action, itemKey: input.itemKey };
    const result = preview.result;
    const counts = result.bankItemCountAfter === undefined ? escapeHtml(JSON.stringify(result, null, 2))
      : `Bank: ${result.bankItemCountBefore} → ${result.bankItemCountAfter} items. Save container: ${result.stashItemCountBefore} → ${result.stashItemCountAfter} items.`;
    const position = preview.placement ? `<p>Destination position: column ${preview.placement.column}, row ${preview.placement.row}.</p>` : '';
    el('preview').innerHTML = `<strong>${escapeHtml(preview.label)}</strong><p>${counts}</p>${position}<p class="muted-copy">${escapeHtml(result.status ?? '')}</p>${preview.canCommit ? '<button id="bank-commit" type="button">Commit transfer</button>' : '<p>Restart with --experimental-write to commit transfers on copies.</p>'}<button id="bank-cancel" type="button">Cancel</button>`;
    el('preview').hidden = false;
    el('cancel').onclick = () => { invalidatePreview(); message('Preview cancelled. No files changed.'); };
    if (preview.canCommit) el('commit').onclick = () => perform(async () => {
      const ticket = preview.ticket;
      invalidatePreview();
      const result = await request('/api/bank/commit', { ticket });
      await reload();
      await load();
      message(`Transfer saved. ${result.backupPaths?.length ?? 0} backups retained.${result.transactionId ? ` Transaction ${result.transactionId}.` : ''}`);
    });
    message('Preview ready. No files changed.');
  }

  el('deposit').onclick = () => perform(async () => {
    const selected = state.view.selectedItem;
    const source = state.catalog.sources.find(source => source.filePath === selected.filePath);
    await makePreview({ action: 'deposit', sourceId: source?.id, itemKey: selected.itemKey });
  });
  el('withdraw-form').onsubmit = event => {
    event.preventDefault();
    const source = state.catalog.sources.find(source => source.id === el('destination').value);
    const container = el('container').value;
    perform(() => makePreview({ action: 'withdraw', sourceId: source?.id, itemId: el('item').value,
      ...(source?.kind === 'character' ? { panel: container } : { pageIndex: Number(container) }),
      column: Number(el('column').value), row: Number(el('row').value), autoPlace: el('auto').checked }));
  };
  el('destination').onchange = () => { invalidatePreview(); showContainers(); };
  el('query').oninput = () => { invalidatePreview(); showItems(); };
  for (const id of ['item', 'container', 'column', 'row', 'auto']) el(id).onchange = invalidatePreview;
  el('refresh').onclick = () => perform(async () => {
    invalidatePreview(); await request('/api/bank/refresh', {}); await reload(); await load(); message('Library refreshed.');
  });
  el('recover').onclick = () => perform(() => makePreview({ action: 'recover' }));
  return { load, selectionChanged };
}
