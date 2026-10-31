import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const REASONS = Object.freeze(['FORMAT_FEHLER', 'BELEGKETTE_UNVOLLSTAENDIG',
  'BELEGE_NICHT_EXAKT', 'FAKTREGEL_NICHT_BESTAETIGT', 'LESEBELEG_NICHT_BEOBACHTET']);
const MAX_ATTEMPTS = 2;
const MAX_STATE_BYTES = 2048;
const HASH = /^[a-f0-9]{64}$/;
const validHash = value => typeof value === 'string' && HASH.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const blocked = () => ({ status: 'STATE_BLOCKED', attempts: null });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = (value, max = 1024) => typeof value === 'string' && value.length > 0
  && value.length <= max && value.trim() === value && !/[\x00-\x20\x7f]/.test(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;

export function correctionReasons(report) {
  if (!object(report) || !['FORMAT_FEHLER', 'GEPRUEFT'].includes(report.status)) return [];
  if (['FEHLEND', 'LEER', 'UNBEKANNT'].includes(report.abdeckung?.blockstatus)) return [];
  if (report.status === 'FORMAT_FEHLER') return ['FORMAT_FEHLER'];
  if (!Array.isArray(report.rows)) return [];
  const observed = new Set(report.rows.filter(object).map(row => row.pruefcode));
  return REASONS.filter(code => observed.has(code));
}

function normalizedModel(value) {
  const modelPart = (part, max) => typeof part === 'string' && part.length > 0
    && part.length <= max && part.trim() === part && !/[\x00-\x1f\x7f]/.test(part);
  if (!object(value) || !modelPart(value.providerID, 256) || !modelPart(value.id, 1024)) return null;
  const variant = value.variant === undefined ? 'default' : value.variant;
  if (!modelPart(variant, 256)) return null;
  return { providerID: value.providerID, id: value.id, variant };
}

export function sameModelReference(a, b) {
  const left = normalizedModel(a), right = normalizedModel(b);
  return left !== null && right !== null && left.providerID === right.providerID
    && left.id === right.id && left.variant === right.variant;
}

// Compatibility for callers of the earlier, unfinished module.
export const sameLocalQwenModel = sameModelReference;

function taskOptions(value) {
  if (!object(value) || !token(value.sessionID) || !token(value.promptID)
      || typeof value.directory !== 'string' || !value.directory || !isAbsolute(value.directory)
      || /[\x00-\x1f\x7f]/.test(value.directory)) throw new Error();
  const directory = resolve(value.directory);
  const taskHash = hash(JSON.stringify([value.sessionID, value.promptID]));
  return { directory, taskHash, path: join(directory, `${taskHash}.json`),
    lockPath: join(directory, `${taskHash}.lock`) };
}

// Check every existing ancestor: resolving a path alone does not reject Windows junctions.
async function safeDirectory(directory, create = true) {
  const paths = [];
  for (let current = directory; ; current = dirname(current)) {
    paths.push(current);
    if (dirname(current) === current) break;
  }
  for (const path of paths.reverse()) {
    let stat;
    try { stat = await lstat(path); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      try { await mkdir(path, { mode: 0o700 }); }
      catch (cause) { if (cause.code !== 'EEXIST') throw cause; }
      stat = await lstat(path);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error();
  }
}

async function regularStat(path, optional = false) {
  let stat;
  try { stat = await lstat(path); }
  catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error();
  return stat;
}

async function readBytes(path, optional = false, sync = false) {
  const before = await regularStat(path, optional);
  if (before === null) return null;
  if (before.size > MAX_STATE_BYTES) throw new Error();
  const handle = await open(path, (sync ? constants.O_RDWR : constants.O_RDONLY) | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFile(before, opened) || opened.size > MAX_STATE_BYTES) throw new Error();
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const linked = await regularStat(path);
    if (bytes.length > MAX_STATE_BYTES || !sameFile(opened, linked) || after.size !== bytes.length
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error();
    if (sync) await handle.sync();
    return bytes;
  } finally { await handle.close(); }
}

function validState(state, taskHash) {
  if (!exactKeys(state, ['schema', 'taskHash', 'modelHash', 'attempts', 'answers'])
      || state.schema !== 1 || state.taskHash !== taskHash || !validHash(state.taskHash)
      || !validHash(state.modelHash) || !Number.isSafeInteger(state.attempts)
      || state.attempts < 0 || state.attempts > MAX_ATTEMPTS || !Array.isArray(state.answers)
      || state.answers.length !== state.attempts) throw new Error();
  const seen = new Set();
  for (const answer of state.answers) {
    if (!exactKeys(answer, ['answerIDHash', 'answerHash']) || !validHash(answer.answerIDHash)
        || !validHash(answer.answerHash) || seen.has(answer.answerIDHash)) throw new Error();
    seen.add(answer.answerIDHash);
  }
  return state;
}

async function loadState(options) {
  const bytes = await readBytes(options.path, true);
  if (bytes === null) return null;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error();
  return validState(JSON.parse(text), options.taskHash);
}

async function removeOwnedFile(path, identity) {
  const linked = await regularStat(path, true);
  if (linked === null) return;
  if (!sameFile(linked, identity)) throw new Error();
  await unlink(path);
}

async function saveState(options, state) {
  const bytes = Buffer.from(JSON.stringify(state) + '\n', 'utf8');
  if (bytes.length > MAX_STATE_BYTES) throw new Error();
  const temporary = join(options.directory, `${options.taskHash}.${randomBytes(12).toString('hex')}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  const identity = await handle.stat();
  let closed = false;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    closed = true;
    if (!(await readBytes(temporary)).equals(bytes)) throw new Error();
    await safeDirectory(options.directory, false);
    await regularStat(options.path, true);
    await rename(temporary, options.path);
    if (!(await readBytes(options.path, false, true)).equals(bytes)) throw new Error();
    // Windows cannot open directories for fsync. The file itself is synced before and after rename.
    if (process.platform !== 'win32') {
      const directory = await open(options.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } finally {
    if (!closed) await handle.close();
    await removeOwnedFile(temporary, identity);
  }
}

async function withBudgetLock(options, action) {
  await safeDirectory(options.directory);
  // Never remove or retry an existing lock, even when its owner appears stale.
  const lock = await open(options.lockPath, 'wx', 0o600);
  const identity = await lock.stat();
  try {
    await safeDirectory(options.directory, false);
    return await action();
  } finally {
    await lock.close();
    await safeDirectory(options.directory, false);
    await removeOwnedFile(options.lockPath, identity);
  }
}

export async function readCorrectionBudget(value) {
  try {
    const options = taskOptions(value);
    return await withBudgetLock(options, async () => {
      const state = await loadState(options);
      return { status: 'READY', attempts: state?.attempts ?? 0 };
    });
  } catch { return blocked(); }
}

export async function reserveCorrection(value) {
  try {
    if (value.signal?.aborted) return { status: 'CANCELLED', attempts: null };
    const options = taskOptions(value), model = normalizedModel(value.model);
    if (!token(value.answerID) || !validHash(value.answerHash) || model === null) return blocked();
    const modelHash = hash(JSON.stringify(model)), answerIDHash = hash(value.answerID);
    return await withBudgetLock(options, async () => {
      if (value.signal?.aborted) return { status: 'CANCELLED', attempts: null };
      const state = await loadState(options) ?? {
        schema: 1, taskHash: options.taskHash, modelHash, attempts: 0, answers: [],
      };
      if (state.modelHash !== modelHash) return blocked();
      const duplicate = state.answers.find(answer => answer.answerIDHash === answerIDHash);
      if (duplicate) return value.strictDuplicateHash === true && duplicate.answerHash !== value.answerHash
        ? blocked() : { status: 'DUPLICATE', attempts: state.attempts };
      if (state.attempts >= MAX_ATTEMPTS) return { status: 'EXHAUSTED', attempts: state.attempts };
      if (value.signal?.aborted) return { status: 'CANCELLED', attempts: state.attempts };
      state.attempts++;
      state.answers.push({ answerIDHash, answerHash: value.answerHash });
      await saveState(options, state);
      return { status: 'RESERVED', attempts: state.attempts,
        syntheticID: `msg_archiguard_${options.taskHash.slice(0, 32)}_${state.attempts}` };
    });
  } catch { return blocked(); }
}

// Independent of host transcript retention: an active request must survive compaction/reload.
function fenceOptions(value) {
  const base = taskOptions({ ...value, promptID: 'session-fence' });
  const sessionHash = hash(value.sessionID);
  return { ...base, sessionHash, path: join(base.directory, `session_${sessionHash}.json`),
    lockPath: join(base.directory, `session_${sessionHash}.lock`) };
}

async function loadFence(options) {
  const bytes = await readBytes(options.path, true);
  if (bytes === null) return null;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error();
  const state = JSON.parse(text);
  if (!exactKeys(state, ['schema', 'sessionHash', 'promptHash', 'taskHash', 'modelHash'])
      || state.schema !== 1 || state.sessionHash !== options.sessionHash
      || !['sessionHash', 'promptHash', 'taskHash', 'modelHash'].every(key => validHash(state[key]))) throw new Error();
  return state;
}

export async function readCorrectionFence(value) {
  try {
    const options = fenceOptions(value);
    await safeDirectory(options.directory);
    // Writers publish atomically before dispatch. Reads need no exclusive lock;
    // concurrent ordinary host requests must not block one another on an absent fence.
    const state = await loadFence(options);
    if (!state) return { status: 'CLEAR' };
    const model = normalizedModel(value.model);
    return { status: 'ACTIVE', taskHash: state.taskHash,
      promptMatches: token(value.promptID) && hash(value.promptID) === state.promptHash,
      modelMatches: model !== null && hash(JSON.stringify(model)) === state.modelHash };
  } catch { return { status: 'STATE_BLOCKED' }; }
}

export async function setCorrectionFence(value) {
  try {
    const task = taskOptions(value), options = fenceOptions(value), model = normalizedModel(value.model);
    if (model === null) return { status: 'STATE_BLOCKED' };
    return await withBudgetLock(options, async () => {
      const state = { schema: 1, sessionHash: options.sessionHash, promptHash: hash(value.promptID),
        taskHash: task.taskHash, modelHash: hash(JSON.stringify(model)) };
      const existing = await loadFence(options);
      if (existing && (existing.taskHash !== state.taskHash || existing.modelHash !== state.modelHash))
        return { status: 'STATE_BLOCKED' };
      await saveState(options, state);
      return { status: 'ACTIVE' };
    });
  } catch { return { status: 'STATE_BLOCKED' }; }
}

export async function clearCorrectionFence(value) {
  try {
    const options = fenceOptions(value);
    if (!validHash(value.taskHash)) return { status: 'STATE_BLOCKED' };
    return await withBudgetLock(options, async () => {
      const existing = await loadFence(options);
      if (!existing) return { status: 'CLEAR' };
      if (existing.taskHash !== value.taskHash) return { status: 'STATE_BLOCKED' };
      await removeOwnedFile(options.path, await regularStat(options.path));
      if (await regularStat(options.path, true)) throw new Error();
      return { status: 'CLEAR' };
    });
  } catch { return { status: 'STATE_BLOCKED' }; }
}
