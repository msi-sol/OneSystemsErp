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

// ------------------------------------------------------------------
// EQUIPMENT REGISTRY ACTIONS
// ------------------------------------------------------------------

export async function getEquipmentList() {
  return await fetchWithAuth('/api/equipment/list');
}

export async function createEquipment(data: any) {
  const result = await fetchWithAuth('/api/equipment/create', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  revalidatePath('/equipment');
  return result;
}

// ------------------------------------------------------------------
// TELEMETRY & FMS ACTIONS
// ------------------------------------------------------------------

export async function getActiveTelemetry() {
  return await fetchWithAuth('/api/equipment/telemetry/active');
}

export async function getFleetStats() {
  return await fetchWithAuth('/api/equipment/telemetry/stats');
}

// ------------------------------------------------------------------
// DEPLOYMENT WORKFLOW ACTIONS
// ------------------------------------------------------------------

export async function getDeploymentOptions() {
  return await fetchWithAuth('/api/equipment/deployment/options');
}

export async function getDeployments() {
  return await fetchWithAuth('/api/equipment/deployment/list');
}

export async function requestDeployment(payload: any) {
  const result = await fetchWithAuth('/api/equipment/deployment/request', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  revalidatePath('/equipment/deployments');
  return result;
}

export async function updateDeploymentStatus(id: string, newStatus: string) {
  const result = await fetchWithAuth(`/api/equipment/deployment/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ newStatus })
  });
  revalidatePath('/equipment/deployments');
  return result;
}

// ------------------------------------------------------------------
// UTILIZATION LOG ACTIONS
// ------------------------------------------------------------------

export async function getUtilizationLogs(filters?: any) {
  return await fetchWithAuth('/api/equipment/utilization/list', {
    method: 'POST',
    body: JSON.stringify(filters || {})
  });
}

export async function getUtilizationOptions() {
  return await fetchWithAuth('/api/equipment/utilization/options');
}

export async function createUtilizationLog(data: any) {
  const result = await fetchWithAuth('/api/equipment/utilization/create', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  revalidatePath('/equipment/utilization');
  return result;
}

export async function syncUtilizationFromFMS(equipmentId: string) {
  const result = await fetchWithAuth('/api/equipment/utilization/sync', {
    method: 'POST',
    body: JSON.stringify({ equipmentId })
  });
  revalidatePath('/equipment/utilization');
  return result;
}

export async function deleteUtilizationLog(id: string) {
  const result = await fetchWithAuth(`/api/equipment/utilization/${id}`, {
    method: 'DELETE'
  });
  revalidatePath('/equipment/utilization');
  return result;
}

export async function getUtilizationSummary() {
  return await fetchWithAuth('/api/equipment/utilization/summary');
}

// ------------------------------------------------------------------
// MAINTENANCE & REPAIR ACTIONS
// ------------------------------------------------------------------

export async function getMaintenanceLogs(filters?: any) {
  return await fetchWithAuth('/api/equipment/maintenance/list', {
    method: 'POST',
    body: JSON.stringify(filters || {})
  });
}

export async function getMaintenanceOptions() {
  return await fetchWithAuth('/api/equipment/maintenance/options');
}

export async function createMaintenance(data: any) {
  const result = await fetchWithAuth('/api/equipment/maintenance/create', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  revalidatePath('/equipment/maintenance');
  return result;
}

export async function updateMaintenanceStatus(id: string, newStatus: string, completionData?: any) {
  const result = await fetchWithAuth(`/api/equipment/maintenance/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ newStatus, completionData })
  });
  revalidatePath('/equipment/maintenance');
  return result;
}

export async function deleteMaintenance(id: string) {
  const result = await fetchWithAuth(`/api/equipment/maintenance/${id}`, {
    method: 'DELETE'
  });
  revalidatePath('/equipment/maintenance');
  return result;
}

export async function getMaintenanceSummary() {
  return await fetchWithAuth('/api/equipment/maintenance/summary');
}

// ------------------------------------------------------------------
// AI SAFETY & DIAGNOSTICS ACTIONS
// ------------------------------------------------------------------

export async function getAIValidations(filters?: any) {
  return await fetchWithAuth('/api/equipment/ai/validations', {
    method: 'POST',
    body: JSON.stringify(filters || {})
  });
}

export async function updateAIValidationStatus(id: string, newStatus: string) {
  const result = await fetchWithAuth(`/api/equipment/ai/validations/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ newStatus })
  });
  revalidatePath('/equipment/dashboard');
  return result;
}

export async function getFleetSafetyEvents(limit?: number) {
  return await fetchWithAuth(`/api/equipment/fleet/events?limit=${limit || 50}`);
}

export async function getAIDashboardStats() {
  return await fetchWithAuth('/api/equipment/ai/dashboard');
}

export async function runAIDiagnostics() {
  const result = await fetchWithAuth('/api/equipment/ai/run-diagnostics', {
    method: 'POST'
  });
  revalidatePath('/equipment/dashboard');
  return result;
}
