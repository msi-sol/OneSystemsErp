import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getSystemRoles } from '@/app/actions/user';
import EditUserClient from './EditUserClient';
import UserTabs from './UserTabs';
import ProjectAccessClient from './ProjectAccessClient';
import { requireUserAdminPage } from '../require-user-admin-page';

export const dynamic = 'force-dynamic';

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUserAdminPage();

  // Await params to avoid Next.js 15 sync access warnings
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      projectAssignments: {
        include: {
          project: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!user) {
    notFound();
  }

  const roles = await getSystemRoles();
  
  // Fetch active projects for assignment dropdown
  const availableProjects = await prisma.project.findMany({
    where: { status: { notIn: ['COMPLETED', 'ARCHIVED'] } },
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '1.8rem', color: 'var(--text-primary)', marginBottom: '5px' }}>{user.name || 'User Profile'}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>{user.role} | {user.email}</p>
      </header>

      <UserTabs 
        profileContent={
          <EditUserClient 
            roles={roles}
            user={{
              id: user.id,
              name: user.name || '',
              email: user.email || '',
              role: user.role
            }} 
          />
        }
        projectAccessContent={
          <ProjectAccessClient 
            userId={user.id}
            assignments={user.projectAssignments}
            availableProjects={availableProjects}
          />
        }
      />
    </div>
  );
}
