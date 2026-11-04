const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ where: { email: 'project_manager@demo.com' } });
  console.log('USERS:', users.length);
  
  // also check if a shared default password breaks anything?
  
  // Test updating the user explicitly
  if (users.length > 0) {
    const user = users[0];
    try {
      const res = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'PROJECT_MANAGER' }
      });
      console.log('Update success', res.role);
    } catch(e) {
      console.error('Update failed', e);
    }
  }
  
  // Let's test createSystemRole
  try {
    const roleName = 'PROJECT_MANAGER';
    const normalized = roleName.toUpperCase().replace(/\s+/g, '_').trim();
    console.log('Testing createSystemRole with', normalized);
    const existing = await prisma.systemRole.findUnique({
      where: { name: normalized }
    });
    console.log('SystemRole exists?', !!existing);
    
    if (!existing) {
      console.log('Creating SystemRole');
      await prisma.systemRole.create({
        data: { name: normalized }
      });
    }
    
    console.log('Testing role findFirst');
    const existingRbac = await prisma.role.findFirst({
      where: {
        OR: [
          { roleName: normalized },
          { roleCode: normalized }
        ]
      }
    });
    console.log('RBAC exists?', !!existingRbac);
    if (!existingRbac) {
      console.log('Creating RBAC');
      await prisma.role.create({
        data: {
          roleName: normalized,
          roleCode: normalized,
          description: normalized
        }
      });
    }
    console.log('createSystemRole logic success');
  } catch(e) {
    console.error('createSystemRole logic failed', e);
  }
  
  prisma.$disconnect();
}
main();
