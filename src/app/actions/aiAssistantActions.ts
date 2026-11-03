'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// Placeholder for fetchWithAuth - replace with actual implementation for auth if needed.
const fetchWithAuth = async <T = any>(endpoint: string, options?: RequestInit): Promise<T> => {

  const headers = {
    'Content-Type': 'application/json',
    // Add authentication headers here if your AWS backend requires them,
    // e.g., 'Authorization': `Bearer ${await getAuthToken()}`
    ...options?.headers,
  };

  const response = await backendFetch(`${endpoint}`, {
    ...options,
    headers,
    cache: options?.cache || 'no-store' // Server Actions typically want fresh data
  });

  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch (e) {
      // If response is not JSON, use statusText
      errorData.message = response.statusText;
    }
    throw new Error(errorData.error || errorData.message || `API request failed with status ${response.status}`);
  }
  return response.json();
};

export async function askERPAssistant(question: string) {
  try {
    const data = await fetchWithAuth('/api/aiAssistantActions/askERPAssistant', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });

    // No revalidatePath/Tag in original, so not adding here.
    // If a revalidation was present in the original, it would go here:
    // revalidatePath('/some-path'); 

    return data; // This will be { success: true, answer: string } or { success: false, error: string }
  } catch (error: any) {
    console.error('Server Action Proxy Error:', error);
    // Mimic the original error structure
    return { success: false, error: error.message || 'Failed to process AI request through proxy.' };
  }
}
