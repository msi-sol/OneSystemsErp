import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/dal/auth';
import { getUserPermissions } from '@/lib/permissions';

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

    await prisma.$transaction([
      prisma.worker.deleteMany({ where: { isSeedData: true } }),
      prisma.supplier.deleteMany({ where: { isSeedData: true } }),
      prisma.subcontractor.deleteMany({ where: { isSeedData: true } }),
    ]);
    
    return NextResponse.json({ message: 'Seed data cleared successfully' });
  } catch (error) {
    console.error('Clear seed error:', error);
    return NextResponse.json(
      { error: 'Failed to clear seed data. Check server logs.' },
      { status: 500 }
    );
  }
}
