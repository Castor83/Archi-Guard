"""No model calls: execute the synchronous hook against temporary local files."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'maintenance' / 'codex-hooks'


class PreCompactTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.home = self.root / 'codex'
        self.cwd = self.root / 'workspace'
        self.cwd.mkdir()
        (self.home / 'sessions').mkdir(parents=True)
        self.transcript = self.home / 'sessions' / 'session.jsonl'
        self.transcript.write_text('{"type":"local-test"}\n', encoding='utf-8')
        self.sid = '00000000-0000-4000-8000-000000000001'
        self.event = dict(hook_event_name='PreCompact', session_id=self.sid,
                          turn_id='turn-local-test', cwd=str(self.cwd),
                          transcript_path=str(self.transcript), trigger='auto')
        self.note_dir = self.cwd / 'work' / 'handoff'
        self.note_dir.mkdir(parents=True)
        self.note = self.note_dir / (self.sid + '-working.md')
        self.note.write_text('Gueltiger Arbeitsstand; keine neue Inferenz.\n', encoding='utf-8')

    def run_hook(self, event=None, script='pre-compaction-snapshot.py'):
        done = subprocess.run([sys.executable, '-B', str(SCRIPTS / script)],
            input=json.dumps(self.event if event is None else event),
            text=True, encoding='utf-8', capture_output=True, timeout=5,
            env={**os.environ, 'CODEX_HOME': str(self.home)})
        self.assertEqual(done.returncode, 0, done.stderr)
        return json.loads(done.stdout)

    def manifests(self):
        return list((self.home / 'handoff-snapshots').glob(self.sid + '/*/manifest.json'))

    def test_confirmed_snapshot_stops_before_compaction(self):
        output = self.run_hook()
        self.assertIs(output.get('continue'), False)
        self.assertIn('bestaetigt', output['stopReason'])
        manifest_path = self.manifests()[0]
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        self.assertEqual(manifest['status'], 'PASS')
        self.assertFalse(manifest['model_called'])
        self.assertFalse(manifest['chat_created'])
        self.assertTrue((manifest_path.parent / 'resume.md').is_file())
        for key in ['transcript', 'working_state']:
            entry = manifest[key]
            copied = (manifest_path.parent / entry['file']).read_bytes()
            self.assertEqual(hashlib.sha256(copied).hexdigest(), entry['sha256'])

    def test_reuses_valid_incremental_state_via_existing_workspace_pointer(self):
        self.note.unlink()
        repo = self.root / 'actual-repo'
        target = repo / 'work' / 'handoff'
        target.mkdir(parents=True)
        (target / self.note.name).write_text('Aktueller Repo-Checkpoint', encoding='utf-8')
        (target / (self.sid + '-handoff.md')).write_text('Vollstaendiger freigegebener Restauftrag', encoding='utf-8')
        (self.note_dir / (self.sid + '-status.json')).write_text(json.dumps({
            'originThreadId': self.sid, 'repositoryPath': str(repo), 'successorThreadId': None}), encoding='utf-8')
        output = self.run_hook()
        self.assertIn('bestaetigt', output['stopReason'])
        manifest_path = self.manifests()[0]
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        self.assertEqual(manifest['status'], 'PASS')
        self.assertEqual((manifest_path.parent / 'working.md').read_text(encoding='utf-8'), 'Aktueller Repo-Checkpoint')
        self.assertTrue((manifest_path.parent / 'handoff.md').is_file())

    def test_repeated_same_turn_reuses_verified_receipt(self):
        self.run_hook()
        self.run_hook()
        self.assertEqual(len(self.manifests()), 1)

    def test_changed_working_checkpoint_is_saved_again(self):
        self.run_hook()
        self.note.write_text('Neuer freigegebener Arbeitsstand', encoding='utf-8')
        self.run_hook()
        self.assertEqual(len(self.manifests()), 2)

    def test_corrupted_backup_is_not_reported_as_verified(self):
        self.run_hook()
        previous = self.manifests()[0]
        (previous.parent / 'working.md').write_text('Beschaedigt', encoding='utf-8')
        self.run_hook()
        self.assertEqual(len(self.manifests()), 2)

    def test_missing_checkpoint_stops_without_claiming_success(self):
        self.note.unlink()
        output = self.run_hook()
        self.assertIs(output.get('continue'), False)
        self.assertIn('NICHT bestaetigt', output['stopReason'])

    def test_external_transcript_is_not_accepted(self):
        self.event['transcript_path'] = str(self.root / 'outside.jsonl')
        output = self.run_hook()
        self.assertIs(output.get('continue'), False)
        self.assertIn('NICHT bestaetigt', output['stopReason'])

    def test_subagent_is_exempt(self):
        self.event['subagent_id'] = 'child-test'
        self.assertEqual(self.run_hook(), {})
        self.assertEqual(self.manifests(), [])

    def test_known_successor_is_preserved_without_creating_a_chat(self):
        successor = '00000000-0000-4000-8000-000000000002'
        (self.note_dir / (self.sid + '-status.json')).write_text(json.dumps({
            'originThreadId': self.sid, 'repositoryPath': str(self.cwd),
            'successorThreadId': successor}), encoding='utf-8')
        self.run_hook()
        manifest = json.loads(self.manifests()[0].read_text(encoding='utf-8'))
        self.assertEqual(manifest['successor_thread_id'], successor)
        self.assertFalse(manifest['chat_created'])
        self.assertFalse(manifest['automatic_chat_creation_supported'])

    def test_post_compaction_fallback_stops_without_extra_model_context(self):
        event = dict(hook_event_name='SessionStart', source='compact', session_id=self.sid)
        output = self.run_hook(event, 'first-compaction-handoff.py')
        self.assertIs(output.get('continue'), False)
        self.assertNotIn('hookSpecificOutput', output)

    def test_invalid_pointer_stops_without_crashing_the_hook(self):
        (self.note_dir / (self.sid + '-status.json')).write_text('[1,2]', encoding='utf-8')
        output = self.run_hook()
        self.assertIs(output.get('continue'), False)
        self.assertIn('NICHT bestaetigt', output['stopReason'])

    def test_failed_readback_never_leaves_a_pass_manifest(self):
        spec = importlib.util.spec_from_file_location('snapshot_test', SCRIPTS / 'pre-compaction-snapshot.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.object(module, '_verified', return_value=False):
            result = module.capture_snapshot(self.event, codex_home=self.home)
        self.assertEqual(result['status'], 'ERROR')
        saved = json.loads(self.manifests()[0].read_text(encoding='utf-8'))
        self.assertEqual(saved['status'], 'ERROR')


if __name__ == '__main__':
    unittest.main()
