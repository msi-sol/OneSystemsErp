import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

// This check must never run against a deployed or shared database.
const target = new URL(process.env.DATABASE_URL || '');
assert.equal(target.protocol, 'mysql:');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '3307');
assert.equal(target.pathname, '/onesystemserp_validation');

const db = new PrismaClient();
const marker = randomUUID();
const rollback = new Error('ROLL_BACK_MYSQL_VALIDATION');
const uniqueViolation = (error) => error?.code === 'P2002';
try {
  const password = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  await assert.rejects(db.$transaction(async (tx) => {
    const email = `MySQL-${marker}@example.invalid`;
    const user = await tx.user.create({ data: {
      email, name: 'Disposable MySQL validation', passwordHash,
      role: 'SUPER_ADMIN', status: 'ACTIVE', mustChangePassword: true,
    } });
    const login = await tx.user.findFirst({ where: { email: email.toLowerCase() } });
    assert.equal(login?.id, user.id);
    assert.equal(await bcrypt.compare(password, login.passwordHash), true);

    const description = 'x'.repeat(100_000);
    const project = await tx.project.create({ data: { name: marker, description } });
    assert.equal((await tx.project.findUniqueOrThrow({ where: { id: project.id } })).description, description);
    const active = await tx.projectSchedule.create({ data: {
      projectId: project.id, name: 'Active baseline', workflowStatus: 'ACTIVE_BASELINE',
      baselineCode: 'BL-001', awardedContractAmount: '123456789.123456789',
    } });
    assert.equal(active.awardedContractAmount.toString(), '123456789.123456789');
    await assert.rejects(tx.projectSchedule.create({ data: {
      projectId: project.id, name: 'Duplicate active', workflowStatus: 'ACTIVE_BASELINE',
    } }), uniqueViolation);
    await assert.rejects(tx.projectSchedule.create({ data: {
      projectId: project.id, name: 'Duplicate baseline code', baselineCode: 'BL-001',
    } }), uniqueViolation);
    await tx.projectSchedule.createMany({ data: [
      { projectId: project.id, name: 'Draft one' },
      { projectId: project.id, name: 'Draft two' },
    ] });
    const anotherProject = await tx.project.create({ data: { name: `${marker}-other` } });
    await tx.projectSchedule.create({ data: {
      projectId: anotherProject.id, name: 'Another project baseline',
      workflowStatus: 'ACTIVE_BASELINE', baselineCode: 'BL-001',
    } });

    const activatedAt = new Date('2026-11-03T01:00:00.123Z');
    const activation = {
      projectId: project.id, scheduleId: active.id, reviewRound: 1,
      revisionCode: 'R0', validationSnapshot: { accepted: true, rows: [1, 2] },
      snapshotVersion: 'test', scheduleSnapshotHash: marker, activatedById: user.id,
      activatedByNameSnapshot: 'Test', activatedByRoleSnapshot: 'SUPER_ADMIN', activatedAt,
    };
    const authoritative = await tx.baselineActivation.create({ data: { ...activation, isAuthoritative: true } });
    assert.deepEqual(authoritative.validationSnapshot, activation.validationSnapshot);
    assert.equal(authoritative.activatedAt.toISOString(), activatedAt.toISOString());
    await assert.rejects(tx.baselineActivation.create({ data: { ...activation, isAuthoritative: true } }), uniqueViolation);
    await tx.baselineActivation.create({ data: { ...activation, isAuthoritative: false } });
    await tx.baselineActivation.create({ data: { ...activation, isAuthoritative: true, invalidatedAt: activatedAt } });
    throw rollback;
  }, { timeout: 60_000 }), (error) => error === rollback);
  assert.equal(await db.user.count({ where: { email: { contains: marker } } }), 0);
  assert.equal(await db.project.count({ where: { name: { contains: marker } } }), 0);
  console.log('PASS: login lookup/hash, long text, decimal/JSON/UTC, three uniqueness guards, allowed inactive/NULL rows, and rollback.');
} finally {
  await db.$disconnect();
}
