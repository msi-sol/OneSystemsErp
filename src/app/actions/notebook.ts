'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/dal/auth';
import { uploadToS3 as put } from '@/lib/s3';
import { requirePermission } from '@/lib/permissions';

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

export async function uploadReferenceFile(formData: FormData) {
  const actor = await verifySession();
  if (!actor) throw new Error('Unauthorized: sign in before uploading a notebook reference.');
  if (actor.mustChangePassword) throw new Error('PASSWORD_CHANGE_REQUIRED');
  await requirePermission(actor.id, 'AI_NOTEBOOK_REFERENCE_CENTER', 'canCreate');

  const file = formData.get('file');
  const title = formData.get('fileName');
  const referenceCategory = formData.get('referenceCategory');
  if (!file || typeof file === 'string' || !title || typeof title !== 'string' || !referenceCategory || typeof referenceCategory !== 'string') {
    throw new Error('Choose a file and provide its name and category.');
  }
  if (typeof file.arrayBuffer !== 'function' || file.size <= 0) {
    throw new Error('The selected file is empty or invalid.');
  }

  const projectAssignment = formData.get('projectAssignment');
  const moduleAssignment = formData.get('moduleAssignment');
  const buffer = Buffer.from(await file.arrayBuffer());
  const storedFile = await put(`notebook-references/${file.name}`, buffer, {
    contentType: file.type || 'application/octet-stream',
    module: 'AI_NOTEBOOK_REFERENCE_CENTER',
    uploadedBy: actor.id,
  });

  const response = await fetchWithAuth('/api/notebook/uploadReferenceFile', {
    method: 'POST',
    body: JSON.stringify({
      userId: actor.id,
      userRole: actor.role,
      fileName: title,
      fileType: file.type || 'application/octet-stream',
      fileUrl: storedFile.url,
      referenceCategory,
      projectAssignment: typeof projectAssignment === 'string' ? projectAssignment : undefined,
      moduleAssignment: typeof moduleAssignment === 'string' ? moduleAssignment : undefined,
    }),
  });

  revalidatePath('/admin/notebook');
  return { success: true, data: response.data };
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
