import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const target = new URL(process.env.DATABASE_URL || '');
assert.equal(target.protocol, 'mysql:');
assert.equal(target.hostname, 'constructpro-db.cwgvyg2y4v4o.us-east-1.rds.amazonaws.com');
assert.equal(target.pathname, '/onesystemserp');
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
assert.ok(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'An administrator email is required.');
assert.ok(password && password.length >= 12, 'Use a password with at least 12 characters.');
assert.ok(!['password123', 'admin123', 'jejors2026', 'onesystemserp', email.toLowerCase()].includes(password.toLowerCase()), 'Use a non-default password.');
const db = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async (tx) => {
    assert.equal(await tx.user.count(), 0, 'Users already exist. No accounts were changed.');
    await tx.systemRole.upsert({ where: { name: 'SUPER_ADMIN' }, update: {}, create: { name: 'SUPER_ADMIN' } });
    const role = await tx.role.upsert({ where: { roleCode: 'SUPER_ADMIN' }, update: {}, create: { roleCode: 'SUPER_ADMIN', roleName: 'SUPER_ADMIN', description: 'System administrator' } });
    const user = await tx.user.create({ data: { email, name: 'Administrator', passwordHash, role: 'SUPER_ADMIN', status: 'ACTIVE', mustChangePassword: true } });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
  });
  console.log('Created the first administrator. Password change is required after sign-in.');
} finally {
  await db.$disconnect();
}
