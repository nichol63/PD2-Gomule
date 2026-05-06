import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';

import { startInspectorServer } from '../src/lib/inspector-server.mjs';
import { getFixtureLibraryDir } from '../src/lib/workspace-paths.mjs';

const FIXTURE_DIR = getFixtureLibraryDir();

function readJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Request failed: ${response.statusCode} ${body}`));
          return;
        }

        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

function readText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Request failed: ${response.statusCode} ${body}`));
          return;
        }

        resolve(body);
      });
    }).on('error', reject);
  });
}

test('serves catalog, view, and static inspector shell endpoints', async () => {
  const { server, url } = await startInspectorServer([
    path.join(FIXTURE_DIR, 'Legacy.d2s'),
    path.join(FIXTURE_DIR, 'Bases.d2x')
  ], {
    host: '127.0.0.1',
    port: 0
  });

  try {
    const html = await readText(url);
    const catalog = await readJson(`${url}/api/catalog`);
    const workspaceSource = catalog.sources.find((source) => source.kind === 'workspace-library');
    const workspaceView = await readJson(
      `${url}/api/view?sourceId=${workspaceSource.id}&query=horadric%20cube`
    );
    const view = await readJson(
      `${url}/api/view?sourceId=${catalog.defaultSourceId}&query=horadric%20cube`
    );

    assert.match(html, /PD2 Mule Inspector/);
    assert.equal(catalog.sourceCount, 2);
    assert.equal(workspaceView.source.kind, 'workspace-library');
    assert.equal(workspaceView.selectedItem?.code, 'box');
    assert.equal(view.source.kind, 'character');
    assert.equal(view.selectedItem?.code, 'box');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
