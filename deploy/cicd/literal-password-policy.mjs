#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const CODE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|sh|ps1)$/;
const IGNORED_PREFIXES = ['temp_sqlite/']; // generated Prisma client

// Files allowed to keep at most this many findings. A limit can only go down: lower
// or remove an entry once the file is fixed, and do not add one to get a change through.
export const KNOWN_EXCEPTIONS = {
  // This policy's own test needs sample findings.
  'deploy/cicd/literal-password-policy.test.mjs': Infinity,
  // Read-only checks that retired credentials are rejected. They write nothing.
  'scripts/security-tests.ts': 4,
  'scripts/security-tests.js': 4,
  // Shipped application code that needs its own product fix.
  'src/app/actions/systemResetActions.ts': 4,
  'apps/aws-backend/src/routes/systemResetActions.ts': 4,
  'src/app/actions/user.ts': 1,
  'apps/aws-backend/src/routes/user.ts': 1,
};

const literal = (name) => String.raw`(?<${name}q>['"\x60])(?<${name}>(?:\\.|(?!\k<${name}q>)[^\\\n])+)\k<${name}q>(?![\w@])`;
const SECRET_NAME = String.raw`\w*(?:[pP]assword|PASSWORD|[pP]asswd|PASSWD|[a-z_]Pass|_PASS|[a-z_]Pwd|_PWD)\d*|[pP]ass|[pP]wd|PWD`;

const RULES = [
  { rule: 'hash-call', pattern: new RegExp(String.raw`\b(?:hash|hashSync|compare|compareSync)\(\s*${literal('value')}`, 'g') },
  { rule: 'password-assignment', pattern: new RegExp(String.raw`\b(?:${SECRET_NAME})["']?\s*(?<!\?)[:=]\s*${literal('value')}`, 'g') },
  { rule: 'env-fallback', pattern: new RegExp(String.raw`process\.env\.\w*(?:PASSWORD|PASSWD|PASS|PWD)\s*(?:\|\||\?\?)\s*${literal('value')}`, 'g') },
  { rule: 'password-field-fill', pattern: new RegExp(String.raw`\.(?:fill|type|pressSequentially)\(\s*(?<q>['"\x60])[^\n]*?(?:password|passwd|pwd)[^\n]*?\k<q>\s*,\s*${literal('value')}`, 'gi') },
  { rule: 'password-locator-fill', pattern: new RegExp(String.raw`(?:password|passwd|pwd)[^\n]*?\.fill\(\s*${literal('value')}`, 'gi') },
  { rule: 'login-call', pattern: new RegExp(String.raw`\b\w*(?:login|signin|auth)\w*\(\s*(?:\w+\s*,\s*)?${literal('user')}\s*,\s*${literal('value')}`, 'gi') },
  { rule: 'bcrypt-hash', pattern: /\$2[aby]\$\d\d\$[A-Za-z0-9./]{53}/g },
];

// Findings hold a line and a rule, never the matched text, so they are safe to log.
export function findLiteralPasswords(text) {
  const findings = [];
  for (const { rule, pattern } of RULES) {
    for (const match of text.matchAll(pattern)) {
      const value = match.groups?.value;
      // Interpolated values are computed, and real passwords rarely hold spaces while UI text does.
      if (value !== undefined && (value.includes('${') || /\s/.test(value))) continue;
      // Helpers such as loginAndFetch(email, '/api/path', body) take a route, not a password.
      if (rule === 'login-call' && value.startsWith('/')) continue;
      findings.push({ line: text.slice(0, match.index).split('\n').length, rule });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

export function checkFiles(files, read) {
  const violations = [];
  for (const file of files) {
    if (!CODE_FILE.test(file) || IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
    const findings = findLiteralPasswords(read(file));
    if (findings.length > (KNOWN_EXCEPTIONS[file] ?? 0)) {
      for (const { line, rule } of findings) violations.push(`${file}:${line} ${rule}`);
    }
  }
  return violations;
}

export function checkTrackedFiles() {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((file) => file && existsSync(file));
  return checkFiles(files, (file) => readFileSync(file, 'utf8'));
}
