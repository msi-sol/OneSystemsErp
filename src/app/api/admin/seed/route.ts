import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/dal/auth';
import { getUserPermissions } from '@/lib/permissions';
import { seedWorkers } from '../../../../../prisma/seeders/seed-workers';
import { seedSuppliers } from '../../../../../prisma/seeders/seed-suppliers';
import { seedSubcontractors } from '../../../../../prisma/seeders/seed-subcontractors';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const actor = await verifySession();
    if (!actor || actor.mustChangePassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const permissions = await getUserPermissions(actor.id);
    if (!permissions.IS_ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    await seedWorkers();
    await seedSuppliers();
    await seedSubcontractors();
    
    return NextResponse.json({ message: 'Seed data generated successfully' });
  } catch (error) {
    console.error('Seeding error:', error);
    return NextResponse.json(
      { error: 'Failed to generate seed data. Check server logs.' },
      { status: 500 }
    );
  }
}
