'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

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

export async function uploadAndParseBOQ(projectId: string | null | undefined, fileBufferBase64: string, fileName: string) {
  try {
    const result = await fetchWithAuth('/api/jobs/boq-upload', {
      method: 'POST',
      body: JSON.stringify({ projectId, fileBufferBase64, fileName })
    });
    return result;
  } catch (error: any) {
    console.error("BOQ Upload dispatch error:", error);
    return { success: false, error: error.message || "Failed to dispatch BOQ upload" };
  }
}

export async function checkBoqUploadStatus(jobId: string) {
  try {
    const result = await fetchWithAuth(`/api/jobs/${jobId}`);
    return result;
  } catch (error: any) {
    console.error("BOQ Job status error:", error);
    return { success: false, error: error.message };
  }
}

export async function approveBOQUpload(uploadId: string) {
  try {
    const result = await fetchWithAuth('/api/consolidation/approve', {
      method: 'POST',
      body: JSON.stringify({ uploadId })
    });
    return result;
  } catch (error: any) {
     return { success: false, error: error.message };
  }
}
