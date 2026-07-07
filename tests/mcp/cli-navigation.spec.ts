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

import { test, expect } from './cli-fixtures';

test('go-back', async ({ cli, server }) => {
  await cli('open', server.HELLO_WORLD);
  await cli('goto', server.PREFIX);
  const { output } = await cli('go-back');
  expect(output).toContain(`### Page
- Page URL: ${server.HELLO_WORLD}
- Page Title: Title`);
});

test('go-forward', async ({ cli, server }) => {
  await cli('open', server.PREFIX);
  await cli('goto', server.HELLO_WORLD);
  await cli('go-back');
  const { output } = await cli('go-forward');
  expect(output).toContain(`### Page
- Page URL: ${server.HELLO_WORLD}
- Page Title: Title`);
});

test('open without url opens about:blank', async ({ cli }) => {
  const { output } = await cli('open');
  expect(output).toContain('- Page URL: about:blank');
});

test('tab-new with url', async ({ cli, server }) => {
  await cli('open');
  const { output } = await cli('tab-new', server.HELLO_WORLD);
  expect(output).toContain(`- 0: [](about:blank)`);
  expect(output).toContain(`- 1: (current) [Title](${server.HELLO_WORLD})`);
});

test('run-code', async ({ cli, server }) => {
  await cli('open', server.HELLO_WORLD);
  const { output } = await cli('run-code', '() => page.title()');
  expect(output).toContain('"Title"');
});

// A page whose network never goes idle (SSE / websocket / poll dashboards). The
// default navigation wait is `domcontentloaded`, NOT `networkidle`, so `open`/`goto`
// must return promptly and keep the session usable.
function neverIdle(server: any) {
  server.setRoute('/hang', () => {}); // never responds -> network never idles
  server.setContent('/', `<title>Streaming</title><body>hi</body><script>fetch('/hang').catch(() => {})</script>`, 'text/html');
}

test('opens a never-idle page promptly and keeps the session usable', async ({ cli, server }) => {
  neverIdle(server);
  const { output } = await cli('open', server.PREFIX);
  expect(output).toContain('- Page Title: Streaming');
  // A slow/streaming navigation must not tear the session down.
  const after = await cli('run-code', '() => page.title()');
  expect(after.output).toContain('"Streaming"');
});

test('open --wait none returns without waiting for the page to settle', async ({ cli, server }) => {
  neverIdle(server);
  const { output } = await cli('open', '--wait', 'none', server.PREFIX);
  expect(output).toContain('### Page');
  expect(output).not.toContain('Timeout');
});

test('goto --wait networkidle --timeout fails fast without tearing down the session', async ({ cli, server }) => {
  neverIdle(server);
  await cli('open', server.PREFIX);
  // networkidle can never be reached; a bounded --timeout must fail fast, not hang.
  const { output } = await cli('goto', '--wait', 'networkidle', '--timeout', '1000', server.PREFIX);
  expect(output).toContain('Timeout 1000ms exceeded');
  // The tab must persist so follow-up commands still work.
  const after = await cli('run-code', '() => page.title()');
  expect(after.output).toContain('"Streaming"');
});
