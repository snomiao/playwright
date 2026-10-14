import { expect, test } from 'bun:test';

test('profile recovery retires only same-attempt unclaimed pages and never reloads', async () => {
  const attempt = '00000000-0000-4000-8000-000000000001';
  const connect = (id = attempt, endpoint = 'ws://127.0.0.1:12345/relay') => `chrome-extension://test/connect.html?attempt=${id}&mcpRelayUrl=${encodeURIComponent(endpoint)}`;
  const removed: number[] = [];
  let reloads = 0;
  const tabs = [
    { id: 1, url: connect() }, // old attempt page
    { id: 2, url: connect() }, // current recovery page
    { id: 3, url: connect('00000000-0000-4000-8000-000000000002') },
    { id: 4, url: connect(attempt, 'ws://127.0.0.1:54321/another') },
    { id: 5, url: connect() }, // already attached to an active group
    { id: 6, url: connect() }, // navigated since query
    { id: 7, url: 'https://example.com/' },
  ];
  const event = { addListener() {} };
  (globalThis as any).chrome = {
    runtime: { id: 'test', onMessage: event, getURL: (p: string) => 'chrome-extension://test' + p, reload: () => reloads++ },
    action: { onClicked: event },
    tabGroups: { query: async () => [] },
    tabs: { onRemoved: event, query: async () => tabs,
      get: async (id: number) => id === 6 ? { id, url: 'https://example.com/changed' } : tabs.find(t => t.id === id),
      remove: async (id: number) => { removed.push(id); },
    },
  };
  const { PlaywrightExtension } = await import('../../packages/extension/src/background');
  const profile: any = new PlaywrightExtension();
  profile._activeGroups.add({ connectedTabIds: () => [5] });
  await profile._retireSupersededPages({ tab: tabs[1], url: tabs[1].url });
  expect(removed).toEqual([1]);
  expect(reloads).toBe(0);
  removed.length = 0;
  await profile._retireSupersededPages({ tab: { id: 9 }, url: 'https://example.com/?attempt=' + attempt });
  expect(removed).toEqual([]);
});
