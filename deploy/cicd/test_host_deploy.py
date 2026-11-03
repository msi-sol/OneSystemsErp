"""Safety tests: no network calls, production paths, service changes, or database writes."""
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

if sys.platform == 'win32':
    sys.modules.setdefault('fcntl', types.SimpleNamespace())
spec = importlib.util.spec_from_file_location('host_deploy', Path(__file__).with_name('host-deploy.py'))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


def archive_with(extra=()):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as archive:
        for name in ['package.json', '.next/BUILD_ID', 'prisma/schema.prisma',
                     'deployment-manifest.json', 'apps/aws-backend/src/index.ts']:
            member = tarfile.TarInfo(name)
            member.size = 2
            archive.addfile(member, io.BytesIO(b'{}'))
        for member in extra:
            archive.addfile(member)
    stream.seek(0)
    return tarfile.open(fileobj=stream, mode='r')


class ArtifactSafety(unittest.TestCase):
    def test_expected_artifact_and_internal_node_link_are_accepted(self):
        link = tarfile.TarInfo('node_modules/.bin/next')
        link.type = tarfile.SYMTYPE
        link.linkname = '../next/dist/bin/next'
        with archive_with([link]) as archive:
            host.validate_archive(archive)

    def test_rejects_unsafe_members(self):
        for name in ['../../etc/passwd', '/etc/passwd', '.env', 'src/.env.local',
                     'public/uploads/client.pdf', '.next/cache/state', '.git/config']:
            with self.subTest(name=name), archive_with([tarfile.TarInfo(name)]) as archive:
                with self.assertRaises(host.DeployError):
                    host.validate_archive(archive)

    def test_rejects_escaping_symlink_and_special_file(self):
        for kind, target in [(tarfile.SYMTYPE, '../../etc/passwd'),
                             (tarfile.LNKTYPE, 'package.json'), (tarfile.CHRTYPE, '')]:
            member = tarfile.TarInfo('node_modules/evil')
            member.type, member.linkname = kind, target
            with archive_with([member]) as archive, self.assertRaises(host.DeployError):
                host.validate_archive(archive)

    def test_only_exact_run_artifact_is_allowed(self):
        revision, checksum, run = 'a' * 40, 'b' * 64, '12345-1'
        host.validate_arguments(f'onesystemserp/releases/{revision}-{run}.tar.gz', checksum, revision, run)
        for bad in ['other-project/file.tar.gz', '../release.tar.gz', 'onesystemserp/releases/anything']:
            with self.subTest(key=bad), self.assertRaises(host.DeployError):
                host.validate_arguments(bad, checksum, revision, run)
        with self.assertRaises(host.DeployError):
            host.validate_arguments('', checksum, revision, '1;id')

    def test_failed_first_activation_restores_original_units(self):
        # Inject paths and symlink operations, so this also runs on Windows without admin privileges.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, state = root / 'base', root / 'state'
            base.mkdir()
            state.mkdir()
            overrides = {u: root / u / 'override.conf' for u in host.UNITS}
            overrides[host.UNITS[0]].parent.mkdir()
            overrides[host.UNITS[0]].write_text('original custom settings')
            calls = []
            with patch.object(host, 'BASE', base), patch.object(host, 'STATE', state), \
                 patch.object(host, 'LEGACY', root / 'absent-legacy'), patch.object(host, 'OVERRIDES', overrides), \
                 patch.object(host, 'set_current'), patch.object(host, 'command', side_effect=lambda args: calls.append(args)), \
                 patch.object(host, 'healthy', side_effect=[False, True]):
                with self.assertRaisesRegex(host.DeployError, 'previous production release was restored'):
                    host.activate(base / 'candidate')
            self.assertEqual(overrides[host.UNITS[0]].read_text(), 'original custom settings')
            self.assertFalse(overrides[host.UNITS[1]].exists())
            self.assertIn(['systemctl', 'restart'] + list(host.UNITS), calls)
            self.assertFalse((state / 'shared-data-initialized').exists())

    def test_disk_rotation_preserves_current_and_unrelated_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            parent = base / 'releases'
            parent.mkdir()
            current = parent / ('a' * 40 + '-1-1')
            previous = parent / ('b' * 40 + '-2-1')
            unrelated = parent / 'unrelated-data'
            for path in (current, previous, unrelated):
                path.mkdir()
            def disk(_):
                return types.SimpleNamespace(free=100 if previous.exists() else 300)
            with patch.object(host, 'BASE', base), patch.object(host.shutil, 'disk_usage', side_effect=disk):
                host.reserve_release_space(200, current)
            self.assertTrue(current.exists())
            self.assertTrue(unrelated.exists())
            self.assertFalse(previous.exists())


if __name__ == '__main__':
    unittest.main()
