'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath, revalidateTag } from 'next/cache'; // Included for completeness, though not used in original

// Placeholder for `fetchWithAuth` function
// In a real application, this would typically involve token authentication
// and proper error handling specific to your auth setup.
async function fetchWithAuth(url: string, options?: RequestInit) {
  // Example: Add an Authorization header if needed
  // const token = await getAuthToken(); // Assuming a function to get the auth token
  const headers = {
    'Content-Type': 'application/json',
    // ... any other headers like Authorization
    ...(options?.headers || {})
  };

  const response = await backendFetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.error || errorData.message || 'An unknown error occurred');
  }

  return response.json();
}

const BASE_API_ROUTE = '/api/knowledgeEnforcement'; // This needs to be configured in your Next.js API route handler

/**
 * Fetches the active, mandatory knowledge rules applicable to a specific ERP module.
 * This is used to display the "Applicable Rules" UI Panel.
 */
export async function getApplicableRulesForModule(moduleName: string) {
  try {
    const response = await fetchWithAuth(`${BASE_API_ROUTE}/getApplicableRulesForModule`, {
      method: 'POST',
      body: JSON.stringify({ moduleName })
    });
    return response; // response will already be { success: true, data: rules } or { success: false, error: message }
  } catch (error: any) {
    console.error(`Failed to fetch rules for module ${moduleName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Logs an audit event whenever the AI or the backend enforces a Knowledge Center rule.
 */
export async function logKnowledgeAudit(data: {
  transactionId?: string;
  moduleName: string;
  notebookName: string;
  ruleApplied: string;
  validationResult: 'APPROVED' | 'BLOCKED' | 'WARNING';
  actionTaken: string;
  userAction?: string;
  overrideRequested?: boolean;
  overrideApprovedBy?: string;
  overrideReason?: string;
}) {
  try {
    const response = await fetchWithAuth(`${BASE_API_ROUTE}/logKnowledgeAudit`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    // If a revalidation is needed after logging an audit, uncomment one of these:
    // revalidatePath('/some-audit-dashboard');
    // revalidateTag('audit-logs');
    return response;
  } catch (error: any) {
    console.error('Failed to log knowledge audit:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches recent audit logs for a specific module to display in the UI panel.
 */
export async function getRecentAuditLogsForModule(moduleName: string, limit: number = 5) {
  try {
    const response = await fetchWithAuth(`${BASE_API_ROUTE}/getRecentAuditLogsForModule`, {
      method: 'POST',
      body: JSON.stringify({ moduleName, limit })
    });
    return response;
  } catch (error: any) {
    console.error(`Failed to fetch audit logs for module ${moduleName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Utility to pre-populate some baseline mandatory rules since this is a new feature.
 * Typically called once during setup or deployment.
 */
export async function seedBaselineRules() {
  try {
    const response = await fetchWithAuth(`${BASE_API_ROUTE}/seedBaselineRules`, {
      method: 'POST',
      body: JSON.stringify({}) // No arguments needed for this function
    });
    // If revalidation is needed after seeding, uncomment one of these:
    // revalidatePath('/knowledge-rules-dashboard');
    // revalidateTag('knowledge-rules');
    return response;
  } catch (error: any) {
    console.error('Failed to seed baseline rules:', error);
    return { success: false, error: error.message };
  }
}
