import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const patch = await import('../scripts/Patch-ClineStopNotice.mjs').catch(() => ({}));
const bundled = await readFile(join(homedir(), '.vscode/extensions/saoudrizwan.claude-dev-4.1.26/dist/extension.js'), 'utf8');
function translator(source) {
  const start = source.indexOf('A2n=class{');
  const end = source.indexOf('},l4p=', start);
  assert.ok(start > 0 && end > start && end - start < 6000, 'Native translator changed');
  const helperStart = source.indexOf('function s4p(');
  const helperEnd = source.indexOf('function u4p(', helperStart);
  // Only the exact inert event translator and its status mapping are evaluated.
  const Native = vm.runInNewContext(`${source.slice(helperStart, helperEnd)}\n(${source.slice(start + 4, end + 1)})`);
  return new Native();
}
const event = (status, reason) => ({ type: 'run-finished', snapshot: { lastError: reason },
  result: { status, outputText: 'previous text', iterations: 2,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 } } });

test('native guard abort produces a visible status notice followed by the unchanged done event', () => {
  assert.equal(typeof patch.patchSource, 'function');
  const native = translator(patch.patchSource(bundled));
  const events = native.translate(event('aborted', 'ARCHI_GUARD: FORMAT_FEHLER; Textabschluss nicht abgenommen; Freigabe=NEIN'));
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'notice');
  assert.equal(events[0].displayRole, 'status');
  assert.match(events[0].message, /FORMAT_FEHLER/);
  assert.equal(events[1].type, 'done');
  assert.equal(events[1].reason, 'aborted');
  assert.equal(events[1].text, 'previous text');
  const uiStart = bundled.indexOf('function Cn0(');
  const uiEnd = bundled.indexOf('function ', uiStart + 9);
  const helperStart = bundled.indexOf('function bAi(');
  const helperEnd = bundled.indexOf('function ', helperStart + 9);
  assert.ok(uiStart > 0 && uiEnd - uiStart < 10000 && helperStart > 0);
  // Native notice rendering, without extension startup or live UI interaction.
  const render = vm.runInNewContext(`${bundled.slice(helperStart, helperEnd)}\n${bundled.slice(uiStart, uiEnd)}\nCn0`, { wn0: new Set() });
  const ui = render(events[0], { nextTs: () => 1 });
  assert.equal(ui.length, 1); assert.equal(ui[0].say, 'info');
  assert.equal(ui[0].text, events[0].message);
});

test('normal completion, user cancellation and missing snapshot keep their native behavior', () => {
  assert.equal(typeof patch.patchSource, 'function');
  const native = translator(patch.patchSource(bundled));
  for (const e of [event('completed', 'ARCHI_GUARD: stale'), event('aborted', 'User cancelled'),
    { ...event('aborted'), snapshot: undefined }]) {
    const events = native.translate(e);
    assert.equal(events.length, 1); assert.equal(events[0].type, 'done');
  }
});

test('patch is idempotent and refuses an unknown translator', () => {
  assert.equal(typeof patch.patchSource, 'function');
  const updated = patch.patchSource(bundled);
  assert.equal(patch.patchSource(updated), updated);
  assert.throws(() => patch.patchSource('unknown code'), /anchor/i);
});
