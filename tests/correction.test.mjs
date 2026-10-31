import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const api = await import('../global-plugin/correction.mjs').catch(() => ({}));
const localModel = { providerID: 'ollama', id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:UD-Q3_K_XL' };
const digest = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'archi-correction-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'budget');
  return { root, directory, sessionID: 'ses_private_session', promptID: 'msg_private_prompt',
    answerID: 'msg_private_answer', answerHash: digest('PRIVATE_ANSWER_TEXT'), model: localModel };
}

function exported(name) {
  assert.equal(typeof api[name], 'function', `Korrekturhilfe ${name} fehlt`);
  return api[name];
}

async function statePath(f) {
  const files = (await readdir(f.directory)).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 1);
  return join(f.directory, files[0]);
}

test('Nur feste konkrete Negativcodes loesen eine Korrektur aus', () => {
  const reasons = exported('correctionReasons');
  assert.deepEqual(reasons({ status: 'GEPRUEFT', rows: [
    { pruefcode: 'LESEBELEG_NICHT_BEOBACHTET' }, { pruefcode: 'BELEGKETTE_UNVOLLSTAENDIG' },
    { pruefcode: 'BELEGE_NICHT_EXAKT' }, { pruefcode: 'FAKTREGEL_NICHT_BESTAETIGT' },
    { pruefcode: 'FAKTREGEL_NICHT_BESTAETIGT', detail: 'PRIVATE_INSTRUCTION' },
  ] }), ['BELEGKETTE_UNVOLLSTAENDIG', 'BELEGE_NICHT_EXAKT',
    'FAKTREGEL_NICHT_BESTAETIGT', 'LESEBELEG_NICHT_BEOBACHTET']);
  assert.deepEqual(reasons({ status: 'FORMAT_FEHLER', rows: [],
    abdeckung: { blockstatus: 'UNGUELTIG' } }), ['FORMAT_FEHLER']);
});

test('Formaler Erfolg, unbekannte Semantik und fehlende Befunde verbrauchen kein Budget', () => {
  const reasons = exported('correctionReasons');
  for (const report of [undefined, null, {},
    { status: 'GEPRUEFT', freigabe: 'NEIN', rows: [
      { pruefcode: 'BELEGKETTE_FORMAL_VOLLSTAENDIG', schlussstatus: 'SCHLUSS_UNGEPRUEFT' } ] },
    { status: 'GEPRUEFT', rows: [] },
    { status: 'KEINE_STRUKTURIERTEN_BEFUNDE', rows: [], abdeckung: { blockstatus: 'FEHLEND' } },
    { status: 'KEINE_STRUKTURIERTEN_BEFUNDE', rows: [], abdeckung: { blockstatus: 'LEER' } },
    { status: 'PRUEFER_FEHLER', rows: [{ pruefcode: 'FORMAT_FEHLER' }] },
    { status: 'PROTOKOLL_FEHLER', rows: [{ pruefcode: 'BELEGE_NICHT_EXAKT' }] },
    { status: 'GEPRUEFT', rows: [{ pruefcode: 'UNBEKANNTER_CODE' }] },
  ]) assert.deepEqual(reasons(report), []);
});

test('Modellbindung verlangt dieselbe Referenz und normalisiert nur fehlende Defaultvariante', () => {
  const same = exported('sameModelReference');
  assert.equal(same(localModel, { ...localModel, variant: 'default' }), true);
  assert.equal(same({ ...localModel, variant: 'precise' }, { ...localModel, variant: 'precise' }), true);
  for (const candidate of [undefined, null, {}, { ...localModel, providerID: 'openai' },
    { ...localModel, id: 'llama3:8b' }, { ...localModel, id: 'QWEN3-coder:30b' },
    { ...localModel, id: 'qwen3:8b' }, { ...localModel, variant: 'precise' },
    { ...localModel, variant: null }, { ...localModel, id: 'qwen\nprivate' },
    { providerID: 'ollama', model: localModel.id },
  ]) assert.equal(same(localModel, candidate), false);
});

test('Pruefung und Reservierung akzeptieren unterschiedliche Modellfamilien und Provider', async t => {
  const same = exported('sameModelReference'), reserve = exported('reserveCorrection');
  const models = [
    { providerID: 'ollama', id: 'llama-test:8b' },
    { providerID: 'openai', id: 'gpt-test' },
    { providerID: 'anthropic', id: 'claude-test', variant: 'precise' },
    { providerID: 'custom-local', id: 'local model with spaces' },
  ];
  for (const model of models) {
    const f = await fixture(t);
    assert.equal(same(model, { ...model }), true, `Referenz abgelehnt: ${model.providerID}`);
    const result = await reserve({ ...f, model });
    assert.equal(result.status, 'RESERVED', `Budget abgelehnt: ${model.providerID}`);
    assert.equal(result.attempts, 1);
    assert.deepEqual(await reserve({ ...f, model: { ...model, providerID: 'different-provider' },
      answerID: 'msg_second' }), { status: 'STATE_BLOCKED', attempts: null });
  }
});

test('Die reale SDK-Modellreferenz mit id ist gueltig; ein model-Alias ersetzt keine id', () => {
  const same = exported('sameModelReference');
  const sdkRef = { providerID: 'ollama', id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:UD-Q3_K_XL', variant: 'default' };
  assert.equal(same(sdkRef, sdkRef), true);
  assert.equal(same(sdkRef, { providerID: 'ollama', model: sdkRef.id, variant: 'default' }), false);
});

test('Ein neuer Auftrag beginnt mit null und reserviert vor Rueckgabe dauerhaft den ersten Slot', async t => {
  const f = await fixture(t), read = exported('readCorrectionBudget'), reserve = exported('reserveCorrection');
  assert.deepEqual(await read(f), { status: 'READY', attempts: 0 });
  const result = await reserve(f);
  assert.equal(result.status, 'RESERVED');
  assert.equal(result.attempts, 1);
  assert.match(result.syntheticID, /^msg_archiguard_[a-f0-9]{32}_1$/);
  assert.deepEqual(await read(f), { status: 'READY', attempts: 1 });
  const stored = JSON.parse(await readFile(await statePath(f), 'utf8'));
  assert.equal(stored.attempts, 1);
});

test('Ein Reload und neuer Prompt behalten getrennte persistente Zaehler', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection');
  await reserve(f);
  const reload = await import('../global-plugin/correction.mjs?budget-reload=1');
  assert.deepEqual(await reload.readCorrectionBudget(f), { status: 'READY', attempts: 1 });
  assert.deepEqual(await reload.readCorrectionBudget({ ...f, promptID: 'msg_new_prompt' }),
    { status: 'READY', attempts: 0 });
  const second = await reload.reserveCorrection({ ...f, answerID: 'msg_second' });
  assert.equal(second.status, 'RESERVED');
  assert.equal(second.attempts, 2);
});

test('Identische Assistant-ID ist Duplikat; neue ID mit identischem Antworttext darf zweiten Slot nutzen', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection');
  const first = await reserve(f);
  const duplicate = await reserve(f);
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(duplicate.attempts, 1);
  assert.equal(duplicate.syntheticID, undefined);
  const second = await reserve({ ...f, answerID: 'msg_new_candidate_same_text' });
  assert.equal(second.status, 'RESERVED');
  assert.equal(second.attempts, 2);
  assert.equal(second.syntheticID.slice(0, -1), first.syntheticID.slice(0, -1));
  assert.ok(second.syntheticID.endsWith('_2'));
});

test('Ein dritter Kandidat bleibt erschoepft und Duplikate werden auch danach erkannt', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection');
  await reserve(f);
  await reserve({ ...f, answerID: 'msg_second' });
  assert.deepEqual(await reserve({ ...f, answerID: 'msg_third' }), { status: 'EXHAUSTED', attempts: 2 });
  assert.deepEqual(await reserve(f), { status: 'DUPLICATE', attempts: 2 });
});

test('Gleichzeitige Reservierungen koennen insgesamt hoechstens zwei Slots dauerhaft verbrauchen', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection'), read = exported('readCorrectionBudget');
  const results = await Promise.all(Array.from({ length: 16 }, (_, index) =>
    reserve({ ...f, answerID: `msg_parallel_${index}` })));
  assert.ok(results.some(result => result.status === 'RESERVED'));
  assert.ok(results.filter(result => result.status === 'RESERVED').length <= 2);
  assert.ok(results.every(result => ['RESERVED', 'STATE_BLOCKED', 'EXHAUSTED'].includes(result.status)));
  for (let index = 0; index < 3; index++) await reserve({ ...f, answerID: `msg_after_${index}` });
  assert.deepEqual(await read(f), { status: 'READY', attempts: 2 });
});

test('Eine vorhandene exklusive Sperre wird weder geloescht noch als freies Budget behandelt', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection'), read = exported('readCorrectionBudget');
  await reserve(f);
  const state = await statePath(f), lock = state.replace(/\.json$/, '.lock');
  await writeFile(lock, '');
  assert.deepEqual(await reserve({ ...f, answerID: 'msg_second' }), { status: 'STATE_BLOCKED', attempts: null });
  assert.deepEqual(await read(f), { status: 'STATE_BLOCKED', attempts: null });
  assert.equal(await readFile(lock, 'utf8'), '');
});

test('Ein anderes Modell, ein anderer Provider oder eine andere Variante kann ein bestehendes Budget nicht uebernehmen', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection');
  await reserve(f);
  for (const model of [{ ...localModel, id: 'qwen3:8b' }, { ...localModel, variant: 'precise' },
    { ...localModel, providerID: 'remote' }]) {
    assert.deepEqual(await reserve({ ...f, answerID: 'msg_second', model }), { status: 'STATE_BLOCKED', attempts: null });
  }
  assert.equal((await reserve({ ...f, answerID: 'msg_second', model: { ...localModel, variant: 'default' } })).status,
    'RESERVED');
});

test('Persistierter Zustand enthaelt weder IDs, Modellbezeichnungen, Rohantworten noch Quellpfade', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection');
  await reserve(f);
  const path = await statePath(f), raw = await readFile(path, 'utf8');
  for (const secret of [f.sessionID, f.promptID, f.answerID, localModel.id,
    'PRIVATE_ANSWER_TEXT', f.root]) assert.ok(!raw.includes(secret));
  assert.ok(Buffer.byteLength(raw) < 2048);
  assert.equal((await readdir(f.directory)).length, 1);
});

test('Kaputte, uebergrosse und schemawidrige Budgetdateien werden nie zurueckgesetzt', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection'), read = exported('readCorrectionBudget');
  await reserve(f);
  const path = await statePath(f), valid = JSON.parse(await readFile(path, 'utf8'));
  for (const raw of ['{broken', ' '.repeat(3000), JSON.stringify({ ...valid, attempts: 3 }),
    JSON.stringify({ ...valid, attempts: -1 }), JSON.stringify({ ...valid, schema: 999 }),
    JSON.stringify({ ...valid, extra: 'PRIVATE_INSTRUCTION' }), JSON.stringify({ ...valid, taskHash: '0'.repeat(64) }),
    JSON.stringify({ ...valid, modelHash: [valid.modelHash] }),
    JSON.stringify({ ...valid, answers: [] }),
    JSON.stringify({ ...valid, attempts: 2, answers: [valid.answers[0], valid.answers[0]] }),
    JSON.stringify({ ...valid, answers: [{ ...valid.answers[0], answerHash: [valid.answers[0].answerHash] }] }),
    JSON.stringify({ ...valid, answers: [{ ...valid.answers[0], extra: 'PRIVATE_INSTRUCTION' }] }),
  ]) {
    await writeFile(path, raw);
    assert.deepEqual(await read(f), { status: 'STATE_BLOCKED', attempts: null });
    assert.deepEqual(await reserve({ ...f, answerID: 'msg_second' }), { status: 'STATE_BLOCKED', attempts: null });
    assert.equal(await readFile(path, 'utf8'), raw);
  }
});

test('Nichtregulaere Budgetdatei wird konservativ gesperrt', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection'), read = exported('readCorrectionBudget');
  await reserve(f);
  const path = await statePath(f);
  await rm(path);
  await mkdir(path);
  assert.deepEqual(await read(f), { status: 'STATE_BLOCKED', attempts: null });
  assert.deepEqual(await reserve({ ...f, answerID: 'msg_second' }), { status: 'STATE_BLOCKED', attempts: null });
});

test('Ein Junction-Zustandsverzeichnis wird abgelehnt und das Ziel bleibt leer', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection'), read = exported('readCorrectionBudget');
  const external = join(f.root, 'external');
  await mkdir(external);
  await symlink(external, f.directory, 'junction');
  assert.deepEqual(await read(f), { status: 'STATE_BLOCKED', attempts: null });
  assert.deepEqual(await reserve(f), { status: 'STATE_BLOCKED', attempts: null });
  assert.deepEqual(await readdir(external), []);
});

test('Eine Junction im Elternpfad wird ebenfalls vor jedem Schreiben abgelehnt', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection');
  const external = join(f.root, 'external'), redirected = join(f.root, 'redirected');
  await mkdir(external);
  await symlink(external, redirected, 'junction');
  assert.deepEqual(await reserve({ ...f, directory: join(redirected, 'child') }),
    { status: 'STATE_BLOCKED', attempts: null });
  assert.deepEqual(await readdir(external), []);
});

test('Ein umgeleiteter Budgetdateipfad darf weder gelesen noch ueberschrieben werden', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection'), read = exported('readCorrectionBudget');
  await reserve(f);
  const path = await statePath(f), external = join(f.root, 'external');
  await mkdir(external);
  await writeFile(join(external, 'keep.txt'), 'EXTERNAL_VALUE');
  await rm(path);
  await symlink(external, path, 'junction');
  assert.deepEqual(await read(f), { status: 'STATE_BLOCKED', attempts: null });
  assert.deepEqual(await reserve({ ...f, answerID: 'msg_second' }), { status: 'STATE_BLOCKED', attempts: null });
  assert.equal(await readFile(join(external, 'keep.txt'), 'utf8'), 'EXTERNAL_VALUE');
});

test('Ungueltige Auftrags-/Antwort-/Modellangaben erzeugen keinen Budgetzustand', async t => {
  const f = await fixture(t), reserve = exported('reserveCorrection'), read = exported('readCorrectionBudget');
  for (const patch of [{ sessionID: '' }, { promptID: null }, { answerID: '' }, { answerHash: 'invalid' },
    { answerHash: [f.answerHash] },
    { directory: 'relative/path' }, { model: null }, { model: { providerID: '', id: 'llama3' } },
    { model: { providerID: 'local\nprivate', id: 'llama3' } }, { model: { providerID: 'local', id: '' } },
    { model: { providerID: 'ollama', model: localModel.id } }]) {
    assert.deepEqual(await reserve({ ...f, ...patch }), { status: 'STATE_BLOCKED', attempts: null });
  }
  assert.deepEqual(await read({ ...f, promptID: '' }), { status: 'STATE_BLOCKED', attempts: null });
  assert.deepEqual(await readdir(f.root), []);
});

test('Aktive Auftragsbindung bleibt ohne Chatkontext ueber einen Modul-Reload erhalten', async t => {
  const f = await fixture(t), set = exported('setCorrectionFence');
  assert.deepEqual(await set(f), { status: 'ACTIVE' });
  const reload = await import('../global-plugin/correction.mjs?fence-reload=1');
  const state = await reload.readCorrectionFence(f);
  assert.equal(state.status, 'ACTIVE');
  assert.equal(state.promptMatches, true);
  assert.equal(state.modelMatches, true);
  assert.match(state.taskHash, /^[a-f0-9]{64}$/);
  const lostContext = await reload.readCorrectionFence({ directory: f.directory, sessionID: f.sessionID,
    model: { providerID: 'other', id: 'different-model' } });
  assert.equal(lostContext.status, 'ACTIVE');
  assert.equal(lostContext.promptMatches, false);
  assert.equal(lostContext.modelMatches, false);
});

test('Aktive Auftragsbindung kann nur mit passendem Auftragshash gezielt beendet werden', async t => {
  const f = await fixture(t), set = exported('setCorrectionFence'), read = exported('readCorrectionFence'),
    clear = exported('clearCorrectionFence');
  assert.deepEqual(await read(f), { status: 'CLEAR' });
  await set(f);
  assert.deepEqual(await set({ ...f, promptID: 'msg_new_task' }), { status: 'STATE_BLOCKED' });
  assert.deepEqual(await set({ ...f, model: { providerID: 'other', id: 'different-model' } }),
    { status: 'STATE_BLOCKED' });
  assert.deepEqual(await clear({ ...f, taskHash: '0'.repeat(64) }), { status: 'STATE_BLOCKED' });
  const original = await read(f);
  assert.equal(original.status, 'ACTIVE');
  assert.deepEqual(await clear({ ...f, taskHash: original.taskHash }), { status: 'CLEAR' });
  assert.deepEqual(await read(f), { status: 'CLEAR' });
  assert.deepEqual(await set({ ...f, promptID: 'msg_new_task' }), { status: 'ACTIVE' });
});

test('Defekte Aktivbindung wird weder als inaktiv behandelt noch ueberschrieben', async t => {
  const f = await fixture(t), set = exported('setCorrectionFence'), read = exported('readCorrectionFence');
  await set(f);
  const path = await statePath(f);
  await writeFile(path, '{broken-state');
  assert.deepEqual(await read(f), { status: 'STATE_BLOCKED' });
  assert.deepEqual(await set(f), { status: 'STATE_BLOCKED' });
  assert.equal(await readFile(path, 'utf8'), '{broken-state');
});

test('Dauerhafte Aktivbindung speichert ausschliesslich Schema und Hashes', async t => {
  const f = await fixture(t), set = exported('setCorrectionFence');
  await set(f);
  const raw = await readFile(await statePath(f), 'utf8');
  for (const privateValue of [f.sessionID, f.promptID, localModel.id, localModel.providerID, f.root])
    assert.ok(!raw.includes(privateValue));
  const state = JSON.parse(raw);
  assert.deepEqual(Object.keys(state).sort(), ['modelHash', 'promptHash', 'schema', 'sessionHash', 'taskHash']);
});
