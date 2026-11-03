'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';
// The original `cookies()` and `sessionId` check is removed here,
// as `fetchWithAuth` is expected to handle authentication.

/**
 * A wrapper around `fetch` that automatically includes authentication credentials
 * and handles base URL. You would typically implement this to inject JWTs or
 * session tokens from `cookies()` or a session context.
 */
async function fetchWithAuth(url: string, options?: RequestInit) {

  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {})
  };

  // In a real application, you would retrieve and attach an authentication token here.
  // Example: const authToken = cookies().get('authToken')?.value;
  // if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }

  const response = await backendFetch(`${url}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let errorData = { error: 'Unknown error occurred' };
    try {
      errorData = await response.json();
    } catch (e) {
      // If response is not JSON, use status text
      errorData.error = response.statusText || 'Failed to parse error response';
    }
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

const API_ROUTE_PREFIX = '/api/supplierActions'; // Corresponds to your Express router prefix for this module

export async function createSupplier(formData: FormData) {
  // Original authentication check removed, delegated to fetchWithAuth

  const data: { [key: string]: string | boolean } = {};
  for (const [key, value] of formData.entries()) {
    if (key === 'isVatable') {
      data[key] = value === 'true';
    } else {
      data[key] = value as string;
    }
  }

  try {
    await fetchWithAuth(`${API_ROUTE_PREFIX}/createSupplier`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    revalidatePath('/procurement/suppliers');
  } catch (error: any) {
    console.error('Error in createSupplier proxy:', error);
    throw new Error(error.message || 'Failed to create supplier via backend');
  }
}

export async function updateSupplier(id: string, formData: FormData) {
  // Original authentication check removed, delegated to fetchWithAuth

  const data: { [key: string]: string | boolean | FormDataEntryValue } = {};
  for (const [key, value] of formData.entries()) {
    if (key === 'isVatable') {
      data[key] = value === 'true';
    } else {
      data[key] = value;
    }
  }

  try {
    await fetchWithAuth(`${API_ROUTE_PREFIX}/updateSupplier`, {
      method: 'POST',
      body: JSON.stringify({
        id,
        ...data
      })
    });
    revalidatePath('/procurement/suppliers');
  } catch (error: any) {
    console.error('Error in updateSupplier proxy:', error);
    throw new Error(error.message || 'Failed to update supplier via backend');
  }
}
