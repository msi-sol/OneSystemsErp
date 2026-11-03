#!/usr/bin/python3
"""Fixed SSM entrypoint. Installs artifacts; never executes repository code as root."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

BASE = Path('/opt/onesystemserp')
STATE = Path('/var/lib/onesystemserp')
CONFIG = Path('/etc/onesystemserp')
LEGACY = Path('/home/ubuntu/onesystemserp')
USER = 'onesystemserp'
UNITS = ('onesystemserp-backend.service', 'onesystemserp.service')
BUCKET = 'onesystemserp-deploy-173677044880-us-east-1'
INSTANCE = 'i-05dbf6853ca3ecb33'
OVERRIDES = {u: Path('/etc/systemd/system') / (u + '.d') / '90-github-deployment.conf' for u in UNITS}


class DeployError(Exception):
    pass


def command(args, *, cwd=None, timeout=90):
    result = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, timeout=timeout)
    if result.returncode:
        diagnostic = STATE / 'last-command-error.log'
        with diagnostic.open('w', opener=lambda path, flags: os.open(path, flags, 0o600)) as stream:
            stream.write(result.stdout)
        diagnostic.chmod(0o600)
        # Do not propagate command arguments, application output, or secrets to SSM logs.
        raise DeployError('A deployment system command failed; inspect the private host logs')
    return result.stdout.strip()


def validate_arguments(key, checksum, revision, run_id):
    if not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise DeployError('Invalid revision')
    if not re.fullmatch(r'[a-f0-9]{64}', checksum):
        raise DeployError('Invalid SHA-256')
    if not re.fullmatch(r'[0-9]{1,20}-[0-9]{1,4}', run_id):
        raise DeployError('Invalid GitHub run identifier')
    if key != f'onesystemserp/releases/{revision}-{run_id}.tar.gz':
        raise DeployError('Invalid artifact key')


def validate_archive(archive):
    """Reject traversal, links outside the release, credentials and special files."""
    seen = set()
    allowed = {'node_modules', '.next', 'public', 'apps', 'src', 'artifacts', 'prisma',
               'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json',
               'next-env.d.ts', 'deployment-manifest.json'}
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        parts = tuple(p for p in path.parts if p != '.')
        if not parts:  # tar's root directory
            if member.isdir():
                continue
            raise DeployError('Invalid archive root')
        if path.is_absolute() or '..' in parts or parts[0] not in allowed:
            raise DeployError('Unsafe or unexpected artifact path')
        if any(p == '.git' or p == '.env' or p.startswith('.env.') for p in parts):
            raise DeployError('Credentials and Git metadata are forbidden in artifacts')
        if parts[:2] in (('public', 'uploads'), ('.next', 'cache')):
            raise DeployError('Persistent data and build caches are forbidden in artifacts')
        normalized = '/'.join(parts)
        if normalized in seen:
            raise DeployError('Duplicate artifact entry')
        seen.add(normalized)
        if not (member.isfile() or member.isdir() or member.issym()):
            raise DeployError('Special files and hard links are forbidden in artifacts')
        if member.issym():
            target = PurePosixPath(member.linkname)
            if target.is_absolute():
                raise DeployError('Absolute artifact symlink')
            depth = len(parts) - 1
            for part in target.parts:
                depth += -1 if part == '..' else (0 if part == '.' else 1)
                if depth < 0:
                    raise DeployError('Artifact symlink escapes release')
    required = {'package.json', '.next/BUILD_ID', 'prisma/schema.prisma',
                'deployment-manifest.json', 'apps/aws-backend/src/index.ts'}
    if not required.issubset(seen):
        raise DeployError('Incomplete production artifact')


def atomic_text(path, text, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(text)
    temp.chmod(mode)
    os.replace(temp, path)


def reserve_release_space(required, current):
    # The running release is the rollback target for the incoming deployment.
    # Retire older generated releases when the small shared disk needs space.
    parent = BASE / 'releases'
    retired = sorted((p for p in parent.iterdir()
                      if p != current and not p.is_symlink() and p.is_dir()
                      and re.fullmatch(r'[a-f0-9]{40}-[0-9]{1,20}-[0-9]{1,4}', p.name)),
                     key=lambda p: p.stat().st_mtime)
    for old in retired:
        if shutil.disk_usage(BASE).free >= required:
            break
        shutil.rmtree(old)
    if shutil.disk_usage(BASE).free < required:
        raise DeployError('Insufficient disk space to stage a release with rollback safety')


def set_current(release):
    link = BASE / 'current.tmp'
    if link.is_symlink():
        link.unlink()
    link.symlink_to(release)
    os.replace(link, BASE / 'current')


def healthy(front=3000, back=4000, attempts=45):
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{back}/health', timeout=3) as r:
                if r.status != 200 or json.load(r).get('status') not in ('ok', 'healthy'):
                    raise ValueError('backend health')
            with urllib.request.urlopen(f'http://127.0.0.1:{front}/login', timeout=5) as r:
                if r.status != 200 or b'<form' not in r.read():
                    raise ValueError('frontend login')
            return True
        except Exception:
            time.sleep(2)
    return False


def systemd_properties():
    return ['--property=User=' + USER, '--property=Group=' + USER,
            '--property=EnvironmentFile=' + str(CONFIG / 'production.env'),
            '--property=NoNewPrivileges=yes', '--property=PrivateTmp=yes',
            '--property=ProtectHome=yes', '--property=ProtectSystem=strict',
            '--property=ReadWritePaths=' + str(STATE),
            '--property=UMask=0077']


def candidate(release, run_id):
    names = [f'onesystemserp-preview-backend-{run_id}', f'onesystemserp-preview-frontend-{run_id}']
    try:
        common = ['systemd-run', '--quiet', '--collect'] + systemd_properties() + [
            '--working-directory=' + str(release),
            '--property=ReadWritePaths=' + str(release / '.next/cache')]
        command(common + ['--unit=' + names[0], '--setenv=ERP_BACKEND_STANDALONE=true',
                         '--setenv=ERP_BACKEND_PORT=14000', '/usr/bin/node', '--import', 'tsx',
                         str(release / 'apps/aws-backend/src/index.ts')])
        command(common + ['--unit=' + names[1], '--setenv=BACKEND_INTERNAL_URL=http://127.0.0.1:14000',
                         '--setenv=AWS_BACKEND_URL=http://127.0.0.1:14000', '/usr/bin/node',
                         str(release / 'node_modules/next/dist/bin/next'), 'start',
                         '--hostname', '127.0.0.1', '--port', '13000'])
        if not healthy(13000, 14000):
            raise DeployError('Candidate health check failed; production was left running')
    finally:
        subprocess.run(['systemctl', 'stop'] + names, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def unit_override(unit):
    backend = unit == UNITS[0]
    execute = ('/usr/bin/node --import tsx ' + str(BASE / 'current/apps/aws-backend/src/index.ts')) if backend else (
        '/usr/bin/node ' + str(BASE / 'current/node_modules/next/dist/bin/next') +
        ' start --hostname 127.0.0.1 --port 3000')
    return '\n'.join(['[Service]', 'User=' + USER, 'Group=' + USER,
                      'WorkingDirectory=' + str(BASE / 'current'), 'EnvironmentFile=',
                      'EnvironmentFile=' + str(CONFIG / 'production.env'), 'ExecStart=', 'ExecStart=' + execute,
                      'NoNewPrivileges=true', 'PrivateTmp=true', 'ProtectHome=true', 'ProtectSystem=strict',
                      'ReadWritePaths=' + str(STATE) + ' ' + str(BASE / 'current/.next/cache'), ''])


def activate(release):
    previous = (BASE / 'current').resolve() if (BASE / 'current').is_symlink() else None
    old_overrides = {u: p.read_bytes() if p.exists() else None for u, p in OVERRIDES.items()}
    original = not (STATE / 'shared-data-initialized').exists()
    try:
        command(['systemctl', 'stop'] + list(reversed(UNITS)))
        if original:
            for source, target in [(LEGACY / 'public/uploads', STATE / 'public-uploads'),
                                   (LEGACY / 'uploads', STATE / 'backend-uploads')]:
                if source.exists():
                    command(['rsync', '-a', '--chown=' + USER + ':' + USER, str(source) + '/', str(target) + '/'])
        set_current(release)
        for unit, path in OVERRIDES.items():
            atomic_text(path, unit_override(unit), 0o644)
        command(['systemctl', 'daemon-reload'])
        command(['systemctl', 'start'] + list(UNITS))
        if not healthy():
            raise DeployError('Production health checks failed')
    except Exception:
        if previous:
            set_current(previous)
        elif (BASE / 'current').is_symlink():
            (BASE / 'current').unlink()
        for unit, path in OVERRIDES.items():
            if old_overrides[unit] is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(old_overrides[unit])
        command(['systemctl', 'daemon-reload'])
        command(['systemctl', 'restart'] + list(UNITS))
        if not healthy():
            raise DeployError('Deployment and automatic rollback health checks failed; operator attention required')
        raise DeployError('Deployment failed; previous production release was restored and checked')
    if original:
        atomic_text(STATE / 'shared-data-initialized', 'Shared ERP uploads initialized from legacy deployment\n')
    return previous


def deploy(args):
    import boto3
    validate_arguments(args.artifact_key, args.sha256, args.revision, args.run_id)
    if os.geteuid() != 0:
        raise DeployError('Use the installed SSM command document')
    config = json.loads((CONFIG / 'deploy.json').read_text())
    if config.get('instance_id') != INSTANCE or config.get('bucket') != BUCKET:
        raise DeployError('Unexpected deployment target configuration')
    # Verify actual EC2 identity without retrieving or logging instance credentials.
    request = urllib.request.Request('http://169.254.169.254/latest/api/token', method='PUT',
                                     headers={'X-aws-ec2-metadata-token-ttl-seconds': '60'})
    with urllib.request.urlopen(request, timeout=3) as response:
        token = response.read().decode()
    request = urllib.request.Request('http://169.254.169.254/latest/meta-data/instance-id',
                                     headers={'X-aws-ec2-metadata-token': token})
    with urllib.request.urlopen(request, timeout=3) as response:
        if response.read().decode() != INSTANCE:
            raise DeployError('This is not the authorized production instance')
    with (STATE / 'deploy.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DeployError('Another production deployment is still running')
        release = BASE / 'releases' / (args.revision + '-' + args.run_id)
        if release.exists():
            current = (BASE / 'current').resolve() if (BASE / 'current').is_symlink() else None
            if current == release and healthy():
                print('This GitHub run is already deployed and healthy')
                return
            raise DeployError('Release directory already exists; rerun with a new GitHub attempt')
        s3 = boto3.client('s3', region_name='us-east-1')
        size = s3.head_object(Bucket=BUCKET, Key=args.artifact_key)['ContentLength']
        if size > 1_500_000_000:
            raise DeployError('Deployment artifact exceeds the 1.5GB transfer limit')
        with tempfile.TemporaryDirectory(prefix='incoming-', dir=STATE) as incoming:
            archive_path = Path(incoming) / 'release.tar.gz'
            print('Downloading verified production artifact', args.revision, flush=True)
            s3.download_file(BUCKET, args.artifact_key, str(archive_path))
            with archive_path.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            if digest != args.sha256:
                raise DeployError('Artifact SHA-256 verification failed')
            with tarfile.open(archive_path, 'r:gz') as archive:
                validate_archive(archive)
                expanded = sum(m.size for m in archive.getmembers())
                if expanded > 4_000_000_000:
                    raise DeployError('Expanded release exceeds the 4GB limit')
                current = (BASE / 'current').resolve() if (BASE / 'current').is_symlink() else None
                reserve_release_space(expanded + 1_000_000_000, current)
                release.mkdir(mode=0o755)
                archive.extractall(release, filter='data')
            metadata = json.loads((release / 'deployment-manifest.json').read_text())
            if (metadata.get('revision') != args.revision or metadata.get('runId') != args.run_id
                    or metadata.get('repositoryId') != '1439613899'
                    or metadata.get('ref') not in ('refs/heads/main', 'refs/heads/master')):
                raise DeployError('Artifact manifest does not match the requested GitHub run')
            if metadata.get('node') != command(['/usr/bin/node', '--version']):
                raise DeployError('Node runtime differs from the build runtime')
            if 'provider = "mysql"' not in (release / 'prisma/schema.prisma').read_text():
                # Whitespace-insensitive fallback for Prisma formatting.
                if not re.search(r'provider\s*=\s*"mysql"', (release / 'prisma/schema.prisma').read_text()):
                    raise DeployError('Artifact is not the deployed MySQL application')
            # Release code is root-owned. Only cache directories and shared uploads are writable.
            for root, dirs, files in os.walk(release, followlinks=False):
                for name in dirs + files:
                    item = Path(root) / name
                    if not item.is_symlink():
                        executable = item.is_dir() or bool(item.stat().st_mode & 0o111)
                        item.chmod(0o755 if executable else 0o644)
            (release / '.next/cache').mkdir(exist_ok=True)
            command(['chown', '-R', USER + ':' + USER, str(release / '.next/cache')])
            (release / '.env').symlink_to(CONFIG / 'production.env')
            (release / 'public/uploads').symlink_to(STATE / 'public-uploads')
            (release / 'uploads').symlink_to(STATE / 'backend-uploads')
            print('Checking database compatibility without changing data', flush=True)
            try:
                command(['systemd-run', '--quiet', '--wait', '--pipe', '--collect',
                         '--unit=onesystemserp-dbcheck-' + args.run_id] + systemd_properties() + [
                             '--working-directory=' + str(release), '/usr/bin/node',
                             '/usr/local/lib/onesystemserp/runtime-check.mjs'], timeout=180)
            except DeployError:
                raise DeployError('Read-only database compatibility check failed. Review the host dbcheck journal; no migration was run.')
            print('Checking staged frontend and backend', flush=True)
            candidate(release, args.run_id)
            print('Activating ERP release', flush=True)
            previous = activate(release)
            atomic_text(STATE / 'deployment.json', json.dumps({
                'revision': args.revision, 'run_id': args.run_id, 'sha256': args.sha256,
                'release': str(release), 'previous': str(previous) if previous else str(LEGACY),
                'deployed_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, indent=2) + '\n')
            # Delete only our older, validated release directories. Keep current + immediate rollback.
            for old in (BASE / 'releases').iterdir():
                if old not in (release, previous) and not old.is_symlink() and old.is_dir() and re.fullmatch(r'[a-f0-9]{40}-[0-9]{1,20}-[0-9]{1,4}', old.name):
                    shutil.rmtree(old)
            print('DEPLOYMENT_SUCCEEDED', args.revision, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('artifact-key', 'sha256', 'revision', 'run-id'):
        parser.add_argument('--' + name, required=True)
    try:
        deploy(parser.parse_args())
    except Exception as error:
        if isinstance(error, DeployError):
            print('DEPLOYMENT_FAILED:', error, file=sys.stderr)
        else:
            # Unexpected errors should not leak credentials through exception repr/HTTP headers.
            print('DEPLOYMENT_FAILED: ' + type(error).__name__ + '; inspect private host logs', file=sys.stderr)
        sys.exit(1)
