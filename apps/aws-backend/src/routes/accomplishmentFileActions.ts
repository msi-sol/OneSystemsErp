import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { uploadToS3 as put, readStoredUpload, type UploadContext } from '../../../../src/lib/s3';
import ExcelJS from "exceljs";

const router = Router();

// Helper function, moved from original Next.js Server Action
async function saveFileLocallyOrBlob(directory: string, fileName: string, buffer: Buffer, contentType: string | undefined, context: UploadContext): Promise<string> {
  const stored = await put(fileName, buffer, { ...context, contentType: contentType || 'application/octet-stream' });
  return stored.url;
}

// Handler for uploadAccomplishmentFileAction
router.post('/uploadAccomplishmentFileAction', async (req, res) => {
  try {
    const { projectId, base64File, fileName, fileType, fileSize, currentUserId } = req.body;

    if (!base64File || !fileName || !projectId) {
      return res.status(400).json({ success: false, error: "Missing required file data or project ID" });
    }

    const buffer = Buffer.from(base64File, 'base64');

    const uniqueId = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const newFileName = `${uniqueId}-${sanitizedFileName}`;

    const publicPath = await saveFileLocallyOrBlob("accomplishments", newFileName, buffer, fileType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", { module: 'ACCOMPLISHMENTS', projectId, uploadedBy: String(req.headers['x-user-session'] || '') });

    const newFileRecord = await prisma.projectAccomplishmentFile.create({
      data: {
        projectId: projectId,
        fileName: fileName,
        originalFilePath: publicPath,
        fileSize: fileSize,
        fileType: fileType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        isLockedOriginal: false,
        uploadedById: String(req.headers['x-user-session'] || ''),
        status: "UPLOADED",
        fileVersion: 1, // Initial version
        workingFilePath: publicPath, // Initial working path is the original
      },
    });

    res.json({ success: true, file: newFileRecord });
  } catch (error: any) {
    console.error("Error in uploadAccomplishmentFileAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed to upload file" });
  }
});

// Handler for deleteAccomplishmentFileAction
router.post('/deleteAccomplishmentFileAction', async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ success: false, error: "File ID is required" });
    }

    const fileRecord = await prisma.projectAccomplishmentFile.findUnique({
      where: { id: fileId }
    });

    if (!fileRecord) {
      return res.status(404).json({ success: false, error: "File not found" });
    }

    // Optional: Add logic to delete physical file from S3/local storage here if necessary
    // await deleteFileFromS3(fileRecord.originalFilePath);

    await prisma.projectAccomplishmentFile.delete({
      where: { id: fileId }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error in deleteAccomplishmentFileAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed to delete file" });
  }
});

// Handler for extractAccomplishmentDataAction
router.post('/extractAccomplishmentDataAction', async (req, res) => {
  try {
    // Original just had a setTimeout and returned a static message. fileId is not used in logic.
    await new Promise(r => setTimeout(r, 1500));
    res.json({ success: true, message: "Data successfully extracted to database without altering the original file." });
  } catch (error: any) {
    console.error("Error in extractAccomplishmentDataAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed to extract data" });
  }
});

// Handler for aiValidateAccomplishmentAction
router.post('/aiValidateAccomplishmentAction', async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ success: false, error: "File ID is required" });
    }

    await new Promise(r => setTimeout(r, 2000));

    const file = await prisma.projectAccomplishmentFile.findUnique({ where: { id: fileId } });
    if (file) {
      await prisma.projectAccomplishmentAIFinding.create({
        data: {
          fileId: file.id,
          projectId: file.projectId,
          findingType: "MISSING_SIGNATURE",
          description: "The AI detected that the Sign Off section is missing a required signature.",
          severity: "WARNING",
          recommendation: "Ensure the document is physically signed before final approval."
        }
      });
    }

    res.json({ success: true, message: "AI Validation complete. Findings generated." });
  } catch (error: any) {
    console.error("Error in aiValidateAccomplishmentAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed AI Validation" });
  }
});

// Handler for createWorkingCopyAction
router.post('/createWorkingCopyAction', async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ success: false, error: "File ID is required" });
    }

    const fileRecord = await prisma.projectAccomplishmentFile.findUnique({
      where: { id: fileId }
    });

    if (!fileRecord) return res.status(404).json({ success: false, error: "File not found" });

    if (fileRecord.workingFilePath) return res.json({ success: true, message: "Working copy already exists", workingFilePath: fileRecord.workingFilePath });

    const uniqueId = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const sanitizedFileName = fileRecord.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const newFileName = `working-${uniqueId}-${sanitizedFileName}`;

    let sourcePath = fileRecord.originalFilePath;
    let sourceBuffer: Buffer;
    // Assuming file is accessible via HTTP or S3 direct URL for the backend
    try {
      sourceBuffer = await readStoredUpload(sourcePath);
    } catch (fetchError: any) {
      console.error("Error fetching source file for working copy:", fetchError);
      return res.status(500).json({ success: false, error: `Failed to fetch original file: ${fetchError.message}` });
    }

    const publicPath = await saveFileLocallyOrBlob("accomplishments", newFileName, sourceBuffer, fileRecord.fileType, { module: 'ACCOMPLISHMENTS', projectId: fileRecord.projectId, uploadedBy: String(req.headers['x-user-session'] || '') });

    const updatedFileRecord = await prisma.projectAccomplishmentFile.update({
      where: { id: fileId },
      data: {
        workingFilePath: publicPath,
      },
    });

    res.json({ success: true, workingFilePath: publicPath, file: updatedFileRecord });
  } catch (error: any) {
    console.error("Error in createWorkingCopyAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed to create working copy" });
  }
});

// Handler for saveFileEditAction
router.post('/saveFileEditAction', async (req, res) => {
  try {
    const { fileId, base64Data, isLocked } = req.body;

    if (!fileId || !base64Data) {
      return res.status(400).json({ success: false, error: "File ID and base64Data are required" });
    }

    const fileRecord = await prisma.projectAccomplishmentFile.findUnique({
      where: { id: fileId }
    });

    if (!fileRecord) return res.status(404).json({ success: false, error: "File not found" });

    if (fileRecord.isLockedOriginal) return res.status(409).json({ success: false, error: 'This billing document is locked. Create a successive billing to make changes.' });

    const uniqueId = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const sanitizedFileName = fileRecord.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const newFileName = `v${fileRecord.fileVersion + 1}-${uniqueId}-${sanitizedFileName}`;

    const buffer = Buffer.from(base64Data, "base64");

    const publicPath = await saveFileLocallyOrBlob("accomplishments", newFileName, buffer, fileRecord.fileType, { module: 'ACCOMPLISHMENTS', projectId: fileRecord.projectId, uploadedBy: String(req.headers['x-user-session'] || '') });

    const versionNumber = fileRecord.fileVersion + 1;

    const newVersion = await prisma.projectAccomplishmentFileVersion.create({
      data: {
        fileId: fileRecord.id,
        versionNumber,
        filePath: publicPath,
      }
    });

    const updatedFile = await prisma.projectAccomplishmentFile.update({
        where: { id: fileId },
        data: {
            fileVersion: versionNumber,
            workingFilePath: publicPath,
            fileSize: buffer.length,
            ...(isLocked === true ? { isLockedOriginal: true, status: 'BILLING' } : {}),
        }
    });

    res.json({ success: true, file: updatedFile, version: newVersion });
  } catch (error: any) {
    console.error("Error in saveFileEditAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed to save file edits" });
  }
});

// Handler for saveAsNewAccomplishmentFileAction
router.post('/saveAsNewAccomplishmentFileAction', async (req, res) => {
  try {
    const { projectId, base64Data, newFileName, originalFileType, isLocked } = req.body;

    if (!projectId || !base64Data || !newFileName || !originalFileType) {
      return res.status(400).json({ success: false, error: "Missing required data for saving new file" });
    }

    const uniqueId = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const sanitizedFileName = newFileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const newPhysicalFileName = `v1-${uniqueId}-${sanitizedFileName}`;

    const buffer = Buffer.from(base64Data, "base64");

    const publicPath = await saveFileLocallyOrBlob("accomplishments", newPhysicalFileName, buffer, originalFileType, { module: 'ACCOMPLISHMENTS', projectId, uploadedBy: String(req.headers['x-user-session'] || '') });

    const newFile = await prisma.projectAccomplishmentFile.create({
      data: {
        projectId,
        fileName: newFileName,
        originalFilePath: publicPath,
        fileSize: buffer.length,
        fileType: originalFileType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        isLockedOriginal: isLocked,
        status: isLocked ? "BILLING" : "ACTIVE",
        fileVersion: 1,
        workingFilePath: publicPath,
      },
    });

    res.json({ success: true, file: newFile });
  } catch (error: any) {
    console.error("Error in saveAsNewAccomplishmentFileAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed to save as new file" });
  }
});

// Handler for createSuccessiveBillingAction
router.post('/createSuccessiveBillingAction', async (req, res) => {
  try {
    const { projectId, templateFileId } = req.body;

    if (!projectId || !templateFileId) {
      return res.status(400).json({ success: false, error: "Project ID and template file ID are required" });
    }

    const latestBilling = await prisma.projectAccomplishmentFile.findUnique({
      where: {
        id: templateFileId
      }
    });

    if (!latestBilling) {
      return res.status(404).json({ success: false, error: "The selected previously locked billing could not be found." });
    }

    const fileUrl = latestBilling.workingFilePath || latestBilling.originalFilePath;

    let nextNumber = 2;
    let baseName = "PROGRESS BILLING";
    let ext = ".xlsx";

    const match = latestBilling.fileName.match(/(.*BILLING) (\d+)(.*)/i);
    if (match) {
      baseName = match[1].trim();
      nextNumber = parseInt(match[2]) + 1;
      ext = match[3];
    } else {
      const dotIdx = latestBilling.fileName.lastIndexOf('.');
      if (dotIdx !== -1) {
        baseName = latestBilling.fileName.substring(0, dotIdx);
        ext = latestBilling.fileName.substring(dotIdx);
      } else {
        baseName = latestBilling.fileName;
        ext = "";
      }
    }

    const newFileName = `${baseName} ${nextNumber}${ext}`;

    const uniqueId = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const sanitizedFileName = newFileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const newPhysicalFileName = `${uniqueId}-${sanitizedFileName}`;

    let finalBuffer: Buffer;

    try {
      let sourceBuffer: Buffer;
      // Backend needs to fetch files, potentially from S3 or its own local storage
      sourceBuffer = await readStoredUpload(fileUrl);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(sourceBuffer as any);
      const worksheet = workbook.worksheets[0];

      if (worksheet) {
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            const col13Value = row.getCell(13).value;
            let newCol11Val: any = 0;

            if (col13Value !== null && col13Value !== undefined) {
              newCol11Val = typeof col13Value === 'object' && col13Value !== null ? (col13Value as any).result : col13Value;
              row.getCell(11).value = Number(newCol11Val) || 0;
            } else {
              const c11 = row.getCell(11).value;
              newCol11Val = typeof c11 === 'object' && c11 !== null ? (c11 as any).result : c11;
            }

            let currentCol10Val: any = row.getCell(10).value;

            const baseCol10 = Number(currentCol10Val) || 0;
            if (Number(newCol11Val) > 0 || baseCol10 > 0) {
              const computedResult = baseCol10 - (Number(newCol11Val) || 0);
              row.getCell(12).value = { formula: `J${rowNumber}-K${rowNumber}`, result: computedResult };
            } else {
              row.getCell(12).value = null;
            }
          }
        });
        const uint8Array = await workbook.xlsx.writeBuffer();
        finalBuffer = Buffer.from(uint8Array);
      } else {
        finalBuffer = sourceBuffer; // If no worksheet found, just use the original buffer
      }
    } catch (excelError: any) {
      console.error("Failed to manipulate Excel columns (backend):", excelError);
      // Fallback: if excel manipulation fails, just re-upload the original content
      try {
        finalBuffer = await readStoredUpload(fileUrl);
      } catch (fallbackFetchError: any) {
        console.error("Failed to fetch original file even in fallback:", fallbackFetchError);
        return res.status(500).json({ success: false, error: `Failed to process or fetch original file: ${fallbackFetchError.message}` });
      }
    }

    const publicPath = await saveFileLocallyOrBlob("accomplishments", newPhysicalFileName, finalBuffer, latestBilling.fileType, { module: 'ACCOMPLISHMENTS', projectId, uploadedBy: String(req.headers['x-user-session'] || '') });

    const newBillingFile = await prisma.projectAccomplishmentFile.create({
      data: {
        projectId,
        fileName: newFileName,
        originalFilePath: publicPath,
        fileSize: finalBuffer.length,
        fileType: latestBilling.fileType,
        status: "BILLING",
        isLockedOriginal: false,
        fileVersion: 1,
        workingFilePath: publicPath,
      }
    });

    res.json({ success: true, message: `Created ${newFileName} successfully!`, file: newBillingFile });
  } catch (error: any) {
    console.error("Error in createSuccessiveBillingAction (backend):", error);
    res.status(500).json({ success: false, error: error.message || "Failed to create successive billing" });
  }
});

export default router;
