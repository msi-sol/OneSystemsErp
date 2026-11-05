import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { uploadFileToS3 } from '../services/s3.service';
import { privateUploadUrl } from '../../../../src/lib/s3';

export type ParsedBOQItem = {
  sourceRowNumber: number; itemCode: string; description: string; unit: string;
  quantity: number; materialUnitCost: number; laborUnitCost: number; equipmentUnitCost: number;
  directCost: number; ocmAmount: number; cpAmount: number; vatAmount: number;
  indirectCost: number; combinedUnitCost: number; totalCost: number; percentageOfTotal: number;
};

type UploadInput = {
  projectId?: string | null; projectName: string; location: string; subject: string;
  templateVersion: string; fileName: string; buffer: Buffer; items: ParsedBOQItem[];
  user: { id: string; role: string; name?: string | null };
  validationStatus: string; grandTotal: number; report: Record<string, unknown>;
};

export async function persistBOQUpload(input: UploadInput) {
  return prisma.$transaction(async (tx) => {
    const project = input.projectId
      ? await tx.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
      : await tx.project.create({ data: {
        name: input.projectName || input.fileName.replace(/\.[^/.]+$/, ''),
        location: input.location, description: input.subject || 'Uploaded from BOQ Template Center',
        status: 'PLANNING', contractAmount: input.grandTotal,
      }, select: { id: true } });
    if (!project) throw new Error('The target project was not found. Please select an existing project.');
    if (!input.projectId) {
      await tx.projectUserAssignment.create({ data: {
        projectId: project.id, userId: input.user.id, projectRole: input.user.role,
        accessLevel: 'READ_WRITE', assignmentStatus: 'active', assignedBy: input.user.id,
      } });
    }

    const safeName = `${randomUUID()}.xlsx`;
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    let storagePath: string;
    let fileUrl: string;
    {
      storagePath = `boq-uploads/${project.id}/${safeName}`;
      await uploadFileToS3(input.buffer, storagePath, mimeType, { module: 'PROJECT_MANAGEMENT', projectId: project.id, uploadedBy: input.user.id }, input.fileName);
      fileUrl = privateUploadUrl(storagePath);
      storagePath = `s3:${storagePath}`;
    }

    const report = { ...input.report, fileUrl };
    const upload = await tx.uploadedWorkbookFile.create({ data: {
      projectId: project.id, originalFilename: input.fileName,
      fileHash: createHash('sha256').update(input.buffer).digest('hex'),
      mimeType, fileSize: input.buffer.length, storagePath, preservedOriginalUrl: fileUrl,
      uploadedBy: input.user.id, templateCode: 'BOQ_TEMPLATE_CENTER', templateVersion: input.templateVersion,
      documentType: 'BOQ', recognizedTemplate: 'BOQ_TEMPLATE_V1',
      validationStatus: input.validationStatus === 'VALIDATION_FAILED' ? 'FAILED' : 'SUCCESS',
      extractionStatus: 'SUCCESS', commitStatus: 'PENDING',
      metadataJson: JSON.stringify({ source: 'BOQ_TEMPLATE_CENTER', status: input.validationStatus, report }),
      extractedItems: { create: input.items.map(item => ({
        projectId: project.id, sheetName: 'BOQ_DATA_ENTRY', sourceRowNumber: item.sourceRowNumber,
        itemNumber: item.itemCode, description: item.description, unit: item.unit, quantity: item.quantity,
        materialUnitCost: item.materialUnitCost, laborUnitCost: item.laborUnitCost, equipmentUnitCost: item.equipmentUnitCost,
        totalDirectCost: item.directCost, ocm: item.ocmAmount, cp: item.cpAmount, vat: item.vatAmount,
        totalIndirectCost: item.indirectCost, unitCost: item.combinedUnitCost, amount: item.totalCost,
        percentage: item.percentageOfTotal,
        validationStatus: input.validationStatus === 'VALIDATION_FAILED' ? 'FAILED' : 'SUCCESS',
      })) },
    } });

    await tx.workbookExtractionAudit.create({ data: {
      uploadedWorkbookFileId: upload.id, projectId: project.id,
      action: 'TEMPLATE_UPLOADED_AND_PARSED', status: input.validationStatus === 'VALIDATION_FAILED' ? 'FAILED' : 'SUCCESS',
      performedBy: input.user.id, performedByRole: input.user.role,
      message: `Parsed ${input.items.length} BOQ rows; ${input.validationStatus}.`,
    } });
    await tx.auditLog.create({ data: {
      userId: input.user.id, userRole: input.user.role, moduleName: 'BOQ_TEMPLATE_CENTER',
      transactionId: upload.id, actionType: 'FILE_UPLOADED_AND_VALIDATED',
      remarks: `Uploaded ${input.fileName}; ${input.validationStatus}.`,
    } });
    return { uploadId: upload.id, projectId: project.id, report };
  }, { maxWait: 5000, timeout: 30000 });
}
