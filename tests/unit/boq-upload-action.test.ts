jest.mock('@/lib/backend-fetch', () => ({ backendFetch: jest.fn() }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/boq/approve-template-upload', () => ({ approveTemplateUploadForCurrentActor: jest.fn() }));
jest.mock('@/lib/boq/template-review', () => ({ updateTemplateUploadReviewStatus: jest.fn() }));

import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';
import { cookies } from 'next/headers';
import { uploadAndParseBOQ } from '@/app/actions/boqUploadParser';
import { MAX_BOQ_UPLOAD_BYTES, validateBOQUploadFile } from '@/lib/boq/upload-input';

function workbook(data: Uint8Array, name = 'Completed.xlsx', projectId = '') {
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('file', new File([data as BlobPart], name));
  return form;
}

beforeEach(() => {
  jest.resetAllMocks();
  (verifySession as jest.Mock).mockResolvedValue({ id: 'actor' });
  (cookies as jest.Mock).mockResolvedValue({ get: () => undefined });
});

test.each([
  [{ name: 'book.XLSX', size: 1 }, null],
  [{ name: 'book.xlsx', size: MAX_BOQ_UPLOAD_BYTES }, null],
  [{ name: 'book.xls', size: 100 }, 'Only .xlsx files are supported.'],
  [{ name: 'book.xlsx', size: 0 }, 'The workbook is empty. Please select a completed .xlsx file.'],
  [{ name: 'book.xlsx', size: MAX_BOQ_UPLOAD_BYTES + 1 }, 'The workbook is too large. Please upload an .xlsx file of 8 MB or less.'],
])('validates the file on both sides of the action boundary: %j', (file, error) => {
  expect(validateBOQUploadFile(file)).toBe(error);
});

test.each(['', 'existing-project'])('dispatches unchanged workbook bytes for project %s', async (projectId) => {
  const data = Buffer.alloc(800_000, 65);
  (backendFetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ success: true, jobId: 'job-1' })));
  await expect(uploadAndParseBOQ(workbook(data, 'Completed.XLSX', projectId))).resolves.toEqual({ success: true, jobId: 'job-1' });
  const [url, options] = (backendFetch as jest.Mock).mock.calls[0];
  expect(url).toBe('/api/jobs/boq-upload');
  expect(options.method).toBe('POST');
  const body = JSON.parse(options.body);
  expect(body.projectId).toBe(projectId || null);
  expect(body.fileName).toBe('Completed.XLSX');
  expect(Buffer.from(body.fileBufferBase64, 'base64')).toEqual(data);
  expect(options.headers.get('x-user-session')).toBe('actor');
});

test('rejects a missing file without dispatching or writing data', async () => {
  await expect(uploadAndParseBOQ(new FormData())).resolves.toMatchObject({ success: false, error: expect.stringContaining('select') });
  expect(backendFetch).not.toHaveBeenCalled();
});

test('rejects oversized files on the server without dispatching', async () => {
  await expect(uploadAndParseBOQ(workbook(new Uint8Array(MAX_BOQ_UPLOAD_BYTES + 1)))).resolves.toMatchObject({ success: false, error: expect.stringContaining('8 MB') });
  expect(backendFetch).not.toHaveBeenCalled();
});

test('returns a safe actionable failure when dispatch fails', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    (backendFetch as jest.Mock).mockRejectedValue(new Error('Private backend diagnostics'));
    await expect(uploadAndParseBOQ(workbook(new Uint8Array([1])))).resolves.toEqual({ success: false, error: 'Unable to start the BOQ upload. Please try again.' });
  } finally {
    log.mockRestore();
  }
});

test('explains permission denial without exposing backend diagnostics', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    (backendFetch as jest.Mock).mockResolvedValue(new Response('Private diagnostics', { status: 403 }));
    await expect(uploadAndParseBOQ(workbook(new Uint8Array([1])))).resolves.toEqual({
      success: false, error: 'You do not have permission to upload or access this project BOQ.',
    });
  } finally { log.mockRestore(); }
});
