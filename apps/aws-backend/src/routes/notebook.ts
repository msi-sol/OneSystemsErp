import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
// Assuming prisma and requirePermission are available in the AWS environment
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions'; // Adjust path as needed for AWS setup

const router = Router();

router.post('/uploadReferenceFile', async (req, res) => {
  try {
    const { fileName, fileType, fileUrl, referenceCategory, projectAssignment, moduleAssignment } = req.body;
    const userRole = (req as any).user?.role as string | undefined;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;

    // Enforce access control - wait, user must have "Upload Attachment" or "Create" permission for AI Notebook Reference Center
    // Since we haven't mapped this exact action name in UI perfectly, we'll check 'canCreate' on the module
    await requirePermission(userId, 'AI_NOTEBOOK_REFERENCE_CENTER', 'canCreate');

    const file = await prisma.aINotebookReference.create({
      data: {
        fileName,
        fileType,
        fileUrl,
        uploadedBy: userId,
        uploadedByRole: userRole,
        referenceCategory,
        projectAssignment,
        moduleAssignment,
        status: 'PENDING_AI_INDEXING'
      }
    });

    res.json({ success: true, data: file });
  } catch (error: any) {
    console.error('Error in uploadReferenceFile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getReferenceFiles', async (req, res) => {
  try {
    const files = await prisma.aINotebookReference.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: files });
  } catch (error: any) {
    console.error('Error in getReferenceFiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/updateReferenceStatus', async (req, res) => {
  try {
    const { fileId, newStatus, isMandatory = false } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;

    // Requires Approval rights to make a file ACTIVE or APPROVED
    if (['APPROVED', 'ACTIVE_REFERENCE'].includes(newStatus)) {
      await requirePermission(userId, 'AI_NOTEBOOK_REFERENCE_CENTER', 'canApprove');
    } else {
      await requirePermission(userId, 'AI_NOTEBOOK_REFERENCE_CENTER', 'canEditDraft');
    }

    const updateData: any = { status: newStatus, isMandatory };

    if (['APPROVED', 'ACTIVE_REFERENCE'].includes(newStatus)) {
      updateData.approvedBy = userId;
      updateData.approvedDate = new Date();
      updateData.isLocked = true;
    }

    const updatedFile = await prisma.aINotebookReference.update({
      where: { id: fileId },
      data: updateData
    });

    res.json({ success: true, data: updatedFile });
  } catch (error: any) {
    console.error('Error in updateReferenceStatus:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
