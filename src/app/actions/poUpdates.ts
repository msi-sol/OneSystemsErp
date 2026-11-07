'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';

// Standard fetchWithAuth definition
async function fetchWithAuth(url: string, options: RequestInit) {
  // In a real application, this would handle authentication tokens (e.g., from cookies, JWT, etc.)
  // For this example, we'll just forward the request, ensuring JSON content type.
  // Replace '/api' with your actual AWS backend API endpoint if it's different.

  const response = await backendFetch(`${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      // Add auth token if available, e.g.:
      // 'Authorization': `Bearer ${getAuthTokenFromCookieOrSession()}`
    },
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: 'Unknown error', status: response.status };
    }
    throw new Error(errorData.error || errorData.message || `Failed to fetch data with status ${response.status}`);
  }

  return response.json();
}

/** "Reject PO": returns a purchase order under review to draft (the backend allows only this transition). */
export async function updatePOStatus(poId: string, status: string) {
  const session = await verifySession();
  if (!session?.id) throw new Error('Not authenticated');

  const result = await fetchWithAuth('/api/poUpdates/updatePOStatus', {
    method: 'POST',
    body: JSON.stringify({ poId, status }),
  });

  if (result.success) {
    revalidatePath(`/procurement/purchase-orders/${poId}`);
    revalidatePath('/procurement/purchase-orders');
  } else {
    throw new Error(result.error || 'Failed to update PO status');
  }
}

/** Returns a draft or under-review canvass PO for further canvassing and reopens its canvass. */
export async function returnPOToCanvassing(poId: string, reason: string): Promise<{ success: boolean; error?: string; canvassFormId?: string }> {
  const session = await verifySession();
  if (!session?.id) return { success: false, error: 'Not authenticated' };
  try {
    const result = await fetchWithAuth('/api/poUpdates/returnToCanvassing', { method: 'POST', body: JSON.stringify({ poId, reason }) });
    revalidatePath(`/procurement/purchase-orders/${poId}`);
    revalidatePath('/procurement/purchase-orders');
    if (result.canvassFormId) revalidatePath(`/procurement/canvassing/${result.canvassFormId}`);
    return { success: true, canvassFormId: result.canvassFormId };
  } catch (cause) {
    return { success: false, error: cause instanceof Error ? cause.message : 'The order could not be returned to canvassing.' };
  }
}
