import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
const api = await import('../cline-plugin/tool-plan.mjs').catch(() => ({}));
const selected = { providerID: 'local', id: 'model' };
const step = { tool: 'read_files', input: { files: [{ path: 'C:\\source.js' }] } };
const wrap = steps => `ARCHI_TOOL_PLAN_BEGIN\n${JSON.stringify({ steps })}\nARCHI_TOOL_PLAN_END`;
const call = (id, tool = step.tool, input = step.input) => ({ toolCall: { toolCallId: id, toolName: tool }, input });
async function fixture(t, steps = [step]) {
  assert.equal(typeof api.parseToolPlan, 'function');
  const directory = await mkdtemp(join(tmpdir(), 'archi-tool-plan-'));
  t.after(async () => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true }); });
  const options = { plan: api.parseToolPlan(wrap(steps)), sessionID: 'session', promptID: 'human', budgetDirectory: directory };
  return { options, flow: api.createToolWorkflow(options) };
}
test('only explicit bounded valid plans are accepted', () => {
  assert.equal(typeof api.parseToolPlan, 'function');
  assert.equal(api.parseToolPlan('ordinary task'), null);
  assert.equal(api.parseToolPlan('Explain ARCHI_TOOL_PLAN_BEGIN syntax'), null);
  assert.deepEqual(api.parseToolPlan(wrap([step])).steps, [step]);
  for (const text of [wrap([]), wrap(Array(9).fill(step)), wrap([{tool:'unknown',input:{}}]),
    wrap([{...step, extra:true}]), 'ARCHI_TOOL_PLAN_BEGIN\n{}', wrap([step])+wrap([step])])
    assert.throws(() => api.parseToolPlan(text));
});
test('wrong tool is skipped twice, third distinct failure stops and does not advance', async t => {
  const {flow}=await fixture(t);
  for (let i=1;i<=2;i++) { const r=await flow.beforeTool(call(`bad-${i}`,'run_commands',{commands:['wrong']}),selected);
    assert.equal(r.skip,true);assert.match(r.reason,/read_files/);assert.match(r.reason,new RegExp(`${i}/2`)); }
  assert.equal((await flow.beforeTool(call('bad-3','run_commands',{}),selected)).stop,true);
  assert.match(flow.missing(),/read_files/);
});
test('wrong arguments are not executed, correct call can recover and success completes step', async t => {
  const {flow}=await fixture(t);
  assert.equal((await flow.beforeTool(call('bad','read_files',{files:[{path:'wrong'}]}),selected)).skip,true);
  const good=call('good');assert.equal(await flow.beforeTool(good,selected),undefined);
  flow.afterTool({...good,result:{output:[{success:true}]}});
  assert.equal(flow.missing(),null);
});
test('failed, foreign and out-of-order results never satisfy a step', async t => {
  const {flow}=await fixture(t,[step,{tool:'run_commands',input:{commands:['hash']}}]);
  const good=call('good');await flow.beforeTool(good,selected);
  flow.afterTool({...call('foreign'),result:{output:[{success:true}]}});assert.match(flow.missing(),/read_files/);
  flow.afterTool({...good,result:{output:[{success:false}]}});assert.match(flow.missing(),/read_files/);
  const retry=call('retry');await flow.beforeTool(retry,selected);flow.afterTool({...retry,result:{output:[{success:true}]}});
  assert.match(flow.missing(),/run_commands/);
});
test('duplicate failure and reload do not reset the correction limit; model change stops', async t => {
  const {flow,options}=await fixture(t);
  const wrong=call('bad','run_commands',{});assert.equal((await flow.beforeTool(wrong,selected)).skip,true);
  assert.equal((await flow.beforeTool(wrong,selected)).skip,true);
  const reload=api.createToolWorkflow(options);
  assert.match((await reload.beforeTool(call('bad-2','run_commands',{}),selected)).reason,/2\/2/);
  assert.equal((await reload.beforeTool(call('bad-3','run_commands',{}),selected)).stop,true);
  assert.equal((await reload.beforeTool(call('good'),{...selected,id:'other'})).stop,true);
});

test('reusing a call ID for altered arguments stops even after a reload', async t => {
  const {flow,options}=await fixture(t);
  assert.equal((await flow.beforeTool(call('same','run_commands',{commands:['first']}),selected)).skip,true);
  const reload=api.createToolWorkflow(options);
  assert.equal((await reload.beforeTool(call('same','run_commands',{commands:['changed']}),selected))?.stop,true);
});
