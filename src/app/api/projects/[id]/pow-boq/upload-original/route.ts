import { verifySession } from '@/lib/dal/auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { uploadToS3 } from '@/lib/s3';
import { actorCanAccessProject } from '@/lib/boq/workspace-service';
import crypto from 'crypto';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }>}) {
  try {
    const cookieStore = await cookies();
    const __session = await verifySession();
  const userId = __session?.id || '';
    const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;
    if (!await actorCanAccessProject(user, projectId, ['canEdit', 'canEditDraft'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const templateCode = formData.get('templateCode') as string || 'POW_BOQ_TEMPLATE';
    const templateVersion = formData.get('templateVersion') as string || '1.0';

    if (!file || !file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Only .xlsx files are supported.' }, { status: 400 });
    }

    // 1. Generate unique file path and hash
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const stored = await uploadToS3(file.name, buffer, { contentType: file.type || 'application/octet-stream', module: 'PROJECT_MANAGEMENT', projectId, uploadedBy: user.id });

    // 3. Store metadata in database
    const uploadedFile = await prisma.uploadedWorkbookFile.create({
      data: {
        projectId,
        templateCode,
        templateVersion,
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        fileHash: hash,
        storagePath: stored.url,
        preservedOriginalUrl: stored.url,
        uploadedBy: user.id || 'system',
        validationStatus: 'PENDING',
        extractionStatus: 'PENDING',
        commitStatus: 'PENDING'
      }
    });

    return NextResponse.json({ 
      success: true, 
      uploadId: uploadedFile.id,
      file: uploadedFile
    });

  } catch (error: any) {
    console.error('Error uploading original workbook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
