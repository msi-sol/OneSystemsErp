'use server';

import { backendFetch } from '@/lib/backend-fetch';
// Standard fetchWithAuth wrapper. This would typically handle authentication headers.
async function fetchWithAuth(url: string, options?: RequestInit) {

  const response = await backendFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const responseData = await response.json();

  if (!response.ok) {
    // If the HTTP status is not OK (e.g., 500), throw an error with the backend's error message.
    throw new Error(responseData.error || 'Something went wrong with the backend request.');
  }

  return responseData;
}

export async function askPayrollAssistant(question: string): Promise<string> {
  try {
    const response = await fetchWithAuth('/api/payrollAiChat/askPayrollAssistant', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });

    // The backend is designed to return { success: true, data: '...' } on success
    // and { success: false, error: '...' } on application-level errors (though HTTP errors are preferred).
    if (response.success) {
      return response.data;
    } else {
      // Fallback for application-level errors not caught by !response.ok
      throw new Error(response.error || "An unknown error occurred on the backend.");
    }
  } catch (error: any) {
    console.error('Error in proxy askPayrollAssistant:', error);
    // Return the same user-friendly error message as the original Server Action
    return "I'm sorry, I encountered an error connecting to the database.";
  }
}
