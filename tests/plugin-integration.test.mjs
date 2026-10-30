import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = await import('../global-plugin/runtime.mjs').catch(() => ({}));
const correctionApi = await import('../global-plugin/correction.mjs');
const bridgePath = fileURLToPath(new URL('../archi_bridge_v2.py', import.meta.url));
const pythonPath = 'C:/Users/USER/AppData/Local/Programs/Python/Python313/python.exe';

function host(root, model) {
  const hooks = new Map(), messages = new Map(), pending = [], dispatches = [];
  const session = { location: { directory: root }, ...(model ? { model } : {}) };
  let reader, closed = false;
  const ctx = {
    location: { directory: root },
    session: {
      hook: async (name, fn) => hooks.set(name, fn),
      context: async ({ sessionID }) => messages.get(sessionID) ?? [],
      get: async () => session,
      ...(model ? { synthetic: async input => { dispatches.push(input); } } : {}),
    },
    tool: { hook: async (name, fn) => hooks.set(name, fn) },
    event: { subscribe: ({ signal }) => {
      signal.addEventListener('abort', () => { closed = true; reader?.({ done: true }); });
      return { [Symbol.asyncIterator]() { return this; }, next() {
        if (pending.length) return Promise.resolve({ value: pending.shift(), done: false });
        if (closed) return Promise.resolve({ done: true });
        return new Promise(r => { reader = r; });
      } };
    } },
  };

  return { ctx, hooks, messages, dispatches, session, emit(sessionID) {
    const value = { type: 'session.execution.succeeded', data: { sessionID } };
    if (reader) { const send = reader; reader = undefined; send({ value, done: false }); }
    else pending.push(value);
  } };
}

function answer(path, literal = 'LOCAL_EVIDENCE_VALUE') {
  return 'Ergebnis\nARCHI_AUDIT_JSON_BEGIN\n' + JSON.stringify([{
    id: 'M1', quelle: 'review', behauptung: 'Die Zeile enthaelt das behauptete Literal.',
    behaupteter_status: 'VERMUTUNG',
    belege: [{ id: 'B1', datei: path, zeile: 1, zitat: 'const marker = "LOCAL_EVIDENCE_VALUE";' }],
    pflichtbelege: ['B1'],
    fakten: [{ typ: 'QUELLZEILE_ENTHAELT', beleg_id: 'B1', literal }],
  }]) + '\nARCHI_AUDIT_JSON_END';
}

async function untilRows(path, count = 1) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const raw = await readFile(path, 'utf8').catch(() => '');
    const lines = raw.trim().split('\n').filter(Boolean);
    if (lines.length >= count) return lines.map(line => JSON.parse(line));
    await new Promise(r => setTimeout(r, 10));
  }
  assert.fail('Kein automatisches Pruefergebnis innerhalb des Zeitlimits');
}

async function fixture(t, options = {}) {
  assert.equal(typeof api.setupGuard, 'function', 'Automatische Bridge-Anbindung fehlt');
  const root = await mkdtemp(join(tmpdir(), 'archi-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source.js'), logPath = join(root, 'audit.jsonl');
  await writeFile(source, 'const marker = "LOCAL_EVIDENCE_VALUE";\n');
  const h = host(root, options.hostModel);
  if (options.workspaceID !== undefined) {
    h.ctx.location.workspaceID = options.workspaceID;
    h.session.location.workspaceID = options.workspaceID;
  }
  const cleanup = await api.setupGuard(h.ctx, { pythonPath, bridgePath, logPath, ...options });
  t.after(cleanup);
  async function turn(sessionID = 'ses_test', text = answer(source), agent = 'build') {
    const messageID = 'msg_' + sessionID;
    await h.hooks.get('prompt')({ sessionID, messageID, prompt: { text: 'Pruefe' } });
    h.messages.set(sessionID, [
      { id: messageID, type: 'user', text: 'Pruefe' },
      { id: 'assistant_' + sessionID, type: 'assistant', agent, ...(options.hostModel ? { model: options.hostModel } : {}),
        content: [{ type: 'text', text }], finish: 'stop' },
    ]);
    return messageID;
  }
  async function read(sessionID = 'ses_test', path = source, content = '1: const marker = "LOCAL_EVIDENCE_VALUE";') {
    const event = { sessionID, messageID: 'assistant_' + sessionID, id: 'call1', tool: 'read',
      status: 'completed', input: { path }, result: { content, metadata: { existing: true } } };
    await h.hooks.get('execute.after')(event);
    assert.equal(event.result.metadata.existing, true);
  }
  return { ...h, root, source, logPath, turn, read, cleanup };
}

test('Abschluss prueft reale Quelle automatisch und erkennt falsches Literal', async t => {
  const f = await fixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT'));
  await f.read();
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.status, 'GEPRUEFT');
  assert.equal(audit.rows[0].pruefcode, 'FAKTREGEL_NICHT_BESTAETIGT');
  assert.equal(audit.rows[0].freigabe, 'NEIN');
  assert.equal(audit.abnahme, 'NICHT_ABGENOMMEN');
  const raw = await readFile(f.logPath, 'utf8');
  assert.ok(!raw.includes(f.source));
  assert.ok(!raw.includes('LOCAL_EVIDENCE_VALUE'));
  const event = { sessionID: 'ses_test', system: [] };
  await f.hooks.get('context')(event);
  assert.match(event.system.map(p => p.text).join('\n'), /FAKTREGEL_NICHT_BESTAETIGT/);
});

test('Plan wird ohne Spezialagent geprueft; doppelte Events bleiben ein Audit', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_plan', answer(f.source), 'plan');
  await f.read('ses_plan');
  f.emit('ses_plan'); f.emit('ses_plan');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
  assert.equal(audit.rows[0].schlussstatus, 'SCHLUSS_UNGEPRUEFT');
  assert.equal(audit.freigabe, 'NEIN');
  assert.equal(audit.abnahme, 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT');
  await f.hooks.get('context')({ sessionID: 'ses_plan', system: [] });
  assert.equal((await readFile(f.logPath, 'utf8')).trim().split('\n').length, 1);
});

test('Unstrukturierte Antwort erhaelt keine Inhaltsfreigabe', async t => {
  const f = await fixture(t);
  await f.turn('ses_test', 'Das funktioniert bestimmt.');
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.status, 'KEINE_STRUKTURIERTEN_BEFUNDE');
  assert.equal(audit.freigabe, 'NEIN');
  assert.equal(audit.abnahme, 'NICHT_ABGENOMMEN');
});

test('Werkzeugerfolg einer anderen Sitzung belegt keine Quelle', async t => {
  const f = await fixture(t);
  await f.turn('ses_a'); await f.turn('ses_b'); await f.read('ses_a');
  f.emit('ses_b');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.rows[0].pruefcode, 'LESEBELEG_NICHT_BEOBACHTET');
  assert.equal(audit.abnahme, 'NICHT_ABGENOMMEN');
});

test('Verspaeteter Abschluss verbraucht keinen neueren noch unbeantworteten Prompt', async t => {
  const f = await fixture(t);
  await f.turn(); await f.read();
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_new', prompt: { text: 'Neu' } });
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
  assert.equal(audit.freigabe, 'NEIN');
  const messages = f.messages.get('ses_test');
  messages.push({ id: 'msg_new', type: 'user', text: 'Neu' });
  messages.push({ id: 'assistant_new', type: 'assistant', agent: 'build', finish: 'stop',
    content: [{ type: 'text', text: 'Eine neue Antwort ohne Pruefblock.' }] });
  f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].status, 'KEINE_STRUKTURIERTEN_BEFUNDE');
  assert.notEqual(reports[0].prompt_sha256, reports[1].prompt_sha256);
});

test('Fehlender Pythonprozess wird datenminimiert als Fehler protokolliert', async t => {
  const f = await fixture(t, { pythonPath: join(tmpdir(), 'archi-python-existiert-nicht.exe') });
  await f.turn(); f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.status, 'PRUEFER_FEHLER');
  assert.equal(audit.freigabe, 'NEIN');
  assert.equal(audit.abnahme, 'NICHT_ABGENOMMEN');
});

test('Python-Zeitlimit beendet nur den eigenen Pruefprozess', async t => {
  assert.equal(typeof api.runBridge, 'function', 'Begrenzter Bridge-Transport fehlt');
  const root = await mkdtemp(join(tmpdir(), 'archi-timeout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const slow = join(root, 'slow.py');
  await writeFile(slow, 'import time\ntime.sleep(10)\n');
  await assert.rejects(api.runBridge({ text: '', reads: [] }, root, {
    pythonPath, bridgePath: slow, timeoutMs: 80,
  }), /ARCHI_BRIDGE/);
});

test('Relativer read-Pfad wird ausschliesslich in der Sitzungswurzel aufgeloest', async t => {
  const f = await fixture(t);
  await f.turn(); await f.read('ses_test', 'source.js');
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
});

test('Strukturierte Textseite liefert Originalzeilen ohne Darstellungs-Praefixe', async t => {
  const f = await fixture(t);
  const quote = 'const marker = "LOCAL_EVIDENCE_VALUE";\nconst second = "SECOND_VALUE";';
  await writeFile(f.source, quote + '\n');
  // Den Block als JSON bearbeiten, damit das mehrzeilige Zitat korrekt escaped ist.
  const record = JSON.parse(answer(f.source).split('ARCHI_AUDIT_JSON_BEGIN\n')[1].split('\nARCHI_AUDIT_JSON_END')[0]);
  record[0].belege[0].zitat = quote;
  await f.turn('ses_test', 'ARCHI_AUDIT_JSON_BEGIN\n' + JSON.stringify(record) + '\nARCHI_AUDIT_JSON_END');
  await f.hooks.get('execute.after')({ sessionID: 'ses_test', messageID: 'assistant_ses_test',
    tool: 'read', status: 'completed', input: { path: f.source },
    result: { output: { type: 'text-page', content: quote, offset: 1, truncated: false },
      content: 'Read file source.js, lines 1-2\n1: const marker = "LOCAL_EVIDENCE_VALUE";\n2: const second = "SECOND_VALUE";' } });
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
});

test('Letzte Assistant-Nachricht ohne Text greift nicht auf fruehere Ausgabe zurueck', async t => {
  const f = await fixture(t);
  await f.turn(); await f.read();
  const messages = f.messages.get('ses_test');
  messages[1].finish = 'tool-calls';
  messages.push({ id: 'assistant_final', type: 'assistant', finish: 'stop',
    content: [{ type: 'reasoning', text: 'Interner Text ist keine Antwort.' }] });
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.status, 'KEINE_STRUKTURIERTEN_BEFUNDE');
  assert.equal(audit.rows.length, 0);
});

async function exceedReadLimit(f, messageID = 'assistant_ses_test') {
  await f.hooks.get('execute.after')({ sessionID: 'ses_test', messageID,
    tool: 'read', status: 'completed', input: { path: f.source },
    result: { content: 'x'.repeat(600_001) } });
}

async function appendCleanTurn(f) {
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_clean', prompt: { text: 'Neu' } });
  f.messages.get('ses_test').push(
    { id: 'msg_clean', type: 'user', text: 'Neu' },
    { id: 'assistant_clean', type: 'assistant', finish: 'stop',
      content: [{ type: 'text', text: 'Neue Antwort ohne Belegblock.' }] },
  );
}

test('Werkzeuglimit eines abgeschlossenen Turns belastet keinen spaeteren sauberen Turn', async t => {
  const f = await fixture(t);
  await f.turn();
  await exceedReadLimit(f);
  f.emit('ses_test');
  const [old] = await untilRows(f.logPath);
  assert.equal(old.werkzeugumfang_begrenzt, true);

  await appendCleanTurn(f);
  f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].werkzeugumfang_begrenzt, false);
});

test('Verspaeteter alter Abschluss behaelt sein Limit nach neuerem Prompt ohne dessen Turn zu belasten', async t => {
  const f = await fixture(t);
  await f.turn();
  const oldAnswer = f.messages.get('ses_test')[1];
  oldAnswer.finish = 'tool-calls';
  await exceedReadLimit(f);
  await appendCleanTurn(f);
  f.emit('ses_test');
  const [clean] = await untilRows(f.logPath);
  assert.equal(clean.werkzeugumfang_begrenzt, false);

  oldAnswer.finish = 'stop';
  f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].werkzeugumfang_begrenzt, true);
  assert.notEqual(reports[0].prompt_sha256, reports[1].prompt_sha256);
});

test('Nicht zuordenbares Werkzeuglimit bleibt fuer spaetere Audits konservativ sichtbar', async t => {
  const f = await fixture(t);
  await f.turn();
  await exceedReadLimit(f, null);
  f.emit('ses_test');
  const [old] = await untilRows(f.logPath);
  assert.equal(old.werkzeugumfang_begrenzt, true);
  await appendCleanTurn(f);
  f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].werkzeugumfang_begrenzt, true);
});

test('Zu viele verschiedene Limit-IDs verlieren den konservativen Werkzeughinweis nicht', async t => {
  const f = await fixture(t);
  await f.turn();
  for (let n = 0; n < 193; n++) {
    await f.hooks.get('execute.after')({ sessionID: 'ses_test', messageID: `assistant_other_${n}`,
      tool: 'read', status: 'completed', input: { path: f.source }, result: { content: 'x' } });
  }
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.werkzeugumfang_begrenzt, true);
});

test('Audit benennt Strukturabdeckung und Benutzer-ID praezise ohne Aussagevollstaendigkeit zu behaupten', async t => {
  const f = await correctionFixture(t);
  await f.turn(); await f.read();
  f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.equal(audit.prompt_id_sha256, createHash('sha256').update('msg_ses_test').digest('hex'));
  assert.equal(audit.prompt_sha256, audit.prompt_id_sha256);
  assert.equal(audit.abdeckung.blockstatus, 'GUELTIG');
  assert.equal(audit.abdeckung.deklarierte_befunde, 1);
  assert.equal(audit.abdeckung.gepruefte_befunde, 1);
  assert.ok(audit.abdeckung.freitext_zeichen > 0);
  assert.equal(audit.abdeckung.aussagen_gesamt, null);
  assert.equal(audit.abdeckung.vollstaendigkeit, 'NICHT_NACHGEWIESEN');
  assert.equal(audit.abnahme, 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT');
  const event = { sessionID: 'ses_test', system: [] };
  await f.hooks.get('context')(event);
  const context = event.system.map(part => part.text).join('\n');
  assert.ok(context.includes(`Benutzer-Nachrichten-ID SHA256=${audit.prompt_id_sha256}`));
  assert.match(context, /1 von 1 deklarierten Befunden geprueft/);
  assert.match(context, /Freitext.*\d+ Zeichen.*ungeprueft/);
  assert.match(context, /Gesamtzahl der Aussagen=unbekannt.*NICHT_NACHGEWIESEN/);
  assert.match(context, /Abnahme=NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT; semantische Freigabe=NEIN/);
});

test('Prueferfehler besitzt unbekannte Strukturabdeckung und bleibt im Kontext nutzbar', async t => {
  const f = await fixture(t, { pythonPath: join(tmpdir(), 'archi-python-existiert-nicht.exe') });
  await f.turn(); f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.deepEqual(audit.abdeckung, {
    blockstatus: 'UNBEKANNT', deklarierte_befunde: 0, gepruefte_befunde: 0,
    freitext_zeichen: 0, aussagen_gesamt: null, vollstaendigkeit: 'NICHT_NACHGEWIESEN',
  });
  const event = { sessionID: 'ses_test', system: [] };
  await f.hooks.get('context')(event);
  assert.match(event.system.map(part => part.text).join('\n'), /Blockstatus=UNBEKANNT/);
});

async function staticBridge(t, result) {
  const root = await mkdtemp(join(tmpdir(), 'archi-protocol-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'output.py');
  await writeFile(path, 'import sys\nsys.stdout.write(' + JSON.stringify(JSON.stringify(result)) + ')\n');
  return { root, path };
}

test('Bridge-Transport uebernimmt ausschliesslich vereinbarte Abdeckungsmetadaten', async t => {
  const abdeckung = { blockstatus: 'LEER', deklarierte_befunde: 0, gepruefte_befunde: 0,
    freitext_zeichen: 12, aussagen_gesamt: null, vollstaendigkeit: 'NICHT_NACHGEWIESEN' };
  const bridge = await staticBridge(t, { status: 'KEINE_STRUKTURIERTEN_BEFUNDE', rows: [], freigabe: 'NEIN',
    abdeckung: { ...abdeckung, rohtext: 'PRIVATE_ANTWORT' }, antwort: 'PRIVATE_ANTWORT' });
  const f = await fixture(t, { bridgePath: bridge.path });
  await f.turn(); f.emit('ses_test');
  const [audit] = await untilRows(f.logPath);
  assert.deepEqual(audit.abdeckung, abdeckung);
  assert.ok(!(await readFile(f.logPath, 'utf8')).includes('PRIVATE_ANTWORT'));
});

test('Bridge-Transport weist falsche Abdeckungswerte als Protokollfehler zurueck', async t => {
  const base = { blockstatus: 'GUELTIG', deklarierte_befunde: 1, gepruefte_befunde: 1,
    freitext_zeichen: 0, aussagen_gesamt: null, vollstaendigkeit: 'NICHT_NACHGEWIESEN' };
  const invalid = [
    undefined, null, [],
    { ...base, blockstatus: 'PRIVATE_ANTWORT' },
    { ...base, deklarierte_befunde: true },
    { ...base, deklarierte_befunde: 4 },
    { ...base, gepruefte_befunde: -1 },
    { ...base, gepruefte_befunde: 2 },
    { ...base, freitext_zeichen: -1 },
    { ...base, freitext_zeichen: 0.5 },
    { ...base, freitext_zeichen: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, aussagen_gesamt: 1 },
    { ...base, vollstaendigkeit: 'VOLLSTAENDIG' },
  ];
  for (const abdeckung of invalid) {
    const bridge = await staticBridge(t, { status: 'GEPRUEFT', rows: [], freigabe: 'NEIN', abdeckung });
    await assert.rejects(api.runBridge({ text: '', reads: [] }, bridge.root, {
      pythonPath, bridgePath: bridge.path,
    }), /ARCHI_BRIDGE_PROTOCOL/);
  }
});

const qwen = { providerID: 'ollama', id: 'qwen3.5:9b', variant: 'default' };

async function correctionFixture(t, options = {}) {
  return fixture(t, { hostModel: qwen, ...options });
}

function correctedAnswer(f, id, text = answer(f.source, 'ERFUNDENER_WERT')) {
  f.messages.get('ses_test').push({ id, type: 'assistant', model: qwen, finish: 'stop',
    content: [{ type: 'text', text }] });
}

function deliverCorrection(f, input = f.dispatches.at(-1)) {
  f.messages.get('ses_test').push({ id: input.id, type: 'synthetic', text: input.text,
    description: input.description, metadata: input.metadata });
}

async function correctionRequest(f, model = qwen, kind = 'primary') {
  const hook = f.hooks.get('model.request');
  assert.equal(typeof hook, 'function', 'Modellschritt-Zaun fehlt');
  await hook({ sessionID: 'ses_test', model, kind, headers: {} });
}

test('Modellschritt-Zaun bindet angenommene Korrekturen und Nebenanfragen an das tatsaechliche Modell', async t => {
  for (const kind of ['primary', 'compaction', 'title', 'generate']) {
    const f = await correctionFixture(t);
    await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
    await untilRows(f.logPath); deliverCorrection(f);
    await correctionRequest(f);
    await assert.rejects(correctionRequest(f, { providerID: 'remote', id: 'other' }, kind), /ARCHI_CORRECTION_BLOCKED/);
    await assert.rejects(correctionRequest(f), /ARCHI_CORRECTION_BLOCKED/, 'Kein stiller Retry des abgebrochenen Auftrags');
    // Der verweigerte, bereits promovierte Eintrag darf spaetere menschliche Arbeit nicht dauerhaft sperren.
    await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_after_block', prompt: { text: 'Neu' } });
    f.messages.get('ses_test').push({ id: 'msg_after_block', type: 'user', text: 'Neu' });
    await correctionRequest(f, { providerID: 'remote', id: 'other' });
    const context = { sessionID: 'ses_test', system: [] };
    await f.hooks.get('context')(context);
    assert.match(context.system.map(part => part.text).join('\n'), /Nachkorrektur.*ABGEBROCHEN/);
  }
});

test('Modellschritt-Zaun verweigert alte Korrektur nach neuer menschlicher Prompt-Annahme', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f);
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_steered', prompt: { text: 'Neu' } });
  await assert.rejects(correctionRequest(f), /ARCHI_CORRECTION_BLOCKED/);
});

test('Unklar angenommene Korrektur bleibt am Modellschritt gebunden und behaelt echte Reads', async t => {
  const f = await correctionFixture(t);
  f.ctx.session.synthetic = async input => { f.dispatches.push(input); throw new Error('Admission unbekannt'); };
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f);
  await correctionRequest(f);
  correctedAnswer(f, 'assistant_unclear_correction', answer(f.source)); f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
  await correctionRequest(f, { providerID: 'remote', id: 'other' });
});

test('Nie angenommene Korrektur sperrt neuen menschlichen Kontext nicht und spaete Zustellung bleibt blockiert', async t => {
  const f = await correctionFixture(t);
  f.ctx.session.synthetic = async input => { f.dispatches.push(input); throw new Error('Vor Admission abgelehnt'); };
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  const [report] = await untilRows(f.logPath);
  assert.equal(report.korrektur.status, 'DISPATCH_UNKLAR');
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_after_unadmitted', prompt: { text: 'Neu' } });
  f.messages.get('ses_test').push({ id: 'msg_after_unadmitted', type: 'user', text: 'Neu' });
  const nextModel = { providerID: 'custom-provider', id: 'current-user-model' };
  f.session.model = nextModel;
  await correctionRequest(f, nextModel);
  assert.equal(f.dispatches.length, 1, 'Keine automatische erneute Admission');
  deliverCorrection(f, f.dispatches[0]);
  await assert.rejects(correctionRequest(f, nextModel), /ARCHI_CORRECTION_BLOCKED/);
  assert.equal(f.dispatches.length, 1);
  await f.cleanup();
  const reloaded = host(f.root, nextModel);
  reloaded.messages.set('ses_test', f.messages.get('ses_test'));
  const cleanup = await api.setupGuard(reloaded.ctx, { pythonPath, bridgePath, logPath: f.logPath });
  t.after(cleanup);
  await assert.rejects(correctionRequest(reloaded, nextModel), /ARCHI_CORRECTION_BLOCKED/);
  assert.equal(reloaded.dispatches.length, 0);
});

test('Echter Reload ohne alten Prompt-Hook hydriert Korrekturbindung und prueft Folgeantwort konservativ', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f); await f.cleanup();
  const next = host(f.root, qwen);
  next.messages.set('ses_test', f.messages.get('ses_test'));
  const cleanup = await api.setupGuard(next.ctx, { pythonPath, bridgePath, logPath: f.logPath });
  t.after(cleanup);
  await correctionRequest(next);
  next.messages.get('ses_test').push({ id: 'assistant_after_real_reload', type: 'assistant', model: qwen,
    finish: 'stop', content: [{ type: 'text', text: answer(f.source) }] });
  next.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].prompt_id_sha256, reports[0].prompt_id_sha256);
  assert.equal(reports[1].rows[0].pruefcode, 'LESEBELEG_NICHT_BEOBACHTET');
  assert.equal(reports[1].korrektur.versuche, 2);
  assert.equal(next.dispatches.length, 1);
});

test('Echter Reload sperrt Modellwechsel vor dem ersten Korrekturschritt', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f); await f.cleanup();
  const next = host(f.root, qwen);
  next.messages.set('ses_test', f.messages.get('ses_test'));
  const cleanup = await api.setupGuard(next.ctx, { pythonPath, bridgePath, logPath: f.logPath });
  t.after(cleanup);
  await assert.rejects(correctionRequest(next, { providerID: 'remote', id: 'other' }), /ARCHI_CORRECTION_BLOCKED/);
});

test('Persistente Aktivbindung sperrt Kontextverlust durch Compaction und Reload ohne normale Compaction zu verbieten', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f);
  await correctionRequest(f, qwen, 'compaction');
  await f.cleanup();
  const nextModel = { providerID: 'custom-provider', id: 'other-model' };
  const next = host(f.root, nextModel);
  next.messages.set('ses_test', [{ id: 'msg_compacted', type: 'compaction', status: 'completed', summary: 'Zusammenfassung' }]);
  const cleanup = await api.setupGuard(next.ctx, { pythonPath, bridgePath, logPath: f.logPath });
  t.after(cleanup);
  await assert.rejects(correctionRequest(next, nextModel), /ARCHI_CORRECTION_BLOCKED/);
  await assert.rejects(correctionRequest(next, qwen), /ARCHI_CORRECTION_BLOCKED/, 'Ohne Originalzuordnung keine Fortsetzung');
  await next.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_after_compaction', prompt: { text: 'Neu' } });
  next.messages.get('ses_test').push({ id: 'msg_after_compaction', type: 'user', text: 'Neu' });
  await correctionRequest(next, nextModel);
  next.messages.get('ses_test').push({ id: f.dispatches[0].id, type: 'synthetic', text: f.dispatches[0].text,
    metadata: f.dispatches[0].metadata });
  await assert.rejects(correctionRequest(next, nextModel), /ARCHI_CORRECTION_BLOCKED/);
  assert.equal(next.dispatches.length, 0);
});

test('Aktivbindung ist vor Host-Admission dauerhaft gespeichert und endet nach erfolgreicher terminaler Folgepruefung', async t => {
  const f = await correctionFixture(t);
  const key = { directory: join(f.root, 'corrections'), sessionID: 'ses_test', promptID: 'msg_ses_test', model: qwen };
  f.ctx.session.synthetic = async input => {
    assert.equal((await correctionApi.readCorrectionFence(key)).status, 'ACTIVE');
    f.dispatches.push(input);
  };
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  const [first] = await untilRows(f.logPath);
  assert.equal(first.korrektur.status, 'ANGEFORDERT');
  deliverCorrection(f);
  correctedAnswer(f, 'assistant_fence_success', answer(f.source)); f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].korrektur.status, 'NICHT_ERFORDERLICH');
  assert.equal((await correctionApi.readCorrectionFence(key)).status, 'CLEAR');
  await correctionRequest(f, { providerID: 'custom-provider', id: 'next-model' });
});

test('Echter Reload auditiert bereits abgeschlossene Folgeantwort ohne Prompt- oder Modellrequest-Hook', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f); await f.cleanup();
  const next = host(f.root, qwen);
  next.messages.set('ses_test', [...f.messages.get('ses_test'), { id: 'assistant_finished_during_reload',
    type: 'assistant', model: qwen, finish: 'stop', content: [{ type: 'text', text: answer(f.source) }] }]);
  const cleanup = await api.setupGuard(next.ctx, { pythonPath, bridgePath, logPath: f.logPath });
  t.after(cleanup);
  next.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].prompt_id_sha256, reports[0].prompt_id_sha256);
  assert.equal(reports[1].rows[0].pruefcode, 'LESEBELEG_NICHT_BEOBACHTET');
  assert.equal(reports[1].korrektur.versuche, 2);
});

test('Reload behandelt eine Laengenbegrenzung ohne terminalen Hostabschluss weiter als aktiven Korrekturpfad', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f);
  f.messages.get('ses_test').push({ id: 'assistant_length', type: 'assistant', model: qwen,
    finish: 'length', content: [{ type: 'text', text: 'Fortsetzung erforderlich' }] });
  await f.cleanup();
  const next = host(f.root, qwen);
  next.messages.set('ses_test', f.messages.get('ses_test'));
  const cleanup = await api.setupGuard(next.ctx, { pythonPath, bridgePath, logPath: f.logPath });
  t.after(cleanup);
  await assert.rejects(correctionRequest(next, { providerID: 'remote', id: 'other' }), /ARCHI_CORRECTION_BLOCKED/);
});

test('Nachkorrektur und Modellschrittbindung funktionieren mit beliebigen identischen Provider-Modellreferenzen', async t => {
  for (const model of [
    { providerID: 'ollama', id: 'llama3.3:70b' },
    { providerID: 'openai', id: 'test-model', variant: 'low' },
    { providerID: 'custom-provider', id: 'custom-model', variant: 'default' },
  ]) {
    const f = await fixture(t, { hostModel: model });
    await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
    const [report] = await untilRows(f.logPath);
    assert.equal(report.korrektur.status, 'ANGEFORDERT');
    assert.equal(f.dispatches.length, 1);
    deliverCorrection(f);
    await correctionRequest(f, model);
    await assert.rejects(correctionRequest(f, { ...model, id: 'anderes-modell' }), /ARCHI_CORRECTION_BLOCKED/);
  }
});

test('Nachkorrektur reserviert fuer denselben Auftrag hoechstens zwei Versuche und meldet Erschoepfung', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
  f.emit('ses_test'); f.emit('ses_test');
  let reports = await untilRows(f.logPath);
  assert.equal(f.dispatches.length, 1);
  assert.deepEqual(reports[0].korrektur, { status: 'ANGEFORDERT', versuche: 1, maximum: 2 });
  assert.equal(f.dispatches[0].delivery, 'queue');
  assert.equal(f.dispatches[0].resume, true);
  assert.equal(f.dispatches[0].sessionID, 'ses_test');
  assert.ok(f.dispatches[0].id);
  assert.match(f.dispatches[0].text, /FAKTREGEL_NICHT_BESTAETIGT/);
  assert.match(f.dispatches[0].text, /Antworttext SHA256=[a-f0-9]{64}/);
  assert.ok(!JSON.stringify(f.dispatches).includes(f.source));
  assert.ok(!JSON.stringify(f.dispatches).includes('ERFUNDENER_WERT'));

  correctedAnswer(f, 'assistant_correction1'); f.emit('ses_test');
  reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].rows[0].pruefcode, 'FAKTREGEL_NICHT_BESTAETIGT', 'Echte Reads bleiben im Korrekturpfad verfuegbar');
  assert.deepEqual(reports[1].korrektur, { status: 'ANGEFORDERT', versuche: 2, maximum: 2 });
  correctedAnswer(f, 'assistant_correction2'); f.emit('ses_test'); f.emit('ses_test');
  reports = await untilRows(f.logPath, 3);
  assert.equal(f.dispatches.length, 2);
  assert.deepEqual(reports[2].korrektur, { status: 'ERSCHOEPFT_UNGELOEST', versuche: 2, maximum: 2 });
  assert.equal(reports[2].freigabe, 'NEIN');
  const context = { sessionID: 'ses_test', system: [] };
  await f.hooks.get('context')(context);
  assert.match(context.system.map(part => part.text).join('\n'), /ERSCHOEPFT_UNGELOEST/);
});

test('Formaler Erfolg und erfolgreiche Folgeantwort starten keine weitere Nachkorrektur', async t => {
  const f = await correctionFixture(t);
  await f.turn(); await f.read(); f.emit('ses_test');
  let reports = await untilRows(f.logPath);
  assert.equal(f.dispatches.length, 0);
  assert.equal(reports[0].korrektur.status, 'NICHT_ERFORDERLICH');
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_second', prompt: { text: 'Pruefe erneut' } });
  f.messages.get('ses_test').push({ id: 'msg_second', type: 'user', text: 'Pruefe erneut' });
  correctedAnswer(f, 'assistant_second');
  await f.hooks.get('execute.after')({ sessionID: 'ses_test', messageID: 'assistant_second', tool: 'read',
    status: 'completed', input: { path: f.source }, result: { content: 'const marker = "LOCAL_EVIDENCE_VALUE";' } });
  f.emit('ses_test'); reports = await untilRows(f.logPath, 2);
  assert.equal(f.dispatches.length, 1);
  correctedAnswer(f, 'assistant_corrected', answer(f.source)); f.emit('ses_test');
  reports = await untilRows(f.logPath, 3);
  assert.equal(reports[2].rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
  assert.equal(reports[2].rows[0].schlussstatus, 'SCHLUSS_UNGEPRUEFT');
  assert.equal(reports[2].korrektur.status, 'NICHT_ERFORDERLICH');
  assert.equal(reports[2].korrektur.versuche, 1);
  assert.equal(f.dispatches.length, 1);
});

test('Neue menschliche Prompt-Hooks sperren alte Nachkorrektur auch vor aktualisiertem Kontext', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_newest', prompt: { text: 'Neuer Auftrag' } });
  f.emit('ses_test');
  const [report] = await untilRows(f.logPath);
  assert.equal(f.dispatches.length, 0);
  assert.equal(report.korrektur.status, 'NEUER_AUFTRAG');
});

test('Neuer menschlicher Kontext ohne Prompt-Hook sperrt ebenfalls alte Nachkorrektur', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
  f.messages.get('ses_test').push({ id: 'msg_new_context', type: 'user', text: 'Anderer Auftrag' });
  f.emit('ses_test'); const [report] = await untilRows(f.logPath);
  assert.equal(f.dispatches.length, 0);
  assert.equal(report.korrektur.status, 'NEUER_AUFTRAG');
  await assert.rejects(access(join(f.root, 'corrections')), { code: 'ENOENT' });
});

test('Wartende Admission blockiert den naechsten menschlichen Auftrag nicht', async t => {
  const f = await correctionFixture(t);
  let firstAdmission;
  const started = new Promise(resolve => { firstAdmission = resolve; });
  let calls = 0;
  f.ctx.session.synthetic = input => {
    f.dispatches.push(input);
    if (++calls === 1) { firstAdmission(); return new Promise(() => {}); }
    return Promise.resolve();
  };
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await started;
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_new_pending', prompt: { text: 'Neu' } });
  f.messages.get('ses_test').push({ id: 'msg_new_pending', type: 'user', text: 'Neu' });
  await correctionRequest(f);
  correctedAnswer(f, 'assistant_new_pending');
  f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[0].korrektur.status, 'DISPATCH_UNKLAR');
  assert.equal(reports[1].korrektur.status, 'ANGEFORDERT');
  assert.equal(reports[1].korrektur.versuche, 1, 'Neuer Originalauftrag hat ein eigenes Budget');
  assert.equal(f.dispatches.length, 2);
});

test('Modellwechsel nach Budgetreservierung verhindert Dispatch ohne Slot rueckzubuchen', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
  f.ctx.session.get = async () => {
    const budget = await correctionApi.readCorrectionBudget({ directory: join(f.root, 'corrections'),
      sessionID: 'ses_test', promptID: 'msg_ses_test' });
    if (budget.attempts >= 1) return { ...f.session, model: { ...qwen, id: 'qwen3:14b' } };
    return f.session;
  };
  f.emit('ses_test'); const [report] = await untilRows(f.logPath);
  assert.equal(f.dispatches.length, 0);
  assert.deepEqual(report.korrektur, { status: 'MODELL_BLOCKIERT', versuche: 1, maximum: 2 });
});

test('Prompt-Hook zwischen letzter Hostantwort und Dispatch wird noch synchron beruecksichtigt', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
  let fired = false;
  f.ctx.session.get = async () => {
    const budget = await correctionApi.readCorrectionBudget({ directory: join(f.root, 'corrections'),
      sessionID: 'ses_test', promptID: 'msg_ses_test' });
    if (budget.attempts >= 1 && !fired) { fired = true; queueMicrotask(() => queueMicrotask(() => {
      void f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_just_arrived', prompt: { text: 'Neu' } });
    })); }
    return f.session;
  };
  f.emit('ses_test'); const [report] = await untilRows(f.logPath);
  assert.equal(f.dispatches.length, 0);
  assert.deepEqual(report.korrektur, { status: 'NEUER_AUFTRAG', versuche: 1, maximum: 2 });
});

test('Modellwechsel und Kind-Sitzung bleiben auditfaehig ohne automatische Nachkorrektur', async t => {
  for (const type of ['changed', 'child', 'missingAPI', 'disabled']) {
    const f = await correctionFixture(t, type === 'disabled' ? { correctionEnabled: false } : {});
    await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
    if (type === 'changed') f.session.model = { ...qwen, id: 'qwen3:14b' };
    if (type === 'child') f.session.parentID = 'ses_parent';
    if (type === 'missingAPI') delete f.ctx.session.synthetic;
    f.emit('ses_test'); const [report] = await untilRows(f.logPath);
    assert.equal(report.rows[0].pruefcode, 'FAKTREGEL_NICHT_BESTAETIGT');
    assert.equal(f.dispatches.length, 0);
    assert.ok(report.korrektur.status);
  }
});

test('Fehlende Synthetic-Hostmethode verhindert Abnahme eines formal bestaetigten Read-Befunds', async t => {
  const f = await correctionFixture(t);
  delete f.ctx.session.synthetic;
  await f.turn(); await f.read(); f.emit('ses_test');
  const [report] = await untilRows(f.logPath);
  assert.equal(report.status, 'GEPRUEFT');
  assert.equal(report.rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
  assert.equal(report.rows[0].werkzeugnachweis, 'READ_PFAD_UND_ZITAT_BEOBACHTET');
  assert.equal(report.korrektur.status, 'HOST_NICHT_VERFUEGBAR');
  assert.equal(report.abnahme, 'NICHT_ABGENOMMEN');
  assert.equal(f.dispatches.length, 0);
  await assert.rejects(access(join(f.root, 'corrections')), { code: 'ENOENT' });
  const event = { sessionID: 'ses_test', system: [] };
  await f.hooks.get('context')(event);
  assert.match(event.system.map(part => part.text).join('\n'), /Abnahme=NICHT_ABGENOMMEN/);
});

test('Hostausfall erst im Korrekturgate verhindert Abnahme nach erfolgreicher Quellenpruefung', async t => {
  const root = await mkdtemp(join(tmpdir(), 'archi-host-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, 'bridge-started'), wrapper = join(root, 'bridge.py');
  await writeFile(wrapper, 'import runpy,sys\nfrom pathlib import Path\n'
    + 'sys.path.insert(0,str(Path(' + JSON.stringify(bridgePath) + ').parent))\n'
    + 'Path(' + JSON.stringify(marker) + ').touch()\n'
    + 'runpy.run_path(' + JSON.stringify(bridgePath) + ',run_name="__main__")\n');
  const f = await correctionFixture(t, { bridgePath: wrapper });
  f.ctx.session.get = async () => {
    if (await access(marker).then(() => true, () => false)) throw new Error('Host unavailable after bridge');
    return f.session;
  };
  await f.turn(); await f.read(); f.emit('ses_test');
  const [report] = await untilRows(f.logPath);
  assert.equal(report.status, 'GEPRUEFT');
  assert.equal(report.rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
  assert.equal(report.rows[0].werkzeugnachweis, 'READ_PFAD_UND_ZITAT_BEOBACHTET');
  assert.equal(report.korrektur.status, 'HOST_NICHT_VERFUEGBAR');
  assert.equal(report.abnahme, 'NICHT_ABGENOMMEN');
  assert.equal(f.dispatches.length, 0);
  await assert.rejects(access(join(f.root, 'corrections')), { code: 'ENOENT' });
});

test('Korrekturzustandsfehler verhindern Abnahme; bewusste Deaktivierung erhaelt formales Pruefergebnis', async t => {
  for (const type of ['budget', 'fence', 'disabled']) {
    const f = await correctionFixture(t, type === 'disabled' ? { correctionEnabled: false } : {});
    await f.turn(); await f.read();
    if (type !== 'disabled') await writeFile(join(f.root, 'corrections'), 'blocked directory');
    if (type === 'fence') f.messages.get('ses_test').splice(1, 0, {
      id: 'synthetic_previous', type: 'synthetic', metadata: { archi_guard_correction: true,
        prompt_id_sha256: createHash('sha256').update('msg_ses_test').digest('hex') },
    });
    f.emit('ses_test');
    const [report] = await untilRows(f.logPath);
    assert.equal(report.rows[0].pruefcode, 'BELEGKETTE_FORMAL_VOLLSTAENDIG');
    assert.equal(report.korrektur.status, type === 'disabled' ? 'DEAKTIVIERT' : 'ZUSTAND_BLOCKIERT');
    assert.equal(report.abnahme, type === 'disabled' ? 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT' : 'NICHT_ABGENOMMEN');
    assert.equal(f.dispatches.length, 0);
  }
});

test('Fehlender oder leerer Block und Infrastrukturfehler starten keine Nachkorrektur', async t => {
  for (const [text, blockstatus] of [['Freitext', 'FEHLEND'],
    ['ARCHI_AUDIT_JSON_BEGIN\n[]\nARCHI_AUDIT_JSON_END', 'LEER']]) {
    const f = await correctionFixture(t);
    await f.turn('ses_test', text); f.emit('ses_test');
    const [report] = await untilRows(f.logPath);
    assert.equal(f.dispatches.length, 0);
    assert.deepEqual(report.korrektur, { status: 'BEFUNDE_FEHLEN_UNGEPRUEFT', versuche: 0, maximum: 2 });
    assert.equal(report.abnahme, 'NICHT_ABGENOMMEN');
    assert.equal(report.abdeckung.blockstatus, blockstatus);
    assert.equal(report.abdeckung.gepruefte_befunde, 0);
    assert.equal(report.rows.length, 0);
    assert.deepEqual(await readdir(join(f.root, 'corrections')), [], 'Keine Budgetreservierung oder Aktivbindung');
    const event = { sessionID: 'ses_test', system: [] };
    await f.hooks.get('context')(event);
    const context = event.system.map(part => part.text).join('\n');
    assert.match(context, /Abnahme=NICHT_ABGENOMMEN; semantische Freigabe=NEIN/);
    assert.match(context, /Nachkorrektur=BEFUNDE_FEHLEN_UNGEPRUEFT; Versuche=0/);
    assert.match(context, /0 von 0 deklarierten Befunden geprueft/);
  }
  const f = await correctionFixture(t, { pythonPath: join(tmpdir(), 'archi-missing-python.exe') });
  await f.turn(); f.emit('ses_test'); const [report] = await untilRows(f.logPath);
  assert.equal(report.status, 'PRUEFER_FEHLER');
  assert.equal(f.dispatches.length, 0);
  assert.equal(report.korrektur.status, 'PRUEFUNG_BLOCKIERT');
  assert.equal(report.abnahme, 'NICHT_ABGENOMMEN');
});

test('GPT-OSS-Freitext mit fetten leeren Markern bleibt trotz beobachtetem Read nicht abgenommen', async t => {
  const logs = [];
  t.mock.method(console, 'info', line => logs.push(line));
  const f = await correctionFixture(t, { hostModel: { providerID: 'ollama', id: 'gpt-oss-20b-32k:latest' } });
  await f.turn('ses_test', 'Die Datei THIS_HIVE.md wurde nicht gefunden.\n'
    + '**ARCHI_AUDIT_JSON_BEGIN**\n[]\n**ARCHI_AUDIT_JSON_END**');
  await f.read();
  f.emit('ses_test');
  const [report] = await untilRows(f.logPath);
  assert.equal(report.plugin_version, 'global-v0.6');
  assert.equal(report.status, 'KEINE_STRUKTURIERTEN_BEFUNDE');
  assert.equal(report.abdeckung.blockstatus, 'LEER');
  assert.equal(report.abdeckung.gepruefte_befunde, 0);
  assert.ok(report.abdeckung.freitext_zeichen > 0);
  assert.equal(report.rows.length, 0);
  assert.equal(report.abnahme, 'NICHT_ABGENOMMEN');
  assert.equal(report.freigabe, 'NEIN');
  assert.deepEqual(report.korrektur, { status: 'BEFUNDE_FEHLEN_UNGEPRUEFT', versuche: 0, maximum: 2 });
  assert.equal(f.dispatches.length, 0);
  assert.deepEqual(await readdir(join(f.root, 'corrections')), []);
  const event = { sessionID: 'ses_test', system: [] };
  await f.hooks.get('context')(event);
  const context = event.system.map(part => part.text).join('\n');
  assert.match(context, /Abnahme=NICHT_ABGENOMMEN; semantische Freigabe=NEIN/);
  assert.match(context, /Nachkorrektur=BEFUNDE_FEHLEN_UNGEPRUEFT; Versuche=0/);
  assert.match(context, /Blockstatus=LEER/);
  assert.ok(logs.some(line => /Abnahme=NICHT_ABGENOMMEN; Freigabe=NEIN; Nachkorrektur=BEFUNDE_FEHLEN_UNGEPRUEFT/.test(line)));
});

test('Fehlende Befunde erhalten vorhandene Korrekturversuche ohne neue Reservierung', async t => {
  const f = await correctionFixture(t);
  const key = { directory: join(f.root, 'corrections'), sessionID: 'ses_test', promptID: 'msg_ses_test' };
  const reserved = await correctionApi.reserveCorrection({ ...key, answerID: 'assistant_previous',
    answerHash: createHash('sha256').update('previous answer').digest('hex'), model: qwen });
  assert.equal(reserved.status, 'RESERVED');
  await f.turn('ses_test', 'ARCHI_AUDIT_JSON_BEGIN\n[]\nARCHI_AUDIT_JSON_END');
  f.emit('ses_test');
  const [report] = await untilRows(f.logPath);
  assert.deepEqual(report.korrektur, { status: 'BEFUNDE_FEHLEN_UNGEPRUEFT', versuche: 1, maximum: 2 });
  assert.equal(f.dispatches.length, 0);
  assert.equal((await correctionApi.readCorrectionBudget(key)).attempts, 1);
});

test('Fehlende Befunde umgehen keine bestehenden Host-, Modell- oder Budgetsperren', async t => {
  for (const [type, expected] of [['missingAPI', 'HOST_NICHT_VERFUEGBAR'],
    ['changed', 'MODELL_BLOCKIERT'], ['child', 'KIND_SITZUNG'],
    ['disabled', 'DEAKTIVIERT'], ['budget', 'ZUSTAND_BLOCKIERT']]) {
    const f = await correctionFixture(t, type === 'disabled' ? { correctionEnabled: false } : {});
    await f.turn('ses_test', 'Freitext');
    if (type === 'missingAPI') delete f.ctx.session.synthetic;
    if (type === 'changed') f.session.model = { ...qwen, id: 'other-model' };
    if (type === 'child') f.session.parentID = 'ses_parent';
    if (type === 'budget') await writeFile(join(f.root, 'corrections'), 'blocked directory');
    f.emit('ses_test');
    const [report] = await untilRows(f.logPath);
    assert.equal(report.korrektur.status, expected, type);
    assert.equal(report.abnahme, 'NICHT_ABGENOMMEN');
    assert.equal(f.dispatches.length, 0);
  }
});

test('Unklarer Dispatch verbraucht einen Slot und wird fuer dieselbe Antwort nicht wiederholt', async t => {
  const f = await correctionFixture(t);
  let requests = 0;
  f.ctx.session.synthetic = async () => { requests++; throw new Error('Unklar nach Annahme'); };
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
  f.emit('ses_test'); const [report] = await untilRows(f.logPath);
  f.emit('ses_test');
  assert.equal(requests, 1);
  assert.deepEqual(report.korrektur, { status: 'DISPATCH_UNKLAR', versuche: 1, maximum: 2 });
});

test('Plugin-Neuladen behaelt Budget und korrigiert dieselbe abgeschlossene Antwort nicht erneut', async t => {
  const f = await correctionFixture(t);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); await f.cleanup();
  const next = host(f.root, qwen);
  next.messages.set('ses_test', f.messages.get('ses_test'));
  const cleanup = await api.setupGuard(next.ctx, { pythonPath, bridgePath, logPath: f.logPath });
  t.after(cleanup);
  await next.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_ses_test', prompt: { text: 'Pruefe' } });
  next.emit('ses_test'); let reports = await untilRows(f.logPath, 2);
  assert.equal(next.dispatches.length, 0);
  assert.equal(reports[1].korrektur.versuche, 1);
  next.messages.get('ses_test').push({ id: 'assistant_after_reload', type: 'assistant', model: qwen,
    finish: 'stop', content: [{ type: 'text', text: answer(f.source, 'ERFUNDENER_WERT') }] });
  next.emit('ses_test'); reports = await untilRows(f.logPath, 3);
  assert.equal(next.dispatches.length, 1);
  assert.equal(reports[2].korrektur.versuche, 2);
});

test('Scope: fremde Instanz uebernimmt Nachkorrektur weder im Modellhook noch im globalen Audit', async t => {
  const f = await correctionFixture(t);
  const otherRoot = await mkdtemp(join(tmpdir(), 'archi-foreign-'));
  t.after(() => rm(otherRoot, { recursive: true, force: true }));
  const other = host(otherRoot, qwen);
  other.ctx.session.get = async () => f.session;
  let foreignContextReads = 0;
  other.ctx.session.context = async ({ sessionID }) => {
    foreignContextReads++;
    return f.messages.get(sessionID) ?? [];
  };
  const cleanup = await api.setupGuard(other.ctx, { pythonPath, bridgePath, logPath: f.logPath,
    correctionDirectory: join(f.root, 'corrections') });
  let closed = false;
  const closeOther = async () => { if (!closed) { closed = true; await cleanup(); } };
  t.after(closeOther);
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read();
  f.emit('ses_test'); await untilRows(f.logPath);
  deliverCorrection(f);
  await other.hooks.get('model.request')({ sessionID: 'ses_test', model: qwen });
  assert.equal(foreignContextReads, 0, 'Fremder Modellhook darf keinen Wiederaufnahme-/Fencepfad betreten');
  correctedAnswer(f, 'assistant_scope_fixed', answer(f.source));
  f.emit('ses_test'); other.emit('ses_test');
  await untilRows(f.logPath, 2); await closeOther();
  const reports = (await readFile(f.logPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(reports.length, 2, 'Genau ein Audit je echter Antwort, keine fremde Zweitpruefung');
  assert.equal(reports[1].rows[0].werkzeugnachweis, 'READ_PFAD_UND_ZITAT_BEOBACHTET');
  assert.equal(reports[1].abnahme, 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT');
  assert.equal(other.dispatches.length, 0);
  assert.equal(f.dispatches.length, 1);
});

test('Scope: fremde Workspace-ID bleibt in allen Hook-Einstiegen ohne Seiteneffekt', async t => {
  const f = await correctionFixture(t);
  f.session.location.workspaceID = 'wrk_other';
  await f.hooks.get('prompt')({ sessionID: 'ses_test', messageID: 'msg_foreign', prompt: { text: 'Pruefe' } });
  const context = { sessionID: 'ses_test', system: [] };
  await f.hooks.get('context')(context);
  assert.deepEqual(context.system, []);
  const read = { sessionID: 'ses_test', messageID: 'assistant_foreign', tool: 'read', status: 'completed',
    input: { path: f.source }, result: { content: 'LOCAL_EVIDENCE_VALUE' } };
  await f.hooks.get('execute.after')(read);
  assert.equal(read.result.metadata?.archi_guard_observed, undefined);
  await f.hooks.get('model.request')({ sessionID: 'ses_test', model: qwen });
  assert.equal(f.dispatches.length, 0);
  await assert.rejects(access(join(f.root, 'corrections')), { code: 'ENOENT' });
});

test('Scope: fehlende oder ungueltige Instanzlocation wird beim Setup sichtbar abgelehnt', async t => {
  const root = await mkdtemp(join(tmpdir(), 'archi-location-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const location of [undefined, { directory: '.' }, { directory: root, workspaceID: '' }]) {
    const h = host(root, qwen); h.ctx.location = location;
    let cleanup;
    t.after(async () => { await cleanup?.(); });
    await assert.rejects(async () => { cleanup = await api.setupGuard(h.ctx, { pythonPath, bridgePath,
      logPath: join(root, 'audit.jsonl') }); }, /LOCATION/);
  }
});

test('Scope: Windows-Schreibweise desselben Verzeichnisses bleibt eigener Kontext', { skip: process.platform !== 'win32' }, async t => {
  const f = await correctionFixture(t);
  f.session.location.directory = f.root.toUpperCase().replaceAll('\\', '/');
  await f.turn(); await f.read(); f.emit('ses_test');
  const [report] = await untilRows(f.logPath);
  assert.equal(report.abnahme, 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT');
});

test('Scope: gleiche Workspace-ID wird anerkannt, fehlende oder falsche ID nicht uebernommen', async t => {
  for (const kind of ['same', 'missing', 'different']) {
    const f = await correctionFixture(t, { workspaceID: 'wrk_owner' });
    if (kind === 'same') {
      await f.turn(); await f.read(); f.emit('ses_test');
      const [report] = await untilRows(f.logPath);
      assert.equal(report.abnahme, 'NUR_DEKLARIERTE_BEFUNDE_GEPRUEFT');
    } else {
      f.session.location.workspaceID = kind === 'missing' ? undefined : 'wrk_foreign';
      await f.hooks.get('model.request')({ sessionID: 'ses_test', model: qwen });
      const context = { sessionID: 'ses_test', system: [] };
      await f.hooks.get('context')(context);
      assert.deepEqual(context.system, []);
      assert.equal(f.dispatches.length, 0);
      await assert.rejects(access(join(f.root, 'corrections')), { code: 'ENOENT' });
    }
  }
});

test('Scope: ungueltige oder nicht aufloesbare Sessionlocation erteilt keine Rechte', async t => {
  for (const kind of ['relative', 'unavailable']) {
    const f = await correctionFixture(t);
    if (kind === 'relative') f.session.location.directory = '.';
    else f.ctx.session.get = async () => { throw new Error('Session unavailable'); };
    const context = { sessionID: 'ses_test', system: [] };
    await f.hooks.get('context')(context);
    assert.deepEqual(context.system, []);
    await assert.rejects(f.hooks.get('model.request')({ sessionID: 'ses_test', model: qwen }),
      /ARCHI_CORRECTION_BLOCKED: SCOPE_NICHT_VERFUEGBAR/);
    assert.equal(f.dispatches.length, 0);
    await assert.rejects(access(join(f.root, 'corrections')), { code: 'ENOENT' });
  }
});

async function countedBridge(t) {
  const root = await mkdtemp(join(tmpdir(), 'archi-scope-drift-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = join(root, 'count'), path = join(root, 'bridge.py');
  await writeFile(path, 'import runpy,sys\nfrom pathlib import Path\n'
    + 'sys.path.insert(0,str(Path(' + JSON.stringify(bridgePath) + ').parent))\n'
    + 'p=Path(' + JSON.stringify(marker) + ')\np.write_text(str(int(p.read_text())+1 if p.exists() else 1))\n'
    + 'runpy.run_path(' + JSON.stringify(bridgePath) + ',run_name="__main__")\n');
  return { path, count: async () => Number(await readFile(marker, 'utf8').catch(() => '0')) };
}

test('Scopewechsel: ungueltige Location nach Bridge verhindert Abnahme und Fence-Loeschung', async t => {
  const bridge = await countedBridge(t), f = await correctionFixture(t, { bridgePath: bridge.path });
  f.ctx.session.get = async () => await bridge.count() >= 2
    ? { ...f.session, location: { directory: '.' } } : f.session;
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f); await correctionRequest(f);
  correctedAnswer(f, 'assistant_unknown_scope', answer(f.source)); f.emit('ses_test');
  const reports = await untilRows(f.logPath, 2);
  assert.equal(reports[1].abnahme, 'NICHT_ABGENOMMEN');
  const fence = await correctionApi.readCorrectionFence({ directory: join(f.root, 'corrections'),
    sessionID: 'ses_test', promptID: 'msg_ses_test', model: qwen });
  assert.equal(fence.status, 'ACTIVE', 'Unbekannter Scope darf die gemeinsame Fence nicht loeschen');
});

test('Scopewechsel: fremde Location nach Bridge erzeugt weder Folgeaudit noch Fence-Loeschung', async t => {
  const bridge = await countedBridge(t), f = await correctionFixture(t, { bridgePath: bridge.path });
  const otherRoot = await mkdtemp(join(tmpdir(), 'archi-moved-'));
  t.after(() => rm(otherRoot, { recursive: true, force: true }));
  let signal; const observed = new Promise(resolve => { signal = resolve; });
  f.ctx.session.get = async () => {
    if (await bridge.count() >= 2) { signal(); return { ...f.session, location: { directory: otherRoot } }; }
    return f.session;
  };
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f); await correctionRequest(f);
  correctedAnswer(f, 'assistant_moved_scope', answer(f.source)); f.emit('ses_test');
  await observed; await f.cleanup();
  const reports = (await readFile(f.logPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(reports.length, 1);
  const fence = await correctionApi.readCorrectionFence({ directory: join(f.root, 'corrections'),
    sessionID: 'ses_test', promptID: 'msg_ses_test', model: qwen });
  assert.equal(fence.status, 'ACTIVE');
});

test('Scopewechsel: Modellhook greift nach Wechsel waehrend Kontextabfrage keine fremde Fence an', async t => {
  const f = await correctionFixture(t), otherRoot = await mkdtemp(join(tmpdir(), 'archi-model-moved-'));
  t.after(() => rm(otherRoot, { recursive: true, force: true }));
  await f.turn('ses_test', answer(f.source, 'ERFUNDENER_WERT')); await f.read(); f.emit('ses_test');
  await untilRows(f.logPath); deliverCorrection(f);
  f.ctx.session.context = async ({ sessionID }) => {
    f.session.location = { directory: otherRoot };
    return f.messages.get(sessionID) ?? [];
  };
  await f.hooks.get('model.request')({ sessionID: 'ses_test', model: { ...qwen, id: 'other-project-model' } });
  const fence = await correctionApi.readCorrectionFence({ directory: join(f.root, 'corrections'),
    sessionID: 'ses_test', promptID: 'msg_ses_test', model: qwen });
  assert.equal(fence.status, 'ACTIVE');
  assert.equal(f.dispatches.length, 1);
});
