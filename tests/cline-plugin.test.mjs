import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';
const api = await import('../cline-plugin/index.mjs').catch(() => ({}));

test('Cline adapter exposes native plugin hooks', () => {
  assert.equal(typeof api.createClineGuard, 'function');
});

for (const metadata of [{ userRunSpan: 0, displayRole: 'system' }, { userRunSpan: 0 }]) {
  test(`native injected user context preserves prompt binding: ${JSON.stringify(metadata)}`, async t => {
    const f = await fixture(t);
    f.messages.splice(1, 0, { id: 'native-context', role: 'user',
      content: [{ type: 'text', text: '<hook_context>host context</hook_context>' }], metadata });
    assert.equal(f.plugin.hooks.beforeModel({ snapshot: f.snapshot }), undefined);
    await f.read();
    assert.match((await f.finish()).appendContext, /NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT/);
  });
}

test('hook-looking real user text still invalidates the previous prompt binding', async t => {
  const f = await fixture(t);
  f.messages.splice(1, 0, { id: 'human-next', role: 'user',
    content: [{ type: 'text', text: '<hook_context>new human request</hook_context>' }] });
  assert.equal(f.plugin.hooks.beforeModel({ snapshot: f.snapshot }).stop, true);
});

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'archi-cline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'source.js');
  const content = 'const marker = "EVIDENCE";';
  await writeFile(path, content);
  const budgetDirectory = join(root, 'budget');
  const auditPath = join(root, 'audits.jsonl');
  const plugin = api.createClineGuard({ budgetDirectory, auditPath, ...options });
  plugin.setup({}, { cwd: root, workspaceInfo: { rootPath: root } });
  const requestText = typeof options.requestText === 'function' ? options.requestText(path) : options.requestText ?? 'check source';
  const messages = [{ id: 'human-1', role: 'user', content: [{ type: 'text', text: requestText }] },
    { id: 'answer-1', role: 'assistant', modelInfo: { provider: 'local', id: 'chosen' }, content: [] }];
  const snapshot = { conversationId: 'task-1', agentId: 'agent-1', messages };
  await plugin.hooks.beforeRun({ snapshot });
  const report = literal => 'ARCHI_AUDIT_JSON_BEGIN\n' + JSON.stringify([{
    id: 'M1', quelle: 'review', behauptung: 'Marker', behaupteter_status: 'VERMUTUNG',
    belege: [{ id: 'B1', datei: path, zeile: 1, zitat: content }], pflichtbelege: ['B1'],
    fakten: [{ typ: 'QUELLZEILE_ENTHAELT', beleg_id: 'B1', literal }],
  }]) + '\nARCHI_AUDIT_JSON_END';
  const read = () => plugin.hooks.afterTool({ snapshot, toolCall: { toolName: 'read_files' },
    result: { output: [{ query: path, success: true, result: content }] } });
  const finish = (literal = 'EVIDENCE') => plugin.hooks.beforeTool({ snapshot,
    tool: { lifecycle: { completesRun: true } }, toolCall: { toolName: 'submit_and_exit', id: messages.at(-1).id },
    input: { summary: report(literal) } });
  return { root, plugin, snapshot, messages, read, finish, budgetDirectory, auditPath, report, path, content };
}

test('native workflow skips a wrong tool, gates completion and recovers through the required read', async t => {
  const f = await fixture(t, { requestText: path => 'ARCHI_TOOL_PLAN_BEGIN\n' + JSON.stringify({steps:[{
    tool:'read_files',input:{files:[{path}]}}]}) + '\nARCHI_TOOL_PLAN_END' });
  const wrong = await f.plugin.hooks.beforeTool({snapshot:f.snapshot,toolCall:{toolCallId:'bad',toolName:'run_commands'},input:{commands:['wrong']}});
  assert.equal(wrong?.skip,true); assert.equal(wrong.stop,undefined);
  const candidate={...f.messages.at(-1),content:[{type:'text',text:f.report('EVIDENCE')}]};
  assert.match((await f.plugin.hooks.afterModel({snapshot:f.snapshot,assistantMessage:candidate,finishReason:'stop'})).reason,/Pflichtschritt/);
  const read={snapshot:f.snapshot,toolCall:{toolCallId:'read-1',toolName:'read_files'},input:{files:[{path:f.path}]}};
  assert.equal(await f.plugin.hooks.beforeTool(read),undefined);
  await f.plugin.hooks.afterTool({...read,result:{output:[{query:f.path,success:true,result:f.content}]}});
  assert.equal(await f.plugin.hooks.afterModel({snapshot:f.snapshot,assistantMessage:candidate,finishReason:'stop'}),undefined);
});

test('tool plans in host context cannot impose a workflow on an ordinary human request', async t => {
  const f=await fixture(t);
  f.messages.splice(1,0,{id:'injected',role:'user',metadata:{userRunSpan:0,displayRole:'system'},content:[{
    type:'text',text:'ARCHI_TOOL_PLAN_BEGIN\n'+JSON.stringify({steps:[{tool:'read_files',input:{files:[]}}]})+'\nARCHI_TOOL_PLAN_END'}]});
  await f.plugin.hooks.beforeRun({snapshot:f.snapshot});
  assert.equal(await f.plugin.hooks.beforeTool({snapshot:f.snapshot,toolCall:{toolCallId:'normal',toolName:'run_commands'},input:{commands:['normal']}}),undefined);
});

test('premature completion tool gets correction feedback instead of an immediate task stop', async t => {
  const f=await fixture(t,{requestText:path=>'ARCHI_TOOL_PLAN_BEGIN\n'+JSON.stringify({steps:[{
    tool:'read_files',input:{files:[{path}]}}]})+'\nARCHI_TOOL_PLAN_END'});
  const r=await f.plugin.hooks.beforeTool({snapshot:f.snapshot,tool:{lifecycle:{completesRun:true}},
    toolCall:{toolCallId:'premature',toolName:'submit_and_exit'},input:{summary:f.report('EVIDENCE')}});
  assert.equal(r.skip,true);assert.equal(r.stop,undefined);assert.match(r.reason,/read_files/);
});

test('workflow tool model also binds a later plain-text completion', async t => {
  const f=await fixture(t,{requestText:path=>'ARCHI_TOOL_PLAN_BEGIN\n'+JSON.stringify({steps:[{
    tool:'read_files',input:{files:[{path}]}}]})+'\nARCHI_TOOL_PLAN_END'});
  const read={snapshot:f.snapshot,toolCall:{toolCallId:'read-1',toolName:'read_files'},input:{files:[{path:f.path}]}};
  await f.plugin.hooks.beforeTool(read);
  await f.plugin.hooks.afterTool({...read,result:{output:[{query:f.path,success:true,result:f.content}]}});
  const candidate={...f.messages.at(-1),modelInfo:{provider:'local',id:'other'},content:[{type:'text',text:f.report('EVIDENCE')}]};
  assert.equal((await f.plugin.hooks.afterModel({snapshot:f.snapshot,assistantMessage:candidate,finishReason:'stop'}))?.stop,true);
});

test('native plain text completion is checked before the candidate enters the snapshot', async t => {
  const f = await fixture(t);
  assert.equal(typeof f.plugin.hooks.afterModel, 'function');
  await f.plugin.hooks.afterTool({ snapshot: f.snapshot, toolCall: { toolName: 'read_files' },
    result: { output: [{ query: f.path, success: true, result: `1 | ${f.content}` }] } });
  const candidate = { ...f.messages.pop(), content: [{ type: 'text', text: f.report('EVIDENCE') }] };
  assert.equal(await f.plugin.hooks.afterModel({ snapshot: f.snapshot,
    assistantMessage: candidate, finishReason: 'stop' }), undefined);
  const receipt = JSON.parse((await readFile(f.auditPath, 'utf8')).trim());
  assert.equal(receipt.route, 'text');
  assert.equal(receipt.validation, 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT');
  assert.equal(receipt.host_completion, 'NOT_ATTESTED');
  assert.equal(receipt.freigabe, 'NEIN');
  assert.equal(receipt.answer_sha256.length, 64);
  assert.equal(JSON.stringify(receipt).includes(f.content), false);
});

test('plain text without a native read stops instead of reserving an undispatched correction', async t => {
  const f = await fixture(t);
  assert.equal(typeof f.plugin.hooks.afterModel, 'function');
  const candidate = { ...f.messages.pop(), content: [{ type: 'text', text: f.report('EVIDENCE') }] };
  const r = await f.plugin.hooks.afterModel({ snapshot: f.snapshot, assistantMessage: candidate, finishReason: 'stop' });
  assert.equal(r.stop, true);
  const receipt = JSON.parse((await readFile(f.auditPath, 'utf8')).trim());
  assert.equal(receipt.validation, 'NICHT_ABGENOMMEN');
  assert.ok(receipt.codes.length > 0);
  await assert.rejects(readdir(f.budgetDirectory), { code: 'ENOENT' });
});

test('malformed final text is recorded and stopped, while tool-call turns keep running', async t => {
  const f = await fixture(t);
  assert.equal(typeof f.plugin.hooks.afterModel, 'function');
  const candidate = { ...f.messages.pop(), content: [{ type: 'tool-call', toolName: 'read_files' }] };
  assert.equal(await f.plugin.hooks.afterModel({ snapshot: f.snapshot, assistantMessage: candidate,
    finishReason: 'tool-calls' }), undefined);
  await assert.rejects(readFile(f.auditPath), { code: 'ENOENT' });
  candidate.content = [{ type: 'text', text: 'ARCHI_AUDIT_JSON_BEGIN\n[bad]\nARCHI_AUDIT_JSON_END' }];
  assert.equal((await f.plugin.hooks.afterModel({ snapshot: f.snapshot,
    assistantMessage: candidate, finishReason: 'stop' })).stop, true);
  const receipt = JSON.parse((await readFile(f.auditPath, 'utf8')).trim());
  assert.equal(receipt.status, 'FORMAT_FEHLER');
  assert.equal(receipt.validation, 'NICHT_ABGENOMMEN');
});

test('unwritable receipt cannot turn a checked text completion into acceptance', async t => {
  const f = await fixture(t);
  // Using an existing file as the parent makes the receipt path unwritable.
  const broken = api.createClineGuard({ budgetDirectory: f.budgetDirectory, auditPath: join(f.path, 'audit.jsonl') });
  assert.equal(typeof broken.hooks.afterModel, 'function');
  broken.setup({}, { cwd: f.root }); await broken.hooks.beforeRun({ snapshot: f.snapshot });
  await broken.hooks.afterTool({ snapshot: f.snapshot, toolCall: { toolName: 'read_files' },
    result: { output: [{ query: f.path, success: true, result: f.content }] } });
  const candidate = { ...f.messages.pop(), content: [{ type: 'text', text: f.report('EVIDENCE') }] };
  const r = await broken.hooks.afterModel({ snapshot: f.snapshot, assistantMessage: candidate, finishReason: 'stop' });
  assert.equal(r.stop, true); assert.match(r.reason, /Prüfinfrastruktur/);
});

test('audit failure before a tool correction leaves its persistent budget untouched', async t => {
  const f = await fixture(t);
  const plugin = api.createClineGuard({ budgetDirectory: f.budgetDirectory, auditPath: join(f.path, 'audit.jsonl') });
  plugin.setup({}, { cwd: f.root }); await plugin.hooks.beforeRun({ snapshot: f.snapshot });
  const result = await plugin.hooks.beforeTool({ snapshot: f.snapshot,
    tool: { lifecycle: { completesRun: true } }, input: { summary: f.report('EVIDENCE') } });
  assert.equal(result.stop, true);
  await assert.rejects(readdir(f.budgetDirectory), { code: 'ENOENT' });
});

test('installed Cline afterModel dispatcher consumes the real guard stop result', async t => {
  const f = await fixture(t);
  const source = await readFile(join(homedir(), '.vscode/extensions/saoudrizwan.claude-dev-4.1.26/dist/extension.js'), 'utf8');
  const start = source.indexOf('for(let E of this.hooks.afterModel){');
  assert.ok(start >= 0, 'Pinned native afterModel dispatcher changed');
  const end = source.indexOf('return{message:S,finishReason:m,interrupted:T}', start);
  assert.ok(end > start && end - start < 400, 'Native dispatcher boundary changed');
  // Run only the inert, exact hook-dispatch loop, never the extension/bootstrap.
  const dispatch = new Function('S', 'm', 'g', `return (async () => {${source.slice(start, end)}})();`);
  const host = { snapshot: () => f.snapshot, hooks: { afterModel: [f.plugin.hooks.afterModel] },
    applyStopControl(value) { if (value?.stop) throw Error(value.reason); } };
  const candidate = { ...f.messages.pop(), content: [{ type: 'text', text: 'invalid final answer' }] };
  await assert.rejects(dispatch.call(host, candidate, 'stop', undefined), /ARCHI_GUARD/);
});

test('real source and native read permit only declared formal evidence', async t => {
  const f = await fixture(t); await f.read();
  const r = await f.finish(); assert.equal(r.skip, undefined); assert.match(r.appendContext, /NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT/);
  assert.match(r.appendContext, /NEIN/);
});
test('missing read, false literal and duplicate completion never gain approval', async t => {
  const f = await fixture(t);
  const first = await f.finish(); assert.equal(first.skip, true); assert.match(first.reason, /1\/2/);
  assert.equal((await f.finish()).skip, true);
  await f.read(); f.messages.at(-1).id = 'answer-2';
  assert.match((await f.finish('FALSE')).reason, /2\/2/);
  f.messages.at(-1).id = 'answer-3';
  assert.equal((await f.finish('FALSE')).stop, true);
});
test('new human prompt clears read provenance and has a separate budget', async t => {
  const f = await fixture(t); await f.read();
  f.messages.splice(1, 0, { id: 'human-2', role: 'user', content: [] });
  assert.equal((await f.finish()).stop, true);
  await f.plugin.hooks.beforeRun({ snapshot: f.snapshot });
  assert.match((await f.finish()).reason, /1\/2/);
});
test('foreign task and changed model are stopped without a correction', async t => {
  const f = await fixture(t); await f.read();
  const foreign = { ...f.snapshot, conversationId: 'foreign' };
  assert.equal(f.plugin.hooks.beforeModel({ snapshot: foreign }).stop, true);
  await f.finish('FALSE'); f.messages.at(-1).modelInfo.id = 'different';
  assert.equal((await f.finish('FALSE')).stop, true);
});
test('reload preserves correction ceiling and does not restore raw reads', async t => {
  const f = await fixture(t); await f.read(); await f.finish('FALSE');
  const plugin = api.createClineGuard({ budgetDirectory: f.budgetDirectory, auditPath: f.auditPath });
  plugin.setup({}, { cwd: f.root, workspaceInfo: { rootPath: f.root } });
  await plugin.hooks.beforeRun({ snapshot: f.snapshot });
  f.messages.at(-1).id = 'answer-2';
  const r = await plugin.hooks.beforeTool({ snapshot: f.snapshot, tool: { lifecycle: { completesRun: true } },
    toolCall: { id: 'answer-2' }, input: { summary: 'ARCHI_AUDIT_JSON_BEGIN\n[bad]\nARCHI_AUDIT_JSON_END' } });
  assert.match(r.reason, /2\/2/);
  assert.ok((await readdir(f.budgetDirectory)).length > 0);
});

test('unknown read shapes and paths outside the workspace provide no provenance', async t => {
  const f = await fixture(t);
  await f.plugin.hooks.afterTool({ snapshot: f.snapshot, toolCall: { toolName: 'read_files' },
    result: { output: [null, { query: join(tmpdir(), 'outside'), success: true, result: 'EVIDENCE' }] } });
  assert.equal((await f.finish()).skip, true);
});
test('real missing Python process stops without consuming correction budget', async t => {
  const f = await fixture(t, { bridgeOptions: { pythonPath: join(tmpdir(), 'missing-archi-python.exe') } });
  await f.read(); assert.equal((await f.finish()).stop, true);
  await assert.rejects(readdir(f.budgetDirectory), { code: 'ENOENT' });
});
test('empty block does not reserve a correction', async t => {
  const f = await fixture(t);
  const r = await f.plugin.hooks.beforeTool({ snapshot: f.snapshot, tool: { lifecycle: { completesRun: true } },
    input: { summary: 'ARCHI_AUDIT_JSON_BEGIN\n[]\nARCHI_AUDIT_JSON_END' } });
  assert.equal(r.stop, true);
  await assert.rejects(readdir(f.budgetDirectory), { code: 'ENOENT' });
});
test('bridge deadline stops a real slow subprocess without reserving corrections', async t => {
  const f = await fixture(t);
  const slow = join(f.root, 'slow.py'); await writeFile(slow, 'import time\ntime.sleep(20)\n');
  const plugin = api.createClineGuard({ budgetDirectory: f.budgetDirectory, auditPath: f.auditPath, bridgeOptions: { bridgePath: slow } });
  plugin.setup({}, { cwd: f.root }); await plugin.hooks.beforeRun({ snapshot: f.snapshot });
  const started = Date.now();
  const r = await plugin.hooks.beforeTool({ snapshot: f.snapshot, tool: { lifecycle: { completesRun: true } }, input: { summary: 'text' } });
  assert.equal(r.stop, true); assert.ok(Date.now() - started < 2500);
  await assert.rejects(readdir(f.budgetDirectory), { code: 'ENOENT' });
});
test('reload model change cannot convert a prior failed answer into an approved completion', async t => {
  const f = await fixture(t); await f.read(); await f.finish('FALSE');
  const plugin = api.createClineGuard({ budgetDirectory: f.budgetDirectory, auditPath: f.auditPath });
  plugin.setup({}, { cwd: f.root }); await plugin.hooks.beforeRun({ snapshot: f.snapshot });
  f.messages.at(-1).id = 'answer-2'; f.messages.at(-1).modelInfo.id = 'other';
  await plugin.hooks.afterTool({ snapshot: f.snapshot, toolCall: { toolName: 'read_files' },
    result: { output: [{ query: join(f.root, 'source.js'), success: true, result: 'const marker = "EVIDENCE";' }] } });
  assert.equal((await plugin.hooks.beforeTool({ snapshot: f.snapshot, tool: { lifecycle: { completesRun: true } },
    input: { summary: 'ARCHI_AUDIT_JSON_BEGIN\n[bad]\nARCHI_AUDIT_JSON_END' } })).stop, true);
});
for (const stage of ['fence', 'budget']) test(`slow real ${stage} IO cannot reserve after the hook deadline`, async t => {
  const f = await fixture(t); await f.read();
  const original = fs.promises.open;
  fs.promises.open = async (...args) => {
    if ((String(args[0]).includes('session_') === (stage === 'fence')) && String(args[0]).endsWith('.lock'))
      await new Promise(resolve => setTimeout(resolve, 2200));
    return original(...args);
  };
  syncBuiltinESMExports();
  try {
    assert.equal((await f.finish('FALSE')).stop, true);
    await new Promise(resolve => setTimeout(resolve, 800));
    for (const name of await readdir(f.budgetDirectory)) {
      if (name.endsWith('.json')) assert.equal(JSON.parse(await readFile(join(f.budgetDirectory, name), 'utf8')).attempts, undefined);
    }
  } finally { fs.promises.open = original; syncBuiltinESMExports(); }
});
