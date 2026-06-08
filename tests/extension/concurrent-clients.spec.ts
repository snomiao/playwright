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

import { test, expect, connectAndNavigate, startWithExtensionFlag } from './extension-fixtures';

test.skip(({ protocolVersion }) => protocolVersion === 1, 'Concurrent clients require protocol v2');

// Two MCP clients connecting to the SAME Chrome profile must coexist: connecting
// the second client must NOT evict the first. Each client keeps its own tab group.
test(`two clients share one Chrome profile without eviction`, async ({ browserWithExtension, startClient, server }) => {
  server.setContent('/a.html', '<title>ClientA</title><body>Client A page</body>', 'text/html');
  server.setContent('/b.html', '<title>ClientB</title><body>Client B page</body>', 'text/html');

  const browserContext = await browserWithExtension.launch();

  // Client A connects to the profile and navigates to its own page.
  const clientA = await startWithExtensionFlag(browserWithExtension, startClient);
  await connectAndNavigate(browserContext, clientA, server.PREFIX + '/a.html');

  // Client B connects to the SAME profile. Before the fix this evicted A
  // (single _activeGroup + _disconnect('Another connection is requested')).
  const clientB = await startWithExtensionFlag(browserWithExtension, startClient);
  await connectAndNavigate(browserContext, clientB, server.PREFIX + '/b.html');

  // Client A must still be alive and still see its OWN page — not evicted.
  const aSnapshot = await clientA.callTool({ name: 'browser_snapshot', arguments: {} });
  expect(aSnapshot.isError).toBeFalsy();
  expect(aSnapshot).toHaveResponse({ inlineSnapshot: expect.stringContaining('Client A page') });

  // Client B is alive too, with its own page.
  const bSnapshot = await clientB.callTool({ name: 'browser_snapshot', arguments: {} });
  expect(bSnapshot.isError).toBeFalsy();
  expect(bSnapshot).toHaveResponse({ inlineSnapshot: expect.stringContaining('Client B page') });
});
