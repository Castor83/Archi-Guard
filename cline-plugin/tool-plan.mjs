import { createHash } from 'node:crypto';
import { reserveCorrection, sameModelReference, setCorrectionFence } from '../global-plugin/correction.mjs';

const tools = new Set(['read_files', 'search_codebase', 'run_commands']);
const hash = value => createHash('sha256').update(value).digest('hex');
const stop = reason => ({ stop: true, reason: `ARCHI_GUARD: ${reason}; Freigabe=NEIN` });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => object(value) && Object.keys(value).length === names.length
  && names.every(name => Object.hasOwn(value, name));
const canonical = (value, depth = 0) => {
  if (depth > 8) throw Error('Tool input nesting limit');
  if (Array.isArray(value)) return '[' + value.map(v => canonical(v, depth + 1)).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k], depth + 1)).join(',') + '}';
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw Error('Non-JSON input');
  return JSON.stringify(value);
};

export function parseToolPlan(text) {
  if (typeof text !== 'string') throw Error('Missing human request');
  const begins = [...text.matchAll(/^ARCHI_TOOL_PLAN_BEGIN\r?$/gm)];
  const ends = [...text.matchAll(/^ARCHI_TOOL_PLAN_END(?:\r?$|<\/user_input>)/gm)];
  if (!begins.length && !ends.length) return null;
  if (begins.length !== 1 || ends.length !== 1) throw Error('Ambiguous tool plan');
  const match = text.match(/(?:^|\n)ARCHI_TOOL_PLAN_BEGIN\r?\n([\s\S]*?)\r?\nARCHI_TOOL_PLAN_END(?:\r?\n|$|<\/user_input>)/);
  if (!match || Buffer.byteLength(match[1], 'utf8') > 16384) throw Error('Invalid or oversized tool plan');
  const plan = JSON.parse(match[1]);
  if (!keys(plan, ['steps']) || !Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 8)
    throw Error('Invalid tool-plan steps');
  for (const step of plan.steps) {
    if (!keys(step, ['tool', 'input']) || !tools.has(step.tool) || !object(step.input)) throw Error('Invalid tool-plan step');
    canonical(step.input);
  }
  return plan;
}

export function createToolWorkflow({ plan, sessionID, promptID, budgetDirectory }) {
  let index = 0, pending, boundModel;
  // Snapshot the plan, never retain a mutable caller-owned argument object.
  const steps = JSON.parse(JSON.stringify(plan.steps));
  const expected = () => steps[index];
  const feedback = () => expected()
    ? `Schritt ${index + 1}/${steps.length} verlangt ${expected().tool} mit exakt den im Werkzeugplan angegebenen Argumenten`
    : 'Pflichtschritte abgeschlossen; jetzt mit geprüftem Auditblock abschließen';
  return {
    missing() { return expected() ? feedback() : null; },
    matchesModel(selected) { return sameModelReference(boundModel, selected); },
    async beforeTool(event, selected) {
      let timer;
      const controller = new AbortController();
      const work = async () => {
        if (!sameModelReference(selected, selected)) return stop('Werkzeugplan: Modellbindung fehlt');
        const callID = event.toolCall?.toolCallId;
        if (typeof callID !== 'string' || !/^[^\s\x00-\x1f]{1,1024}$/.test(callID))
          return stop('Werkzeugplan: native Aufrufkennung fehlt');
        const fence = await setCorrectionFence({ directory: budgetDirectory, sessionID, promptID, model: selected });
        if (controller.signal.aborted) return stop('Werkzeugplan-Prüfzeitlimit');
        if (fence.status !== 'ACTIVE') return stop('Werkzeugplan: Modell-/Auftragsbindung gesperrt');
        boundModel = { ...selected };
        const step = expected();
        const inputHash = hash(canonical(event.input));
        if (step && !pending && event.toolCall.toolName === step.tool && inputHash === hash(canonical(step.input))) {
          pending = { callID, tool: step.tool, inputHash };
          return;
        }
        const reservation = await reserveCorrection({ directory: budgetDirectory, sessionID, promptID, model: selected,
          answerID: callID, answerHash: hash(canonical({ tool: event.toolCall.toolName, input: event.input })),
          strictDuplicateHash: true, signal: controller.signal });
        if (controller.signal.aborted) return stop('Werkzeugplan-Prüfzeitlimit');
        if (['RESERVED', 'DUPLICATE'].includes(reservation.status)) return { skip: true,
          reason: `ARCHI_GUARD: Nicht ausgeführt: ${feedback()}. Korrigiere den Aufruf; ${reservation.attempts}/2; Freigabe=NEIN` };
        return stop('Werkzeugplan: Korrekturversuche erschöpft oder Zustand gesperrt');
      };
      try {
        return await Promise.race([work(), new Promise(resolve => {
          timer = setTimeout(() => { controller.abort(); resolve(stop('Werkzeugplan-Prüfzeitlimit')); }, 2000);
        })]);
      } catch { return stop('Werkzeugplan-Prüfinfrastruktur nicht verfügbar'); }
      finally { clearTimeout(timer); }
    },
    afterTool(event) {
      if (!pending || event.toolCall?.toolCallId !== pending.callID || event.toolCall?.toolName !== pending.tool) return;
      const call = pending; pending = undefined;
      if (hash(canonical(event.input)) !== call.inputHash || event.result?.isError
        || !Array.isArray(event.result?.output) || !event.result.output.length
        || !event.result.output.every(item => item?.success === true)) return;
      index++;
    },
  };
}
