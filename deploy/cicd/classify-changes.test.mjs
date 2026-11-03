import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appFingerprint, classifyPaths, isApplicationPath, isTestPath } from './classify-changes.mjs';

test('application classifier includes runtime inputs and excludes docs/deploy-only files', () => {
  for (const path of ['src/app/page.tsx', 'apps/aws-backend/src/index.ts', 'artifacts/scheduling/blueprints.json', 'public/logo.svg', 'prisma/schema.prisma', 'prisma.config.ts', 'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'postcss.config.mjs', 'auth.ts', 'proxy.ts', 'middleware.ts', 'instrumentation.ts']) {
    assert.equal(isApplicationPath(path), true, path);
  }
  for (const path of ['docs/guide.md', 'deploy/cicd/README.md', '.github/workflows/production.yml', 'tests/unit/example.test.ts', 'public/uploads/customer.pdf']) {
    assert.equal(isApplicationPath(path), false, path);
  }
});

test('test-only changes request tests but do not trigger app deployment', () => {
  assert.equal(isApplicationPath('deploy/cicd/package-release.mjs'), true);
  assert.deepEqual(classifyPaths(['tests/unit/example.test.ts']), { appChanged: false, testsChanged: true, forceBuild: false });
  assert.equal(isTestPath('jest.config.js'), true);
});

test('workflow dispatch always forces an app build', () => {
  assert.deepEqual(classifyPaths([], 'workflow_dispatch'), { appChanged: true, testsChanged: false, forceBuild: true });
});

test('fingerprint is stable across file ordering and changes with app source', () => {
  const root = mkdtempSync(join(tmpdir(), 'onesystemserp-classifier-'));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'page.tsx'), 'export default 1;');
    writeFileSync(join(root, 'docs.md'), 'ignored');
    const originalCwd = process.cwd();
    process.chdir(root);
    try {
      const first = appFingerprint(['src/page.tsx', 'docs.md']);
      assert.equal(appFingerprint(['docs.md', 'src/page.tsx']), first);
      writeFileSync(join(root, 'src', 'page.tsx'), 'export default 2;');
      assert.notEqual(appFingerprint(['src/page.tsx']), first);
    } finally {
      process.chdir(originalCwd);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
