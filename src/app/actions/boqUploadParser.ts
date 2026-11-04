'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';
import { validateBOQUploadFile } from '@/lib/boq/upload-input';

import { cookies } from 'next/headers';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const session = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value;
  const simulatedRole = cookieStore.get('simulatedRole')?.value;

  const headers = new Headers(options.headers);
  if (session) headers.set('x-user-session', session);
  if (activeProjectId) headers.set('x-active-project-id', activeProjectId);
  if (simulatedRole) headers.set('x-simulated-role', simulatedRole);
  headers.set('Content-Type', 'application/json');

  const res = await backendFetch(`${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Backend Error: ${res.status} ${errorText}`);
  }
  return res.json();
}

export async function uploadAndParseBOQ(formData: FormData) {
  try {
    const file = formData.get('file');
    const projectId = formData.get('projectId');
    if (!file || typeof file === 'string') return { success: false, error: 'Please select an .xlsx file to upload.' };
    if (projectId !== null && typeof projectId !== 'string') return { success: false, error: 'Invalid target project.' };
    const validationError = validateBOQUploadFile(file);
    if (validationError) return { success: false, error: validationError };

    // Keep the large file out of React's positional string-argument decoder.
    // The private backend still receives its existing base64 JSON contract.
    const fileBufferBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const result = await fetchWithAuth('/api/jobs/boq-upload', {
      method: 'POST',
      body: JSON.stringify({ projectId: projectId || null, fileBufferBase64, fileName: file.name })
    });
    return result;
  } catch (error) {
    console.error("BOQ Upload dispatch error:", error);
    return { success: false, error: 'Unable to start the BOQ upload. Please try again.' };
  }
}

export async function checkBoqUploadStatus(jobId: string) {
  try {
    const result = await fetchWithAuth(`/api/jobs/${jobId}`);
    return result;
  } catch (error) {
    console.error("BOQ Job status error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Unable to check BOQ upload status.' };
  }
}

export async function approveBOQUpload(uploadId: string) {
  try {
    const result = await fetchWithAuth('/api/consolidation/approve', {
      method: 'POST',
      body: JSON.stringify({ uploadId })
    });
    return result;
  } catch (error) {
     return { success: false, error: error instanceof Error ? error.message : 'Unable to approve BOQ upload.' };
  }
}
