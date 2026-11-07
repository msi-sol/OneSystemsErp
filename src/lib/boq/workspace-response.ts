import type { WorkspaceAnalysis } from './workspace-types';

type WorkspaceResponseAction = 'analyze' | 'confirm';
type FailureResponse = { success: false; error: string };
type ConfirmReport = {
  fileUrl: string;
  grandTotal: number;
  validRowsCount: number;
  warningRowsCount: number;
  errorRowsCount: number;
};
export type WorkspaceAnalyzeResponse = { success: true; analysis: WorkspaceAnalysis } | FailureResponse;
export type WorkspaceConfirmResponse = {
  success: true;
  uploadId: string;
  projectId: string;
  status: string;
  report: ConfirmReport;
} | FailureResponse;

const genericMessage = (action: WorkspaceResponseAction) => action === 'analyze'
  ? 'The selected source could not be analyzed. Your file is still selected; try again or choose a smaller supported file.'
  : 'The BOQ draft could not be saved. Your source file and review choices are still here; try again.';

function statusMessage(status: number, action: WorkspaceResponseAction): string | null {
  if (status === 401) return 'Your session may have expired. Sign in again, then retry; your selected source and review choices are still here.';
  if (status === 403) return 'Your account cannot complete this BOQ action. Ask a project administrator to check your access; your selected source is still here.';
  if (status === 413) return 'This upload is too large for the server to process. Choose a smaller supported source file (up to 10 MiB) or ask an administrator to check the upload limit.';
  if ([502, 503, 504].includes(status)) return 'The BOQ service is temporarily unavailable or took too long. Your file and review choices are still here; wait a moment and retry.';
  return null;
}

function isLoginLocation(url: string): boolean {
  try {
    return /(?:^|\/)(?:login|signin|sign-in|auth)(?:\/|$)/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isWorkspaceAnalysis(value: unknown): value is WorkspaceAnalysis {
  if (!isRecord(value)) return false;
  return typeof value.fileName === 'string'
    && typeof value.fileHash === 'string'
    && Array.isArray(value.sheets)
    && Array.isArray(value.columns)
    && Array.isArray(value.sections)
    && Array.isArray(value.preview)
    && Array.isArray(value.errors)
    && Array.isArray(value.warnings)
    && (value.mapping === null || isRecord(value.mapping))
    && isRecord(value.breakdownMapping)
    && (value.selectedSheet === null || typeof value.selectedSheet === 'string')
    && typeof value.itemCount === 'number'
    && typeof value.total === 'string'
    && typeof value.previewOffset === 'number'
    && typeof value.previewPageSize === 'number'
    && typeof value.filteredItemCount === 'number'
    && typeof value.filteredTotal === 'string'
    && (value.selectedSectionKey === null || typeof value.selectedSectionKey === 'string')
    && (value.printedTotal === null || typeof value.printedTotal === 'string')
    && typeof value.suggestedProjectName === 'string';
}

function isConfirmSuccess(value: Record<string, unknown>): boolean {
  if (typeof value.uploadId !== 'string' || typeof value.projectId !== 'string' || typeof value.status !== 'string' || !isRecord(value.report)) return false;
  const report = value.report;
  return typeof report.fileUrl === 'string'
    && typeof report.grandTotal === 'number'
    && typeof report.validRowsCount === 'number'
    && typeof report.warningRowsCount === 'number'
    && typeof report.errorRowsCount === 'number';
}

export function readWorkspaceResponse(response: Response, action: 'analyze'): Promise<WorkspaceAnalyzeResponse>;
export function readWorkspaceResponse(response: Response, action: 'confirm'): Promise<WorkspaceConfirmResponse>;
export async function readWorkspaceResponse(
  response: Response,
  action: WorkspaceResponseAction,
): Promise<WorkspaceAnalyzeResponse | WorkspaceConfirmResponse> {
  const redirectedToLogin = response.redirected && isLoginLocation(response.url);
  if (redirectedToLogin || response.status === 401) {
    throw new Error(statusMessage(401, action) ?? genericMessage(action));
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new Error(genericMessage(action));
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(statusMessage(response.status, action) ?? genericMessage(action));
  }

  if (!isRecord(data)) {
    throw new Error(statusMessage(response.status, action) ?? genericMessage(action));
  }
  if (!response.ok) {
    const apiError = typeof data.error === 'string' && data.error.trim() ? data.error : null;
    throw new Error(apiError ?? statusMessage(response.status, action) ?? genericMessage(action));
  }

  if (data.success === false && typeof data.error === 'string' && data.error.trim()) {
    return { success: false, error: data.error };
  }
  if (data.success !== true) throw new Error(genericMessage(action));

  if (action === 'analyze') {
    if (!isWorkspaceAnalysis(data.analysis)) throw new Error(genericMessage(action));
    return { success: true, analysis: data.analysis };
  }
  if (!isConfirmSuccess(data)) throw new Error(genericMessage(action));
  return {
    success: true,
    uploadId: data.uploadId as string,
    projectId: data.projectId as string,
    status: data.status as string,
    report: data.report as ConfirmReport,
  };
}
