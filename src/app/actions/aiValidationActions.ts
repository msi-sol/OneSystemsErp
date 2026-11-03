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

export async function validateTransactionWithAI(
  moduleName: string,
  transactionDetails: any,
  userId: string,
  userRole: string
) {
  try {
    return await fetchWithAuth('/api/ai/validate', {
      method: 'POST',
      body: JSON.stringify({ moduleName, transactionDetails })
    });
  } catch (error: any) {
    console.error('AI Validation Error:', error);
    return { validationStatus: 'NEEDS HUMAN REVIEW', riskLevel: 'MEDIUM', findings: 'AI Engine Error: ' + error.message, aiRecommendation: 'Contact admin.', validationLogId: null };
  }
}

export async function updateAIValidationLog(logId: string, transactionId: string) {
    if (!logId) return;
    try {
        await fetchWithAuth('/api/ai/update-log', {
            method: 'POST',
            body: JSON.stringify({ logId, transactionId })
        });
    } catch(e) {
        console.error("Failed to update AI log with transaction ID", e);
    }
}

export async function verifyDeliveryDocumentWithAI(fileBuffer: Buffer, mimeType: string, poDetails: any) {
  try {
    return await fetchWithAuth('/api/ai/verify-delivery', {
      method: 'POST',
      body: JSON.stringify({
        fileBase64: fileBuffer.toString('base64'),
        mimeType,
        poDetails
      })
    });
  } catch (error: any) {
    console.error('AI Document Verification Error:', error);
    return { matches: false, findings: `AI Vision Engine Error: ${error.message}` };
  }
}
