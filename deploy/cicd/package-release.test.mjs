import test from 'node:test';
import assert from 'node:assert/strict';
import { includeRuntimePath, releaseManifest, packageRelease } from './package-release.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('runtime packaging excludes credentials, mutable uploads/cache and nonproduction engines', () => {
  for (const path of ['.next/standalone/.env', 'node_modules/foo/.env.production', 'public/uploads/a.xlsx', 'uploads/a', '.next/cache/foo', 'node_modules/.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node', 'node_modules/@prisma/engines/schema-engine-darwin-arm64', 'node_modules/.prisma/client/query_engine-windows.dll.node']) assert.equal(includeRuntimePath(path), false, path);
  for (const path of ['public/templates/test.xlsx', 'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node', 'node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x', 'prisma/migrations/20261103000000_mysql_baseline/migration.sql', 'node_modules/prisma/build/query_engine_bg.mysql.wasm', 'src/lib/scheduling/blueprints/historical-validated-v1.json']) assert.equal(includeRuntimePath(path), true, path);
});

test('format 2 manifest binds the GitHub revision, protected branch and run attempt', () => {
  const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' };
  assert.deepEqual(releaseManifest(env, 'v22.0.0'), { format: 2, repositoryId: '1439613899', revision: 'a'.repeat(40), ref: 'refs/heads/main', runId: '123-2', node: 'v22.0.0' });
  for (const bad of [{ ...env, GITHUB_SHA: '' }, { ...env, GITHUB_REF: 'refs/pull/1/merge' }, { ...env, GITHUB_RUN_ATTEMPT: '../1' }]) assert.throws(() => releaseManifest(bad));
});

test('staging never overwrites existing contents', async t => {
  const stage = await mkdtemp(join(tmpdir(), 'erp-package-test-'));
  t.after(() => rm(stage, { recursive: true, force: true }));
  await writeFile(join(stage, 'sentinel'), 'preserved');
  await assert.rejects(packageRelease(stage), /must be empty/);
  assert.equal(await readFile(join(stage, 'sentinel'), 'utf8'), 'preserved');
});
