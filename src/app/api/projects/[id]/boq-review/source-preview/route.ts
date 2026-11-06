import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { previewSourceWorkbook } from '@/lib/boq/source-preview';
import { MAX_WORKSPACE_FILE_BYTES } from '@/lib/boq/workspace-parser';
import { readWorkspaceOriginal } from '@/lib/boq/workspace-service';
import { WorkspaceError } from '@/lib/boq/workspace-types';

type Context = { params: Promise<{ id: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await getSessionActor();
    const { id: projectId } = await params;
    const capacity = await planningCapacity(actor, projectId);
    if (!capacity.canView) return json({ error: 'You do not have access to this project.' }, 403);

    const query = new URL(request.url).searchParams;
    const versionIds = query.getAll('versionId');
    const sheetNames = query.getAll('sheet');
    const offsets = query.getAll('offset');
    if (versionIds.length !== 1 || !versionIds[0]?.trim() || versionIds[0].length > 191) {
      return json({ error: 'Choose a BOQ version to preview.' }, 400);
    }
    if (sheetNames.length > 1 || (sheetNames.length === 1 && !sheetNames[0]?.trim())) {
      return json({ error: 'Choose one exact source sheet name.' }, 400);
    }
    if (offsets.length > 1 || (offsets.length === 1 && !/^(0|[1-9]\d*)$/.test(offsets[0]!))) {
      return json({ error: 'The source row offset must be a non-negative whole number.' }, 400);
    }
    const offset = offsets.length ? Number(offsets[0]) : 0;
    if (!Number.isSafeInteger(offset)) return json({ error: 'The source row offset is outside the supported range.' }, 400);

    const version = await prisma.projectBOQVersion.findFirst({
      where: { id: versionIds[0]!, projectId },
      select: { id: true, sourceUploadedWorkbookFileId: true },
    });
    if (!version?.sourceUploadedWorkbookFileId) return json({ error: 'The original source workbook was not found for this BOQ version.' }, 404);

    const upload = await prisma.uploadedWorkbookFile.findFirst({
      where: { id: version.sourceUploadedWorkbookFileId, projectId },
      select: { id: true, fileSize: true, originalFilename: true, storagePath: true },
    });
    if (!upload || !upload.storagePath) return json({ error: 'The original source workbook is unavailable.' }, 404);
    if (!/\.xlsx$/i.test(upload.originalFilename)) {
      return json({ error: 'Source preview supports .xlsx workbooks only. Download the original PDF or DOCX to view it.' }, 415);
    }
    if (upload.fileSize > MAX_WORKSPACE_FILE_BYTES) {
      return json({ error: 'The workbook must be 10 MiB or smaller.' }, 413);
    }

    const buffer = await readWorkspaceOriginal(upload.storagePath);
    const preview = await previewSourceWorkbook({
      buffer,
      fileName: upload.originalFilename,
      sheetName: sheetNames[0],
      offset,
    });
    return json({ versionId: version.id, ...preview });
  } catch (error) {
    if (error instanceof WorkspaceError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) {
      return json({ error: 'Sign in to preview this source workbook.' }, 401);
    }
    return json({ error: 'The original source workbook could not be previewed.' }, 500);
  }
}
