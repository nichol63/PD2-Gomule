import { filterBankItems } from './bank-search.mjs';

const escapeHtml = value => `${value ?? ''}`.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function createBankUi(state, reload) {
  const el = id => document.getElementById(`bank-${id}`);
  let status;
  let busy = false;
  let preview = null;
  let detailsGeneration = 0;
  let containerSource = null;

  function clearDetails(text = 'Select a bank item to view its properties.') {
    detailsGeneration += 1;
    el('details-content').textContent = text;
  }

  function propertyGroups(item) {
    return (item.propertyLists ?? []).map(list => {
      const label = list.kind === 'runeword' ? 'Runeword properties' : list.kind === 'set' ? 'Set properties' : 'Properties';
      return `<div class="detail-group"><strong>${escapeHtml(label)}</strong><ul class="detail-list">${(list.displayLines ?? []).map(line => `<li>${escapeHtml(line.text)}</li>`).join('')}</ul></div>`;
    }).join('');
  }

  function renderDetails(item) {
    const facts = [item.qualityLabel, item.code, item.dimensions,
      item.itemLevel === null || item.itemLevel === undefined ? null : `Item level ${item.itemLevel}`,
      item.defense === null || item.defense === undefined ? null : `Defense ${item.defense}`,
      item.durability ? `Durability ${item.durability}` : null,
      item.stackSize === null || item.stackSize === undefined ? null : `Stack ${item.stackSize}`,
      item.totalSockets ? `Sockets ${item.socketsFilled}/${item.totalSockets}` : null, ...(item.flags ?? [])].filter(Boolean);
    const source = item.source ? [item.source.fileName, item.source.characterName, item.source.pageName].filter(Boolean).join(' · ') : '';
    const children = (item.children ?? []).map(child => `<div class="detail-group detail-group--nested"><strong>${escapeHtml(child.displayName)} [${escapeHtml(child.code)}]</strong>${child.baseName !== child.displayName ? `<p>${escapeHtml(child.baseName)}</p>` : ''}${propertyGroups(child)}</div>`).join('');
    el('details-content').innerHTML = `<h4>${escapeHtml(item.displayName)}</h4>${item.baseName !== item.displayName ? `<p>${escapeHtml(item.baseName)}</p>` : ''}<p class="muted-copy">${escapeHtml(facts.join(' · '))}</p>${propertyGroups(item)}${children ? `<div class="detail-socket-children"><strong>Socket contents</strong>${children}</div>` : ''}${source ? `<p class="muted-copy">Source: ${escapeHtml(source)}</p>` : ''}${item.depositedAt ? `<p class="muted-copy">Deposited: ${escapeHtml(item.depositedAt)}</p>` : ''}`;
  }

  async function loadDetails() {
    const itemId = el('item').value;
    clearDetails(itemId ? 'Loading item details…' : undefined);
    if (!itemId || !status?.configured) return;
    const generation = detailsGeneration;
    try {
      const { item } = await request(`/api/bank/item?itemId=${encodeURIComponent(itemId)}`);
      if (generation !== detailsGeneration || el('item').value !== itemId) return;
      if (!item || item.itemId !== itemId) throw new Error('Unexpected bank item details response');
      renderDetails(item);
    } catch {
      if (generation !== detailsGeneration || el('item').value !== itemId) return;
      clearDetails('Unable to load item details.');
    }
  }

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
    clearDetails();
    const selected = el('item').value;
    const items = filterBankItems(status.bank.items ?? [], el('query').value);
    el('count').textContent = `Bank items (${items.length} of ${status.bank.items.length})`;
    el('item').innerHTML = items.length ? items.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.displayName ?? item.baseName ?? item.code)} [${escapeHtml(item.code)}] · ${escapeHtml(item.source?.fileName)}</option>`).join('') : `<option value="">${status.bank.items.length ? 'No matching bank items' : 'Bank is empty'}</option>`;
    if (items.some(item => item.id === selected)) el('item').value = selected;
    el('withdraw').disabled = !items.length || busy;
    void loadDetails();
  }

  function showContainers() {
    const destinationId = el('destination').value;
    const selectedContainer = el('container').value;
    const source = state.catalog.sources.find(source => source.id === destinationId);
    el('container').innerHTML = source?.kind === 'character'
      ? '<option value="inventory">Inventory</option><option value="cube">Cube</option><option value="stash">Personal stash</option>'
      : (source?.pages ?? []).map(page => `<option value="${page.index}">${page.index + 1}. ${escapeHtml(page.name)}</option>`).join('');
    const validContainer = source?.kind === 'character'
      ? ['inventory', 'cube', 'stash'].includes(selectedContainer)
      : (source?.pages ?? []).some(page => `${page.index}` === selectedContainer);
    if (containerSource?.id === destinationId && containerSource.filePath === source?.filePath
        && containerSource.kind === source?.kind && validContainer) el('container').value = selectedContainer;
    containerSource = source ? { id: destinationId, filePath: source.filePath, kind: source.kind } : null;
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
    clearDetails();
    try { status = await request('/api/bank'); }
    catch (error) { clearDetails('Unable to load item details.'); throw error; }
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
  el('item').onchange = () => { invalidatePreview(); void loadDetails(); };
  for (const id of ['container', 'column', 'row', 'auto']) el(id).onchange = invalidatePreview;
  el('refresh').onclick = () => perform(async () => {
    invalidatePreview(); await request('/api/bank/refresh', {}); await reload(); await load(); message('Library refreshed.');
  });
  el('recover').onclick = () => perform(() => makePreview({ action: 'recover' }));
  return { load, selectionChanged };
}
