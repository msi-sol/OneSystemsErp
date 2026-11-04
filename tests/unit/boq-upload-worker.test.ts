jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('../../apps/aws-backend/src/services/s3.service', () => ({ uploadFileToS3: jest.fn() }));

import ExcelJS from 'exceljs';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { runBoqUploadJob } from '../../apps/aws-backend/src/jobs/boqWorker';
import { prisma } from '../../apps/aws-backend/src/lib/prisma';

const actor = { id: 'actor-1', role: 'SUPER_ADMIN', name: 'Test actor' };
let uploadData: Record<string, unknown> | undefined;
let failSave = false;
let committed = false;
let fileWrite: jest.SpyInstance;
let directoryCreate: jest.SpyInstance;
let errorLog: jest.SpyInstance;
const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
const tx = {
  project: { create: jest.fn(), findUnique: jest.fn() },
  projectUserAssignment: { create: jest.fn() },
  uploadedWorkbookFile: { create: jest.fn() },
  workbookExtractionAudit: { create: jest.fn() },
  auditLog: { create: jest.fn() },
};

async function encodedWorkbook(options: { sheet?: string; headers?: boolean; valid?: boolean; spacedTotal?: boolean } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(options.sheet || 'BOQ_DATA_ENTRY');
  sheet.getCell('A2').value = 'PROJECT:';
  sheet.getCell('B2').value = 'SAMPLE - BOQ Upload Test';
  sheet.getCell('I4').value = 0.08; sheet.getCell('J4').value = 0.08; sheet.getCell('K4').value = 0.05;
  if (options.headers !== false) sheet.getRow(5).values = ['ITEM', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'MATERIAL', 'LABOR', 'EQUIPMENT', 'TOTAL DIRECT COST', 'OCM', 'CP', 'VAT', 'TOTAL INDIRECT COST', 'UNIT COST', 'AMOUNT', '% OF TOTAL'];
  sheet.getRow(6).values = ['1', 'Concrete', options.valid === false ? '' : 'm3', 2, 20, 20, 10, 50, 0, 0, 0, 0, 50, 100, 1];
  sheet.getRow(options.spacedTotal ? 162 : 7).values = ['GRAND TOTAL', '', '', '', '', '', '', '', '', '', '', '', '', 100, 1];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

beforeEach(() => {
  jest.resetAllMocks();
  uploadData = undefined; failSave = false; committed = false;
  delete process.env.AWS_ACCESS_KEY_ID;
  fileWrite = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  directoryCreate = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  tx.project.create.mockResolvedValue({ id: 'new-project' });
  tx.project.findUnique.mockResolvedValue({ id: 'existing-project' });
  tx.uploadedWorkbookFile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    if (failSave) throw new Error('Save failed');
    uploadData = data;
    // Validate real model fields so a made-up legacy delegate/column cannot pass.
    const model = Prisma.dmmf.datamodel.models.find(model => model.name === 'UploadedWorkbookFile')!;
    for (const key of Object.keys(data)) expect(model.fields.some(field => field.name === key)).toBe(true);
    return { id: 'upload-1' };
  });
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
    const result = await callback(tx);
    committed = true;
    return result;
  });
});

afterEach(() => {
  fileWrite.mockRestore(); directoryCreate.mockRestore(); errorLog.mockRestore();
  if (originalAccessKey === undefined) delete process.env.AWS_ACCESS_KEY_ID;
  else process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
});

test.each([null, 'existing-project'])('parses and saves a valid workbook with project %s', async (projectId) => {
  const bytes = await encodedWorkbook();
  const result = await runBoqUploadJob('job', projectId, bytes.toString('base64'), 'sample.xlsx', actor);
  expect(result).toMatchObject({ success: true, uploadId: 'upload-1', status: 'DRAFT_UPLOADED', report: { grandTotal: 100, validRowsCount: 1, errors: [] } });
  expect(committed).toBe(true);
  expect(uploadData).toMatchObject({ originalFilename: 'sample.xlsx', uploadedBy: actor.id, fileSize: bytes.length,
    fileHash: createHash('sha256').update(bytes).digest('hex'), validationStatus: 'SUCCESS', commitStatus: 'PENDING',
    extractedItems: { create: [expect.objectContaining({ description: 'Concrete', quantity: 2, amount: 100 })] },
  });
  expect(fileWrite).toHaveBeenCalledWith(expect.stringContaining('boq-uploads'), bytes, { flag: 'wx' });
  expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: actor.id, transactionId: 'upload-1' }) });
  expect(tx.workbookExtractionAudit.create).toHaveBeenCalled();
  if (projectId) {
    expect(tx.project.create).not.toHaveBeenCalled();
    expect(tx.projectUserAssignment.create).not.toHaveBeenCalled();
  } else {
    expect(tx.project.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contractAmount: 100 }) }));
    expect(tx.projectUserAssignment.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      projectId: 'new-project', userId: actor.id, projectRole: actor.role, assignmentStatus: 'active',
    }) });
  }
});

test.each([{ sheet: 'Wrong sheet' }, { headers: false }])('malformed workbook creates no project or upload: %j', async options => {
  const bytes = await encodedWorkbook(options);
  await expect(runBoqUploadJob('job', null, bytes.toString('base64'), 'bad.xlsx', actor)).resolves.toMatchObject({ success: false });
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(tx.project.create).not.toHaveBeenCalled();
  expect(fileWrite).not.toHaveBeenCalled();
});

test('reads the official grand total after its unused blank item rows', async () => {
  const bytes = await encodedWorkbook({ spacedTotal: true });
  await expect(runBoqUploadJob('job', null, bytes.toString('base64'), 'sample.xlsx', actor))
    .resolves.toMatchObject({ success: true, status: 'DRAFT_UPLOADED', report: { grandTotal: 100, errors: [] } });
});

test('preserves an invalid-row report as failed validation without approving it', async () => {
  const bytes = await encodedWorkbook({ valid: false });
  await expect(runBoqUploadJob('job', 'existing-project', bytes.toString('base64'), 'invalid.xlsx', actor)).resolves.toMatchObject({ success: true, status: 'VALIDATION_FAILED' });
  expect(uploadData).toMatchObject({ validationStatus: 'FAILED', commitStatus: 'PENDING' });
});

test('database save failure never commits the new project or audits', async () => {
  failSave = true;
  const bytes = await encodedWorkbook();
  await expect(runBoqUploadJob('job', null, bytes.toString('base64'), 'sample.xlsx', actor)).resolves.toMatchObject({ success: false });
  expect(committed).toBe(false);
  expect(tx.auditLog.create).not.toHaveBeenCalled();
  expect(tx.workbookExtractionAudit.create).not.toHaveBeenCalled();
});

test('storage failure never records an upload without its original file', async () => {
  fileWrite.mockImplementation(() => { throw new Error('Read-only storage'); });
  const bytes = await encodedWorkbook();
  await expect(runBoqUploadJob('job', null, bytes.toString('base64'), 'sample.xlsx', actor)).resolves.toMatchObject({ success: false });
  expect(committed).toBe(false);
  expect(tx.uploadedWorkbookFile.create).not.toHaveBeenCalled();
});

// Optional local verification of the workbook delivered to the user; no database/file writes.
const sampleWorkbookPath = process.env.BOQ_SAMPLE_PATH;
(sampleWorkbookPath ? test : test.skip)('accepts the delivered sample workbook with three items and its cached totals', async () => {
  const bytes = fs.readFileSync(sampleWorkbookPath!);
  const result = await runBoqUploadJob('sample-job', null, bytes.toString('base64'), 'BOQ_Upload_Test_Sample.xlsx', actor);
  expect(result).toMatchObject({ success: true, status: 'DRAFT_UPLOADED', report: {
    grandTotal: 57246, validRowsCount: 3, errors: [],
  } });
  expect(committed).toBe(true);
});
