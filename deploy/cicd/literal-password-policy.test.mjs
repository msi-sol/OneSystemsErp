import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_EXCEPTIONS, checkFiles, checkTrackedFiles, findLiteralPasswords } from './literal-password-policy.mjs';
import { requireLocalDatabaseUrl } from '../../scripts/lib/local-database-guard.mjs';

const rulesFor = (source) => findLiteralPasswords(source).map(({ rule }) => rule);

test('tracked code holds no literal passwords beyond the known exceptions', () => {
  assert.deepEqual(checkTrackedFiles(), []);
});

test('flags literals in each shape they were written in', () => {
  const cases = [
    ['await bcrypt.hash("sample-value", 10)', 'hash-call'],
    ['bcrypt.hashSync(`sample-value`, 10)', 'hash-call'],
    ['await bcrypt.compare("sample-value", user.passwordHash)', 'hash-call'],
    ['data: { password: "sample-value" }', 'password-assignment'],
    ['const newPassword = "sample-value";', 'password-assignment'],
    ['const superAdminPass = "sample-value";', 'password-assignment'],
    ['{ "password": "sample-value" }', 'password-assignment'],
    ['UAT_PASSWORD = "sample-value"', 'password-assignment'],
    ['const secret = process.env.ADMIN_PASSWORD || "sample-value";', 'env-fallback'],
    ['const secret = process.env.ADMIN_PASS ?? "sample-value";', 'env-fallback'],
    [`await page.fill('input[name="password"]', 'sample-value');`, 'password-field-fill'],
    [`await page.locator('input[type="password"]').fill('sample-value');`, 'password-locator-fill'],
    [`await login(page, 'someone@example.com', 'sample-value');`, 'login-call'],
    [`await getAuthCookie(\n  'someone@example.com',\n  'sample-value'\n);`, 'login-call'],
    [`passwordHash: '$2b$10$${'a'.repeat(53)}'`, 'bcrypt-hash'],
  ];
  for (const [source, rule] of cases) {
    assert.ok(rulesFor(source).includes(rule), source);
  }
});

test('ignores values that are read or computed, and text that only mentions passwords', () => {
  const cases = [
    'await bcrypt.hash(process.env.LOCAL_TEST_PASSWORD, 10)',
    'await bcrypt.hash(password, 10)',
    'data: { password: hashedPassword }',
    'const password = process.env.LOCAL_TEST_PASSWORD;',
    'const newPassword = `Rotated_${randomUUID()}`;',
    `await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD!);`,
    `await page.fill('input[name="email"]', 'someone@example.com');`,
    `passwordHash: 'inert-placeholder'`,
    `const password = '';`,
    `const passwordLabel = 'Password';`,
    `{ password: 'Password is required' }`,
    `<input type="password" name="password" placeholder="secret" />`,
    `const fromAddress = process.env.PASSWORD_RECOVERY_EMAIL_FROM || 'noreply@example.com';`,
    `if (line.includes('UAT_MANAGER_PASSWORD=')) creds['someone@example.com'] = value;`,
    `const bypass = 'value'; const className = 'value'; const compass = 'value';`,
    `await ensureUser('someone@example.com', 'Some Name');`,
    `await loginAndFetch('someone@example.com', '/api/internal/route', {});`,
    `const hash = createHash('sha256');`,
  ];
  for (const source of cases) {
    assert.deepEqual(rulesFor(source), [], source);
  }
});

test('reports a location and a rule, never the matched value', () => {
  const [finding] = findLiteralPasswords('\n\nconst password = "sample-value";');
  assert.deepEqual(finding, { line: 3, rule: 'password-assignment' });

  const violations = checkFiles(['scripts/new.ts'], () => 'const password = "sample-value";');
  assert.deepEqual(violations, ['scripts/new.ts:1 password-assignment']);
});

test('a known exception cannot grow, and only code files are read', () => {
  const file = 'src/app/actions/user.ts';
  assert.equal(KNOWN_EXCEPTIONS[file], 1);
  assert.deepEqual(checkFiles([file], () => 'password: "sample-value"'), []);
  assert.equal(checkFiles([file], () => 'password: "sample-value"\npassword: "sample-value"').length, 2);
  assert.deepEqual(checkFiles(['docs/guide.md', 'temp_sqlite/client/index.js'], () => 'password: "sample-value"'), []);
});

test('the local database guard accepts only this machine', () => {
  for (const url of [
    'mysql://user:secret@localhost:3306/app',
    'mysql://user:secret@127.0.0.1:3306/app',
    'mysql://user:secret@LOCALHOST/app',
    'postgresql://user:secret@[::1]:5432/app',
  ]) {
    assert.equal(requireLocalDatabaseUrl(url), url);
  }
  for (const url of [
    undefined,
    '',
    'not a url',
    'mysql://user:secret@db.example.rds.amazonaws.com:3306/app',
    'mysql://user:secret@localhost.example.com/app',
    'mysql://localhost:secret@db.example.com/app',
    'mysql://user:secret@127.0.0.1@db.example.com/app',
    'postgresql://user:secret@localhost/app?host=db.example.com',
    'mysql://user:secret@10.0.0.5/app',
  ]) {
    assert.throws(() => requireLocalDatabaseUrl(url), /^Error: Refusing to run/, String(url));
  }
});

test('the local database guard never echoes the database password', () => {
  assert.throws(
    () => requireLocalDatabaseUrl('mysql://user:secret@db.example.com/app'),
    (error) => !error.message.includes('secret'),
  );
});
