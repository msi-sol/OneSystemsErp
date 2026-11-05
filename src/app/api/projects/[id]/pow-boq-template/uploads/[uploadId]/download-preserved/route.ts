import { NextRequest, NextResponse } from 'next/server';
import { generatePreservedExport } from '@/lib/excel/excel-workbook-exporter';
import { verifyApiSession } from '@/lib/dal/auth';
import { actorCanAccessProject } from '@/lib/boq/workspace-service';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string, uploadId: string }>}) {
  try {
    const actor = await verifyApiSession();
    if (!actor) return new NextResponse('Unauthorized', { status: 401 });
    const { id, uploadId } = await params;
    if (!await actorCanAccessProject(actor, id, ['canView'])) return new NextResponse('Forbidden', { status: 403 });
    const upload = await prisma.uploadedWorkbookFile.findUnique({ where: { id: uploadId }, select: { projectId: true } });
    if (!upload || upload.projectId !== id) return new NextResponse('Not found', { status: 404 });
    const exportData = await generatePreservedExport(uploadId);
    
    return new NextResponse(new Uint8Array(exportData.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(exportData.filename)}`,
        'Cache-Control': 'private, no-store',
      }
    });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
