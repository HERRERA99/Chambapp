import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Chrome derives an unpacked extension's id from the "key" in its manifest. The local
// edition's nginx only lets that id reach the API, so both must stay in sync.
test('the local nginx allows exactly the Chambapp extension id', () => {
  const { key } = JSON.parse(readFileSync('extension/manifest.json', 'utf8')) as { key: string };
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  const nginx = readFileSync('docker/web/default.conf.template', 'utf8');
  assert.ok(nginx.includes(`"~^chrome-extension://${id}$" 1;`));
  assert.ok(!/chrome-extension:\/\/\[a-p\]/.test(nginx), 'no wildcard for Chrome extensions');
});
