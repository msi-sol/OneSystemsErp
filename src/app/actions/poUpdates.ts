'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

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

export async function updatePOStatus(poId: string, status: string) {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || ''; // This session ID might represent the approverId
  
  if (!sessionId) {
    throw new Error('Not authenticated');
  }

  const body: { poId: string; status: string; approverId?: string } = { poId, status };
  
  if (status === 'ISSUED') {
    body.approverId = sessionId; // Pass the sessionId as approverId to the backend
  }

  const result = await fetchWithAuth('/api/poUpdates/updatePOStatus', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (result.success) {
    revalidatePath(`/procurement/${poId}`);
    revalidatePath('/procurement/purchase-orders');
  } else {
    throw new Error(result.error || 'Failed to update PO status');
  }
}
