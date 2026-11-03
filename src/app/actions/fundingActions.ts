'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// Standard fetchWithAuth definition
async function fetchWithAuth(url: string, options?: RequestInit) {
  // In a real application, this would include authentication headers
  // e.g., an Authorization token from a session or cookie.
  const defaultHeaders = {
    'Content-Type': 'application/json',
    // Add authentication headers here if needed, e.g.,
    // 'Authorization': `Bearer ${await getAuthToken()}`
  };

  const response = await backendFetch(url, {
    ...options,
    headers: { ...defaultHeaders, ...options?.headers },
    cache: 'no-store' // Typically for mutations
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    console.error(`API Error for ${url}:`, errorData);
    return { success: false, error: errorData.error || errorData.message || 'Failed to fetch data' };
  }

  return response.json();
}

export async function createFundingRequest(accountId: string, amount: number, reason: string, userId: string, periodId?: string) {
  try {
    const result = await fetchWithAuth('/api/fundingActions/createFundingRequest', {
      method: 'POST',
      body: JSON.stringify({ accountId, amount, reason, userId, periodId })
    });

    if (result.success) {
      revalidatePath(`/finance/payroll-accounts/${accountId}`);
    }
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function approveFundingRequest(requestId: string) {
  try {
    const result = await fetchWithAuth('/api/fundingActions/approveFundingRequest', {
      method: 'POST',
      body: JSON.stringify({ requestId })
    });

    if (result.success && result.accountId) {
      revalidatePath(`/finance/payroll-accounts/${result.accountId}`);
    }
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
