import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const BASELINE_NAME = '20261103000000_mysql_baseline';
export const BASELINE_CHECKSUM = 'e9a582bf8c43e9e37cfc6860535c54583aea1c7da5d08bca64a8ef5bb383cc32';
const DATABASE = 'onesystemserp';
const ACCOUNT = 'onesystemserp_migrator@172.31.28.197';
const protectedIdentifiers = new Set(['_activebaselineprojectid', '_authoritativescheduleid', 'projectschedule_one_active_baseline_per_project', 'projectschedule_unique_baseline_code_per_project', 'baselineactivation_one_authoritative_per_schedule']);
const fail = message => { throw new Error(`Migration policy: ${message}`); };

export function validateMigrationUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { fail('invalid migration URL'); }
  if (url.protocol !== 'mysql:' || url.hostname !== 'constructpro-db.cwgvyg2y4v4o.us-east-1.rds.amazonaws.com' || url.port !== '3306' || url.pathname !== '/onesystemserp' || decodeURIComponent(url.username) !== 'onesystemserp_migrator' || !url.password || url.hash) fail('migration URL must target the dedicated migrator and existing schema');
  const allowed = new Set(['sslaccept', 'sslcert', 'connection_limit', 'connect_timeout', 'socket_timeout', 'pool_timeout']);
  for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) fail('unsupported or duplicate URL option');
  if (url.searchParams.get('sslaccept') !== 'strict' || !url.searchParams.get('sslcert')?.trim()) fail('strict TLS and a CA certificate are required');
  return url;
}

export function validateGrants(grantStrings, currentUser) {
  if (currentUser !== ACCOUNT || !Array.isArray(grantStrings) || !grantStrings.length) fail('unexpected authenticated migrator account');
  const privileges = new Set(['ALL PRIVILEGES', 'ALTER', 'CREATE', 'CREATE TEMPORARY TABLES', 'DELETE', 'DROP', 'INDEX', 'INSERT', 'LOCK TABLES', 'REFERENCES', 'SELECT', 'UPDATE', 'SHOW VIEW', 'CREATE VIEW', 'EXECUTE', 'CREATE ROUTINE', 'ALTER ROUTINE', 'EVENT', 'TRIGGER']);
  let schemaGrant = false;
  for (const grant of grantStrings) {
    // SHOW GRANTS uses quoted account names. No trailing clauses (roles,
    // authentication changes, proxy rights or grant option) are accepted.
    const match = /^GRANT (.+?) ON (\*\.\*|`onesystemserp`\.\*|onesystemserp\.\*) TO (?:`onesystemserp_migrator`|'onesystemserp_migrator')@(?:`172\.31\.28\.197`|'172\.31\.28\.197')$/i.exec(grant.trim());
    if (!match) fail('grant contains an unsupported scope, account or clause');
    const rights = match[1].toUpperCase().split(/\s*,\s*/);
    if (match[2] === '*.*') {
      if (rights.length !== 1 || rights[0] !== 'USAGE') fail('global privileges are forbidden');
    } else {
      if (rights.some(right => !privileges.has(right))) fail('unsupported schema privilege');
      schemaGrant = true;
    }
  }
  if (!schemaGrant) fail('schema privileges are missing');
  return true;
}

// The execution wrapper must reject ANSI_QUOTES and NO_BACKSLASH_ESCAPES in
// the server's session sql_mode before using this lexer. Tokens preserve the
// distinction between identifiers and strings: quoted values are never SQL.
function tokenize(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i], next = sql[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '#' || (c === '-' && next === '-' && (i + 2 === sql.length || /[\x00-\x20]/.test(sql[i + 2])))) {
      while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      if (sql[i + 2] === '!' || sql[i + 2] === '+') fail('executable comments and optimizer hints are forbidden');
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) fail('unterminated comment');
      i = end + 2; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c; let value = '', closed = false; i++;
      while (i < sql.length) {
        if (sql[i] === '\\') { if (++i >= sql.length) fail('unterminated escape'); value += sql[i++]; }
        else if (sql[i] === quote) {
          if (sql[i + 1] === quote) { value += quote; i += 2; }
          else { i++; closed = true; break; }
        } else value += sql[i++];
      }
      if (!closed) fail('unterminated quoted token');
      tokens.push({ type: quote === '`' ? 'id' : 'string', value: value.toLowerCase() }); continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(sql.slice(i));
    if (number) { tokens.push({ type: 'number', value: number[0] }); i += number[0].length; continue; }
    const word = /^[a-zA-Z_$][a-zA-Z0-9_$]*/.exec(sql.slice(i));
    if (word) { tokens.push({ type: 'word', value: word[0].toLowerCase() }); i += word[0].length; continue; }
    if (!'(),.;=+-*/%<>!|&^~:'.includes(c)) fail('unsupported SQL character');
    tokens.push({ type: 'symbol', value: c }); i++;
  }
  return tokens;
}

export function validateMigrationSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) fail('empty migration SQL');
  const tokens = tokenize(sql);
  const forbidden = new Set('use database schema grant revoke definer role roles user account password identified global persist persist_only procedure function trigger event call prepare execute deallocate load outfile dumpfile infile delimiter handler flush shutdown reset install uninstall plugin component tablespace server import export repair optimize analyze checksum kill source'.split(' '));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if ((token.type === 'word' || token.type === 'id') && protectedIdentifiers.has(token.value)) fail('pending migration touches a protected baseline identifier');
    if (token.type === 'word' && forbidden.has(token.value)) fail(`forbidden SQL keyword: ${token.value}`);
    if (token.value === '.' && token.type === 'symbol') {
      const left = tokens[i - 1], right = tokens[i + 1];
      if (!left || !right || !['word', 'id'].includes(left.type) || left.value !== DATABASE || !['word', 'id'].includes(right.type) || tokens[i - 2]?.value === '.' || tokens[i + 2]?.value === '.') fail('qualified identifiers must name only the application schema');
    }
  }
  let statement = [];
  const check = () => {
    if (!statement.length) return;
    const words = statement.slice(0, 5).map(t => t.type === 'word' ? t.value : '');
    if (['insert', 'update', 'delete', 'select', 'replace'].includes(words[0])) return;
    if (words[0] === 'alter' && words[1] === 'table') return;
    if (words[0] === 'create' && (words[1] === 'table' || words[1] === 'index' || (words[1] === 'unique' && words[2] === 'index'))) return;
    if (words[0] === 'drop' && ['table', 'index'].includes(words[1])) {
      if (words[1] === 'table' && statement.some(token => ['id', 'word'].includes(token.type) && ['projectschedule', 'baselineactivation'].includes(token.value))) fail('cannot drop tables containing protected baseline invariants');
      return;
    }
    fail('only table/index DDL and scoped DML are allowed');
  };
  for (const token of tokens) {
    if (token.type === 'symbol' && token.value === ';') { check(); statement = []; }
    else statement.push(token);
  }
  check();
  if (!tokens.length) fail('migration contains no SQL');
  return true;
}

export async function loadMigrations(rootPath) {
  if (!(await lstat(rootPath)).isDirectory() || (await lstat(rootPath)).isSymbolicLink()) fail('migration root must be a real directory');
  const entries = await readdir(rootPath, { withFileTypes: true });
  const migrations = [];
  let lockFound = false;
  for (const entry of entries) {
    const path = join(rootPath, entry.name), info = await lstat(path);
    if (info.isSymbolicLink()) fail('symlinks are forbidden');
    if (entry.name === 'migration_lock.toml' && info.isFile()) {
      const lock = await readFile(path, 'utf8');
      if (!/^\s*(?:#[^\r\n]*(?:\r?\n|$)\s*)*provider\s*=\s*"mysql"\s*(?:#[^\r\n]*)?\s*$/.test(lock)) fail('migration provider must be mysql');
      lockFound = true; continue;
    }
    if (!info.isDirectory() || !/^\d{14}_[A-Za-z0-9_-]+$/.test(entry.name)) fail('unexpected migration-root entry');
    const children = await readdir(path);
    if (children.length !== 1 || children[0] !== 'migration.sql') fail('migration directories may contain only migration.sql');
    const file = join(path, 'migration.sql'), stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('migration.sql must be a regular file');
    const bytes = await readFile(file);
    migrations.push({ name: entry.name, checksum: createHash('sha256').update(bytes).digest('hex'), sql: bytes.toString('utf8') });
  }
  if (!lockFound) fail('migration_lock.toml is required');
  migrations.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (migrations[0]?.name !== BASELINE_NAME || migrations[0].checksum !== BASELINE_CHECKSUM) fail('immutable baseline is missing or changed');
  return migrations;
}

export function validateHistory(migrations, rows) {
  if (!Array.isArray(rows) || !rows.length || migrations[0]?.name !== BASELINE_NAME || migrations[0].checksum !== BASELINE_CHECKSUM) fail('existing baseline history is required');
  if (rows.some(row => row.finished_at && row.rolled_back_at)) fail('history contains contradictory completion states');
  // Prisma keeps attempts explicitly resolved as rolled back. They do not count
  // as applied migrations; unresolved failures still block all automatic work.
  const applied = rows.filter(row => !row.rolled_back_at);
  if (applied.length > migrations.length) fail('history includes removed migrations');
  // Caller reads in started_at,id order; do not sort away a reordered history.
  applied.forEach((row, i) => {
    if (!row.finished_at || row.rolled_back_at || row.migration_name !== migrations[i]?.name || row.checksum !== migrations[i]?.checksum) fail('history is failed, reordered, removed or edited');
  });
  if (!applied.length) fail('existing baseline history is required');
  const pending = migrations.slice(applied.length);
  pending.forEach(migration => validateMigrationSql(migration.sql));
  return pending;
}
