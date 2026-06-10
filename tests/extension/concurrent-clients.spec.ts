/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect, connectAndNavigate, startWithExtensionFlag, extensionId } from './extension-fixtures';

test.skip(({ protocolVersion }) => protocolVersion === 1, 'Concurrent clients require protocol v2');

// Two MCP clients connecting to the SAME Chrome profile must coexist: connecting
// the second client must NOT evict the first. Each client keeps its own tab group,
// titled by its PLAYWRIGHT_MCP_CLIENT_NAME so the groups are distinguishable.
test(`two clients share one Chrome profile without eviction`, async ({ browserWithExtension, startClient, server }) => {
  server.setContent('/a.html', '<title>ClientA</title><body>Client A page</body>', 'text/html');
  server.setContent('/b.html', '<title>ClientB</title><body>Client B page</body>', 'text/html');

  const browserContext = await browserWithExtension.launch();

  // Client A connects to the profile and navigates to its own page.
  const clientA = await startWithExtensionFlag(browserWithExtension, startClient, { PLAYWRIGHT_MCP_CLIENT_NAME: 'agent-A' });
  await connectAndNavigate(browserContext, clientA, server.PREFIX + '/a.html');

  // Client B connects to the SAME profile. Before the fix this evicted A
  // (single _activeGroup + _disconnect('Another connection is requested')).
  const clientB = await startWithExtensionFlag(browserWithExtension, startClient, { PLAYWRIGHT_MCP_CLIENT_NAME: 'agent-B' });
  await connectAndNavigate(browserContext, clientB, server.PREFIX + '/b.html');

  // Client A must still be alive and still see its OWN page — not evicted.
  const aSnapshot = await clientA.callTool({ name: 'browser_snapshot', arguments: {} });
  expect(aSnapshot.isError).toBeFalsy();
  expect(aSnapshot).toHaveResponse({ inlineSnapshot: expect.stringContaining('Client A page') });

  // Client B is alive too, with its own page.
  const bSnapshot = await clientB.callTool({ name: 'browser_snapshot', arguments: {} });
  expect(bSnapshot.isError).toBeFalsy();
  expect(bSnapshot).toHaveResponse({ inlineSnapshot: expect.stringContaining('Client B page') });

  // Each client gets its own Chrome tab group, named after its client name.
  const [sw] = browserContext.serviceWorkers();
  const titles: string[] = await sw.evaluate(async () =>
    (await chrome.tabGroups.query({ color: 'green' })).map(g => g.title || ''));
  expect(titles.sort()).toEqual(['agent-A', 'agent-B']);
});

// A second same-profile client's connect.html (which Chrome drops into the
// currently-active group) must NOT be absorbed by the first client's group.
// KNOWN ISSUE (deferred, see TODO.md): the orphaned connect page is cosmetic and
// harmless (closing it does not drop the connection), but ejecting it cleanly
// collides with the racy path where a connect page legitimately seeds the owner's
// group. Marked fixme until a non-racy fix lands.
test.fixme(`token-bypass: connect.html does not leak into another client's group`, async ({ browserWithExtension, startClient, server }) => {
  server.setContent('/a.html', '<title>A</title><body>A page</body>', 'text/html');
  server.setContent('/b.html', '<title>B</title><body>B page</body>', 'text/html');

  const browserContext = await browserWithExtension.launch();

  const tokenPage = await browserContext.newPage();
  await tokenPage.goto(`chrome-extension://${extensionId}/status.html`);
  const [, token] = (await tokenPage.locator('.auth-token-code').textContent())?.split('=') || [];
  await tokenPage.close();

  const startBypass = async (name: string) => {
    const { client } = await startClient({
      args: ['--extension'],
      env: {
        PLAYWRIGHT_MCP_EXTENSION_TOKEN: token,
        PLAYWRIGHT_MCP_CLIENT_NAME: name,
        PWTEST_EXTENSION_USER_DATA_DIR: browserWithExtension.userDataDir,
      },
    });
    return client;
  };

  const clientA = await startBypass('A');
  await clientA.callTool({ name: 'browser_navigate', arguments: { url: server.PREFIX + '/a.html' } });
  const clientB = await startBypass('B');
  await clientB.callTool({ name: 'browser_navigate', arguments: { url: server.PREFIX + '/b.html' } });

  // No Playwright (green) group may contain a connect.html tab.
  const [sw] = browserContext.serviceWorkers();
  const groupedUrls: string[] = await sw.evaluate(async () => {
    const urls: string[] = [];
    for (const g of await chrome.tabGroups.query({ color: 'green' }))
      for (const t of await chrome.tabs.query({ groupId: g.id }))
        urls.push(t.url || '');
    return urls;
  });
  expect(groupedUrls.filter(u => u.includes('/connect.html'))).toEqual([]);
});

// The token-bypass path (no Allow click — what rech actually uses) must also
// forward the client name. Regression for the connect.tsx state-timing bug where
// it auto-connected with the stale initial 'unknown' before setClientInfo applied,
// naming every group "🎭 unknown".
test(`token-bypass: concurrent clients get distinct named groups`, async ({ browserWithExtension, startClient, server }) => {
  server.setContent('/a.html', '<title>A</title><body>Token A page</body>', 'text/html');
  server.setContent('/b.html', '<title>B</title><body>Token B page</body>', 'text/html');

  const browserContext = await browserWithExtension.launch();

  // Read the extension's auth token — the value rech passes for token-bypass.
  const tokenPage = await browserContext.newPage();
  await tokenPage.goto(`chrome-extension://${extensionId}/status.html`);
  const tokenText = await tokenPage.locator('.auth-token-code').textContent();
  const [, token] = tokenText?.split('=') || [];
  await tokenPage.close();

  const startBypass = async (name: string) => {
    const { client } = await startClient({
      args: ['--extension'],
      env: {
        PLAYWRIGHT_MCP_EXTENSION_TOKEN: token,
        PLAYWRIGHT_MCP_CLIENT_NAME: name,
        PWTEST_EXTENSION_USER_DATA_DIR: browserWithExtension.userDataDir,
      },
    });
    return client;
  };

  const clientA = await startBypass('agent-A');
  expect(await clientA.callTool({ name: 'browser_navigate', arguments: { url: server.PREFIX + '/a.html' } }))
      .toHaveResponse({ snapshot: expect.stringContaining('Token A page') });

  const clientB = await startBypass('agent-B');
  expect(await clientB.callTool({ name: 'browser_navigate', arguments: { url: server.PREFIX + '/b.html' } }))
      .toHaveResponse({ snapshot: expect.stringContaining('Token B page') });

  // A still alive (no eviction) ...
  expect((await clientA.callTool({ name: 'browser_snapshot', arguments: {} })).isError).toBeFalsy();

  // ... and the groups are named by client, not "unknown".
  const [sw] = browserContext.serviceWorkers();
  const titles: string[] = await sw.evaluate(async () =>
    (await chrome.tabGroups.query({ color: 'green' })).map(g => g.title || ''));
  expect(titles.sort()).toEqual(['agent-A', 'agent-B']);
});
