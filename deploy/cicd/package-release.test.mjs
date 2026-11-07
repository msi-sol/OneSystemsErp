import test from 'node:test';
import assert from 'node:assert/strict';
import { includeRuntimePath, releaseManifest, packageRelease, verifyAppRoutes, smokeRuntimeLibraries } from './package-release.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('packaging rejects the PDF native-runtime failure that previously crashed Excel upload routes', async () => {
  const runtime = name => {
    if (name === 'exceljs') return { Workbook: class {
      xlsx = { writeBuffer: async () => Buffer.from([0x50, 0x4b, 0x03, 0x04]) };
      addWorksheet() { return { getCell: () => ({ value: null }) }; }
    } };
    if (name === 'pdf-parse') throw new ReferenceError('DOMMatrix is not defined');
    throw new Error(`Unexpected smoke dependency: ${name}`);
  };
  runtime.resolve = () => { const error = new Error('Optional PDFKit is bundled'); error.code = 'MODULE_NOT_FOUND'; throw error; };
  await assert.rejects(smokeRuntimeLibraries(runtime), /DOMMatrix is not defined/);
});

test('runtime packaging excludes credentials, mutable uploads/cache and nonproduction engines', () => {
  for (const path of ['.next/standalone/.env', 'node_modules/foo/.env.production', 'public/uploads/a.xlsx', 'uploads/a', '.next/cache/foo', 'node_modules/.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node', 'node_modules/@prisma/engines/schema-engine-darwin-arm64', 'node_modules/.prisma/client/query_engine-windows.dll.node']) assert.equal(includeRuntimePath(path), false, path);
  for (const path of ['public/templates/test.xlsx', 'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node', 'node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x', 'prisma/migrations/20261103000000_mysql_baseline/migration.sql', 'node_modules/prisma/build/query_engine_bg.mysql.wasm', 'src/lib/scheduling/blueprints/historical-validated-v1.json']) assert.equal(includeRuntimePath(path), true, path);
});

test('mutable upload roots are excluded without dropping compiled upload API routes', () => {
  for (const prefix of ['', '.next/standalone/']) {
    for (const file of ['uploads', 'uploads/private.xlsx', 'public/uploads', 'public/uploads/proof.pdf']) {
      assert.equal(includeRuntimePath(prefix + file), false, prefix + file);
    }
    for (const file of ['.next/server/app/api/boq-workspace/uploads',
      '.next/server/app/api/boq-workspace/uploads/[uploadId]/original/route.js',
      '.next/server/app/api/uploads/file/route.js']) {
      assert.equal(includeRuntimePath(prefix + file), true, prefix + file);
    }
  }
});

test('release validation rejects a missing route declared in the Next app manifest', async t => {
  const stage = await mkdtemp(join(tmpdir(), 'erp-route-package-test-'));
  t.after(() => rm(stage, { recursive: true, force: true }));
  const server = join(stage, '.next/server');
  const file = 'app/api/boq-workspace/uploads/[uploadId]/original/route.js';
  await mkdir(server, { recursive: true });
  await writeFile(join(server, 'app-paths-manifest.json'), JSON.stringify({ '/api/boq-workspace/uploads/[uploadId]/original/route': file }));
  await assert.rejects(verifyAppRoutes(stage), /App route was not packaged/);
  await mkdir(join(server, 'app/api/boq-workspace/uploads/[uploadId]/original'), { recursive: true });
  await writeFile(join(server, file), 'module.exports = {};');
  await verifyAppRoutes(stage);
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
