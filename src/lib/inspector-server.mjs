import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMuleService } from './mule-service.mjs';

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
  '/bank.js': { filePath: path.join(UI_DIR, 'bank.js'), contentType: 'text/javascript; charset=utf-8' },
  '/bank-search.mjs': { filePath: path.join(LIB_DIR, 'bank-search.mjs'), contentType: 'text/javascript; charset=utf-8' },
  '/bank-sort.mjs': { filePath: path.join(LIB_DIR, 'bank-sort.mjs'), contentType: 'text/javascript; charset=utf-8' },
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

async function readRequestJson(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('JSON requests only.');
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 16384) throw new Error('Request too large.');
  }
  return JSON.parse(body);
}

function createRequestHandler(workspace, mule, options) {
  return async (request, response) => {
    try {
    if (!request.url) {
      writeJson(response, 400, { error: 'Missing request URL.' });
      return;
    }

    const url = new URL(request.url, 'http://127.0.0.1');

    if (options.bankPath) {
      const host = request.headers.host;
      const port = request.socket.localPort;
      if (![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)
        || request.headers.origin && request.headers.origin !== `http://${host}`
        || request.headers['sec-fetch-site'] === 'cross-site') {
        writeJson(response, 403, { error: 'Bank requests must come from this local app.' });
        return;
      }
    }

    if (request.method === 'POST' && options.bankPath && url.pathname.startsWith('/api/bank/')) {
      if (request.headers['x-pd2-mule-token'] !== mule.sessionToken) {
        writeJson(response, 403, { error: 'Invalid app session. Reload this page.' });
        return;
      }
      const input = await readRequestJson(request);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request.');
      const result = url.pathname === '/api/bank/preview' ? mule.preview(input)
        : url.pathname === '/api/bank/commit' ? mule.commit(input.ticket)
          : url.pathname === '/api/bank/refresh' ? mule.refresh() : null;
      if (result === null) { writeJson(response, 404, { error: 'Unknown bank endpoint.' }); return; }
      writeJson(response, 200, result);
      return;
    }

    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'Read-only GET endpoints only.' });
      return;
    }

    if (url.pathname === '/api/bank') {
      writeJson(response, 200, mule.status());
      return;
    }

    if (url.pathname === '/api/bank/item') {
      writeJson(response, 200, { item: mule.itemDetails(url.searchParams.get('itemId')) });
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
    } catch (error) {
      writeJson(response, 400, { error: error.message });
    }
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
  if (options.bankPath && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error('The item bank is available on loopback hosts only.');
  }
  const requestedPort = Number.parseInt(`${options.port ?? 4173}`, 10);
  const port = Number.isNaN(requestedPort) ? 4173 : requestedPort;
  const mule = createMuleService(workspace, options);
  const server = http.createServer(createRequestHandler(workspace, mule, options));

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
