'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';

// Standard fetchWithAuth definition
async function fetchWithAuth(url: string, options?: RequestInit) {
  const token = 'YOUR_AUTH_TOKEN_LOGIC_HERE'; // Replace with actual token retrieval logic (e.g., from a cookie, session)
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers,
  };

  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
  });

  const responseData = await response.json().catch(() => ({ success: false, error: 'Failed to parse response' }));

  if (!response.ok || !responseData.success) {
    throw new Error(responseData.error || `HTTP error! status: ${response.status} - ${response.statusText}`);
  }

  return responseData;
}

export async function uploadReferenceFile(data: {
  userId: string;
  userRole: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  referenceCategory: string;
  projectAssignment?: string;
  moduleAssignment?: string;
}) {
  const response = await fetchWithAuth('/api/notebook/uploadReferenceFile', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  revalidatePath('/admin/notebook');
  return response.data;
}

export async function getReferenceFiles() {
  const response = await fetchWithAuth('/api/notebook/getReferenceFiles', {
    method: 'POST', // Sticking to POST as per backend endpoint definition
    body: JSON.stringify({}), // Empty body for consistency with POST requests
  });

  return response.data;
}

export async function updateReferenceStatus(
  fileId: string,
  userId: string,
  newStatus: string,
  isMandatory: boolean = false
) {
  const response = await fetchWithAuth('/api/notebook/updateReferenceStatus', {
    method: 'POST',
    body: JSON.stringify({ fileId, userId, newStatus, isMandatory }),
  });

  revalidatePath('/admin/notebook');
  return response.data; // Returning data consistently, even if original didn't explicitly return in some cases
}
