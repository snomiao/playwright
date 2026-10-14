/**
 * Modified by rechrome contributors (2026); see MODIFICATIONS.md.
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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

type Phase = 'launch' | 'recovery-page' | 'ws-accepted' | 'initialized' | 'timeout' | 'closed' | 'launch-failed';
const phases = new Set<Phase>(['launch', 'recovery-page', 'ws-accepted', 'initialized', 'timeout', 'closed', 'launch-failed']);

// Separate from raw stderr: this format accepts no URLs, tokens, names or error text.
export class BridgeAttempt {
  readonly id = randomUUID();
  private _start = Date.now();
  private _file?: string;

  constructor(directory = process.env.PLAYWRIGHT_MCP_BRIDGE_LOG_DIR || path.join(os.homedir(), '.cache', 'ms-playwright', 'bridge')) {
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      this._file = path.join(directory, `${this._start}-${this.id}.bridge.jsonl`);
      fs.closeSync(fs.openSync(this._file, 'wx', 0o600));
    } catch { this._file = undefined; } // Diagnostics must not prevent a connection.
  }

  record(phase: Phase): void {
    if (!this._file || !phases.has(phase))
      return;
    const now = Date.now();
    try {
      fs.appendFileSync(this._file, JSON.stringify({ attempt: this.id, pid: process.pid, time: new Date(now).toISOString(), elapsedMs: now - this._start, phase }) + '\n');
    } catch { /* A full/read-only disk must not terminate the browser session. */ }
  }
}
