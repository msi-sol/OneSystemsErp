'use server';

import { backendFetch } from '@/lib/backend-fetch';
import { revalidatePath, revalidateTag } from 'next/cache'; // Required imports even if not used in this specific scenario

// Define SimulationMode if it's not globally available or needs explicit import in this file
// For simplicity, we'll assume it's available or a string in this context.
type SimulationMode = 'dryRun' | 'live'; // Example definition if not imported

/**
 * A wrapper around fetch that includes authentication logic and handles API responses.
 * In a real application, this might retrieve a token from a cookie or session.
 * For this migration, we assume the Server Action context implicitly handles some auth,
 * or the AWS backend uses other means of authentication (e.g., API Gateway IAM).
 */
async function fetchWithAuth(url: string, options: RequestInit) {

  const response = await backendFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error occurred on backend.' }));
    throw new Error(errorData.error || errorData.message || `Backend error: ${response.status} ${response.statusText}`);
  }

  const jsonResponse = await response.json();

  if (!jsonResponse.success) {
    throw new Error(jsonResponse.error || 'Backend operation failed with no specific error message.');
  }

  return jsonResponse.data;
}

export async function runSimulationScenario(scenarioId: string, mode: SimulationMode) {
  try {
    const result = await fetchWithAuth('/api/simulationActions/runSimulationScenario', {
      method: 'POST',
      body: JSON.stringify({ scenarioId, mode }),
    });
    // The original code did not contain revalidatePath/revalidateTag.
    // If a simulation run changes data that should trigger a revalidation, add it here.
    // Example: revalidatePath('/dashboard');
    return result;
  } catch (error: any) {
    console.error('Error proxying runSimulationScenario:', error);
    throw error; // Re-throw to be handled by the UI or calling context
  }
}

export async function getSimulationScenarios() {
  try {
    const result = await fetchWithAuth('/api/simulationActions/getSimulationScenarios', {
      method: 'POST',
      body: JSON.stringify({}), // No arguments, but POST requests often expect a body
    });
    return result;
  } catch (error: any) {
    console.error('Error proxying getSimulationScenarios:', error);
    throw error;
  }
}

export async function getSimulationStats() {
  try {
    const result = await fetchWithAuth('/api/simulationActions/getSimulationStats', {
      method: 'POST',
      body: JSON.stringify({}), // No arguments
    });
    return result;
  } catch (error: any) {
    console.error('Error proxying getSimulationStats:', error);
    throw error;
  }
}
