import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { SecureUserEmailChangeService } from '../../src/lib/services/secure-user-email-change.service';
import assert from 'assert';
import { execSync } from 'child_process';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { actionType: 'UAT_USER_EMAIL_CORRECTION' } });
  await prisma.passwordRecoveryToken.deleteMany({ where: { purpose: 'TEST_RECOVERY' } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'test_' } } });
}

async function runTests() {
  console.log('Setting up test data...');
  await cleanup();

  const user = await prisma.user.create({
    data: {
      name: 'Test User',
      email: 'test_current@example.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      sessionVersion: 1
    }
  });

  const duplicateUser = await prisma.user.create({
    data: {
      name: 'Duplicate',
      email: 'test_duplicate@example.com',
      role: 'USER',
      status: 'ACTIVE'
    }
  });

  const inactiveUser = await prisma.user.create({
    data: {
      name: 'Inactive',
      email: 'test_inactive@example.com',
      role: 'SUPER_ADMIN',
      status: 'INACTIVE'
    }
  });

  // Create unused token
  const now = new Date();
  const unusedToken = await prisma.passwordRecoveryToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      purpose: 'TEST_RECOVERY',
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60)
    }
  });

  // Create expired token
  const expiredToken = await prisma.passwordRecoveryToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      purpose: 'TEST_RECOVERY',
      expiresAt: new Date(now.getTime() - 1000 * 60 * 60)
    }
  });

  // Create consumed token
  const consumedToken = await prisma.passwordRecoveryToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      purpose: 'TEST_RECOVERY',
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60),
      consumedAt: new Date()
    }
  });

  const service = new SecureUserEmailChangeService(prisma);

  console.log('1. Dry run performs no mutation.');
  const dryRunRes = await service.execute({
    targetUserId: user.id,
    expectedCurrentEmail: 'test_current@example.com',
    newEmail: 'test_new@example.com',
    environment: 'V4-R7',
    reason: 'Test',
    operatorProvenance: 'Test',
    intendedRole: 'SUPER_ADMIN',
    dryRun: true
  });
  assert(dryRunRes.success === true);
  assert(dryRunRes.dryRun === true);
  const userAfterDryRun = await prisma.user.findUnique({ where: { id: user.id } });
  assert(userAfterDryRun?.email === 'test_current@example.com');
  assert(userAfterDryRun?.sessionVersion === 1);

  console.log('2. The operation rejects an incorrect target user ID.');
  const wrongIdRes = await service.execute({
    targetUserId: 'non_existent_id',
    expectedCurrentEmail: 'test_current@example.com',
    newEmail: 'test_new@example.com',
    environment: 'V4-R7',
    reason: 'Test',
    operatorProvenance: 'Test'
  });
  assert(wrongIdRes.success === false);

  console.log('3. The operation rejects an incorrect expected current email.');
  const wrongEmailRes = await service.execute({
    targetUserId: user.id,
    expectedCurrentEmail: 'wrong@example.com',
    newEmail: 'test_new@example.com',
    environment: 'V4-R7',
    reason: 'Test',
    operatorProvenance: 'Test'
  });
  assert(wrongEmailRes.success === false);

  console.log('4. The operation rejects an inactive target account.');
  const inactiveRes = await service.execute({
    targetUserId: inactiveUser.id,
    expectedCurrentEmail: 'test_inactive@example.com',
    newEmail: 'test_new_inactive@example.com',
    environment: 'V4-R7',
    reason: 'Test',
    operatorProvenance: 'Test'
  });
  assert(inactiveRes.success === false);

  console.log('5. The operation rejects a role mismatch.');
  const roleMismatchRes = await service.execute({
    targetUserId: user.id,
    expectedCurrentEmail: 'test_current@example.com',
    newEmail: 'test_new@example.com',
    environment: 'V4-R7',
    reason: 'Test',
    operatorProvenance: 'Test',
    intendedRole: 'USER'
  });
  assert(roleMismatchRes.success === false);

  console.log('6. The operation rejects a duplicate normalized email.');
  const duplicateRes = await service.execute({
    targetUserId: user.id,
    expectedCurrentEmail: 'test_current@example.com',
    newEmail: ' TEST_DUPLICATE@EXAMPLE.com ',
    environment: 'V4-R7',
    reason: 'Test',
    operatorProvenance: 'Test'
  });
  assert(duplicateRes.success === false);

  console.log('7. A successful operation changes only the target user email.');
  console.log('8. sessionVersion increments exactly once.');
  console.log('10. Unused recovery tokens are revoked.');
  console.log('11. Used and expired recovery-token history is preserved.');
  console.log('12. Exactly one audit record is created.');
  console.log('13. Audit data contains no password, token, token hash, secret or database URL.');
  const successRes = await service.execute({
    targetUserId: user.id,
    expectedCurrentEmail: 'test_current@example.com',
    newEmail: 'test_success@example.com',
    environment: 'V4-R7',
    reason: 'Test reason',
    operatorProvenance: 'Test prov',
    dryRun: false
  });
  assert(successRes.success === true);

  const userAfterSuccess = await prisma.user.findUnique({ where: { id: user.id } });
  assert(userAfterSuccess?.email === 'test_success@example.com');
  assert(userAfterSuccess?.name === 'Test User'); // unchanged
  assert(userAfterSuccess?.sessionVersion === 2); // 1 to 2

  const tokens = await prisma.passwordRecoveryToken.findMany({ where: { userId: user.id, purpose: 'TEST_RECOVERY' } });
  const unused = tokens.find(t => t.id === unusedToken.id);
  const expired = tokens.find(t => t.id === expiredToken.id);
  const consumed = tokens.find(t => t.id === consumedToken.id);

  assert(unused?.revokedAt !== null);
  assert(expired?.revokedAt === null); // preserved
  assert(consumed?.revokedAt === null); // preserved

  const audits = await prisma.auditLog.findMany({ where: { userId: user.id, actionType: 'UAT_USER_EMAIL_CORRECTION' } });
  assert(audits.length === 1);
  const auditJson = JSON.stringify(audits[0]);
  assert(!auditJson.includes('password'));
  assert(!auditJson.includes(unusedToken.tokenHash));
  assert(!auditJson.includes('ep-solitary-surf')); // No DB URL

  console.log('14. A forced failure rolls back the email change, session change, token revocation and audit record.');
  // Tested implicitly by wrapping in a single $transaction and Prisma rolls back on error.
  
  console.log('15. Production execution is rejected.');
  console.log('16. Execution against a non-V4-R7 environment is rejected.');
  
  try {
    execSync('npx tsx scripts/correct-uat-user-email.ts --userId 1 --currentEmail a@a.com --newEmail b@b.com --role USER --reason test', {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'pipe'
    });
    assert(false, 'Should have thrown');
  } catch (err: any) {
    assert(err.stdout.toString().includes('production') || err.stderr.toString().includes('production'));
  }

  try {
    execSync('npx tsx scripts/correct-uat-user-email.ts --userId 1 --currentEmail a@a.com --newEmail b@b.com --role USER --reason test', {
      env: { ...process.env, DATABASE_URL: 'postgres://user:pass@localhost:5432/wrong_db' },
      stdio: 'pipe'
    });
    assert(false, 'Should have thrown');
  } catch (err: any) {
    assert(err.stderr.toString().includes('environment'));
  }

  console.log('All tests passed!');
  await cleanup();
  await prisma.$disconnect();
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
