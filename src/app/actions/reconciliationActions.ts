'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// Basic fetchWithAuth definition - replace with your actual implementation
// This function should handle authentication (e.g., attaching a token)
// and standard error handling for API calls.
async function fetchWithAuth(input: string | URL, init?: RequestInit) {
  const headers = {
    'Content-Type': 'application/json',
    ...(init?.headers || {})
    // Add your authentication token here, e.g.:
    // 'Authorization': `Bearer ${await getSessionToken()}`
  };

  const response = await backendFetch(input, { ...init, headers });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.error || errorData.message || `API error: ${response.status}`);
  }
  return response.json();
}

// Mock reconciliation that simulates updating batch rows based on a file upload
export async function reconcileBatch(batchId: string, results: { payslipId: string, status: string, reference?: string }[], userId: string) {
  try {
    const responseData = await fetchWithAuth('/api/reconciliationActions/reconcileBatch', {
      method: 'POST',
      body: JSON.stringify({
        batchId,
        results,
        userId
      }),
    });

    if (responseData.success) {
      revalidatePath(`/payroll`);
    }

    return responseData;
  } catch (error: any) {
    console.error('Error reconciling batch via proxy:', error);
    return { success: false, error: error.message };
  }
}
