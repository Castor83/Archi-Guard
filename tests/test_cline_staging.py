"""Only temporary staging targets; no plugin activation or real hooks."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
FILES = ('cline-plugin/index.mjs', 'cline-plugin/tool-plan.mjs', 'global-plugin/runtime.mjs', 'global-plugin/core.mjs',
         'global-plugin/correction.mjs', 'archi_bridge_v2.py', 'archi_belegpruefer_v1_1.py', 'archi_schlusspruefer_v2.py')


class ClineStaging(unittest.TestCase):
    def run_stage(self, destination, root=ROOT):
        return subprocess.run(['pwsh', '-NoProfile', '-File', str(root / 'scripts/Stage-ClinePlugin.ps1'),
                               '-Destination', str(destination)], capture_output=True, timeout=20)

    def test_exact_runtime_files_and_backup_are_readable_without_activation(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / 'staged'
            (target / 'cline-plugin').mkdir(parents=True)
            (target / FILES[0]).write_text('OLD', encoding='utf-8')
            done = self.run_stage(target)
            self.assertEqual(done.returncode, 0, done.stderr.decode(errors='replace'))
            result = json.loads(done.stdout)
            self.assertEqual(result['status'], 'STAGED_NOT_ACTIVE')
            self.assertEqual((Path(result['backup']) / FILES[0]).read_text(), 'OLD')
            for name in FILES:
                self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).digest(),
                                 hashlib.sha256((target / name).read_bytes()).digest())

    def test_automatic_discovery_destination_is_refused(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / '.cline/plugins/guard'
            self.assertNotEqual(self.run_stage(target).returncode, 0)
            self.assertFalse(target.exists())

    def test_midcopy_failure_restores_old_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / 'source'
            for name in (*FILES[:-1], 'scripts/Stage-ClinePlugin.ps1'):
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, root / name)
            target = Path(td) / 'staged'
            (target / 'cline-plugin').mkdir(parents=True)
            (target / FILES[0]).write_text('OLD', encoding='utf-8')
            self.assertNotEqual(self.run_stage(target, root).returncode, 0)
            self.assertEqual((target / FILES[0]).read_text(), 'OLD')
            self.assertFalse((target / FILES[1]).exists())

    def test_directory_collision_is_refused_without_modifying_the_existing_tree(self):
        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / 'staged'
            collision = target / FILES[0]
            collision.mkdir(parents=True)
            before = sorted(str(p.relative_to(target)) for p in target.rglob('*'))
            self.assertNotEqual(self.run_stage(target).returncode, 0)
            self.assertEqual(sorted(str(p.relative_to(target)) for p in target.rglob('*')), before)
