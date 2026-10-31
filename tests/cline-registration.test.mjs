import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['cline-plugin/index.mjs', 'cline-plugin/tool-plan.mjs', 'global-plugin/runtime.mjs', 'global-plugin/core.mjs',
  'global-plugin/correction.mjs', 'archi_bridge_v2.py', 'archi_belegpruefer_v1_1.py', 'archi_schlusspruefer_v2.py'];

test('installed layout imports the complete native plugin through its JS entry', async t => {
  const target = await mkdtemp(path.join(tmpdir(), 'archi-registration-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  for (const name of files) {
    const dest = path.join(target, '.runtime', name);
    await mkdir(path.dirname(dest), { recursive: true }); await copyFile(path.join(root, name), dest);
  }
  for (const name of ['index.js', 'package.json']) await copyFile(path.join(root, 'cline-plugin/loader', name), path.join(target, name));
  const { default: plugin } = await import(pathToFileURL(path.join(target, 'index.js')));
  assert.equal(plugin.name, 'archi-guard');
  assert.equal(typeof plugin.hooks.beforeTool, 'function');
  assert.equal(typeof plugin.hooks.afterModel, 'function');
  const bundled = path.join(homedir(), '.vscode/extensions/saoudrizwan.claude-dev-4.1.26/dist/extension.js');
  if (fs.existsSync(bundled)) {
    // Narrow characterization: execute the installed scanner, never the extension.
    const source = await readFile(bundled, 'utf8');
    const functions = ['zCr', 'MG', 'D6i', 'B6i', 'PLe'].map(name => {
      const start = source.indexOf(`function ${name}(`);
      assert.ok(start >= 0, `Scanner changed: ${name}`);
      const end = source.indexOf('function ', start + 9);
      return source.slice(start, end);
    }).join('\n');
    const scan = vm.runInNewContext(functions + '\nPLe', { Yf: fs, xo: path, kLe: 'plugin.json',
      YCr: 'package.json', R6i: new Set(['.js', '.ts']), HJu: new Set(['node_modules']) });
    assert.deepEqual(Array.from(scan(target)), [path.join(target, 'index.js')]);
  }
});
