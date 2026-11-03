'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// Placeholder for fetchWithAuth - replace with your actual implementation
const fetchWithAuth = async (
  url: string,
  options: RequestInit
): Promise<any> => {
  // In a real application, you would add authentication headers here.
  // For example, by getting a token from cookies or a session.
  const headers = {
    'Content-Type': 'application/json',
    // 'Authorization': `Bearer ${YOUR_AUTH_TOKEN}`,
    ...options.headers,
  };
  const response = await backendFetch(url, {
    ...options,
    headers,
  });

  // Parse error responses from the backend.
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.error || errorData.message || `API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

export async function createFundingRequest(periodId: string, destinationAccountId: string, userId: string, boqItemId?: string) {
  try {
    const data = await fetchWithAuth('/api/payrollFundingActions/createFundingRequest', {
      method: 'POST',
      body: JSON.stringify({ periodId, destinationAccountId, userId, boqItemId }),
    });

    if (!data.success) {
      // Backend error messages are passed through
      throw new Error(data.error || 'Failed to create funding request');
    }

    revalidatePath(`/payroll/${periodId}`);
    return { success: true, requestId: data.requestId };
  } catch (error: any) {
    console.error('Error creating funding request via proxy:', error);
    return { success: false, error: error.message };
  }
}

export async function approveFundingRequest(requestId: string, userId: string) {
  try {
    const data = await fetchWithAuth('/api/payrollFundingActions/approveFundingRequest', {
      method: 'POST',
      body: JSON.stringify({ requestId, userId }),
    });

    if (!data.success) {
      // Backend error messages are passed through
      throw new Error(data.error || 'Failed to approve funding request');
    }

    // The backend now returns payrollPeriodId for revalidation.
    revalidatePath(`/payroll/${data.payrollPeriodId}`); 
    return { success: true };
  } catch (error: any) {
    console.error('Error approving funding request via proxy:', error);
    return { success: false, error: error.message };
  }
}
