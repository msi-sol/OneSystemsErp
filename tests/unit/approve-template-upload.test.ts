jest.mock('@/lib/prisma', () => ({ prisma: { uploadedWorkbookFile: { findUnique: jest.fn() } } }));
jest.mock('@/lib/scheduling/authUtils', () => ({ getSessionActor: jest.fn(), checkSchedulingAccess: jest.fn() }));
jest.mock('@/lib/boq/boq-template-commit-service', () => ({ commitTemplateToBOQ: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { commitTemplateToBOQ } from '@/lib/boq/boq-template-commit-service';
import { approveTemplateUploadForCurrentActor } from '@/lib/boq/approve-template-upload';

beforeEach(() => {
  jest.resetAllMocks();
  (getSessionActor as jest.Mock).mockResolvedValue({ id: 'verified-actor', role: 'PROJECT_DIRECTOR' });
  (prisma.uploadedWorkbookFile.findUnique as jest.Mock).mockResolvedValue({ projectId: 'stored-project' });
  (checkSchedulingAccess as jest.Mock).mockResolvedValue({ allowed: true });
  (commitTemplateToBOQ as jest.Mock).mockResolvedValue({ success: true, count: 2 });
});

test('requires project approval permission and commits using the verified actor and stored project', async () => {
  await expect(approveTemplateUploadForCurrentActor('upload-1', 'stored-project')).resolves.toEqual({ success: true, count: 2 });
  expect(checkSchedulingAccess).toHaveBeenCalledWith('verified-actor', 'PROJECT_DIRECTOR', 'stored-project', 'canApprove');
  expect(commitTemplateToBOQ).toHaveBeenCalledWith('upload-1', 'stored-project', 'verified-actor');
});

test('resolves the upload project when no caller project is supplied', async () => {
  await approveTemplateUploadForCurrentActor('upload-1');
  expect(commitTemplateToBOQ).toHaveBeenCalledWith('upload-1', 'stored-project', 'verified-actor');
});

test('rejects unauthenticated actors before reading the upload', async () => {
  (getSessionActor as jest.Mock).mockRejectedValue(new Error('UNAUTHORIZED: No active session'));
  await expect(approveTemplateUploadForCurrentActor('upload-1')).rejects.toThrow('UNAUTHORIZED');
  expect(prisma.uploadedWorkbookFile.findUnique).not.toHaveBeenCalled();
  expect(commitTemplateToBOQ).not.toHaveBeenCalled();
});

test('rejects users who can view but cannot approve the project', async () => {
  (checkSchedulingAccess as jest.Mock).mockResolvedValue({ allowed: false });
  await expect(approveTemplateUploadForCurrentActor('upload-1')).rejects.toThrow('permission to approve');
  expect(commitTemplateToBOQ).not.toHaveBeenCalled();
});

test('rejects a caller project mismatch before permission checks or commit', async () => {
  await expect(approveTemplateUploadForCurrentActor('upload-1', 'other-project')).rejects.toThrow('not found');
  expect(checkSchedulingAccess).not.toHaveBeenCalled();
  expect(commitTemplateToBOQ).not.toHaveBeenCalled();
});

test('rejects missing uploads without checking access or committing', async () => {
  (prisma.uploadedWorkbookFile.findUnique as jest.Mock).mockResolvedValue(null);
  await expect(approveTemplateUploadForCurrentActor('missing-upload')).rejects.toThrow('not found');
  expect(checkSchedulingAccess).not.toHaveBeenCalled();
  expect(commitTemplateToBOQ).not.toHaveBeenCalled();
});

test('propagates commit validation failures', async () => {
  (commitTemplateToBOQ as jest.Mock).mockRejectedValue(new Error('Contract mismatch'));
  await expect(approveTemplateUploadForCurrentActor('upload-1')).rejects.toThrow('Contract mismatch');
});
