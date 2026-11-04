import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';

export interface TemporaryCredential {
  email: string;
  name: string;
  roleCode: string;
  temporaryPassword: string;
}

export const ROLE_ACCOUNTS = [
  { email: 'director@onesystemserp.com', name: 'Project Director', roleCode: 'PROJECT_DIRECTOR' },
  { email: 'manager@onesystemserp.com', name: 'Project Manager', roleCode: 'PROJECT_MANAGER' },
  { email: 'purchasing@onesystemserp.com', name: 'Purchasing Officer', roleCode: 'PURCHASING_OFFICER' },
  { email: 'finance@onesystemserp.com', name: 'Finance Officer', roleCode: 'FINANCE_OFFICER' },
  { email: 'accounting@onesystemserp.com', name: 'Accountant', roleCode: 'ACCOUNTANT' },
  { email: 'billing@onesystemserp.com', name: 'Billing Engineer', roleCode: 'BILLING_ENGINEER' },
  { email: 'engineer@onesystemserp.com', name: 'Site Engineer', roleCode: 'SITE_ENGINEER' },
  { email: 'admin@onesystemserp.com', name: 'Site Admin', roleCode: 'SITE_ADMIN' },
];

export function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url');
}

// Creates any missing role account with its own one-time password. Existing accounts
// keep their credentials. The returned passwords exist nowhere else, so callers must
// only hand them out after the surrounding transaction has committed.
export async function seedRoleAccounts(tx: Prisma.TransactionClient) {
  const issued: TemporaryCredential[] = [];

  for (const account of ROLE_ACCOUNTS) {
    let user = await tx.user.findFirst({ where: { email: account.email } });
    if (!user) {
      const temporaryPassword = generateTemporaryPassword();
      user = await tx.user.create({
        data: {
          name: account.name,
          email: account.email,
          passwordHash: await bcrypt.hash(temporaryPassword, 12),
          mustChangePassword: true,
          role: account.roleCode,
          status: 'ACTIVE',
          defaultRole: account.roleCode,
        },
      });
      issued.push({ ...account, temporaryPassword });
    } else {
      user = await tx.user.update({
        where: { id: user.id },
        data: { role: account.roleCode, defaultRole: account.roleCode },
      });
    }

    const roleRecord = await tx.role.findFirst({ where: { roleCode: account.roleCode } });
    if (roleRecord) {
      const existingUserRole = await tx.userRole.findFirst({
        where: { userId: user.id, roleId: roleRecord.id },
      });
      if (!existingUserRole) {
        await tx.userRole.create({
          data: { userId: user.id, roleId: roleRecord.id },
        });
      }
    }
  }

  return issued;
}
