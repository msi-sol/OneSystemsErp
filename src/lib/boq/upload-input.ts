// Leave room for multipart fields within the 10 MiB Server Action request limit.
export const MAX_BOQ_UPLOAD_BYTES = 8 * 1024 * 1024;

export function validateBOQUploadFile(file: { name: string; size: number }): string | null {
  if (!/\.xlsx$/i.test(file.name)) return 'Only .xlsx files are supported.';
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'The workbook is empty. Please select a completed .xlsx file.';
  if (file.size > MAX_BOQ_UPLOAD_BYTES) return 'The workbook is too large. Please upload an .xlsx file of 8 MB or less.';
  return null;
}
