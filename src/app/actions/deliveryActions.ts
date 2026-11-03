'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const session = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value;
  const simulatedRole = cookieStore.get('simulatedRole')?.value;

  const headers = new Headers(options.headers);
  if (session) headers.set('x-user-session', session);
  if (activeProjectId) headers.set('x-active-project-id', activeProjectId);
  if (simulatedRole) headers.set('x-simulated-role', simulatedRole);
  headers.set('Content-Type', 'application/json');

  const res = await backendFetch(`${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Backend Error: ${res.status} ${errorText}`);
  }
  return res.json();
}

export async function encodeDelivery(data: {
  poId: string;
  receiptNumber: string;
  items: { consolidatedBoqItemId: string; quantity: number; drQuantity: number; remarks: string }[];
  drDocumentText?: string;
  proofFileUrl?: string;
  hasProof?: boolean;
}) {
  const result = await fetchWithAuth('/api/delivery/encode', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (result.success) {
    revalidatePath('/deliveries');
    revalidatePath('/inventory');
  }

  return result;
}

export async function approveDelivery(deliveryId: string) {
  const result = await fetchWithAuth(`/api/delivery/${deliveryId}/approve`, {
    method: 'POST'
  });

  if (result.success) {
    revalidatePath(`/deliveries/${deliveryId}`);
    revalidatePath('/deliveries');
    revalidatePath('/inventory');
  }

  return result;
}

export async function encodeDeliveryWithFile(formData: FormData) {
  try {
    const poId = formData.get('poId') as string;
    const receiptNumber = formData.get('receiptNumber') as string;
    const itemsStr = formData.get('items') as string;
    const items = JSON.parse(itemsStr);
    const file = formData.get('file') as File | null;
    const noFileReason = formData.get('noFileReason') as string | null;

    let fileBase64: string | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      fileBase64 = buffer.toString('base64');
      mimeType = file.type;
      fileName = file.name;
    }

    const payload = {
      poId,
      receiptNumber,
      items,
      noFileReason,
      fileBase64,
      mimeType,
      fileName
    };

    const result = await fetchWithAuth('/api/delivery/encode', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.success) {
      revalidatePath('/deliveries');
      revalidatePath('/inventory');
    }

    return result;
  } catch (error: any) {
    console.error('Error encoding delivery with file:', error);
    return { success: false, error: error.message || 'Failed to process file and encode delivery.' };
  }
}

export async function uploadDelayedDeliveryProof(formData: FormData) {
  try {
    const deliveryId = formData.get('deliveryId') as string;
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) throw new Error('No file provided');

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileBase64 = buffer.toString('base64');
    const mimeType = file.type;
    const fileName = file.name;

    const result = await fetchWithAuth(`/api/delivery/${deliveryId}/upload-proof`, {
      method: 'POST',
      body: JSON.stringify({ fileBase64, mimeType, fileName })
    });

    if (result.success) {
      revalidatePath(`/deliveries/${deliveryId}`);
    }

    return result;
  } catch (error: any) {
    console.error('Error uploading delayed delivery proof:', error);
    return { success: false, error: error.message || 'Failed to process delayed file upload.' };
  }
}
