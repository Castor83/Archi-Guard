"""Offline regressions for the public source review; no host or model starts."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class ReviewRegressions(unittest.TestCase):
    def test_v1_refuses_output_symlink_without_changing_its_target(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / 'input.jsonl'
            source.write_text('{}\n', encoding='utf-8')
            target = root / 'private.txt'
            target.write_text('UNCHANGED', encoding='utf-8')
            link = root / 'output.jsonl'
            link.symlink_to(target)
            done = subprocess.run([sys.executable, '-B', str(ROOT / 'archi_belegpruefer_v1_1.py'),
                                   '--root', td, '--input', str(source), '--output', str(link)],
                                  capture_output=True, timeout=10)
            self.assertEqual(target.read_text(encoding='utf-8'), 'UNCHANGED')
            self.assertEqual(done.returncode, 2)

    def test_utf8_noncompact_event_is_not_blocked_by_windows_locale(self):
        script = ROOT / 'maintenance/codex-hooks/first-compaction-handoff.py'
        done = subprocess.run([sys.executable, '-B', '-X', 'utf8=0', str(script)],
                              input=json.dumps({'hook_event_name': 'SessionStart',
                                                'source': 'startup', 'cwd': 'C:/Árbeit'},
                                               ensure_ascii=False).encode('utf-8'),
                              env={**os.environ, 'PYTHONIOENCODING': 'cp1252'},
                              capture_output=True, timeout=10)
        self.assertEqual(done.returncode, 0)
        self.assertEqual(json.loads(done.stdout), {})

    def test_interrupted_readback_leaves_no_pass_manifest(self):
        script = ROOT / 'maintenance/codex-hooks/pre-compaction-snapshot.py'
        spec = importlib.util.spec_from_file_location('snapshot_review', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            home = root / 'codex'
            cwd = root / 'project'
            (home / 'sessions').mkdir(parents=True)
            (cwd / 'work/handoff').mkdir(parents=True)
            sid = '01a17768-341b-7c71-94be-70a5967cdc6e'
            transcript = home / 'sessions/local.jsonl'
            transcript.write_text('{}\n', encoding='utf-8')
            (cwd / 'work/handoff' / (sid + '-working.md')).write_text('Local fixture', encoding='utf-8')
            event = dict(session_id=sid, turn_id='review-test', cwd=str(cwd),
                         transcript_path=str(transcript), hook_event_name='PreCompact', trigger='auto')
            with patch.object(module, '_verified', side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):
                    module.capture_snapshot(event, codex_home=home)
            for file in (home / 'handoff-snapshots').rglob('manifest.json'):
                self.assertNotEqual(json.loads(file.read_text(encoding='utf-8'))['status'], 'PASS')

    def test_git_bash_launcher_uses_localappdata_with_spaces_and_preserves_arguments(self):
        git_bash = Path(r'C:\Program Files\Git\bin\bash.exe')
        bash = str(git_bash) if git_bash.is_file() else shutil.which('bash')
        with tempfile.TemporaryDirectory(prefix='archi launcher ') as td:
            target = Path(td) / 'Programs/@opencodedesktop/resources/opencode-cli.exe'
            target.parent.mkdir(parents=True)
            target.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n', encoding='utf-8', newline='\n')
            done = subprocess.run([bash, (ROOT / 'scripts/launchers/opencode').as_posix(), 'one argument', '--version'],
                                  env={**os.environ, 'LOCALAPPDATA': td.replace('\\', '/')},
                                  capture_output=True, timeout=10)
            self.assertEqual(done.returncode, 0, done.stderr.decode('utf-8', errors='replace'))
            self.assertEqual(done.stdout.decode().splitlines(), ['one argument', '--version'])

    def test_sanitized_integration_test_uses_configured_python(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            shutil.copytree(ROOT / 'global-plugin', root / 'global-plugin')
            for name in ('archi_belegpruefer_v1_1.py', 'archi_schlusspruefer_v2.py', 'archi_bridge_v2.py'):
                shutil.copyfile(ROOT / name, root / name)
            (root / 'tests').mkdir()
            testfile = root / 'tests/plugin-integration.test.mjs'
            text = (ROOT / 'tests/plugin-integration.test.mjs').read_text(encoding='utf-8')
            testfile.write_text(text.replace(Path.home().name, 'USER'), encoding='utf-8')
            done = subprocess.run(['node', '--test', '--test-name-pattern=^Abschluss prueft reale Quelle', str(testfile)],
                                  env={**os.environ, 'ARCHI_GUARD_PYTHON': sys.executable},
                                  capture_output=True, timeout=20)
            self.assertEqual(done.returncode, 0, done.stdout.decode('utf-8', errors='replace')[-3000:])


if __name__ == '__main__':
    unittest.main()
