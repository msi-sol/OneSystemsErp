'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';
// @ts-nocheck

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

export async function createCanvassForm(mrId: string) {
  return await fetchWithAuth('/api/canvass', {
    method: 'POST',
    body: JSON.stringify({ mrId })
  });
}

export async function addSupplierQuotation(canvassId: string, supplierId: string, items: any[]) {
  return await fetchWithAuth(`/api/canvass/${canvassId}/quotations`, {
    method: 'POST',
    body: JSON.stringify({ supplierId, items })
  });
}

export async function autoGeneratePOFromCanvass(canvassId: string, supplierId: string) {
  return await fetchWithAuth(`/api/canvass/${canvassId}/generate-po`, {
    method: 'POST',
    body: JSON.stringify({ supplierId })
  });
}

export async function sendCanvassEmail(canvassId: string, supplierIds: string[]) {
  return await fetchWithAuth(`/api/canvass/${canvassId}/email`, {
    method: 'POST',
    body: JSON.stringify({ supplierIds })
  });
}

export async function approveCanvassRecommendation(canvassId: string) {
  return await fetchWithAuth(`/api/canvass/${canvassId}/approve`, {
    method: 'POST'
  });
}

export async function endorseCanvassRecommendation(canvassId: string) {
  return await fetchWithAuth(`/api/canvass/${canvassId}/endorse`, {
    method: 'POST'
  });
}

export async function deleteCanvass(canvassId: string) {
  const result = await fetchWithAuth(`/api/canvass/${canvassId}`, {
    method: 'DELETE'
  });

  if (result.success) {
    revalidatePath('/procurement/canvassing');
  }

  return result;
}

export async function updateSupplierQuotation(canvassId: string, quotationId: string, supplierId: string, items: any[]) {
  return await fetchWithAuth(`/api/canvass/${canvassId}/quotations/${quotationId}`, {
    method: 'PUT',
    body: JSON.stringify({ supplierId, items })
  });
}
