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
    if (res.status === 400 && errorText.includes('AI Blocked')) {
      return res.json(); // Pass the validation block to frontend
    }
    throw new Error(`Backend Error: ${res.status} ${errorText}`);
  }
  return res.json();
}

export async function issuePayment(payableId: string, paymentData: {
  amount: number;
  paymentMethod: string;
  paymentRef: string;
  paidAt: string;
}) {
  const result = await fetchWithAuth('/api/finance/payment/issue', {
    method: 'POST',
    body: JSON.stringify({ payableId, paymentData })
  });

  if (result.success) {
    revalidatePath('/supplier-payables');
    revalidatePath(`/supplier-payables/${payableId}`);
    revalidatePath('/finance');
  }

  return result;
}

export async function clearAccruedPayment(payableId: string) {
  const result = await fetchWithAuth(`/api/finance/payment/${payableId}/clear-accrued`, {
    method: 'PUT'
  });

  if (result.success) {
    revalidatePath('/supplier-payables');
    revalidatePath('/finance');
  }
  return result;
}

export async function getConsolidatedItemsForProject(projectId: string) {
  return await fetchWithAuth(`/api/finance/consolidated-items/${projectId}`);
}

export async function logDirectExpense(data: {
  projectId: string;
  consolidatedBoqItemId?: string;
  voucherNo: string;
  date: string;
  category: string;
  description: string;
  issuedById: string;
  supplierName: string;
  netAmount: number;
  vatAmount: number;
  isAccrued: boolean;
  breakdowns: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    supplierName: string;
    isVat: boolean;
  }>;
}) {
  const result = await fetchWithAuth('/api/finance/expense/log', {
    method: 'POST',
    body: JSON.stringify({ data })
  });

  revalidatePath('/expenses');
  return result.id;
}
