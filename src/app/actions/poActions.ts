'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { backendErrorMessage } from '@/lib/backend-error';

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
    throw new Error(backendErrorMessage(res.status, errorText));
  }
  return res.json();
}

export async function createPOFromMRF(mrId: string, items: { consolidatedBoqItemId: string, quantity: number, unitCost: number, supplierId: string }[]) {
  const result = await fetchWithAuth('/api/procurement/po/from-mrf', {
    method: 'POST',
    body: JSON.stringify({ mrId, items })
  });

  if (result.success) {
    revalidatePath('/procurement/purchase-orders');
    revalidatePath('/material-requests');
  }

  return result;
}

export async function approvePurchaseOrder(poId: string) {
  const result = await fetchWithAuth(`/api/procurement/po/${poId}/approve`, {
    method: 'POST'
  });

  if (result.success) {
    revalidatePath('/procurement/purchase-orders');
  }

  return result;
}

export async function submitPOForApproval(poId: string) {
  const result = await fetchWithAuth(`/api/procurement/po/${poId}/submit`, {
    method: 'POST'
  });

  if (result.success) {
    revalidatePath(`/procurement/purchase-orders/${poId}`);
    revalidatePath('/procurement/purchase-orders');
  }

  return result;
}
