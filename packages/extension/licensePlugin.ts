// Copyright (c) 2026 rechrome contributors.
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const documents = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt', 'MODIFICATIONS.md'];
const reviewed = new Set(['react', 'react-dom', 'scheduler']);
const banner = '/*! Rechrome fork: modified by rechrome contributors (2026).\n' +
  ' * Playwright: Copyright (c) Microsoft Corporation; Apache-2.0.\n' +
  ' * See LICENSE, NOTICE, MODIFICATIONS.md and THIRD_PARTY_NOTICES.txt. */\n';

export function extensionLicenses(): Plugin {
  return {
    name: 'rechrome-extension-licenses',
    renderChunk(code) {
      return { code: banner + code, map: null };
    },
    generateBundle(_options, bundle) {
      const notices = readFileSync(resolve(__dirname, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          const normalized = id.replaceAll('\0', '').replaceAll('\\', '/');
          const marker = normalized.lastIndexOf('/node_modules/');
          if (marker === -1) continue;
          const segments = normalized.slice(marker + '/node_modules/'.length).split('/');
          const name = segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
          if (!reviewed.has(name)) this.error(`Review and include the license for bundled dependency: ${name}`);
          const packageDir = normalized.slice(0, marker + '/node_modules/'.length) + name;
          const metadata = JSON.parse(readFileSync(`${packageDir}/package.json`, 'utf8'));
          const license = readFileSync(`${packageDir}/LICENSE`, 'utf8').trim();
          if (metadata.license !== 'MIT' || !notices.includes(`${name} ${metadata.version} (MIT)`) || !notices.includes(license))
            this.error(`Refresh THIRD_PARTY_NOTICES.txt for ${name}: version or license changed`);
        }
      }
      for (const name of documents)
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(resolve(__dirname, name)) });
    },
  };
}
