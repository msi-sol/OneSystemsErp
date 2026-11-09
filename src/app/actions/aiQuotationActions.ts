'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { backendErrorMessage } from '@/lib/backend-error';

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
    throw new Error(backendErrorMessage(res.status, errorText));
  }
  return res.json();
}

export async function uploadAndAnalyzeQuotationsBulk(canvassId: string, formData: FormData) {
  try {
    const files = formData.getAll('files') as File[];
    if (!files || files.length === 0) throw new Error('No files provided');

    const filePayloads = await Promise.all(files.map(async (file) => ({
      name: file.name,
      type: file.type,
      base64: Buffer.from(await file.arrayBuffer()).toString('base64')
    })));

    const result = await fetchWithAuth('/api/ai/quotations', {
      method: 'POST',
      body: JSON.stringify({ canvassId, files: filePayloads })
    });

    return result;
  } catch (error: any) {
    console.error('Bulk AI Analysis Error:', error);
    return { success: false, error: error.message || 'Failed to analyze quotations.' };
  }
}
