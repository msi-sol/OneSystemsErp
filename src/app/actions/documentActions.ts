'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma'; // Prisma is used here for uploaderId lookup

// Placeholder for your actual backend URL

// IMPORTANT: Implement your actual authentication logic here.
// This is a placeholder function that assumes auth is handled by cookies/headers
// and passed through or the backend itself handles session validation.
async function fetchWithAuth(url: string, options?: RequestInit) {
  const headers = new Headers(options?.headers);
  // Example: Attach a session token or API key if needed by your backend
  const __session = await verifySession();
  const sessionToken = __session?.id || '';
  // if (sessionToken) {
  //   headers.set('Authorization', `Bearer ${sessionToken}`);
  // }
  const response = await backendFetch(`${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(errorData.error || response.statusText);
  }
  return response.json();
}

export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File;
  const category = formData.get('category') as string || 'OTHER';
  const projectId = formData.get('projectId') as string || null;

  if (!file) {
    throw new Error('No file provided.');
  }

  // Retrieve uploaderId here before sending to backend
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  let uploaderId = null;

  if (sessionId) {
    const user = await prisma.user.findUnique({ where: { id: sessionId } });
    if (user) uploaderId = user.id;
  }

  // Convert file to base64 for JSON transmission
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileContentBase64 = buffer.toString('base64');

  const body = JSON.stringify({
    fileName: file.name,
    fileContentBase64,
    fileType: file.type || 'application/octet-stream',
    fileSize: file.size,
    category,
    projectId,
    uploaderId // Pass uploaderId to the backend
  });

  const result = await fetchWithAuth('/api/documentActions/uploadDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  revalidatePath('/documents');
  return result;
}

export async function getAllDocuments() {
  const docs = await fetchWithAuth('/api/documentActions/getAllDocuments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No body needed for GET, but instruction specifies POST with empty body often
    body: JSON.stringify({}) 
  });
  return docs;
}

export async function deleteDocument(id: string) {
  const body = JSON.stringify({ id });

  const result = await fetchWithAuth('/api/documentActions/deleteDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  revalidatePath('/documents');
  return result;
}
