// @ts-nocheck
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { readStoredUpload } from '@/lib/s3';

export async function generatePreservedExport(uploadedWorkbookFileId: string) {
  const upload = await prisma.uploadedWorkbookFile.findUnique({
    where: { id: uploadedWorkbookFileId }
  });

  if (!upload) throw new Error('Upload not found');

  const buffer = await readStoredUpload(upload.storagePath);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // In a full implementation, you would:
  // 1. Fetch any edits made by the user in the FortuneSheet grid from the DB
  // 2. Apply those edits to `workbook` here.
  // 3. Recalculate formulas if needed (though Excel usually recalculates on open)

  const outputBuffer = await workbook.xlsx.writeBuffer();
  
  return {
    buffer: Buffer.from(outputBuffer),
    filename: `Preserved_${upload.originalFilename}`
  };
}
