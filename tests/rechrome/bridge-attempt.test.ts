import { test, expect } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeAttempt } from '../../packages/playwright-core/src/tools/mcp/bridgeAttempt';

test('phase logs retain separate attempts and never accept arbitrary error text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-log-test-'));
  try {
    const a = new BridgeAttempt(dir), b = new BridgeAttempt(dir);
    a.record('launch'); a.record('timeout'); b.record('launch'); b.record('initialized');
    a.record('ws://secret:token@localhost/private' as any);
    const files = readdirSync(dir);
    expect(files.length).toBe(2);
    for (const file of files) {
      expect(statSync(join(dir, file)).mode & 0o777).toBe(0o600);
      const raw = readFileSync(join(dir, file), 'utf8');
      expect(raw).not.toContain('secret');
      const entries = raw.trim().split('\n').map(line => JSON.parse(line));
      expect(entries.length).toBe(2);
      for (const entry of entries) expect(Object.keys(entry).sort()).toEqual(['attempt', 'elapsedMs', 'phase', 'pid', 'time']);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
