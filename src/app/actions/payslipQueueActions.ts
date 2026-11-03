'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// Placeholder for fetchWithAuth. In a real app, this would handle authentication tokens
// (e.g., from a session or cookie) and potentially refresh logic.
async function fetchWithAuth(url: string, options?: RequestInit) {
  const headers = {
    'Content-Type': 'application/json',
    // 'Authorization': `Bearer ${yourAuthToken}`, // Add actual auth token here
    ...options?.headers,
  };
  // This example uses a fallback for local development.

  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Attempt to parse error message from response body, fallback to status text
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || errorData.message || 'An unknown network error occurred');
  }

  return response.json();
}

const API_ROUTE_PREFIX = '/api/payslipQueueActions';

export async function holdPayslip(payslipId: string, reason: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/holdPayslip`, {
      method: 'POST',
      body: JSON.stringify({ payslipId, reason }),
    });

    if (result.success) {
      revalidatePath('/finance/approved-payslips');
    }
    return result;
  } catch (error: any) {
    console.error('Failed to hold payslip:', error);
    return { success: false, error: error.message };
  }
}

export async function resolvePayslipException(payslipId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/resolvePayslipException`, {
      method: 'POST',
      body: JSON.stringify({ payslipId }),
    });

    if (result.success) {
      revalidatePath('/finance/approved-payslips');
    }
    return result;
  } catch (error: any) {
    console.error('Failed to resolve payslip exception:', error);
    return { success: false, error: error.message };
  }
}
