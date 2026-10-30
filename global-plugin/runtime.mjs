import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceLedger, systemMessage } from './core.mjs';
import { correctionReasons, sameModelReference, readCorrectionBudget, reserveCorrection,
  readCorrectionFence, setCorrectionFence, clearCorrectionFence } from './correction.mjs';

const VERSION = 'global-v0.6';
const MAX_SESSIONS = 128;
const MAX_LIMIT_IDS = 128;
const MAX_READ_BYTES = 600_000;
const MAX_INPUT_BYTES = 1_048_576;
const hash = value => createHash('sha256').update(value).digest('hex');

function locationIdentity(location) {
  if (!location || typeof location.directory !== 'string' || !isAbsolute(location.directory)
      || /^(?:\\\\|\/\/)/.test(location.directory)) return undefined;
  const workspaceID = location.workspaceID ?? null;
  if (workspaceID !== null && (typeof workspaceID !== 'string' || !workspaceID.trim())) return undefined;
  try {
    let directory = realpathSync.native(location.directory);
    if (/^(?:\\\\|\/\/)/.test(directory) || !statSync(directory).isDirectory()) return undefined;
    if (process.platform === 'win32') directory = directory.toLowerCase();
    return JSON.stringify([directory, workspaceID]);
  } catch { return undefined; }
}
const failure = status => ({ status, rows: [], freigabe: 'NEIN', abdeckung: {
  blockstatus: 'UNBEKANNT', deklarierte_befunde: 0, gepruefte_befunde: 0,
  freitext_zeichen: 0, aussagen_gesamt: null, vollstaendigkeit: 'NICHT_NACHGEWIESEN',
} });

function coverageMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !['FEHLEND', 'LEER', 'GUELTIG', 'UNGUELTIG', 'UNBEKANNT'].includes(value.blockstatus)
      || !Number.isSafeInteger(value.deklarierte_befunde) || value.deklarierte_befunde < 0 || value.deklarierte_befunde > 3
      || !Number.isSafeInteger(value.gepruefte_befunde) || value.gepruefte_befunde < 0 || value.gepruefte_befunde > value.deklarierte_befunde
      || !Number.isSafeInteger(value.freitext_zeichen) || value.freitext_zeichen < 0
      || value.aussagen_gesamt !== null || value.vollstaendigkeit !== 'NICHT_NACHGEWIESEN') throw new Error();
  return {
    blockstatus: value.blockstatus, deklarierte_befunde: value.deklarierte_befunde,
    gepruefte_befunde: value.gepruefte_befunde, freitext_zeichen: value.freitext_zeichen,
    aussagen_gesamt: null, vollstaendigkeit: 'NICHT_NACHGEWIESEN',
  };
}

const OUTPUT_RULES = `ARCHI GUARD: Maschinell pruefbare Aussagen ueber Quelltext.
Fuege am Ende der abschliessenden Antwort genau einen Datenblock hinzu:
ARCHI_AUDIT_JSON_BEGIN
[]
ARCHI_AUDIT_JSON_END
Bei Aussagen ueber gelesenen Quelltext ersetze [] durch maximal drei Befunde:
{"id":"M1","quelle":"review","behauptung":"Die konkrete Aussage",
"behaupteter_status":"VERMUTUNG",
"belege":[{"id":"B1","datei":"ABSOLUTER_GELESENER_PFAD","zeile":1,"zitat":"Vollstaendige Originalzeile mit Einrueckung"}],
"pflichtbelege":["B1"],
"fakten":[{"typ":"QUELLZEILE_ENTHAELT","beleg_id":"B1","literal":"direkt in dieser Zeile vorhandener Text"}]}
Der Block enthaelt eine JSON-Liste, kein einzelnes Objekt. Backslashes JSON-konform escapen.
Nur tatsaechlich mit read gelesene Belege verwenden. Nicht fuer diesen Block weitere Dateien lesen.
Ohne solche Aussagen bleibt die Liste leer. Keine erfundenen Belege.
Der Pruefer kontrolliert Zitate und Literalregeln, keine freien Schlussfolgerungen.
Die automatische Pruefung erfolgt nach der Antwort. Sie erteilt keine semantische Freigabe.`;

function defaults() {
  const packaged = fileURLToPath(new URL('./archi_bridge_v2.py', import.meta.url));
  const python313 = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Python', 'Python313', 'python.exe');
  return {
    bridgePath: existsSync(packaged) ? packaged : fileURLToPath(new URL('../archi_bridge_v2.py', import.meta.url)),
    pythonPath: process.env.ARCHI_GUARD_PYTHON || (existsSync(python313) ? python313 : 'python'),
    logPath: join(homedir(), '.local', 'state', 'archi-guard', 'audits.jsonl'),
    timeoutMs: 5000,
    correctionEnabled: true,
    dispatchTimeoutMs: 5000,
  };
}

// Kein Shell-Aufruf, keine temporaere Datei mit Antwort-/Werkzeugrohtexten.
export function runBridge(payload, root, options = {}) {
  const config = { ...defaults(), ...options };
  const input = JSON.stringify(payload);
  if (Buffer.byteLength(input, 'utf8') > MAX_INPUT_BYTES) return Promise.reject(new Error('ARCHI_BRIDGE_INPUT_LIMIT'));
  return new Promise((resolve, reject) => {
    const child = spawn(config.pythonPath, ['-B', '-X', 'utf8', config.bridgePath, '--plugin-stdin', '--root', root], {
      windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '', bytes = 0, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { child.kill(); reject(error); }
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('ARCHI_BRIDGE_TIMEOUT')), config.timeoutMs);
    child.on('error', () => finish(new Error('ARCHI_BRIDGE_PROCESS')));
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > MAX_INPUT_BYTES) finish(new Error('ARCHI_BRIDGE_OUTPUT_LIMIT'));
      else output += chunk;
    });
    // Fehlermeldungen koennen Eingabepfade enthalten; nicht speichern/weiterreichen.
    child.stderr.resume();
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return finish(new Error('ARCHI_BRIDGE_EXIT'));
      try {
        const result = JSON.parse(output);
        if (!['GEPRUEFT', 'KEINE_STRUKTURIERTEN_BEFUNDE', 'FORMAT_FEHLER'].includes(result.status)
            || !Array.isArray(result.rows) || result.rows.length > 3 || result.freigabe !== 'NEIN') throw new Error();
        finish(null, { status: result.status, rows: result.rows, freigabe: 'NEIN',
          abdeckung: coverageMetadata(result.abdeckung) });
      } catch { finish(new Error('ARCHI_BRIDGE_PROTOCOL')); }
    });
    child.stdin.end(input, 'utf8');
  });
}

function auditAcceptance(report) {
  const coverage = report.abdeckung;
  const infrastructureFailed = ['PRUEFUNG_BLOCKIERT', 'HOST_NICHT_VERFUEGBAR',
    'ZUSTAND_BLOCKIERT', 'DISPATCH_UNKLAR'].includes(report.korrektur?.status);
  const passed = !infrastructureFailed && report.status === 'GEPRUEFT' && coverage.blockstatus === 'GUELTIG'
    && coverage.gepruefte_befunde > 0
    && coverage.gepruefte_befunde === coverage.deklarierte_befunde
    && report.rows.length === coverage.gepruefte_befunde
    && report.rows.every(row => row?.pruefcode === 'BELEGKETTE_FORMAL_VOLLSTAENDIG'
      && row.schlussstatus === 'SCHLUSS_UNGEPRUEFT'
      && row.werkzeugnachweis === 'READ_PFAD_UND_ZITAT_BEOBACHTET'
      && row.freigabe === 'NEIN');
  return passed ? 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT' : 'NICHT_ABGENOMMEN';
}

function auditSummary(report) {
  const coverage = report.abdeckung;
  return [
    'ARCHI GUARD: Nachgelagerte Pruefung der vorigen abgeschlossenen Antwort.',
    `Zuordnung Benutzer-Nachrichten-ID SHA256=${report.prompt_id_sha256}; Antworttext SHA256=${report.answer_sha256 ?? 'unbekannt'}.`,
    `Status=${report.status}; Abnahme=${report.abnahme}; semantische Freigabe=NEIN.`,
    `Nachkorrektur=${report.korrektur.status}; Versuche=${report.korrektur.versuche ?? 'unbekannt'}; Maximum=${report.korrektur.maximum}.`,
    ...report.rows.map((r, i) => `Befund ${i + 1}: ${r.pruefcode}; ${r.schlussstatus}; ${r.werkzeugnachweis}.`),
    `Strukturabdeckung: ${coverage.gepruefte_befunde} von ${coverage.deklarierte_befunde} deklarierten Befunden geprueft; Blockstatus=${coverage.blockstatus}.`,
    coverage.blockstatus === 'UNBEKANNT'
      ? 'Freitext ausserhalb des Blocks: Umfang unbekannt; ungeprueft.'
      : `Freitext ausserhalb des Blocks: ${coverage.freitext_zeichen} Zeichen; ungeprueft.`,
    'Gesamtzahl der Aussagen=unbekannt; semantische Vollstaendigkeit=NICHT_NACHGEWIESEN. Fehlende Befunde und freie Schlussfolgerungen bleiben ungeprueft.',
  ].join('\n');
}

export async function setupGuard(ctx, options = {}) {
  const instanceLocation = locationIdentity(ctx.location);
  if (!instanceLocation) throw new Error('ARCHI_GUARD_LOCATION_REQUIRED');
  const config = { ...defaults(), ...options };
  config.correctionDirectory ??= join(dirname(config.logPath), 'corrections');
  const ledger = new EvidenceLedger();
  const turns = new Map();
  const pending = new Set();
  const controller = new AbortController();
  let stopped = false;
  let scopeWarning = false;

  async function sessionIdentity(sessionID) {
    let identity;
    try {
      if (typeof sessionID === 'string' && sessionID) {
        identity = locationIdentity((await ctx.session.get({ sessionID })).location);
      }
    } catch { /* Unknown identity never grants ownership. */ }
    return identity;
  }

  async function ownsSession(sessionID, blockUnknown = false) {
    const identity = await sessionIdentity(sessionID);
    if (identity) return identity === instanceLocation;
    if (!scopeWarning) {
      scopeWarning = true;
      console.error('[Archi Guard] Sitzungszuordnung nicht verfuegbar; keine Belegabnahme');
    }
    if (blockUnknown) throw new Error('ARCHI_CORRECTION_BLOCKED: SCOPE_NICHT_VERFUEGBAR');
    return false;
  }

  function sessionState(sessionID) {
    let state = turns.get(sessionID);
    if (!state) {
      state = { prompts: new Map(), reads: [], readBytes: 0, latestPromptID: undefined,
        limitedAssistantIDs: new Set(), unassignedLimited: false,
        report: undefined, running: false, requested: false,
        correctionBinding: undefined, seenCorrections: new Set(), cancelledCorrections: new Set() };
      turns.set(sessionID, state);
      if (turns.size > MAX_SESSIONS) turns.delete(turns.keys().next().value);
    }
    return state;
  }

  const promptTurn = () => ({ lastAnswerID: undefined, attempts: 0,
    correctionPending: false, retainedIDs: new Set() });
  const answerText = message => message.content?.filter(p => p.type === 'text').map(p => p.text).join('\n') ?? '';
  const completedAnswer = message => message.type === 'assistant'
    && (message.finish || message.time?.completed) && message.finish !== 'tool-calls';

  async function recoverCorrections(sessionID, messages) {
    const synthetics = messages.filter(message => message.type === 'synthetic'
      && (message.id?.startsWith('msg_archiguard_') || message.metadata?.archi_guard_correction === true));
    let state = turns.get(sessionID);
    if (!state && !synthetics.length) return undefined;
    state ??= sessionState(sessionID);
    state.latestPromptID ??= messages.filter(message => message.type === 'user').at(-1)?.id;
    for (const synthetic of synthetics) {
      if (state.seenCorrections.has(synthetic.id)) continue;
      const metadata = synthetic.metadata;
      const index = messages.indexOf(synthetic);
      const user = messages.slice(0, index).filter(message => message.type === 'user'
        && hash(message.id) === metadata?.prompt_id_sha256).at(-1);
      const previous = user && messages.slice(messages.indexOf(user) + 1, index)
        .filter(message => message.type === 'assistant').at(-1);
      const expectedID = user && `msg_archiguard_${hash(JSON.stringify([sessionID, user.id])).slice(0, 32)}_${metadata?.versuch}`;
      const valid = metadata?.archi_guard_correction === true && metadata.schema_version === 1
        && metadata.maximum === 2 && [1, 2].includes(metadata.versuch)
        && user && previous && synthetic.id === expectedID
        && hash(answerText(previous)) === metadata.answer_sha256
        && sameModelReference(previous.model, previous.model);
      const budget = valid ? await readCorrectionBudget({ directory: config.correctionDirectory,
        sessionID, promptID: user.id }) : undefined;
      const bound = valid && budget.status === 'READY' && budget.attempts >= metadata.versuch;
      if (user) {
        if (!state.prompts.has(user.id)) state.prompts.set(user.id, promptTurn());
        state.prompts.get(user.id).attempts = budget?.attempts ?? null;
      }
      const following = messages.slice(index + 1);
      const ended = following.some(completedAnswer);
      const terminal = following.some(message => message.type === 'idle');
      state.seenCorrections.add(synthetic.id);
      if (state.seenCorrections.size > 256) state.seenCorrections.delete(state.seenCorrections.values().next().value);
      // A completed provider response can still require tools/length recovery. Only
      // the host idle marker proves that this busy period actually settled.
      if (!terminal) state.correctionBinding = { syntheticID: synthetic.id,
        promptID: bound ? user.id : undefined, model: bound ? { ...previous.model } : undefined };
      else if (!ended) state.cancelledCorrections.add(hash(synthetic.id));
    }
    return state;
  }

  await ctx.session.hook('prompt', async event => {
    // Cancel an already owned old turn synchronously, before the location lookup
    // yields. A moved-away session can cancel its old work, never claim new work.
    const known = turns.get(event.sessionID);
    if (known && !known.prompts.has(event.messageID)) {
      known.latestPromptID = event.messageID;
      known.cancelAdmission?.();
    }
    if (!(await ownsSession(event.sessionID))) return;
    const state = sessionState(event.sessionID);
    if (state.prompts.has(event.messageID)) return;
    state.latestPromptID = event.messageID;
    if (state.deniedPrompt?.id !== event.messageID) state.deniedPrompt = undefined;
    state.cancelAdmission?.();
    for (const previous of state.prompts.values()) {
      if (previous.correctionPending) releaseReads(state, previous.retainedIDs);
      previous.correctionPending = false;
    }
    state.prompts.set(event.messageID, promptTurn());
    if (state.prompts.size > 128) state.prompts.delete(state.prompts.keys().next().value);
    ledger.reset(event.sessionID);
    if (turns.size > MAX_SESSIONS) turns.delete(turns.keys().next().value);
  });

  await ctx.session.hook('context', async event => {
    if (!(await ownsSession(event.sessionID))) return;
    event.system.push({ type: 'text', text: systemMessage(ledger.snapshot(event.sessionID)) + '\n\n' + OUTPUT_RULES });
    const report = turns.get(event.sessionID)?.report;
    if (report) event.system.push({ type: 'text', text: auditSummary(report) });
    const cancelled = turns.get(event.sessionID)?.cancelledCorrections;
    if (cancelled?.size) event.system.push({ type: 'text', text:
      `ARCHI GUARD: Nachkorrektur ABGEBROCHEN fuer synthetische Nachrichten-ID SHA256=${[...cancelled].join(',')}. `
      + 'Diese alten Korrekturauftraege nicht fortsetzen. Massgeblich bleibt der aktuelle Benutzerauftrag.' });
  });

  // Pinned host: model.request runs after model resolution, before any provider request,
  // including title/compaction/generate. Rejecting this Promise propagates as a host defect.
  await ctx.session.hook('model.request', async event => {
    if (!(await ownsSession(event.sessionID, true))) return;
    const key = { directory: config.correctionDirectory, sessionID: event.sessionID };
    let messages, state, session, fence;
    try {
      messages = await ctx.session.context({ sessionID: event.sessionID });
      state = await recoverCorrections(event.sessionID, messages);
      const latest = messages.filter(message => message.type === 'user').at(-1)?.id;
      fence = await readCorrectionFence({ ...key, promptID: latest, model: event.model });
      if (fence.status === 'STATE_BLOCKED') throw new Error();
      if (fence.status === 'ACTIVE') {
        state ??= sessionState(event.sessionID);
        state.latestPromptID ??= latest;
      }
      if (state?.deniedPrompt) throw new Error('ARCHI_CORRECTION_BLOCKED');
      if (!state?.correctionBinding && fence.status === 'CLEAR') return;
      session = await ctx.session.get({ sessionID: event.sessionID });
      const currentLocation = locationIdentity(session.location);
      if (!currentLocation) throw new Error('ARCHI_GUARD_LOCATION_REQUIRED');
      if (currentLocation !== instanceLocation) return;
    } catch {
      throw new Error('ARCHI_CORRECTION_BLOCKED: HOST_NICHT_VERFUEGBAR');
    }
    const binding = state.correctionBinding;
    const latest = messages.filter(message => message.type === 'user').at(-1)?.id;
    const delivered = binding && messages.some(message => message.type === 'synthetic' && message.id === binding.syntheticID);
    const newHuman = latest && state.latestPromptID === latest
      && (fence.status === 'ACTIVE' ? !fence.promptMatches : binding?.promptID && latest !== binding.promptID);
    if (!delivered && newHuman) {
      // An unknown admission may never arrive. A confirmed new human turn can
      // proceed, but a later delivery must be rediscovered and denied, not ignored.
      if (fence.status === 'ACTIVE' && (await clearCorrectionFence({ ...key, taskHash: fence.taskHash })).status !== 'CLEAR')
        throw new Error('ARCHI_CORRECTION_BLOCKED: ZUSTAND_BLOCKIERT');
      const ids = binding ? [binding.syntheticID]
        : [1, 2].map(attempt => `msg_archiguard_${fence.taskHash.slice(0, 32)}_${attempt}`);
      for (const id of ids) {
        state.cancelledCorrections.add(hash(id));
        state.seenCorrections.delete(id);
      }
      if (state.cancelledCorrections.size > 128) state.cancelledCorrections.delete(state.cancelledCorrections.values().next().value);
      state.correctionBinding = undefined;
      const original = state.prompts.get(binding?.promptID);
      if (original) {
        original.correctionPending = false;
        releaseReads(state, original.retainedIDs);
      }
      return;
    }
    const sessionFence = fence.status === 'ACTIVE'
      ? await readCorrectionFence({ ...key, promptID: latest, model: session.model }) : fence;
    const persistentAllows = fence.status === 'CLEAR' || (fence.promptMatches && fence.modelMatches
      && sessionFence.status === 'ACTIVE' && sessionFence.taskHash === fence.taskHash && sessionFence.modelMatches);
    const bindingAllows = !binding || (state.latestPromptID === binding.promptID && latest === binding.promptID
      && sameModelReference(binding.model, session.model) && sameModelReference(binding.model, event.model));
    if (!stopped && !session.parentID && state.latestPromptID === latest
        && persistentAllows && bindingAllows) return;
    // Once delivered, this input is no longer pending in the host inbox. Abort this
    // request and mark its instruction cancelled; a later human prompt may proceed.
    if (delivered) {
      const bindingTaskHash = hash(JSON.stringify([event.sessionID, binding.promptID]));
      if (fence.status === 'ACTIVE' && fence.taskHash === bindingTaskHash
          && (await clearCorrectionFence({ ...key, taskHash: fence.taskHash })).status !== 'CLEAR')
        throw new Error('ARCHI_CORRECTION_BLOCKED: ZUSTAND_BLOCKIERT');
      state.cancelledCorrections.add(hash(binding.syntheticID));
      if (state.cancelledCorrections.size > 128) state.cancelledCorrections.delete(state.cancelledCorrections.values().next().value);
      state.seenCorrections.add(binding.syntheticID);
      state.correctionBinding = undefined;
      state.deniedPrompt = { id: state.latestPromptID ?? latest };
      const original = state.prompts.get(binding.promptID);
      if (original) {
        original.correctionPending = false;
        releaseReads(state, original.retainedIDs);
      }
    }
    if (state.report?.prompt_id_sha256 === hash(binding?.promptID ?? '')) {
      state.report = { ...state.report, korrektur: { ...state.report.korrektur, status: 'ABGEBROCHEN' } };
    }
    console.error('[Archi Guard] Nachkorrektur ABGEBROCHEN; Auftrags-/Modellbindung nicht bestaetigt');
    throw new Error('ARCHI_CORRECTION_BLOCKED: AUFTRAG_ODER_MODELL_GEAENDERT');
  });

  await ctx.tool.hook('execute.after', async event => {
    if (!(await ownsSession(event.sessionID))) return;
    ledger.observe(event);
    if (event.status !== 'completed') return;
    const turn = turns.get(event.sessionID);
    const path = event.input?.path;
    const output = event.result?.output;
    const content = output?.type === 'text-page' || (output?.type === 'file' && output?.encoding !== 'base64')
      ? output.content : event.result?.content;
    if (turn && event.tool === 'read' && typeof path === 'string' && typeof content === 'string') {
      const bytes = Buffer.byteLength(content, 'utf8');
      if (turn.reads.length < 64 && turn.readBytes + bytes <= MAX_READ_BYTES) {
        turn.reads.push({ path, content, messageID: event.messageID });
        turn.readBytes += bytes;
      } else if (typeof event.messageID === 'string' && event.messageID
          && (turn.limitedAssistantIDs.has(event.messageID) || turn.limitedAssistantIDs.size < MAX_LIMIT_IDS)) {
        turn.limitedAssistantIDs.add(event.messageID);
      } else {
        // Fehlende Zuordnung oder erschöpfter ID-Speicher darf Limits nicht verbergen.
        turn.unassignedLimited = true;
      }
    }
    if (event.result) event.result = { ...event.result, metadata: {
      ...event.result.metadata, archi_guard_observed: VERSION,
    } };
  });

  function releaseReads(state, assistantIDs) {
    state.reads = state.reads.filter(r => !assistantIDs.has(r.messageID));
    state.readBytes = state.reads.reduce((sum, r) => sum + Buffer.byteLength(r.content, 'utf8'), 0);
    for (const id of assistantIDs) state.limitedAssistantIDs.delete(id);
    // Unzuordenbare Limits und noch ungepruefte alte IDs niemals als erledigt behandeln.
  }

  const correctionMetadata = (status, attempts) => ({ status, versuche: attempts, maximum: 2 });

  async function correctionGate(sessionID, state, user, answer) {
    if (stopped || state.latestPromptID !== user.id) return 'NEUER_AUFTRAG';
    let messages, session;
    try {
      messages = await ctx.session.context({ sessionID });
      session = await ctx.session.get({ sessionID });
    } catch { return 'HOST_NICHT_VERFUEGBAR'; }
    const currentLocation = locationIdentity(session.location);
    if (!currentLocation) return 'HOST_NICHT_VERFUEGBAR';
    if (currentLocation !== instanceLocation) return 'NEUER_AUFTRAG';
    if (stopped || state.latestPromptID !== user.id || messages.filter(m => m.type === 'user').at(-1)?.id !== user.id) return 'NEUER_AUFTRAG';
    if (session.parentID) return 'KIND_SITZUNG';
    if (!sameModelReference(answer.model, session.model)) return 'MODELL_BLOCKIERT';
    const userIndex = messages.findIndex(m => m.type === 'user' && m.id === user.id);
    if (messages.slice(userIndex + 1).filter(m => m.type === 'assistant').at(-1)?.id !== answer.id) return 'NEUERE_ANTWORT';
    return undefined;
  }

  async function dispatchCorrection(state, input) {
    let timer, cancel;
    const interrupted = new Promise(resolve => { cancel = () => resolve('DISPATCH_UNKLAR'); });
    state.cancelAdmission = cancel;
    const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve('DISPATCH_UNKLAR'), config.dispatchTimeoutMs); });
    try {
      // Admission ist kein Modellabschluss. Unklare Annahme wird nie erneut angefordert.
      const admission = Promise.resolve(ctx.session.synthetic(input)).then(() => 'ANGEFORDERT', () => 'DISPATCH_UNKLAR');
      return await Promise.race([admission, interrupted, timedOut]);
    } catch { return 'DISPATCH_UNKLAR'; }
    finally {
      clearTimeout(timer);
      if (state.cancelAdmission === cancel) state.cancelAdmission = undefined;
    }
  }

  async function correct(sessionID, state, turn, user, answer, report) {
    if (['PRUEFER_FEHLER', 'PROTOKOLL_FEHLER'].includes(report.status)) return correctionMetadata('PRUEFUNG_BLOCKIERT', turn.attempts);
    if (!config.correctionEnabled) return correctionMetadata('DEAKTIVIERT', turn.attempts);
    if (typeof ctx.session.synthetic !== 'function') return correctionMetadata('HOST_NICHT_VERFUEGBAR', turn.attempts);
    const blocked = await correctionGate(sessionID, state, user, answer);
    if (blocked) return correctionMetadata(blocked, turn.attempts);
    const key = { directory: config.correctionDirectory, sessionID, promptID: user.id };
    const budget = await readCorrectionBudget(key);
    turn.attempts = budget.attempts;
    if (budget.status !== 'READY') return correctionMetadata('ZUSTAND_BLOCKIERT', budget.attempts);
    const reasons = correctionReasons(report);
    if (!report.rows.length && ['FEHLEND', 'LEER'].includes(report.abdeckung.blockstatus))
      return correctionMetadata('BEFUNDE_FEHLEN_UNGEPRUEFT', budget.attempts);
    if (!reasons.length) return correctionMetadata('NICHT_ERFORDERLICH', budget.attempts);
    const recheck = await correctionGate(sessionID, state, user, answer);
    if (recheck) return correctionMetadata(recheck, budget.attempts);
    const reservation = await reserveCorrection({ ...key, answerID: answer.id,
      answerHash: report.answer_sha256, model: answer.model });
    turn.attempts = reservation.attempts;
    if (reservation.status !== 'RESERVED') return correctionMetadata({
      DUPLICATE: 'BEREITS_RESERVIERT', EXHAUSTED: 'ERSCHOEPFT_UNGELOEST', STATE_BLOCKED: 'ZUSTAND_BLOCKIERT',
    }[reservation.status] ?? 'ZUSTAND_BLOCKIERT', reservation.attempts);
    const afterReserve = await correctionGate(sessionID, state, user, answer);
    if (afterReserve) return correctionMetadata(afterReserve, reservation.attempts);
    // Ein Prompt-Hook kann bereits zwischen der Gate-Aufloesung und dieser Fortsetzung laufen.
    if (stopped || state.latestPromptID !== user.id) return correctionMetadata('NEUER_AUFTRAG', reservation.attempts);
    const codes = report.rows.flatMap((row, i) => reasons.includes(row.pruefcode)
      ? [{ befundindex: i + 1, pruefcode: row.pruefcode }] : []);
    if (reasons.includes('FORMAT_FEHLER')) codes.unshift({ befundindex: 0, pruefcode: 'FORMAT_FEHLER' });
    const text = [
      'ARCHI GUARD: Begrenzte Nachkorrektur der vorigen abgeschlossenen Antwort.',
      `Benutzer-Nachrichten-ID SHA256=${report.prompt_id_sha256}; Antworttext SHA256=${report.answer_sha256}.`,
      `Versuch=${reservation.attempts}; Maximum=2; Pruefcodes=${JSON.stringify(codes)}.`,
      'Korrigiere ausschliesslich die Antwort und deren deklarierte Belege anhand dieser konkreten Prueffehler.',
      'Keine zusaetzlichen Dateioperationen, keine neuen Werkzeugrechte und keine Erweiterung des Benutzerauftrags.',
      'Verwende nur bereits beobachtete Belege; entferne unbelegbare Aussagen oder kennzeichne die verbleibende Unsicherheit.',
      'Fuege den vereinbarten ARCHI_AUDIT_JSON_BEGIN/END-Block an. Semantische Freigabe bleibt NEIN.',
    ].join('\n');
    // Bind before calling the host: it may start model.request before admission resolves.
    if ((await setCorrectionFence({ ...key, model: answer.model })).status !== 'ACTIVE')
      return correctionMetadata('ZUSTAND_BLOCKIERT', reservation.attempts);
    state.correctionBinding = { promptID: user.id, model: { ...answer.model }, syntheticID: reservation.syntheticID };
    state.seenCorrections.add(reservation.syntheticID);
    const status = await dispatchCorrection(state, { sessionID, id: reservation.syntheticID, text,
      description: 'Archi Guard Nachkorrektur', delivery: 'queue', resume: true,
      metadata: { archi_guard_correction: true, schema_version: 1,
        prompt_id_sha256: report.prompt_id_sha256, answer_sha256: report.answer_sha256,
        versuch: reservation.attempts, maximum: 2 } });
    turn.correctionPending = ['ANGEFORDERT', 'DISPATCH_UNKLAR'].includes(status)
      && state.latestPromptID === user.id && state.correctionBinding?.syntheticID === reservation.syntheticID;
    return correctionMetadata(status, reservation.attempts);
  }

  async function audit(sessionID) {
    if (!(await ownsSession(sessionID))) return;
    let state = turns.get(sessionID);
    if (!state) {
      try { state = await recoverCorrections(sessionID, await ctx.session.context({ sessionID })); }
      catch { return; }
    }
    if (!state) return;
    state.requested = true;
    if (state.running) return;
    state.running = true;
    try {
      while (state.requested) {
        state.requested = false;
        const messages = await ctx.session.context({ sessionID });
        for (let start = 0; start < messages.length; start++) {
          const user = messages[start];
          if (user.type !== 'user') continue;
          const turn = state.prompts.get(user.id);
          if (!turn) continue;
          const nextUser = messages.findIndex((m, i) => i > start && m.type === 'user');
          const assistants = messages.slice(start + 1, nextUser < 0 ? undefined : nextUser).filter(m => m.type === 'assistant');
          // Niemals eine fruehere texttragende Zwischenausgabe als Endantwort verwenden.
          const answer = assistants.at(-1);
          if (!answer || (!answer.finish && !answer.time?.completed) || answer.finish === 'tool-calls'
              || answer.id === turn.lastAnswerID) continue;
          turn.correctionPending = false;
          const bindingIndex = messages.findIndex(message => message.id === state.correctionBinding?.syntheticID);
          if (state.correctionBinding?.promptID === user.id && bindingIndex >= 0
              && messages.indexOf(answer) > bindingIndex) state.correctionBinding = undefined;
          const text = answer.content?.filter(p => p.type === 'text').map(p => p.text).join('\n') ?? '';
          const assistantIDs = new Set(assistants.map(m => m.id));
          let result;
          try {
            const session = await ctx.session.get({ sessionID });
            if (locationIdentity(session.location) !== instanceLocation) return;
            if (typeof session.location?.directory !== 'string') throw new Error('ARCHI_SESSION_LOCATION');
            const reads = state.reads.filter(r => assistantIDs.has(r.messageID)).map(({ path, content }) => ({
              path: resolve(session.location.directory, path), content,
            }));
            result = await runBridge({ text, reads }, session.location.directory, config);
          } catch { result = failure('PRUEFER_FEHLER'); }
          const report = {
            schema_version: 1, plugin_version: VERSION, datum: new Date().toISOString(),
            session_sha256: hash(sessionID), prompt_id_sha256: hash(user.id), prompt_sha256: hash(user.id),
            answer_sha256: hash(text), werkzeugumfang_begrenzt: state.unassignedLimited
              || assistants.some(message => state.limitedAssistantIDs.has(message.id)),
            ...result,
          };
          try {
            await mkdir(dirname(config.logPath), { recursive: true });
            // Protokoll-Infrastruktur vor einer moeglichen Inferenzanforderung pruefen.
            await appendFile(config.logPath, '', 'utf8');
          } catch { report.status = 'PROTOKOLL_FEHLER'; }
          try {
            const currentLocation = await sessionIdentity(sessionID);
            if (currentLocation && currentLocation !== instanceLocation) return;
            if (!currentLocation) {
              report.korrektur = correctionMetadata('HOST_NICHT_VERFUEGBAR', turn.attempts);
            } else {
              const inputIndex = messages.findLastIndex(message => message.type === 'synthetic'
                && message.metadata?.archi_guard_correction === true && message.metadata.prompt_id_sha256 === hash(user.id));
              if (inputIndex >= 0 && messages.indexOf(answer) > inputIndex) {
                const cleared = await clearCorrectionFence({ directory: config.correctionDirectory,
                  sessionID, taskHash: hash(JSON.stringify([sessionID, user.id])) });
                if (cleared.status !== 'CLEAR') throw new Error();
              }
              report.korrektur = await correct(sessionID, state, turn, user, answer, report);
            }
          }
          catch { report.korrektur = correctionMetadata('ZUSTAND_BLOCKIERT', turn.attempts); }
          const currentLocation = await sessionIdentity(sessionID);
          if (currentLocation && currentLocation !== instanceLocation) return;
          if (!currentLocation) report.korrektur = correctionMetadata('HOST_NICHT_VERFUEGBAR', turn.attempts);
          report.abnahme = auditAcceptance(report);
          try {
            await appendFile(config.logPath, JSON.stringify(report) + '\n', 'utf8');
          } catch { report.status = 'PROTOKOLL_FEHLER'; report.abnahme = 'NICHT_ABGENOMMEN'; }
          state.report = report;
          turn.lastAnswerID = answer.id;
          turn.retainedIDs = assistantIDs;
          if (!turn.correctionPending) releaseReads(state, assistantIDs);
          console.info(`[Archi Guard] ${report.status}; Abnahme=${report.abnahme}; Freigabe=NEIN; Nachkorrektur=${report.korrektur.status}; Versuche=${report.korrektur.versuche ?? 'unbekannt'}/2`);
        }
      }
    } catch {
      console.error('[Archi Guard] Nachrichtenkontext nicht verfuegbar; Antwort ungeprueft');
    } finally { state.running = false; }
  }

  const stream = (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (stopped) break;
        if (event.type !== 'session.execution.succeeded' || typeof event.data?.sessionID !== 'string') continue;
        const task = audit(event.data.sessionID);
        pending.add(task);
        void task.finally(() => pending.delete(task));
      }
    } catch {
      if (!stopped) console.error('[Archi Guard] Ereignisstrom unterbrochen; automatische Pruefung nicht verfuegbar');
    }
  })();

  console.info('[Archi Guard] Globales Plugin mit automatischer Bridge registriert');
  return async () => {
    stopped = true;
    for (const state of turns.values()) state.cancelAdmission?.();
    controller.abort();
    await stream;
    await Promise.allSettled([...pending]);
    ledger.clear();
    turns.clear();
  };
}
