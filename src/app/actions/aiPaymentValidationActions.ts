'use server';

import { backendFetch } from '@/lib/backend-fetch';
// Standard fetchWithAuth definition for making API calls.
// with the actual URL of your deployed AWS Express backend.
const fetchWithAuth = async (url: string, options?: RequestInit) => {
  const response = await backendFetch(`${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
      // For server-to-server authentication (Server Action to AWS Backend),
      // consider using an API Key or other secure methods.
    },
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: response.statusText || `Request failed with status ${response.status}` };
    }
    // Propagate the error message from the backend
    throw new Error(errorData.error || errorData.message || 'An unknown error occurred on the backend.');
  }

  return response.json();
};

const API_ROUTE_PREFIX = '/api/aiPaymentValidationActions'; // As specified in the instructions

export async function validatePaymentBatchWithAI(batchId: string) {
  try {
    const data = await fetchWithAuth(`${API_ROUTE_PREFIX}/validatePaymentBatchWithAI`, {
      method: 'POST',
      body: JSON.stringify({ batchId }),
    });

    // The backend already returns { success: true, riskLevel, anomalies } on success.
    // If fetchWithAuth succeeds, 'data' will contain these properties.
    return data; // Return the backend's response directly
  } catch (error: any) {
    // Catch errors thrown by fetchWithAuth or other issues
    console.error("Error in validatePaymentBatchWithAI proxy:", error);
    return { success: false, error: error.message };
  }
}
