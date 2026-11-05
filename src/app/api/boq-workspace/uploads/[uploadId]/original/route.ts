import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { actorCanAccessProject, readWorkspaceOriginal } from '@/lib/boq/workspace-service';
import { WorkspaceError } from '@/lib/boq/workspace-types';

export async function GET(_request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  try {
    const actor = await getSessionActor();
    const { uploadId } = await params;
    const upload = await prisma.uploadedWorkbookFile.findUnique({
      where: { id: uploadId },
      select: { id: true, projectId: true, storagePath: true, originalFilename: true },
    });
    if (!upload || !upload.storagePath.startsWith('s3:') && !upload.storagePath.startsWith('.runtime/boq-workspace/') && !upload.storagePath.startsWith('retained:boq-workspace/')) {
      return new NextResponse('Not found', { status: 404 });
    }
    if (!await actorCanAccessProject(actor, upload.projectId, ['canView'])) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }
    const buffer = await readWorkspaceOriginal(upload.storagePath);
    const fileName = upload.originalFilename.replace(/[\r\n"\\]/g, '_');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(upload.originalFilename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceError) return new NextResponse(error.message, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return new NextResponse('Unauthorized', { status: 401 });
    return new NextResponse('The original workbook is unavailable.', { status: 500 });
  }
}
