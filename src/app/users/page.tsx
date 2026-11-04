// @ts-nocheck
import styles from './page.module.css';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

import AddUserButton from './AddUserButton';
import ManageRolesButton from './ManageRolesButton';
import DeleteUserButton from './DeleteUserButton';
import { getSystemRoles } from '@/app/actions/user';
import { requireUserAdminPage } from './require-user-admin-page';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  await requireUserAdminPage();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
  });
  const roles = await getSystemRoles();
  
  const rbacRoles = await prisma.role.findMany({ orderBy: { roleName: 'asc' } });
  const modules = await prisma.module.findMany({ orderBy: { moduleName: 'asc' } });
  const permissions = await prisma.rolePermission.findMany();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>System Users</h1>
          <p>Manage access and roles for all personnel.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ManageRolesButton roles={roles} rbacRoles={rbacRoles} modules={modules} permissions={permissions} />
          <AddUserButton roles={roles} />
        </div>
      </header>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>No users found.</td>
              </tr>
            ) : users.map(user => (
              <tr key={user.id}>
                <td>
                  <div className={styles.userName}>{user.name}</div>
                </td>
                <td>{user.email || 'N/A'}</td>
                <td>
                  <span className={styles.roleBadge}>{user.role}</span>
                </td>
                <td>
                  <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Link href={`/users/${user.id}`} className={styles.actionLink}>Edit</Link>
                    <DeleteUserButton userId={user.id} userName={user.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
