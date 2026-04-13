import fs from 'node:fs';
import path from 'node:path';

import {
  collectBrowseEntries,
  filterBrowseEntries,
  resolvePage,
  sortBrowseEntries
} from './browser-index.mjs';
import { loadPd2Tables } from './pd2-data.mjs';
import { formatPropertyListForDisplay } from './property-display.mjs';
import { inspectSaveFile } from './save-parsers.mjs';
import { getFixtureLibraryDir } from './workspace-paths.mjs';

const SAVE_FILE_EXTENSIONS = new Set(['.d2s', '.d2x', '.sss']);
const PANEL_DETAILS = {
  '1/0': { label: 'Equipped', columns: 10, rows: 4, order: 10 },
  '0/1': { label: 'Inventory', columns: 10, rows: 4, order: 20 },
  '0/4': { label: 'Cube', columns: 4, rows: 4, order: 30 },
  '0/5': { label: 'Stash', columns: 10, rows: 10, order: 40 },
  '2/0': { label: 'Belt', columns: 4, rows: 4, order: 50 }
};
const KIND_LABELS = {
  character: 'Character',
  'plugy-personal-stash': 'Personal Stash',
  'plugy-shared-stash': 'Shared Stash',
  'workspace-library': 'Library'
};
const WORKSPACE_SOURCE_ID = 'workspace-library';

function normalizeFilePath(filePath) {
  return path.resolve(filePath);
}

function isSupportedSaveFile(filePath) {
  return SAVE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walkSaveFiles(targetPath, files) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      walkSaveFiles(path.join(targetPath, entry.name), files);
    }
    return;
  }

  if (stat.isFile() && isSupportedSaveFile(targetPath)) {
    files.push(normalizeFilePath(targetPath));
  }
}

function getDefaultInputs(inputPaths) {
  if (inputPaths.length > 0) {
    return inputPaths;
  }

  return [getFixtureLibraryDir()];
}

function getVisibleItems(summary, page = null) {
  if (summary.kind === 'character') {
    return summary.topLevelItems ?? summary.items ?? [];
  }

  if (page) {
    return page.topLevelItems ?? page.items ?? [];
  }

  return [];
}

function getSourceLabel(summary) {
  if (summary.kind === 'character') {
    return summary.name;
  }

  return summary.fileName;
}

function getSourceSubtitle(summary) {
  if (summary.kind === 'character') {
    return `${summary.className} level ${summary.level}`;
  }

  return `${summary.pageCount} pages, ${summary.totalItems} items`;
}

function countTopLevelItems(summary) {
  if (summary.kind === 'character') {
    return summary.topLevelItems?.length ?? summary.items?.length ?? 0;
  }

  return summary.pages?.reduce(
    (sum, page) => sum + (page.topLevelItems?.length ?? page.items?.length ?? 0),
    0
  ) ?? 0;
}

function getEntrySourceLabel(entry) {
  if (entry.pageName) {
    return `${entry.fileName} / ${entry.pageName}`;
  }

  if (entry.characterName) {
    return `${entry.fileName} / ${entry.characterName}`;
  }

  return entry.fileName;
}

function getItemKey(entry) {
  return [
    entry.filePath,
    entry.pageIndex ?? 'root',
    entry.itemIndex,
    entry.code,
    entry.location ?? 'na',
    entry.panel ?? 'na',
    entry.row ?? 'na',
    entry.column ?? 'na'
  ].join('|');
}

function describeLocation(entry) {
  const panelDetails = PANEL_DETAILS[`${entry.location}/${entry.panel}`];
  const panelLabel = panelDetails?.label ?? `Panel ${entry.panel ?? '?'}`;
  return `${panelLabel} (${entry.column ?? '?'}:${entry.row ?? '?'})`;
}

function formatPropertyValues(property) {
  if (!Array.isArray(property.values) || property.values.length === 0) {
    return 'n/a';
  }

  if (property.values.length === 1) {
    return `${property.values[0]}`;
  }

  return property.values.join(', ');
}

function serializeProperty(property) {
  return {
    statId: property.statId,
    statKey: property.statKey,
    listKind: property.listKind,
    values: property.values,
    valueLabel: formatPropertyValues(property)
  };
}

function serializePropertyList(propertyList) {
  return {
    kind: propertyList.kind,
    complete: propertyList.complete !== false,
    error: propertyList.error ?? null,
    propertyCount: propertyList.properties?.length ?? 0,
    properties: (propertyList.properties ?? []).map(serializeProperty)
  };
}

function serializeChildItem(child, pd2Tables) {
  return {
    displayName: child.displayName,
    code: child.code,
    qualityLabel: child.qualityLabel,
    propertyCount: child.propertyCount ?? 0,
    propertiesComplete: child.propertiesComplete !== false,
    propertyLists: (child.propertyLists ?? [])
      .map((list) => formatPropertyListForDisplay(list, pd2Tables))
  };
}

function createSourceDescriptor(source) {
  const { id, summary } = source;
  return {
    id,
    kind: summary.kind,
    kindLabel: KIND_LABELS[summary.kind] ?? summary.kind,
    filePath: summary.filePath,
    fileName: summary.fileName,
    label: getSourceLabel(summary),
    subtitle: getSourceSubtitle(summary),
    itemCount: countTopLevelItems(summary),
    pageCount: summary.pageCount ?? 0,
    pages: summary.pages?.map((page) => ({
      index: page.index,
      name: page.name,
      itemCount: page.itemCount,
      topLevelCount: (page.topLevelItems ?? page.items ?? []).length
    })) ?? []
  };
}

function createWorkspaceDescriptor(workspace) {
  return {
    id: WORKSPACE_SOURCE_ID,
    kind: 'workspace-library',
    kindLabel: KIND_LABELS['workspace-library'],
    filePath: null,
    fileName: null,
    label: 'All Loaded Saves',
    subtitle: `${workspace.sourceCount} files loaded`,
    itemCount: workspace.totalTopLevelItemCount,
    pageCount: 0,
    pages: []
  };
}

function createMatchEntry(entry, selectedItemKey) {
  const itemKey = getItemKey(entry);
  return {
    itemKey,
    selected: itemKey === selectedItemKey,
    displayName: entry.displayName,
    code: entry.code,
    qualityLabel: entry.qualityLabel,
    propertyCount: entry.propertyCount,
    propertiesComplete: entry.propertiesComplete,
    totalSockets: entry.totalSockets,
    isRuneword: entry.item?.isRuneword ?? false,
    sourceLabel: getEntrySourceLabel(entry),
    locationLabel: describeLocation(entry)
  };
}

function createPanelItem(entry, selectedItemKey) {
  const panelKey = `${entry.location}/${entry.panel}`;
  const itemKey = getItemKey(entry);
  return {
    itemKey,
    selected: itemKey === selectedItemKey,
    displayName: entry.displayName,
    code: entry.code,
    qualityLabel: entry.qualityLabel,
    propertyCount: entry.propertyCount,
    propertiesComplete: entry.propertiesComplete,
    socketsFilled: entry.socketsFilled,
    totalSockets: entry.totalSockets,
    isRuneword: entry.item?.isRuneword ?? false,
    column: entry.column ?? 0,
    row: entry.row ?? 0,
    width: entry.item.invWidth ?? 1,
    height: entry.item.invHeight ?? 1,
    panelKey
  };
}

function sortPanels(left, right) {
  const leftDetails = PANEL_DETAILS[left.key] ?? {};
  const rightDetails = PANEL_DETAILS[right.key] ?? {};
  const leftOrder = leftDetails.order ?? 999;
  const rightOrder = rightDetails.order ?? 999;

  return leftOrder - rightOrder || left.label.localeCompare(right.label);
}

function createPanels(entries, selectedItemKey) {
  const panelsByKey = new Map();

  for (const entry of entries) {
    const key = `${entry.location}/${entry.panel}`;
    const panelDetails = PANEL_DETAILS[key] ?? {};
    if (!panelsByKey.has(key)) {
      panelsByKey.set(key, {
        key,
        label: panelDetails.label ?? `Location ${entry.location} / Panel ${entry.panel}`,
        columns: panelDetails.columns ?? 0,
        rows: panelDetails.rows ?? 0,
        items: []
      });
    }

    const panel = panelsByKey.get(key);
    panel.items.push(createPanelItem(entry, selectedItemKey));
    panel.columns = Math.max(panel.columns, (entry.column ?? 0) + (entry.item.invWidth ?? 1));
    panel.rows = Math.max(panel.rows, (entry.row ?? 0) + (entry.item.invHeight ?? 1));
  }

  return [...panelsByKey.values()]
    .map((panel) => ({
      ...panel,
      columns: Math.max(panel.columns, 4),
      rows: Math.max(panel.rows, 4)
    }))
    .sort(sortPanels);
}

function createSelectedItem(entry, pd2Tables) {
  if (!entry) {
    return null;
  }

  const { item } = entry;
  const propertyLists = (item.propertyLists ?? [])
    .map((propertyList) => formatPropertyListForDisplay(propertyList, pd2Tables));
  const isRuneword = item.isRuneword ?? false;
  const runewordRecipe = isRuneword && item.children?.length
    ? item.children.map((child) => child.displayName).join(' + ')
    : null;
  return {
    itemKey: getItemKey(entry),
    displayName: entry.displayName,
    code: entry.code,
    qualityLabel: entry.qualityLabel,
    isRuneword,
    runewordRecipe,
    sourceLabel: getEntrySourceLabel(entry),
    panelLabel: describeLocation(entry),
    dimensions: `${item.invWidth ?? 1} x ${item.invHeight ?? 1}`,
    propertyStatus: entry.propertiesComplete ? 'complete' : 'partial',
    propertyCount: entry.propertyCount,
    propertyParseError: item.propertyParseError ?? null,
    socketsFilled: entry.socketsFilled,
    totalSockets: entry.totalSockets,
    itemLevel: item.itemLevel ?? null,
    fingerprint: item.fingerprint ?? null,
    defense: item.defense ?? null,
    durability: item.maxDurability
      ? `${item.currentDurability}/${item.maxDurability}`
      : null,
    stackSize: item.stackSize ?? null,
    section: item.section ?? null,
    type: item.type ?? null,
    type2: item.type2 ?? null,
    flags: [
      item.isIdentified ? 'Identified' : null,
      item.isEthereal ? 'Ethereal' : null,
      item.isRuneword ? 'Runeword' : null,
      item.isSocketed ? 'Socketed' : null,
      item.isPersonalized ? 'Personalized' : null
    ].filter(Boolean),
    properties: (item.properties ?? []).map(serializeProperty),
    propertyLists,
    children: (item.children ?? []).map((child) => serializeChildItem(child, pd2Tables))
  };
}

function createSummaryCard(summary, visibleItemCount, matchedItemCount, selectedPage) {
  return {
    kind: summary.kind,
    kindLabel: KIND_LABELS[summary.kind] ?? summary.kind,
    filePath: summary.filePath,
    fileName: summary.fileName,
    label: getSourceLabel(summary),
    subtitle: getSourceSubtitle(summary),
    visibleItemCount,
    matchedItemCount,
    sourceCount: null,
    selectedPage: selectedPage
      ? {
          index: selectedPage.index,
          name: selectedPage.name,
          itemCount: selectedPage.itemCount,
          topLevelCount: (selectedPage.topLevelItems ?? selectedPage.items ?? []).length
        }
      : null
  };
}

function createWorkspaceSummary(workspace, matchedItemCount) {
  return {
    kind: 'workspace-library',
    kindLabel: KIND_LABELS['workspace-library'],
    filePath: null,
    fileName: null,
    label: 'All Loaded Saves',
    subtitle: 'Workspace-wide read-only search across parsed top-level items',
    visibleItemCount: workspace.totalTopLevelItemCount,
    matchedItemCount,
    sourceCount: workspace.sourceCount,
    selectedPage: null
  };
}

function createPages(summary, selectedPage) {
  if (!summary.pages) {
    return [];
  }

  return summary.pages.map((page) => ({
    index: page.index,
    name: page.name,
    itemCount: page.itemCount,
    topLevelCount: (page.topLevelItems ?? page.items ?? []).length,
    selected: page.index === selectedPage?.index
  }));
}

function getSelectedPage(summary, pageSpecifier) {
  if (!summary.pages || summary.pages.length === 0) {
    return null;
  }

  if (pageSpecifier === undefined || pageSpecifier === null || pageSpecifier === '') {
    return summary.pages[0];
  }

  return resolvePage(summary, pageSpecifier) ?? summary.pages[0];
}

function normalizeCompleteOnly(value) {
  return value === true || value === 'true' || value === '1';
}

export function discoverSaveFiles(inputPaths = []) {
  const files = [];
  const uniqueFiles = new Set();

  for (const inputPath of getDefaultInputs(inputPaths)) {
    const resolvedPath = normalizeFilePath(inputPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Save path does not exist: ${resolvedPath}`);
    }

    walkSaveFiles(resolvedPath, files);
  }

  return files
    .filter((filePath) => {
      if (uniqueFiles.has(filePath)) {
        return false;
      }

      uniqueFiles.add(filePath);
      return true;
    });
}

export function loadInspectorWorkspace(inputPaths = [], options = {}) {
  const pd2Tables = options.pd2Tables ?? loadPd2Tables();
  const filePaths = discoverSaveFiles(inputPaths);
  const sources = filePaths.map((filePath, index) => ({
    id: `source-${index + 1}`,
    summary: inspectSaveFile(filePath, { ...options, pd2Tables })
  }));
  const totalTopLevelItemCount = sources.reduce(
    (sum, source) => sum + countTopLevelItems(source.summary),
    0
  );

  return {
    loadedFrom: getDefaultInputs(inputPaths).map(normalizeFilePath),
    sourceCount: sources.length,
    totalTopLevelItemCount,
    pd2Tables,
    sources
  };
}

export function getInspectorCatalog(workspace) {
  const defaultSourceId = workspace.sources[0]?.id ?? null;
  return {
    loadedFrom: workspace.loadedFrom,
    sourceCount: workspace.sourceCount,
    defaultSourceId,
    sources: [
      createWorkspaceDescriptor(workspace),
      ...workspace.sources.map(createSourceDescriptor)
    ]
  };
}

function buildWorkspaceInspectorView(workspace, options = {}) {
  const hasActiveFilters = Boolean(
    (options.query && `${options.query}`.trim())
    || (options.quality && `${options.quality}`.trim())
    || normalizeCompleteOnly(options.completeOnly)
    || (options.socketFilter && `${options.socketFilter}`.trim())
  );

  if (!hasActiveFilters) {
    return {
      source: createWorkspaceDescriptor(workspace),
      summary: createWorkspaceSummary(workspace, 0),
      filters: {
        page: null,
        query: options.query ?? '',
        quality: options.quality ?? '',
        sort: options.sort ?? 'name',
        completeOnly: normalizeCompleteOnly(options.completeOnly)
      },
      pages: [],
      panels: [],
      matches: [],
      selectedItem: null
    };
  }

  const allEntries = workspace.sources.flatMap((source) => collectBrowseEntries(source.summary));
  const filteredEntries = filterBrowseEntries(allEntries, options);
  const sortedEntries = sortBrowseEntries(filteredEntries, options.sort ?? 'name');
  const selectedEntry = sortedEntries.find((entry) => getItemKey(entry) === options.selectedItemKey)
    ?? sortedEntries[0]
    ?? null;
  const selectedItemKey = selectedEntry ? getItemKey(selectedEntry) : null;

  return {
    source: createWorkspaceDescriptor(workspace),
    summary: createWorkspaceSummary(workspace, filteredEntries.length),
    filters: {
      page: null,
      query: options.query ?? '',
      quality: options.quality ?? '',
      sort: options.sort ?? 'name',
      completeOnly: normalizeCompleteOnly(options.completeOnly)
    },
    pages: [],
    panels: [],
    matches: sortedEntries.map((entry) => createMatchEntry(entry, selectedItemKey)),
    selectedItem: createSelectedItem(selectedEntry, workspace.pd2Tables)
  };
}

export function buildInspectorView(workspace, options = {}) {
  if (workspace.sources.length === 0) {
    return {
      source: null,
      summary: null,
      pages: [],
      panels: [],
      matches: [],
      selectedItem: null
    };
  }

  if (options.sourceId === WORKSPACE_SOURCE_ID) {
    return buildWorkspaceInspectorView(workspace, options);
  }

  const source = workspace.sources.find((entry) => entry.id === options.sourceId)
    ?? workspace.sources[0];
  const summary = source.summary;
  const selectedPage = getSelectedPage(summary, options.page);
  const browseOptions = {
    page: selectedPage?.name ?? null,
    query: options.query ?? '',
    quality: options.quality ?? '',
    sort: options.sort ?? 'name',
    completeOnly: normalizeCompleteOnly(options.completeOnly),
    socketFilter: options.socketFilter ?? ''
  };
  const visibleEntries = collectBrowseEntries(summary, { page: browseOptions.page });
  const filteredEntries = filterBrowseEntries(visibleEntries, browseOptions);
  const sortedEntries = sortBrowseEntries(filteredEntries, browseOptions.sort);
  const hasActiveFilters = browseOptions.query || browseOptions.quality || browseOptions.completeOnly || browseOptions.socketFilter;
  const selectedEntry = sortedEntries.find((entry) => getItemKey(entry) === options.selectedItemKey)
    ?? sortedEntries[0]
    ?? (hasActiveFilters ? null : visibleEntries[0] ?? null);
  const selectedItemKey = selectedEntry ? getItemKey(selectedEntry) : null;
  const visibleItems = getVisibleItems(summary, selectedPage);
  const itemsToRender = hasActiveFilters ? filteredEntries : visibleEntries;

  return {
    source: createSourceDescriptor(source),
    summary: createSummaryCard(summary, visibleItems.length, filteredEntries.length, selectedPage),
    filters: browseOptions,
    pages: createPages(summary, selectedPage),
    panels: createPanels(itemsToRender, selectedItemKey),
    matches: sortedEntries.map((entry) => createMatchEntry(entry, selectedItemKey)),
    selectedItem: createSelectedItem(selectedEntry, workspace.pd2Tables)
  };
}
