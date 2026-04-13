import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildInspectorView,
  getInspectorCatalog,
  loadInspectorWorkspace
} from './inspector-model.mjs';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const LIB_DIR = path.dirname(CURRENT_FILE);
const SRC_DIR = path.dirname(LIB_DIR);
const UI_DIR = path.join(SRC_DIR, 'ui');
const STATIC_FILES = {
  '/': { filePath: path.join(UI_DIR, 'index.html'), contentType: 'text/html; charset=utf-8' },
  '/index.html': { filePath: path.join(UI_DIR, 'index.html'), contentType: 'text/html; charset=utf-8' },
  '/app.js': { filePath: path.join(UI_DIR, 'app.js'), contentType: 'text/javascript; charset=utf-8' },
  '/styles.css': { filePath: path.join(UI_DIR, 'styles.css'), contentType: 'text/css; charset=utf-8' }
};

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function writeStaticFile(response, fileDetails) {
  response.writeHead(200, {
    'Content-Type': fileDetails.contentType,
    'Cache-Control': 'no-store'
  });
  response.end(fs.readFileSync(fileDetails.filePath));
}

function normalizeQueryValue(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = `${value}`.trim();
  return trimmed === '' ? undefined : trimmed;
}

function createRequestHandler(workspace) {
  return (request, response) => {
    if (!request.url) {
      writeJson(response, 400, { error: 'Missing request URL.' });
      return;
    }

    const url = new URL(request.url, 'http://127.0.0.1');

    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'Read-only GET endpoints only.' });
      return;
    }

    if (url.pathname === '/api/catalog') {
      writeJson(response, 200, getInspectorCatalog(workspace));
      return;
    }

    if (url.pathname === '/api/view') {
      const view = buildInspectorView(workspace, {
        sourceId: normalizeQueryValue(url.searchParams.get('sourceId')),
        page: normalizeQueryValue(url.searchParams.get('page')),
        query: url.searchParams.get('query') ?? '',
        quality: url.searchParams.get('quality') ?? '',
        sort: normalizeQueryValue(url.searchParams.get('sort')) ?? 'name',
        completeOnly: url.searchParams.get('completeOnly') ?? false,
        socketFilter: normalizeQueryValue(url.searchParams.get('socketFilter')) ?? '',
        selectedItemKey: normalizeQueryValue(url.searchParams.get('selectedItemKey'))
      });

      writeJson(response, 200, view);
      return;
    }

    const staticFile = STATIC_FILES[url.pathname];
    if (staticFile) {
      writeStaticFile(response, staticFile);
      return;
    }

    writeJson(response, 404, { error: `Not found: ${url.pathname}` });
  };
}

function createServerUrl(host, port) {
  if (host.includes(':') && !host.startsWith('[')) {
    return `http://[${host}]:${port}`;
  }

  return `http://${host}:${port}`;
}

export async function startInspectorServer(inputPaths = [], options = {}) {
  const workspace = loadInspectorWorkspace(inputPaths, options);
  const host = options.host ?? '127.0.0.1';
  const requestedPort = Number.parseInt(`${options.port ?? 4173}`, 10);
  const port = Number.isNaN(requestedPort) ? 4173 : requestedPort;
  const server = http.createServer(createRequestHandler(workspace));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    workspace,
    server,
    url: createServerUrl(host, actualPort)
  };
}
