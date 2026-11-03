'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// Placeholder for fetchWithAuth function
// In a real application, this would handle authentication tokens etc.
async function fetchWithAuth(url: string, options?: RequestInit) {
  const response = await backendFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': `Bearer ${await getAuthToken()}`, // Example for a real app
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json(); // Return JSON body
}

export async function createMaterialReturn(data: any) {
  try {
    const result = await fetchWithAuth('/api/returnActions/createMaterialReturn', {
      method: 'POST',
      body: JSON.stringify({ data }), // Pass original 'data' object as 'data' property in body
    });

    if (result.success) {
      revalidatePath('/material-issuance');
    }
    return result;
  } catch (error: any) {
    console.error('Error creating material return (Proxy):', error);
    return { success: false, error: error.message || 'Failed to create return slip' };
  }
}

export async function processMaterialReturn(returnId: string, warehousemanId: string) {
  try {
    const result = await fetchWithAuth('/api/returnActions/processMaterialReturn', {
      method: 'POST',
      body: JSON.stringify({ returnId, warehousemanId }), // Pass arguments directly
    });

    if (result.success) {
      revalidatePath('/material-issuance');
      revalidatePath('/inventory');
    }
    return result;
  } catch (error: any) {
    console.error('Error processing material return (Proxy):', error);
    return { success: false, error: error.message || 'Failed to process return slip' };
  }
}
