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

export async function getDashboardStats() {
  try {
    return await fetchWithAuth('/api/projects/dashboard-stats');
  } catch (error) {
    console.error('Failed to fetch dashboard stats from backend:', error);
    return {
      pendingAIOverrides: 0,
      totalProjects: 0,
      totalBudget: 0,
      totalPayables: 0,
      totalAccomplishments: 0,
      pendingMRFs: 0,
      pendingPettyCash: 0,
      activePayrollPeriods: 0,
      openCanvassing: 0,
      activePurchaseOrders: 0,
      expectedDeliveries: 0,
      totalIssuances: 0,
      totalSuppliers: 0,
      totalWorkers: 0,
      totalUsers: 0,
      totalAuditLogs: 0,
      totalDailyLogs: 0,
      totalJobOrders: 0
    };
  }
}

export async function assignProjectManager(projectId: string, managerId: string | null) {
  return fetchWithAuth(`/api/projects/${projectId}/assign-manager`, {
    method: 'POST',
    body: JSON.stringify({ managerId })
  });
}

export async function deleteProject(projectId: string) {
  try {
    const res = await fetchWithAuth(`/api/projects/${projectId}`, {
      method: 'DELETE'
    });
    revalidatePath('/projects');
    return res;
  } catch (error: any) {
    console.error('Error deleting project:', error);
    return { success: false, error: error.message || 'Failed to delete project' };
  }
}

export async function updateProjectDates(projectId: string, startDateStr: string, durationDays: number) {
  try {
    return await fetchWithAuth(`/api/projects/${projectId}/dates`, {
      method: 'POST',
      body: JSON.stringify({ startDateStr, durationDays })
    });
  } catch (error: any) {
    console.error('Error updating project dates:', error);
    return { success: false, error: error.message || 'Failed to update project dates' };
  }
}
