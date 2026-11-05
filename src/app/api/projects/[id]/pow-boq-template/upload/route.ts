import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseWorkbook } from '@/lib/excel/excel-workbook-parser';
import { extractBOQItems } from '@/lib/boq/boq-item-extractor';
import { validateFormulas } from '@/lib/excel/excel-formula-validator';
import { createHash } from 'node:crypto';
import { uploadToS3 } from '@/lib/s3';
import { verifyApiSession } from '@/lib/dal/auth';
import { actorCanAccessProject } from '@/lib/boq/workspace-service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }>}) {
  try {
    const actor = await verifyApiSession();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const projectId = (await params).id;
    if (!await actorCanAccessProject(actor, projectId, ['canEdit', 'canEditDraft'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Save Layer 1: Source File
    const stored = await uploadToS3(file.name, buffer, { contentType: file.type || 'application/octet-stream', module: 'PROJECT_MANAGEMENT', projectId, uploadedBy: actor.id });

    // 2. Create Upload Record
    const upload = await prisma.uploadedWorkbookFile.create({
      data: {
        projectId,
        originalFilename: file.name,
        fileHash: createHash('sha256').update(buffer).digest('hex'),
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        storagePath: stored.url,
        preservedOriginalUrl: stored.url,
        uploadedBy: actor.id,
        extractionStatus: 'PROCESSING'
      }
    });

    // 3. Parse & Snapshot Layer
    const { layout, cellCount, workbook } = await parseWorkbook(buffer, upload.id, projectId);
    const sheet = workbook.getWorksheet('BOQ_DATA_ENTRY');
    
    if (!sheet) {
      await prisma.uploadedWorkbookFile.update({
        where: { id: upload.id },
        data: { extractionStatus: 'FAILED', validationStatus: 'CRITICAL_ERROR', metadataJson: JSON.stringify({ error: "Missing BOQ_DATA_ENTRY sheet" }) }
      });
      return NextResponse.json({ error: 'Missing BOQ_DATA_ENTRY sheet' }, { status: 400 });
    }

    // 4. Extract BOQ Structured Data
    const { itemsCount } = await extractBOQItems(sheet, upload.id, projectId);

    // 5. Validate Formulas
    const validation = await validateFormulas(sheet, upload.id);

    // 6. Finalize Status
    const finalStatus = validation.success ? 'SUCCESS' : 'WARNINGS';
    await prisma.uploadedWorkbookFile.update({
      where: { id: upload.id },
      data: {
        commitStatus: 'PENDING',
        extractionStatus: 'SUCCESS',
        validationStatus: finalStatus,
        recognizedTemplate: "BOQ_TEMPLATE_V1",
        metadataJson: JSON.stringify({ cellCount, itemsCount, warnings: validation.warnings })
      }
    });

    // 7. Audit
    await prisma.workbookExtractionAudit.create({
      data: {
        uploadedWorkbookFileId: upload.id,
        projectId,
        action: 'TEMPLATE_UPLOADED_AND_PARSED',
        status: 'SUCCESS',
        message: `Parsed ${itemsCount} items. ${validation.criticalErrors} critical errors, ${validation.warnings} warnings.`
      }
    });

    return NextResponse.json({ success: true, uploadId: upload.id });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
