"""Local PreCompact file snapshots. No network, models, chats or trust changes.

Installed as a standalone script under CODEX_HOME/hooks. Sources are opaque
files: the transcript format is not treated as a stable parsing interface.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import uuid

MAX_TRANSCRIPT_BYTES = 128 * 1024 * 1024
MAX_WORKING_BYTES = 4 * 1024 * 1024
MAX_EVENT_BYTES = 65536


def _json_file(path):
    if path.stat().st_size > MAX_WORKING_BYTES:
        raise ValueError('Metadata exceeds limit.')
    return json.loads(path.read_text(encoding='utf-8-sig'))


def _digest(path, size=None):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        remaining = path.stat().st_size if size is None else size
        while remaining:
            chunk = handle.read(min(1024 * 1024, remaining))
            if not chunk:
                raise OSError('Snapshot shorter than expected.')
            result.update(chunk)
            remaining -= len(chunk)
    return result.hexdigest()


def _checkpoint(cwd, session):
    """Reuse a per-origin workspace pointer, never arbitrary file names."""
    pointer = cwd / 'work/handoff' / (session + '-status.json')
    state = _json_file(pointer) if pointer.is_file() else {}
    if not isinstance(state, dict):
        raise ValueError('Workspace pointer must be an object.')
    if state and state.get('originThreadId') != session:
        raise ValueError('Workspace pointer belongs to another session.')
    root = cwd
    value = state.get('repositoryPath')
    if value:
        candidate = Path(value)
        if not candidate.is_absolute() or not _local(candidate):
            raise ValueError('Checkpoint repository must be local and absolute.')
        candidate = candidate.resolve(strict=True)
        if not candidate.is_dir() or candidate == Path(candidate.anchor) or not _local(candidate):
            raise ValueError('Invalid checkpoint repository.')
        root = candidate
    return root, state, pointer


def _verified(manifest):
    if manifest.get('status') != 'PASS':
        return False
    directory = Path(manifest['snapshot_path'])
    for key, name in [('transcript', 'transcript.jsonl'), ('working_state', 'working.md'),
                      ('handoff_report', 'handoff.md'), ('handoff_status', 'status.json')]:
        entry = manifest.get(key)
        if entry is None:
            continue
        if (entry.get('status') != 'COPIED' or entry.get('file') != name
                or (directory / name).stat().st_size != entry['bytes']
                or _digest(directory / name) != entry['sha256']):
            return False
    return all(key in manifest for key in ('transcript', 'working_state'))


def _atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    with temporary.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _local(path):
    """Refuse explicit UNC paths; this is not an OS network sandbox."""
    value = str(path)
    if value.startswith('\\\\?\\'):
        return bool(re.match(r'^[A-Za-z]:[\\/]', value[4:]))
    return not value.startswith(('\\\\', '//'))


def _copy_prefix(source, destination, allowed_roots, limit):
    if not source.is_absolute() or not _local(source):
        raise ValueError('Source must be an absolute local path.')
    resolved = source.resolve(strict=True)
    if not _local(resolved) or not any(resolved.is_relative_to(root) for root in allowed_roots):
        raise ValueError('Resolved source is outside its allowed area.')
    if not resolved.is_file():
        raise ValueError('Source is not a regular file.')
    digest = hashlib.sha256()
    with resolved.open('rb') as original:
        size = os.fstat(original.fileno()).st_size
        if size > limit:
            raise ValueError('Source exceeds the byte limit; no truncated backup.')
        with destination.open('xb') as copied:
            remaining = size
            while remaining:
                chunk = original.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise OSError('Source became shorter during backup.')
                copied.write(chunk)
                digest.update(chunk)
                remaining -= len(chunk)
            copied.flush()
            os.fsync(copied.fileno())
        size_after = os.fstat(original.fileno()).st_size
        if size_after < size:
            raise OSError('Source became shorter during backup.')
    return dict(status='COPIED', source=str(resolved), file=destination.name,
                bytes=size, sha256=digest.hexdigest(), source_bytes_after_read=size_after,
                scope='Exact prefix available at file open; later appends are not part of this snapshot.')


def capture_snapshot(event, *, codex_home=None):
    """Return a durable manifest for a main-session PreCompact event."""
    if not isinstance(event, dict):
        return dict(status='ERROR', error='Invalid event object.')
    if (event.get('hook_event_name') != 'PreCompact'
            or event.get('trigger') not in {'auto', 'manual'} or event.get('subagent_id')):
        return dict(status='SKIPPED')
    directory = None
    try:
        session = event.get('session_id')
        if not isinstance(session, str) or str(uuid.UUID(session)) != session:
            raise ValueError('Canonical session ID required.')
        cwd_value = event.get('cwd')
        if not isinstance(cwd_value, str) or not Path(cwd_value).is_absolute() or not _local(cwd_value):
            raise ValueError('Absolute local working directory required.')
        cwd = Path(cwd_value).resolve(strict=True)
        if not _local(cwd) or not cwd.is_dir():
            raise ValueError('Working directory is not a directory.')
        home = Path(codex_home if codex_home is not None else
                    os.environ.get('CODEX_HOME', str(Path.home() / '.codex')))
        if not home.is_absolute() or not _local(home):
            raise ValueError('Absolute local CODEX_HOME required.')
        home = home.resolve(strict=True)
        if not _local(home):
            raise ValueError('Resolved CODEX_HOME must be local.')
        storage = home / 'handoff-snapshots'
        parent = storage / session
        if not parent.resolve().is_relative_to(home):
            raise ValueError('Resolved backup area escapes CODEX_HOME.')
        parent.mkdir(parents=True, exist_ok=True)
        checkpoint_root, checkpoint_status, pointer = _checkpoint(cwd, session)
        note = checkpoint_root / 'work/handoff' / (session + '-working.md')
        if event.get('turn_id') and (parent / 'latest.json').is_file():
            try:
                cached = _json_file(parent / 'latest.json')
                old_dir = Path(cached['snapshot_path']).resolve(strict=True)
                if (old_dir.is_relative_to(parent.resolve()) and cached.get('turn_id') == event['turn_id']
                        and cached.get('trigger') == event['trigger'] and _verified(cached)
                        and str(note.resolve(strict=True)) == cached['working_state']['source']
                        and _digest(note) == cached['working_state']['sha256']
                        and str(Path(event['transcript_path']).resolve(strict=True)) == cached['transcript']['source']
                        and _digest(Path(event['transcript_path']), cached['transcript']['bytes']) == cached['transcript']['sha256']
                        and checkpoint_status.get('successorThreadId') == cached.get('successor_thread_id')):
                    optional = [('handoff_report', checkpoint_root / 'work/handoff' / (session + '-handoff.md')),
                                ('handoff_status', pointer)]
                    if all((not source.is_file() and key not in cached) or
                           (source.is_file() and key in cached and _digest(source) == cached[key]['sha256'])
                           for key, source in optional):
                        return cached
            except (OSError, ValueError, KeyError, TypeError):
                pass
        name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '-' + uuid.uuid4().hex[:8]
        directory = parent / name
        directory.mkdir(exist_ok=False)
        manifest = dict(schema_version=1, session_id=session, cwd=str(cwd), trigger=event['trigger'],
                        turn_id=event.get('turn_id'),
                        started_at_utc=datetime.now(timezone.utc).isoformat(),
                        status='ERROR', snapshot_path=str(directory),
                        model_called=False, network_requested=False, chat_created=False,
                        automatic_chat_creation_supported=False,
                        successor_thread_id=checkpoint_status.get('successorThreadId'))
        transcript_value = event.get('transcript_path')
        try:
            if not isinstance(transcript_value, str) or not transcript_value:
                raise ValueError('Host did not provide a local transcript path.')
            allowed = [(home / part).resolve() for part in ('sessions', 'archived_sessions')]
            # A redirected sessions directory must not escape CODEX_HOME.
            if any(not path.is_relative_to(home) for path in allowed):
                raise ValueError('History directory escapes CODEX_HOME.')
            manifest['transcript'] = _copy_prefix(Path(transcript_value), directory / 'transcript.jsonl',
                                                   allowed, MAX_TRANSCRIPT_BYTES)
        except (OSError, ValueError) as exc:
            manifest['transcript'] = dict(status='ERROR', error=str(exc))
        try:
            manifest['working_state'] = _copy_prefix(note, directory / 'working.md', [checkpoint_root], MAX_WORKING_BYTES)
        except FileNotFoundError:
            manifest['working_state'] = dict(status='MISSING', source=str(note))
        except (OSError, ValueError) as exc:
            manifest['working_state'] = dict(status='ERROR', error=str(exc))
        manifest['status'] = ('ERROR' if manifest['transcript']['status'] != 'COPIED' else
                              'PASS' if manifest['working_state']['status'] == 'COPIED' else 'PARTIAL')
        for key, source, name, allowed in [
            ('handoff_report', checkpoint_root / 'work/handoff' / (session + '-handoff.md'), 'handoff.md', checkpoint_root),
            ('handoff_status', pointer, 'status.json', cwd),
        ]:
            if source.is_file():
                manifest[key] = _copy_prefix(source, directory / name, [allowed], MAX_WORKING_BYTES)
        resume = ('VOR Komprimierung lokal gesichert. Keine weitere Modellarbeit im alten Durchlauf.\n'
                  'Vorhandenen Nachfolger aus status.json wiederverwenden; keinen zweiten Chat anlegen.\n'
                  'Ohne Nachfolger: genau einen lokalen Chat manuell anlegen und gesicherten '
                  'handoff.md bzw. working.md als Restauftrag verwenden.\n'
                  'Erst nach erfolgreicher Uebernahme alten Chat archivieren. Keine neuen Tests/Modelle nur fuer Uebergabe.\n')
        with (directory / 'resume.md').open('x', encoding='utf-8') as handle:
            handle.write(resume)
            handle.flush()
            os.fsync(handle.fileno())
        manifest['completed_at_utc'] = datetime.now(timezone.utc).isoformat()
        if manifest['status'] == 'PASS':
            try:
                confirmed = _verified(manifest)
            except (OSError, ValueError, KeyError, TypeError):
                confirmed = False
            if not confirmed:
                manifest['status'] = 'ERROR'
                manifest['error'] = 'Read-back verification failed.'
        # Publish a receipt only after its copied bytes have been checked.
        # Interruption before this point must not leave an unverified PASS.
        with (directory / 'manifest.json').open('x', encoding='utf-8', newline='\n') as handle:
            json.dump(manifest, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        if manifest['status'] == 'PASS':
            _atomic_json(parent / 'latest.json', manifest)
        return manifest
    except (OSError, ValueError, TypeError) as exc:
        return dict(status='ERROR', error=str(exc), snapshot_path=str(directory) if directory else None)


def main():
    try:
        raw = sys.stdin.buffer.read(MAX_EVENT_BYTES + 1)
        if len(raw) > MAX_EVENT_BYTES:
            raise ValueError('Oversized hook event.')
        result = capture_snapshot(json.loads(raw.decode('utf-8')))
        if result['status'] == 'SKIPPED':
            output = {}
        else:
            reason = ('Lokale Sicherung bestaetigt. ' if result['status'] == 'PASS' else 'Lokale Sicherung NICHT bestaetigt. ')
            reason += ('Komprimierung und weitere Modellarbeit vor Komprimierung gestoppt. '
                       'Uebergabe/Resume-Dateien: ' + str(result.get('snapshot_path') or 'kein Sicherungsordner') +
                       '. Vorhandenen Nachfolger wiederverwenden; alten Chat erst nach erfolgreicher Uebernahme archivieren.')
            output = {'continue': False, 'stopReason': reason, 'systemMessage': reason}
    except (OSError, ValueError, TypeError, UnicodeError):
        output = {'continue': False, 'stopReason': 'Sicherung NICHT bestaetigt; Komprimierung vorsorglich gestoppt.',
                  'systemMessage': 'PreCompact-Daten ungueltig. Keinen Nachfolger doppelt anlegen und alten Chat nicht archivieren.'}
    print(json.dumps(output, ensure_ascii=True))


if __name__ == '__main__':
    main()
