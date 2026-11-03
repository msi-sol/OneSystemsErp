'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// A placeholder for fetchWithAuth, which would typically handle authentication headers
// and base URL resolution in a real application.
async function fetchWithAuth(url: string, options?: RequestInit) {
  const response = await backendFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Add authentication headers here if needed, e.g., Authorization: `Bearer ${getToken()}`
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: response.statusText };
    }
    throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
  }

  return response;
}

export async function runPBACMigration() {
  try {
    const response = await fetchWithAuth('/api/migration/runPBACMigration', {
      method: 'POST',
      // No body needed as the original function takes no arguments
    });
    const result = await response.json();

    if (result.success) {
      revalidatePath('/'); // Revalidate the root path after successful migration
    }

    return result;
  } catch (error: any) {
    console.error('Error in runPBACMigration proxy:', error);
    return { success: false, error: error.message };
  }
}
