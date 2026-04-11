const state = {
  catalog: null,
  view: null,
  sourceId: null,
  page: null,
  query: '',
  quality: '',
  sort: 'name',
  completeOnly: false,
  selectedItemKey: null
};

const elements = {
  workspaceMeta: document.querySelector('#workspace-meta'),
  sourceCount: document.querySelector('#source-count'),
  sourceList: document.querySelector('#source-list'),
  pageCount: document.querySelector('#page-count'),
  pageList: document.querySelector('#page-list'),
  matchCount: document.querySelector('#match-count'),
  selectedPath: document.querySelector('#selected-path'),
  summaryCard: document.querySelector('#summary-card'),
  gridPanels: document.querySelector('#grid-panels'),
  matchList: document.querySelector('#match-list'),
  itemDetails: document.querySelector('#item-details'),
  detailStatus: document.querySelector('#detail-status'),
  queryInput: document.querySelector('#query-input'),
  qualitySelect: document.querySelector('#quality-select'),
  sortSelect: document.querySelector('#sort-select'),
  completeOnlyInput: document.querySelector('#complete-only-input'),
  filtersForm: document.querySelector('#filters-form'),
  itemTooltip: document.querySelector('#item-tooltip')
};

function escapeHtml(value) {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createSearchParams() {
  const params = new URLSearchParams();
  if (state.sourceId) {
    params.set('sourceId', state.sourceId);
  }
  if (state.page) {
    params.set('page', state.page);
  }
  if (state.query) {
    params.set('query', state.query);
  }
  if (state.quality) {
    params.set('quality', state.quality);
  }
  if (state.sort) {
    params.set('sort', state.sort);
  }
  if (state.completeOnly) {
    params.set('completeOnly', 'true');
  }
  if (state.selectedItemKey) {
    params.set('selectedItemKey', state.selectedItemKey);
  }
  return params;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function loadCatalog() {
  state.catalog = await fetchJson('/api/catalog');
  state.sourceId = state.catalog.defaultSourceId;
  elements.sourceCount.textContent = `${state.catalog.sourceCount}`;
  elements.workspaceMeta.textContent = state.catalog.loadedFrom.join(' | ');
}

async function loadView() {
  const params = createSearchParams();
  state.view = await fetchJson(`/api/view?${params.toString()}`);
  state.sourceId = state.view.source?.id ?? state.sourceId;

  const selectedPage = state.view.pages.find((page) => page.selected);
  state.page = selectedPage?.name ?? null;
  state.selectedItemKey = state.view.selectedItem?.itemKey ?? null;

  render();
}

function setLoading(message) {
  elements.gridPanels.innerHTML = `<div class="panel-block empty-state">${escapeHtml(message)}</div>`;
}

function setupTooltip() {
  const tip = elements.itemTooltip;
  if (!tip) return;

  elements.gridPanels.addEventListener('mousemove', (event) => {
    const btn = event.target.closest('[data-item-key]');
    if (!btn) return;

    const name = btn.dataset.tooltipName ?? '';
    const code = btn.dataset.tooltipCode ?? '';
    const quality = btn.dataset.tooltipQuality ?? '';
    const props = btn.dataset.tooltipProps ?? '0';
    const sockets = btn.dataset.tooltipSockets ?? '0';

    tip.innerHTML = `
      <span class="tooltip-name quality-${escapeHtml(quality)}">${escapeHtml(name)}</span>
      <div class="tooltip-row"><span>${escapeHtml(code)}</span><span>${escapeHtml(quality)}</span></div>
      <div class="tooltip-row"><span>${escapeHtml(props)} props</span>${sockets !== '0' ? `<span>${escapeHtml(sockets)} sockets</span>` : ''}</div>
    `;

    const x = event.clientX + 14;
    const y = event.clientY + 14;
    const maxX = window.innerWidth - tip.offsetWidth - 8;
    const maxY = window.innerHeight - tip.offsetHeight - 8;
    tip.style.left = `${Math.min(x, maxX)}px`;
    tip.style.top = `${Math.min(y, maxY)}px`;
    tip.classList.add('is-visible');
  });

  elements.gridPanels.addEventListener('mouseleave', () => {
    tip.classList.remove('is-visible');
  });

  elements.gridPanels.addEventListener('mouseover', (event) => {
    if (!event.target.closest('[data-item-key]')) {
      tip.classList.remove('is-visible');
    }
  });
}

function renderSourceList() {
  if (!state.catalog || state.catalog.sources.length === 0) {
    elements.sourceList.innerHTML = '<div class="empty-state">No save files loaded.</div>';
    return;
  }

  elements.sourceList.innerHTML = state.catalog.sources.map((source) => `
    <button class="source-card ${source.id === state.sourceId ? 'is-selected' : ''}" data-source-id="${escapeHtml(source.id)}">
      <span class="source-card__kind">${escapeHtml(source.kindLabel)}</span>
      <strong>${escapeHtml(source.label)}</strong>
      <span>${escapeHtml(source.subtitle)}</span>
    </button>
  `).join('');

  for (const button of elements.sourceList.querySelectorAll('[data-source-id]')) {
    button.addEventListener('click', async () => {
      state.sourceId = button.dataset.sourceId;
      state.page = null;
      state.selectedItemKey = null;
      setLoading('Loading source...');
      await loadView();
    });
  }
}

function renderPageList() {
  const pages = state.view?.pages ?? [];
  elements.pageCount.textContent = `${pages.length}`;

  if (state.view?.source?.kind === 'workspace-library') {
    elements.pageList.className = 'page-list empty-state';
    elements.pageList.textContent = 'Workspace view does not use stash pages. Pick a save file to browse page grids.';
    return;
  }

  if (pages.length === 0) {
    elements.pageList.className = 'page-list empty-state';
    elements.pageList.textContent = 'This save holds no PlugY stash pages.';
    return;
  }

  const maxCount = Math.max(1, ...pages.map((p) => p.topLevelCount));

  elements.pageList.className = 'page-list';
  elements.pageList.innerHTML = pages.map((page) => {
    const pct = Math.round((page.topLevelCount / maxCount) * 100);
    return `
    <button class="page-card ${page.selected ? 'is-selected' : ''}" data-page-name="${escapeHtml(page.name)}">
      <strong>${escapeHtml(page.name)}</strong>
      <span>${page.topLevelCount} top-level items</span>
      <div class="page-card__bar-track">
        <div class="page-card__bar-fill" style="width:${pct}%"></div>
      </div>
    </button>
  `;
  }).join('');

  for (const button of elements.pageList.querySelectorAll('[data-page-name]')) {
    button.addEventListener('click', async () => {
      state.page = button.dataset.pageName;
      state.selectedItemKey = null;
      setLoading('Loading page...');
      await loadView();
    });
  }
}

function renderSummaryCard() {
  const summary = state.view?.summary;
  if (!summary) {
    elements.summaryCard.innerHTML = '<div class="empty-state">No summary available.</div>';
    return;
  }

  const selectedPage = summary.selectedPage
    ? `<div><span class="summary-label">Selected page</span><strong>${escapeHtml(summary.selectedPage.name)}</strong></div>`
    : '';
  const sourceCount = summary.sourceCount !== null
    ? `<div><span class="summary-label">Loaded files</span><strong>${summary.sourceCount}</strong></div>`
    : '';

  elements.summaryCard.innerHTML = `
    <div class="summary-grid">
      <div>
        <span class="summary-label">${escapeHtml(summary.kindLabel)}</span>
        <strong>${escapeHtml(summary.label)}</strong>
        <p>${escapeHtml(summary.subtitle)}</p>
      </div>
      <div>
        <span class="summary-label">Visible top-level items</span>
        <strong>${summary.visibleItemCount}</strong>
      </div>
      <div>
        <span class="summary-label">Matched items</span>
        <strong>${summary.matchedItemCount}</strong>
      </div>
      ${sourceCount}
      ${selectedPage}
    </div>
  `;

  elements.matchCount.textContent = `${summary.matchedItemCount}`;
  elements.selectedPath.textContent = summary.filePath ?? 'Workspace library view';
}

function renderGridPanels() {
  const panels = state.view?.panels ?? [];
  if (state.view?.source?.kind === 'workspace-library') {
    elements.gridPanels.innerHTML = '<div class="panel-block empty-state">Select a specific save file to inspect its equipment, inventory, cube, or stash grid. Use the workspace view for cross-save search.</div>';
    return;
  }

  if (panels.length === 0) {
    elements.gridPanels.innerHTML = '<div class="panel-block empty-state">The vault holds no relics matching your search.</div>';
    return;
  }

  elements.gridPanels.innerHTML = panels.map((panel) => `
    <section class="panel-block">
      <div class="section-header">
        <h2>${escapeHtml(panel.label)}</h2>
        <span class="section-pill">${panel.items.length}</span>
      </div>
      <div class="item-grid" style="--grid-columns:${panel.columns}; --grid-rows:${panel.rows};">
        ${panel.items.map((item) => `
          <button
            class="grid-item quality-${escapeHtml(item.qualityLabel)} ${item.selected ? 'is-selected' : ''} ${item.propertiesComplete ? '' : 'is-partial'}"
            data-item-key="${escapeHtml(item.itemKey)}"
            data-col="${item.column}"
            data-row="${item.row}"
            data-tooltip-name="${escapeHtml(item.displayName)}"
            data-tooltip-code="${escapeHtml(item.code)}"
            data-tooltip-quality="${escapeHtml(item.qualityLabel)}"
            data-tooltip-props="${item.propertyCount}"
            data-tooltip-sockets="${item.totalSockets ?? 0}"
            style="grid-column:${item.column + 1} / span ${item.width}; grid-row:${item.row + 1} / span ${item.height};"
          >
            <span class="grid-item__name">${escapeHtml(item.displayName)}</span>
            <span class="grid-item__meta">${escapeHtml(item.code)} - ${escapeHtml(item.qualityLabel)}</span>
            <span class="grid-item__meta">${item.propertyCount} props${item.totalSockets ? ` - ${item.totalSockets} sockets` : ''}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `).join('');

  const allGridItems = [...elements.gridPanels.querySelectorAll('[data-item-key]')];

  for (const button of allGridItems) {
    button.addEventListener('click', async () => {
      state.selectedItemKey = button.dataset.itemKey;
      await loadView();
    });

    button.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.selectedItemKey = button.dataset.itemKey;
        await loadView();
        return;
      }

      const col = parseInt(button.dataset.col, 10);
      const row = parseInt(button.dataset.row, 10);
      let targetCol = col;
      let targetRow = row;

      if (event.key === 'ArrowRight') { event.preventDefault(); targetCol = col + 1; }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); targetCol = col - 1; }
      else if (event.key === 'ArrowDown') { event.preventDefault(); targetRow = row + 1; }
      else if (event.key === 'ArrowUp') { event.preventDefault(); targetRow = row - 1; }
      else return;

      const nearest = allGridItems.find(
        (b) => parseInt(b.dataset.col, 10) === targetCol && parseInt(b.dataset.row, 10) === targetRow
      ) ?? allGridItems.find(
        (b) => Math.abs(parseInt(b.dataset.col, 10) - targetCol) <= 1 && Math.abs(parseInt(b.dataset.row, 10) - targetRow) <= 1
      );

      if (nearest) nearest.focus();
    });
  }
}

function renderMatchList() {
  const matches = state.view?.matches ?? [];
  const hasActiveFilters = Boolean(state.query || state.quality || state.completeOnly);
  if (matches.length === 0 && state.view?.source?.kind === 'workspace-library' && !hasActiveFilters) {
    elements.matchList.innerHTML = '<div class="empty-state">Seek across all loaded saves. Enter a search to begin.</div>';
    return;
  }

  if (matches.length === 0) {
    elements.matchList.innerHTML = '<div class="empty-state">No items match the current filters.</div>';
    return;
  }

  elements.matchList.innerHTML = matches.map((entry) => `
    <button class="match-row ${entry.selected ? 'is-selected' : ''}" data-item-key="${escapeHtml(entry.itemKey)}">
      <strong>${escapeHtml(entry.displayName)}</strong>
      <span>${escapeHtml(entry.sourceLabel)}</span>
      <span>${escapeHtml(entry.code)} - ${escapeHtml(entry.qualityLabel)}</span>
      <span>${escapeHtml(entry.locationLabel)} - ${entry.propertyCount} props</span>
    </button>
  `).join('');

  for (const button of elements.matchList.querySelectorAll('[data-item-key]')) {
    button.addEventListener('click', async () => {
      state.selectedItemKey = button.dataset.itemKey;
      await loadView();
    });
  }
}

function renderItemDetails() {
  const item = state.view?.selectedItem;
  if (!item) {
    elements.detailStatus.textContent = 'None';
    elements.itemDetails.className = 'item-details empty-state';
    elements.itemDetails.textContent = 'Select an item to inspect its read-only details.';
    return;
  }

  elements.detailStatus.textContent = item.propertyStatus === 'partial' ? 'Partial' : 'Ready';
  elements.itemDetails.className = `item-details ${item.propertyStatus === 'partial' ? 'is-partial' : ''}`;

  const flags = item.flags.length > 0
    ? item.flags.map((flag) => `<span class="flag-pill">${escapeHtml(flag)}</span>`).join('')
    : '<span class="muted-copy">No special flags</span>';
  const sockets = item.totalSockets
    ? `${item.socketsFilled}/${item.totalSockets}`
    : '0';
  const propertyWarning = item.propertyParseError
    ? `<div class="detail-warning">Property stream is partial: ${escapeHtml(item.propertyParseError)}</div>`
    : '';
  const kindClass = (kind) => {
    if (kind === 'set') return 'kind-set';
    if (kind === 'runeword') return 'kind-runeword';
    if (kind === 'base') return '';
    return 'kind-muted';
  };

  const propertyLists = item.propertyLists.length > 0
    ? item.propertyLists.map((list) => `
        <section class="detail-group">
          <div class="detail-group__header ${kindClass(list.kind)}">
            <strong>${escapeHtml(list.kind)}</strong>
            <span>${list.complete ? 'complete' : 'partial'} - ${list.propertyCount} stats</span>
          </div>
          ${list.error ? `<div class="detail-warning">${escapeHtml(list.error)}</div>` : ''}
          <ul class="detail-list">
            ${(list.displayLines ?? []).map((line) => `
              <li><span>${escapeHtml(line.text)}</span></li>
            `).join('') || '<li><span>No decoded properties</span></li>'}
          </ul>
        </section>
      `).join('')
    : '<div class="detail-group"><span class="muted-copy">No decoded properties.</span></div>';
  const children = item.children.length > 0
    ? `
        <section class="detail-group">
          <div class="detail-group__header">
            <strong>Socket Children</strong>
            <span>${item.children.length}</span>
          </div>
          <ul class="detail-list">
            ${item.children.map((child) => `
              <li><strong>${escapeHtml(child.displayName)}</strong><span>${escapeHtml(child.code)} - ${child.propertyCount} props</span></li>
            `).join('')}
          </ul>
        </section>
      `
    : '';

  elements.itemDetails.innerHTML = `
    <header class="detail-header">
      <span class="quality-badge quality-${escapeHtml(item.qualityLabel)}">${escapeHtml(item.qualityLabel)}</span>
      <h3>${escapeHtml(item.displayName)}</h3>
      <p>${escapeHtml(item.code)} - ${escapeHtml(item.sourceLabel)} - ${escapeHtml(item.panelLabel)}</p>
    </header>

    ${propertyWarning}

    <section class="detail-group">
      <div class="detail-group__header">
        <strong>Core</strong>
        <span>${item.dimensions}</span>
      </div>
      <ul class="detail-list">
        <li><strong>Properties</strong><span>${item.propertyCount}</span></li>
        <li><strong>Sockets</strong><span>${sockets}</span></li>
        <li><strong>Item level</strong><span>${item.itemLevel ?? 'n/a'}</span></li>
        <li><strong>Defense</strong><span>${item.defense ?? 'n/a'}</span></li>
        <li><strong>Durability</strong><span>${item.durability ?? 'n/a'}</span></li>
        <li><strong>Stack size</strong><span>${item.stackSize ?? 'n/a'}</span></li>
        <li><strong>Section</strong><span>${escapeHtml(item.section ?? 'n/a')}</span></li>
        <li><strong>Type</strong><span>${escapeHtml(item.type ?? 'n/a')}</span></li>
        <li><strong>Type2</strong><span>${escapeHtml(item.type2 ?? 'n/a')}</span></li>
        <li><strong>Fingerprint</strong><span>${item.fingerprint ?? 'n/a'}</span></li>
      </ul>
    </section>

    <section class="detail-group">
      <div class="detail-group__header">
        <strong>Flags</strong>
        <span>${item.propertyStatus}</span>
      </div>
      <div class="flags-row">${flags}</div>
    </section>

    ${propertyLists}
    ${children}
  `;
}

function render() {
  renderSourceList();
  renderPageList();
  renderSummaryCard();
  renderGridPanels();
  renderMatchList();
  renderItemDetails();
}

let queryTimer = null;

function bindEvents() {
  elements.queryInput.addEventListener('input', () => {
    window.clearTimeout(queryTimer);
    queryTimer = window.setTimeout(async () => {
      state.query = elements.queryInput.value.trim();
      state.selectedItemKey = null;
      setLoading('Searching...');
      await loadView();
    }, 150);
  });

  elements.qualitySelect.addEventListener('change', async () => {
    state.quality = elements.qualitySelect.value;
    state.selectedItemKey = null;
    setLoading('Applying quality filter...');
    await loadView();
  });

  elements.sortSelect.addEventListener('change', async () => {
    state.sort = elements.sortSelect.value;
    setLoading('Sorting items...');
    await loadView();
  });

  elements.completeOnlyInput.addEventListener('change', async () => {
    state.completeOnly = elements.completeOnlyInput.checked;
    state.selectedItemKey = null;
    setLoading('Filtering incomplete properties...');
    await loadView();
  });

  elements.filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}

async function main() {
  bindEvents();
  setupTooltip();
  setLoading('Loading inspector...');

  try {
    await loadCatalog();
    await loadView();
  } catch (error) {
    elements.gridPanels.innerHTML = `<div class="panel-block empty-state">Failed to load inspector data: ${escapeHtml(error.message)}</div>`;
  }
}

main();
