'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

/**
 * A wrapper around the native fetch API to include authentication headers
 * and handle common response parsing and error handling for API calls.
 * Assumes the API endpoint is relative to the Next.js application's origin,
 * targeting a Next.js API route that may then proxy to an external backend.
 */
async function fetchWithAuth(url: string, options?: RequestInit) {
  const response = await backendFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Add authentication headers here if needed, e.g.,
      // 'Authorization': `Bearer ${await getAuthToken()}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    // Attempt to parse error message from response body, or use status text
    const errorBody = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorBody.error || errorBody.message || `API Error (${response.status}): ${response.statusText}`);
  }

  return response.json();
}

export async function createPayrollAccount(data: any, userId: string) {
  try {
    const result = await fetchWithAuth('/api/payrollBankActions/createPayrollAccount', {
      method: 'POST',
      body: JSON.stringify({ data, userId }),
    });

    // Check the 'success' property from the backend response
    if (result.success) {
      revalidatePath('/finance/payroll-accounts');
      return { success: true, accountId: result.accountId };
    } else {
      // Backend indicated a failure, propagate its error message
      console.error('Backend error creating payroll account:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error('Fetch or network error creating payroll account:', error);
    // Catch errors from fetchWithAuth (network issues, non-2xx responses)
    return { success: false, error: error.message };
  }
}
