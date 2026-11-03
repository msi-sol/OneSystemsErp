import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BASELINE_CHECKSUM, BASELINE_NAME, validateMigrationUrl, validateGrants, validateMigrationSql, loadMigrations, validateHistory } from './migration-policy.mjs';

const goodUrl = 'mysql://onesystemserp_migrator:secret@constructpro-db.cwgvyg2y4v4o.us-east-1.rds.amazonaws.com:3306/onesystemserp?sslaccept=strict&sslcert=%2Fca.pem';
test('migration URL pins account, host, schema and verified TLS', () => {
  assert.equal(validateMigrationUrl(goodUrl).pathname, '/onesystemserp');
  for (const bad of [goodUrl.replace('migrator:', 'app:'), goodUrl.replace('/onesystemserp?', '/mysql?'), goodUrl.replace(':3306/', ':3307/'), goodUrl.replace('strict', 'accept_invalid_certs'), goodUrl.replace('sslcert=%2Fca.pem', 'sslcert='), `${goodUrl}&sslaccept=strict`, `${goodUrl}&socket=/tmp/mysql.sock`, goodUrl.replace('secret@', '@'), goodUrl.replace('rds.amazonaws.com', 'rds.amazonaws.com.evil.test')]) assert.throws(() => validateMigrationUrl(bad));
});

const account = "'onesystemserp_migrator'@'172.31.28.197'";
test('grants permit only the authenticated restricted account and application schema', () => {
  assert.equal(validateGrants([`GRANT USAGE ON *.* TO ${account}`, `GRANT ALL PRIVILEGES ON \`onesystemserp\`.* TO ${account}`], 'onesystemserp_migrator@172.31.28.197'), true);
  for (const grant of [`GRANT SELECT ON *.* TO ${account}`, `GRANT SELECT ON \`other\`.* TO ${account}`, `GRANT SELECT ON \`onesystemserp\`.* TO ${account} WITH GRANT OPTION`, `GRANT 'admin' TO ${account}`, `GRANT PROXY ON 'root'@'%' TO ${account}`, `GRANT SELECT ON onesystemserp.* TO 'onesystemserp_migrator'@'%'`]) assert.throws(() => validateGrants([grant], 'onesystemserp_migrator@172.31.28.197'));
  assert.throws(() => validateGrants([`GRANT ALL PRIVILEGES ON onesystemserp.* TO ${account}`], 'root@localhost'));
});

test('SQL lexer allows Prisma DDL, scoped DML, decimals, quoted text and comments', () => {
  for (const sql of [
    'CREATE TABLE `Example` (`id` INTEGER NOT NULL, `value` DECIMAL(10,2), PRIMARY KEY (`id`));',
    'ALTER TABLE `Example` ADD COLUMN `note` VARCHAR(191); CREATE UNIQUE INDEX `Example_note_key` ON `Example`(`note`);',
    "INSERT INTO `onesystemserp`.`Example` (`value`, `note`) VALUES (1.25, 'other.table; DROP DATABASE x; _activeBaselineProjectId');",
    "UPDATE `Example` SET `note` = 'it\\'s other.table', `value` = .25; # USE other\nDELETE FROM `Example` WHERE `note` = 'it''s';",
    '/* other.table */ SELECT 1.25; -- GRANT SELECT ON *.*\n DROP INDEX `idx` ON `Example`; DROP TABLE `Example`;'
  ]) assert.equal(validateMigrationSql(sql), true, sql);
});

test('SQL fails closed on scope bypasses, executable comments, privileged operations and protected identifiers', () => {
  for (const sql of [
    'CREATE TABLE other.t (id INT)', 'UPDATE `other`.`t` SET x=1', 'SELECT * FROM `mysql`.`user`',
    'SELECT t.id FROM t', 'SELECT onesystemserp.t.id FROM t', 'SELECT "other"."t" FROM t',
    '/*!50000 DROP DATABASE other */ SELECT 1', 'SELECT /*+ MAX_EXECUTION_TIME(1) */ 1',
    'USE onesystemserp', 'CREATE DATABASE x', 'DROP SCHEMA x', 'GRANT SELECT ON onesystemserp.* TO x',
    'CREATE USER x', 'SET GLOBAL sql_mode = ""', 'CALL onesystemserp.p()', 'PREPARE x FROM "SELECT 1"',
    'EXECUTE x', "LOAD DATA LOCAL INFILE 'x' INTO TABLE t", "SELECT 1 INTO OUTFILE '/tmp/x'",
    'CREATE DEFINER=root VIEW v AS SELECT 1', 'CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW SET x=1',
    'ALTER TABLE t DROP COLUMN `_activeBaselineProjectId`',
    'DROP INDEX ProjectSchedule_one_active_baseline_per_project ON ProjectSchedule',
    'DROP TABLE `onesystemserp`.`ProjectSchedule`', 'DROP TABLE BaselineActivation',
    "SELECT 'unterminated", 'SELECT 1 /* unterminated', 'SELECT @x', 'TRUNCATE TABLE t'
  ]) assert.throws(() => validateMigrationSql(sql), undefined, sql);
});

const baseline = { name: BASELINE_NAME, checksum: BASELINE_CHECKSUM, sql: 'ALTER TABLE t ADD `_activeBaselineProjectId` INT' };
const next = { name: '20261104000000_next', checksum: 'b'.repeat(64), sql: 'CREATE TABLE t (id INT)' };
const row = migration => ({ migration_name: migration.name, checksum: migration.checksum, finished_at: new Date(), rolled_back_at: null });
test('history requires an applied immutable baseline and an exact successful prefix', () => {
  assert.deepEqual(validateHistory([baseline, next], [row(baseline)]), [next]);
  assert.deepEqual(validateHistory([baseline, next], [row(baseline), row(next)]), []);
  for (const rows of [[], [row(next)], [{ ...row(baseline), checksum: 'x' }], [{ ...row(baseline), finished_at: null }], [{ ...row(baseline), rolled_back_at: new Date() }], [row(baseline), row(next), row(next)]]) assert.throws(() => validateHistory([baseline, next], rows));
  assert.throws(() => validateHistory([baseline, { ...next, sql: 'ALTER TABLE t DROP `_authoritativeScheduleId`' }], [row(baseline)]));
});

test('filesystem loader rejects root SQL, edited baseline, invalid providers and nonregular migrations', async t => {
  const root = await mkdtemp(join(tmpdir(), 'migration-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, BASELINE_NAME));
  await writeFile(join(root, 'migration_lock.toml'), 'provider = "mysql"\n');
  // Obtain the trusted tracked bytes, avoiding checkout newline conversion.
  const bytes = execFileSync('git', ['show', 'HEAD:prisma/migrations/20261103000000_mysql_baseline/migration.sql']);
  await writeFile(join(root, BASELINE_NAME, 'migration.sql'), bytes);
  const migrations = await loadMigrations(root);
  assert.equal(migrations[0].checksum, BASELINE_CHECKSUM);
  await writeFile(join(root, 'pending.sql'), 'SELECT 1');
  await assert.rejects(loadMigrations(root));
  await rm(join(root, 'pending.sql'));
  await writeFile(join(root, 'migration_lock.toml'), 'provider = "postgresql"');
  await assert.rejects(loadMigrations(root));
  await writeFile(join(root, 'migration_lock.toml'), 'provider = "mysql"');
  await writeFile(join(root, BASELINE_NAME, 'migration.sql'), Buffer.concat([bytes, Buffer.from('\n')]));
  await assert.rejects(loadMigrations(root));
  await writeFile(join(root, BASELINE_NAME, 'migration.sql'), bytes);
  await mkdir(join(root, '20261104000000_next'));
  await mkdir(join(root, '20261104000000_next', 'migration.sql'));
  await assert.rejects(loadMigrations(root));
  await rm(join(root, '20261104000000_next'), { recursive: true });
  await symlink(join(root, BASELINE_NAME), join(root, '20261104000000_link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(loadMigrations(root));
});

test('policy module has no database dependency or execution path', async () => {
  const source = await readFile(new URL('./migration-policy.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"](?:mysql|mysql2|@prisma\/client)|\b(?:execFile|spawn|fetch)\s*\(/);
});
