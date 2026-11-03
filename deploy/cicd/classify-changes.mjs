#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_PREFIXES = ['src/', 'apps/aws-backend/', 'artifacts/', 'public/', 'prisma/'];
const TEST_PREFIXES = ['tests/'];

export function isApplicationPath(file) {
  const path = file.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path === 'public/uploads' || path.startsWith('public/uploads/')) return false;
  if (path === 'deploy/cicd/package-release.mjs') return true;
  if (APP_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (/^package(?:-lock)?\.json$/.test(path)) return true;
  return /^(?:next\.config\.|tsconfig(?:\.|$)|postcss\.config\.|tailwind\.config\.|prisma\.config\.|auth\.|proxy\.|middleware\.|instrumentation\.|sentry\.)/.test(path);
}

export function isTestPath(file) {
  const path = file.replaceAll('\\', '/').replace(/^\.\//, '');
  return TEST_PREFIXES.some((prefix) => path.startsWith(prefix)) || path === 'jest.config.js';
}

export function classifyPaths(paths, eventName = 'push') {
  const forceBuild = eventName === 'workflow_dispatch';
  return {
    appChanged: forceBuild || paths.some(isApplicationPath),
    testsChanged: paths.some(isTestPath),
    forceBuild,
  };
}

export function appFingerprint(files) {
  const hash = createHash('sha256');
  for (const file of [...files].filter(isApplicationPath).sort()) {
    hash.update(file.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf('--base');
  const eventIndex = args.indexOf('--event');
  if (baseIndex < 0 || !args[baseIndex + 1] || eventIndex < 0 || !args[eventIndex + 1]) {
    throw new Error('Usage: classify-changes.mjs --base <sha> --event <push|workflow_dispatch>');
  }
  const base = args[baseIndex + 1];
  const event = args[eventIndex + 1];
  const head = process.env.GITHUB_SHA || 'HEAD';
  let paths = [];
  let failClosed = false;
  if (event === 'workflow_dispatch' || /^0+$/.test(base)) {
    failClosed = event !== 'workflow_dispatch';
  } else {
    try {
      paths = git(['diff', '--name-only', '--no-renames', `${base}..${head}`]).split(/\r?\n/).filter(Boolean);
    } catch {
      // An unknown base must never turn an app push into a skipped deployment.
      failClosed = true;
    }
  }
  const result = classifyPaths(paths, event);
  if (failClosed) {
    result.appChanged = true;
    result.testsChanged = true;
  }
  const trackedFiles = git(['ls-files', '-z']).split('\0').filter(Boolean);
  result.fingerprint = appFingerprint(trackedFiles);
  result.baseResolved = !failClosed;
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
