import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIGINAL_SHA256 = 'ae4cec19fd74dc97681dcfcfe5a6644cae4a5f5f19396f1424dcd9eada659559';
const ORIGINAL = 'case"run-finished":return this.translateRunFinished(e.result);';
const UPDATED = 'case"run-finished":{const r=this.translateRunFinished(e.result),i=e.snapshot?.lastError;return e.result.status==="aborted"&&typeof i==="string"&&i.startsWith("ARCHI_GUARD:")?[{type:"notice",noticeType:"status",displayRole:"status",message:i,metadata:{archiGuard:true,runStatus:"aborted"}},...r]:r}';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function patchSource(source) {
  if (source.split(UPDATED).length === 2 && !source.includes(ORIGINAL)) return source;
  if (source.split(ORIGINAL).length !== 2 || source.includes(UPDATED))
    throw Error('Cline stop-notice anchor mismatch; no patch applied');
  return source.replace(ORIGINAL, UPDATED);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--extension-root' || args[2] !== '--backup-root'
    || !path.isAbsolute(args[1]) || !path.isAbsolute(args[3]))
    throw Error('Usage: --extension-root <absolute directory> --backup-root <absolute directory>');
  const extensionRoot = path.resolve(args[1]), backupRoot = path.resolve(args[3]);
  const metadata = JSON.parse(await readFile(path.join(extensionRoot, 'package.json'), 'utf8'));
  if (metadata.version !== '4.1.26' || metadata.publisher !== 'saoudrizwan')
    throw Error('Unsupported Cline package; no patch applied');
  const target = path.join(extensionRoot, 'dist', 'extension.js');
  const before = await readFile(target);
  if (hash(before) !== ORIGINAL_SHA256) throw Error('Cline bundle hash changed; inspect before applying');
  const after = Buffer.from(patchSource(before.toString('utf8')));
  await mkdir(backupRoot, { recursive: true });
  const backup = path.join(backupRoot, 'extension-before.js');
  await writeFile(backup, before, { flag: 'wx' });
  if (hash(await readFile(backup)) !== ORIGINAL_SHA256) throw Error('Backup verification failed');
  const manifest = { version: '4.1.26', target, backup, before_sha256: ORIGINAL_SHA256,
    after_sha256: hash(after), created_at: new Date().toISOString() };
  await writeFile(path.join(backupRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const temporary = target + '.archi-stop-notice.tmp';
  await writeFile(temporary, after, { flag: 'wx' });
  if (hash(await readFile(target)) !== ORIGINAL_SHA256) throw Error('Cline changed during patch; target preserved');
  await rename(temporary, target);
  if (hash(await readFile(target)) !== manifest.after_sha256) throw Error('Patched bundle verification failed; backup retained');
  console.log(JSON.stringify({ status: 'PATCHED_VERIFIED_RELOAD_REQUIRED', ...manifest }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
