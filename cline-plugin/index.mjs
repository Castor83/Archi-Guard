import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { runBridge, OUTPUT_RULES } from '../global-plugin/runtime.mjs';
import { correctionReasons, reserveCorrection, sameModelReference, setCorrectionFence } from '../global-plugin/correction.mjs';
import { parseToolPlan, createToolWorkflow } from './tool-plan.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const stop = reason => ({ stop: true, reason: `ARCHI_GUARD: ${reason}; Freigabe=NEIN` });
// Cline injects hook context and reminders as user messages with userRunSpan: 0.
// These host messages must not replace the human request that owns the reads.
const user = snapshot => snapshot?.messages?.findLast(m => m.role === 'user'
  && m.metadata?.userRunSpan !== 0 && m.metadata?.displayRole !== 'system');
const assistant = snapshot => snapshot?.messages?.findLast(m => m.role === 'assistant');
const model = (snapshot, candidate) => {
  const info = (candidate ?? assistant(snapshot))?.modelInfo;
  return info && { providerID: info.provider, id: info.id };
};
const token = value => typeof value === 'string' && /^[^\s\x00-\x1f]{1,1024}$/.test(value);
const canonical = path => {
  const result = realpathSync.native(path);
  return process.platform === 'win32' ? result.toLowerCase() : result;
};
const RULES = OUTPUT_RULES.replaceAll('mit read', 'mit read_files')
  .replace('Die automatische Pruefung erfolgt nach der Antwort.',
    'Die automatische Pruefung erfolgt auch bei normalen Textabschluessen; ungueltige oder unbelegte Befunde stoppen den Abschluss.');

/** Native Cline SDK plugin. No file hooks, provider changes or model calls. */
export function createClineGuard(options = {}) {
  let root, owner, state, logger;
  const budgetDirectory = options.budgetDirectory ?? join(homedir(), '.local/state/archi-guard/cline-corrections');
  const auditPath = options.auditPath ?? join(homedir(), '.local/state/archi-guard/cline-audits.jsonl');
  const owned = snapshot => root && owner === JSON.stringify([snapshot?.conversationId, snapshot?.agentId])
    && state?.promptID === user(snapshot)?.id && !snapshot?.parentAgentId;
  const recordCheck = async (event, operation, report) => {
    const formal = report.status === 'GEPRUEFT' && report.rows?.length > 0
      && report.rows.every(row => row.pruefcode === 'BELEGKETTE_FORMAL_VOLLSTAENDIG'
        && row.schlussstatus === 'SCHLUSS_UNGEPRUEFT' && row.freigabe === 'NEIN'
        && row.werkzeugnachweis === 'READ_PFAD_UND_ZITAT_BEOBACHTET');
    const receipt = { schema_version: 1, host: 'cline', route: operation.route,
      checked_at: new Date().toISOString(), workspace_sha256: hash(root ?? ''),
      conversation_sha256: hash(String(event.snapshot?.conversationId ?? '')),
      prompt_sha256: hash(String(user(event.snapshot)?.id ?? '')),
      answer_sha256: hash(String(event.input?.summary ?? '')),
      status: report.status, codes: report.rows.map(row => row.pruefcode),
      validation: formal ? 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT' : 'NICHT_ABGENOMMEN',
      host_completion: 'NOT_ATTESTED', freigabe: 'NEIN' };
    await mkdir(dirname(auditPath), { recursive: true });
    if (operation.expired) return;
    await appendFile(auditPath, JSON.stringify(receipt) + '\n', 'utf8');
    operation.receipt = receipt;
  };
  const complete = async (event, operation) => {
    if (!owned(event.snapshot)) return stop('Auftragsbindung fehlt oder wurde geändert');
    if (state.workflow?.missing()) return stop(`Pflichtschritt fehlt: ${state.workflow.missing()}`);
    const current = state;
    const selected = model(event.snapshot, event.assistantMessage);
    if (current.workflow && !current.workflow.matchesModel(selected)) return stop('Werkzeugplan-Modellwechsel');
    if (!sameModelReference(selected, selected)) return stop('Modellreferenz nicht belegt');
    if (current.model && !sameModelReference(current.model, selected)) return stop('Modellwechsel');
    current.model ??= selected;
    const text = event.input?.summary;
    if (typeof text !== 'string' || !token((event.assistantMessage ?? assistant(event.snapshot))?.id)) return stop('Abschlussformat unbekannt');
    const answerID = (event.assistantMessage ?? assistant(event.snapshot)).id;
    const report = await runBridge({ text, reads: current.reads }, root, { ...options.bridgeOptions, timeoutMs: 1000 });
    operation.report = report;
    if (operation.expired || state !== current || !owned(event.snapshot) || !sameModelReference(selected, model(event.snapshot, event.assistantMessage)))
      return stop('Auftrag oder Modell während Prüfung geändert');
    // Persist the validation result before any correction reservation. An audit
    // failure must never consume a correction the host cannot dispatch.
    await recordCheck(event, operation, report);
    if (operation.expired || state !== current || !owned(event.snapshot)
      || !sameModelReference(selected, model(event.snapshot, event.assistantMessage)))
      return stop('Auftrag, Modell oder Prüfzeit während Quittierung geändert');
    const reasons = correctionReasons(report);
    if (!reasons.length && (report.status !== 'GEPRUEFT' || !report.rows?.length))
      return stop('Keine bestätigten deklarierten Befunde; keine automatische Korrektur');
    // afterModel only supports stop/reason, not skip or automatic continuation.
    // Never reserve a correction that the host cannot dispatch from this hook.
    if (reasons.length && event.assistantMessage)
      return stop(`${reasons.join(',')}; Textabschluss nicht abgenommen`);
    const sessionID = hash(JSON.stringify([root, event.snapshot.conversationId]));
    const fence = await setCorrectionFence({ directory: budgetDirectory,
      sessionID: hash(JSON.stringify([sessionID, current.promptID])), promptID: current.promptID, model: selected });
    if (fence.status !== 'ACTIVE') return stop('Dauerhafte Modellbindung gesperrt');
    if (operation.expired || state !== current || !owned(event.snapshot) || !sameModelReference(selected, model(event.snapshot, event.assistantMessage)))
      return stop('Auftrag oder Modell während Bindung geändert');
    if (reasons.length) {
      const reservation = await reserveCorrection({ directory: budgetDirectory,
        sessionID, promptID: current.promptID,
        model: selected, answerID, answerHash: hash(text), signal: operation.controller.signal });
      if (operation.expired || state !== current || !owned(event.snapshot) || !sameModelReference(selected, model(event.snapshot, event.assistantMessage)))
        return stop('Auftrag oder Modell während Reservierung geändert');
      if (reservation.status === 'RESERVED') return { skip: true,
        reason: `ARCHI_GUARD: ${reasons.join(',')}; gezielt korrigieren, gleicher Auftrag/Modell; ${reservation.attempts}/2; Freigabe=NEIN` };
      if (reservation.status === 'DUPLICATE') return { skip: true, reason: 'ARCHI_GUARD: Doppelte Antwort; keine weitere Reservierung; Freigabe=NEIN' };
      return stop('Korrekturbudget erschöpft oder Zustand gesperrt');
    }
    if (report.status !== 'GEPRUEFT' || !report.rows?.length
      || report.rows.some(row => row.pruefcode !== 'BELEGKETTE_FORMAL_VOLLSTAENDIG'
        || row.schlussstatus !== 'SCHLUSS_UNGEPRUEFT' || row.freigabe !== 'NEIN'
        || row.werkzeugnachweis !== 'READ_PFAD_UND_ZITAT_BEOBACHTET'))
      return stop('Keine bestätigten deklarierten Befunde; keine automatische Korrektur');
    return { appendContext: 'ARCHI_GUARD: NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT; SCHLUSS_UNGEPRUEFT; Freigabe=NEIN' };
  };
  const checkedCompletion = async (event, route) => {
    let timer;
    const operation = { expired: false, route, controller: new AbortController() };
    try {
      return await Promise.race([(async () => {
        const control = await complete(event, operation);
        if (operation.expired) return stop('Prüfzeitlimit');
        const receipt = operation.receipt;
        try { logger?.log?.(`ARCHI_GUARD: ${route}; ${receipt?.status ?? 'NICHT_GEPRUEFT'}; ${receipt?.validation ?? 'NICHT_ABGENOMMEN'}; Antwort-SHA256=${receipt?.answer_sha256 ?? 'unbekannt'}; ${control.reason ?? ''}; Freigabe=NEIN`); }
        catch { /* The persisted receipt, not optional logging, is the proof. */ }
        return control;
      })(), new Promise(resolve => {
        timer = setTimeout(() => { operation.expired = true; operation.controller.abort(); resolve(stop('Prüfzeitlimit')); }, 2000);
      })]);
    } catch { return stop('Prüfinfrastruktur nicht verfügbar'); }
    finally { clearTimeout(timer); }
  };
  return {
    name: 'archi-guard', manifest: { capabilities: ['hooks'] },
    setup(_api, ctx) {
      if (root) throw Error('ARCHI_GUARD: Setup darf nicht wiederverwendet werden');
      const path = ctx.workspaceInfo?.rootPath ?? ctx.cwd;
      if (!isAbsolute(path ?? '') || /^(?:\\\\|\/\/)/.test(path)) throw Error('ARCHI_GUARD: Workspace fehlt');
      root = canonical(path);
      logger = ctx.logger;
    },
    hooks: {
      beforeRun({ snapshot }) {
        if (!root || !token(snapshot?.conversationId) || !token(snapshot?.agentId)
          || !token(user(snapshot)?.id) || snapshot.parentAgentId) return stop('Hostbindung fehlt');
        const identity = JSON.stringify([snapshot.conversationId, snapshot.agentId]);
        if (owner && owner !== identity) return stop('Fremde Sitzung');
        owner = identity;
        let plan;
        try { plan = parseToolPlan(user(snapshot).content?.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? ''); }
        catch { return stop('Werkzeugplan ungültig'); }
        const planHash = hash(JSON.stringify(plan));
        if (state?.promptID === user(snapshot).id && state.planHash !== planHash) return stop('Werkzeugplan im laufenden Auftrag geändert');
        if (state?.promptID !== user(snapshot).id) state = { promptID: user(snapshot).id, reads: [], bytes: 0, planHash,
          workflow: plan && createToolWorkflow({ plan, budgetDirectory, promptID: user(snapshot).id,
            sessionID: hash(JSON.stringify(['cline-tool-plan', root, snapshot.conversationId, user(snapshot).id])) }) };
        return { appendContext: RULES };
      },
      beforeModel({ snapshot }) { if (!owned(snapshot)) return stop('Auftragsbindung fehlt'); },
      async afterModel(event) {
        const message = event.assistantMessage;
        if (message?.content?.some(part => part.type === 'tool-call')) return;
        if (event.finishReason !== 'stop' || !Array.isArray(message?.content))
          return stop('Textabschluss unvollständig oder unbekannt');
        const text = message.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
        const control = await checkedCompletion({ ...event, input: { summary: text } }, 'text');
        // Native afterModel consumes stop/reason only; appendContext is not supported.
        return control.stop ? control : undefined;
      },
      afterTool(event) {
        if (!owned(event.snapshot)) return;
        try { state.workflow?.afterTool(event); }
        catch { return stop('Werkzeugplan-Ergebnisbindung unbekannt'); }
        if (!owned(event.snapshot) || event.toolCall?.toolName !== 'read_files' || event.result?.isError
          || !Array.isArray(event.result?.output)) return;
        for (const item of event.result.output) {
          if (!item || item.success !== true || typeof item.query !== 'string' || !isAbsolute(item.query)
            || typeof item.result !== 'string') continue;
          try {
            const path = canonical(item.query), rel = relative(root, path);
            if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) continue;
            const bytes = Buffer.byteLength(item.result, 'utf8');
            if (state.reads.length >= 64 || state.bytes + bytes > 600000) continue;
            state.reads.push({ path, content: item.result }); state.bytes += bytes;
          } catch { /* Unknown/missing/foreign sources are not read evidence. */ }
        }
      },
      async beforeTool(event) {
        if (!owned(event.snapshot)) return stop('Auftragsbindung fehlt');
        if (event.tool?.lifecycle?.completesRun === true && !state.workflow?.missing()) return checkedCompletion(event, 'tool');
        return state.workflow?.beforeTool(event, model(event.snapshot));
      },
    },
  };
}

export default createClineGuard();
