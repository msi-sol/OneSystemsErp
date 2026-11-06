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

  try {
    const res = await backendFetch(`${endpoint}`, { ...options, headers });
    const result = await res.json();
    if (!res.ok) return { success: false, error: result.error || `The issuance request failed (${res.status}).` };
    return result;
  } catch {
    // Callers already render success:false; throwing left their saving state
    // active indefinitely and hid stock/quantity validation failures.
    return { success: false, error: 'The issuance service is unavailable. Try again; your entries have been kept.' };
  }
}

export async function getConsolidatedItemsForIssuance(projectId: string) {
  return await fetchWithAuth(`/api/issuance/consolidated-items/${projectId}`);
}

export async function createIssuanceSlip(data: any) {
  const result = await fetchWithAuth('/api/issuance/create', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (result.success) {
    revalidatePath('/material-issuance');
  }

  return result;
}

export async function processIssuanceSlip(issuanceId: string, warehousemanId: string, itemsData: any[]) {
  const result = await fetchWithAuth(`/api/issuance/${issuanceId}/process`, {
    method: 'POST',
    body: JSON.stringify({ warehousemanId, itemsData })
  });

  if (result.success) {
    revalidatePath('/material-issuance');
  }

  return result;
}

export async function approveIssuanceSlip(issuanceId: string, accountantId: string) {
  const result = await fetchWithAuth(`/api/issuance/${issuanceId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ accountantId })
  });

  if (result.success) {
    revalidatePath('/material-issuance');
  }

  return result;
}

export async function rejectIssuanceSlip(issuanceId: string, userId: string) {
  const result = await fetchWithAuth(`/api/issuance/${issuanceId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });

  if (result.success) {
    revalidatePath('/material-issuance');
  }

  return result;
}
