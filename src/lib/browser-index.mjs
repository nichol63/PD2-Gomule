const QUALITY_SORT_ORDER = {
  unknown: 0,
  simple: 1,
  low: 2,
  normal: 3,
  superior: 4,
  magic: 5,
  set: 6,
  rare: 7,
  unique: 8,
  crafted: 9,
  ear: 10
};

function getVisibleItems(summary, page = null) {
  if (summary.kind === 'character') {
    return summary.topLevelItems ?? summary.items ?? [];
  }

  if (page) {
    return page.topLevelItems ?? page.items ?? [];
  }

  return summary.pages.flatMap((entry) => entry.topLevelItems ?? entry.items ?? []);
}

function normalizeText(value) {
  return `${value ?? ''}`.trim().toLowerCase();
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

function getQualityRank(item) {
  return QUALITY_SORT_ORDER[item.qualityLabel] ?? 0;
}

// Mirrors the parser-noise filter in property-display.mjs (isParserNoiseProperty).
// Drops properties whose saveBits is strict-equal to 0 — those come from
// ItemStatCost rows with an empty "Save Bits" column and are always parser-
// noise from bit-walk over-read. Test-shape properties with undefined saveBits
// are kept (undefined !== 0). This keeps grid-tile/match-row/details-panel
// counts in sync with formatPropertyListForDisplay's filtered propertyCount.
function countRealProperties(item) {
  const properties = item.properties ?? [];
  let count = 0;
  for (const property of properties) {
    if (property.saveBits !== 0) {
      count += 1;
    }
  }
  return count;
}

function buildSearchText(item, context) {
  const propertyKeys = item.properties?.map((entry) => entry.statKey).join(' ') ?? '';
  const childNames = item.children?.map((entry) => `${entry.displayName} ${entry.code}`).join(' ') ?? '';

  return [
    context.fileName,
    context.characterName,
    context.pageName,
    item.displayName,
    item.code,
    item.qualityLabel,
    item.section,
    item.type,
    item.type2,
    propertyKeys,
    childNames
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function createBrowseEntry(item, context, itemIndex) {
  return {
    item,
    itemIndex,
    filePath: context.filePath,
    fileName: context.fileName,
    sourceKind: context.sourceKind,
    characterName: context.characterName ?? null,
    pageIndex: context.pageIndex ?? null,
    pageName: context.pageName ?? null,
    displayName: item.displayName,
    code: item.code,
    qualityLabel: item.qualityLabel,
    qualityRank: getQualityRank(item),
    propertyCount: countRealProperties(item),
    propertiesComplete: item.propertiesComplete !== false,
    socketsFilled: item.socketsFilled ?? 0,
    totalSockets: item.totalSockets ?? 0,
    childCount: item.children?.length ?? 0,
    section: item.section ?? null,
    type: item.type ?? '',
    type2: item.type2 ?? '',
    location: item.location ?? null,
    panel: item.panel ?? null,
    bodyPosition: item.bodyPosition ?? null,
    row: item.row ?? null,
    column: item.column ?? null,
    searchText: buildSearchText(item, context)
  };
}

export function resolvePage(summary, pageSpecifier) {
  if (!summary.pages) {
    return null;
  }

  if (pageSpecifier === null || pageSpecifier === undefined || pageSpecifier === '') {
    return null;
  }

  const trimmed = `${pageSpecifier}`.trim();
  const numericIndex = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(numericIndex)) {
    const byOneBasedIndex = summary.pages[numericIndex - 1];
    if (byOneBasedIndex) {
      return byOneBasedIndex;
    }
  }

  const normalized = trimmed.toLowerCase();
  return summary.pages.find((page) => page.name.toLowerCase() === normalized)
    ?? summary.pages.find((page) => page.name.toLowerCase().includes(normalized))
    ?? null;
}

export function collectBrowseEntries(summary, options = {}) {
  const page = summary.pages ? resolvePage(summary, options.page ?? null) : null;

  if (summary.pages && options.page && !page) {
    throw new Error(`Could not find stash page: ${options.page}`);
  }

  const visibleItems = getVisibleItems(summary, page);
  const context = {
    filePath: summary.filePath,
    fileName: summary.fileName,
    sourceKind: summary.kind,
    characterName: summary.kind === 'character' ? summary.name : null,
    pageIndex: page?.index ?? null,
    pageName: page?.name ?? null
  };

  if (!page && summary.pages) {
    return summary.pages.flatMap((entry) =>
      (entry.topLevelItems ?? entry.items ?? []).map((item, itemIndex) =>
        createBrowseEntry(
          item,
          {
            ...context,
            pageIndex: entry.index,
            pageName: entry.name
          },
          itemIndex
        )
      )
    );
  }

  return visibleItems.map((item, itemIndex) => createBrowseEntry(item, context, itemIndex));
}

export function filterBrowseEntries(entries, options = {}) {
  const queryTokens = tokenizeText(options.query ?? '');
  const quality = normalizeText(options.quality ?? '');
  const completeOnly = options.completeOnly === true;
  const socketFilter = options.socketFilter ?? '';

  return entries.filter((entry) => {
    if (queryTokens.length > 0) {
      const matchesQuery = queryTokens.every((token) => entry.searchText.includes(token));
      if (!matchesQuery) {
        return false;
      }
    }

    if (quality && normalizeText(entry.qualityLabel) !== quality) {
      return false;
    }

    if (completeOnly && !entry.propertiesComplete) {
      return false;
    }

    if (socketFilter === 'has-sockets' && entry.totalSockets <= 0) {
      return false;
    }

    if (socketFilter === 'filled' && entry.socketsFilled <= 0) {
      return false;
    }

    return true;
  });
}

function compareText(left, right) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

export function sortBrowseEntries(entries, sortKey = 'name') {
  const normalizedSortKey = normalizeText(sortKey || 'name');
  const sorted = [...entries];

  sorted.sort((left, right) => {
    switch (normalizedSortKey) {
      case 'code':
        return compareText(left.code, right.code)
          || compareText(left.displayName, right.displayName);
      case 'quality':
        return right.qualityRank - left.qualityRank
          || compareText(left.displayName, right.displayName);
      case 'properties':
      case 'props':
        return right.propertyCount - left.propertyCount
          || compareText(left.displayName, right.displayName);
      case 'sockets':
        return right.totalSockets - left.totalSockets
          || right.socketsFilled - left.socketsFilled
          || compareText(left.displayName, right.displayName);
      case 'source':
        return compareText(left.fileName, right.fileName)
          || compareText(left.pageName ?? '', right.pageName ?? '')
          || compareText(left.displayName, right.displayName);
      case 'position':
        return (left.location ?? 0) - (right.location ?? 0)
          || (left.panel ?? 0) - (right.panel ?? 0)
          || (left.row ?? 0) - (right.row ?? 0)
          || (left.column ?? 0) - (right.column ?? 0)
          || compareText(left.displayName, right.displayName);
      case 'name':
      default:
        return compareText(left.displayName, right.displayName)
          || compareText(left.code, right.code);
    }
  });

  return sorted;
}

export function limitBrowseEntries(entries, limit = 50) {
  const numericLimit = Number.parseInt(`${limit}`, 10);
  if (Number.isNaN(numericLimit) || numericLimit <= 0) {
    return entries;
  }

  return entries.slice(0, numericLimit);
}

export function listPages(summary, options = {}) {
  if (!summary.pages) {
    throw new Error(`File does not contain stash pages: ${summary.filePath}`);
  }

  const queryTokens = tokenizeText(options.query ?? '');
  return summary.pages.filter((page) => {
    if (queryTokens.length === 0) {
      return true;
    }

    const haystack = `${page.name} ${page.index + 1}`.toLowerCase();
    return queryTokens.every((token) => haystack.includes(token));
  });
}

export function browseSummaryItems(summary, options = {}) {
  const entries = collectBrowseEntries(summary, options);
  const filtered = filterBrowseEntries(entries, options);
  const sorted = sortBrowseEntries(filtered, options.sort);
  return limitBrowseEntries(sorted, options.limit);
}

export function searchSummaries(summaries, options = {}) {
  const entries = summaries.flatMap((summary) => collectBrowseEntries(summary));
  const filtered = filterBrowseEntries(entries, options);
  const sorted = sortBrowseEntries(filtered, options.sort);
  return limitBrowseEntries(sorted, options.limit);
}
