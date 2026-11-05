import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readStoredUpload } from '@/lib/s3';
import { readWorkspaceOriginal, actorCanAccessProject } from '@/lib/boq/workspace-service';
import { verifyApiSession } from '@/lib/dal/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string, uploadId: string }>}) {
  try {
    const actor = await verifyApiSession();
    if (!actor) return new NextResponse('Unauthorized', { status: 401 });
    const { id: projectId, uploadId } = await params;
    if (!await actorCanAccessProject(actor, projectId, ['canView'])) return new NextResponse('Forbidden', { status: 403 });
    const upload = await prisma.uploadedWorkbookFile.findUnique({
      where: { id: uploadId }
    });
    if (!upload || upload.projectId !== projectId) return new NextResponse('Not found', { status: 404 });

    const buffer = /^\.runtime\/boq-workspace\/|^retained:boq-workspace\//.test(upload.storagePath)
      ? await readWorkspaceOriginal(upload.storagePath) : await readStoredUpload(upload.storagePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(upload.originalFilename)}`,
        'Cache-Control': 'private, no-store',
      }
    });
  } catch (error: any) {
    return new NextResponse(error.message, { status: 500 });
  }
}
