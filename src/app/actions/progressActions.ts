'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { uploadToS3 as put } from '@/lib/s3';
import fs from 'fs';

const PDFParse = require('pdf-parse');
const API_ROUTE_PREFIX = '/api/progressActions'; // The agreed-upon route name for the API

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
  
  // Only set Content-Type to application/json if a JSON body is present
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

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

// --- LOCAL READ & UTILITIES (Kept on Vercel) ---

export async function parseAccomplishmentReport(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) return { success: false, error: 'No file provided' };

    const arrayBuffer = await file.arrayBuffer();
    let text = "";
    
    if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      text = new TextDecoder("utf-8").decode(arrayBuffer);
    } else {
      const buffer = Buffer.from(arrayBuffer);
      const parser = new PDFParse({ data: buffer }); // Retaining original PDFParse usage
      const textResult = await parser.getText();
      text = textResult.text;
    }

    const percentMatches = text.match(/(\d+(?:\.\d+)?)\s*%/g);
    
    if (percentMatches && percentMatches.length > 0) {
      const percentages = percentMatches.map(m => parseFloat(m.replace('%', '').trim()));
      const validPercentages = percentages.filter(p => !isNaN(p) && p <= 100);
      
      if (validPercentages.length > 0) {
        const extractedPercent = Math.max(...validPercentages);
        return { success: true, percent: extractedPercent };
      }
    }

    return { success: false, error: 'Could not extract accomplishment percentage from the document.' };
  } catch (error: any) {
    console.error("Parse Report Error:", error);
    return { success: false, error: error.message };
  }
}

// --- Proxied READ & MUTATIONS (All now proxy to AWS Backend) ---

export async function getPackageProgressHubData(packageId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getPackageProgressHubData`, {
      method: 'POST',
      body: JSON.stringify({ packageId })
    });
    return result;
  } catch (error: any) {
    console.error('Error fetching progress hub data:', error);
    return { success: false, error: error.message };
  }
}

export async function getJobOrderProgressHubData(jobOrderId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/getJobOrderProgressHubData`, {
      method: 'POST',
      body: JSON.stringify({ jobOrderId })
    });
    return result;
  } catch (error: any) {
    console.error('Error fetching job order progress hub data:', error);
    return { success: false, error: error.message };
  }
}

export async function createAccomplishment(formData: FormData) {
  try {
    const file = formData.get('file') as File | null;
    let inspectionReport = null;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;

      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(`accomplishments/${fileName}`, buffer, {
          access: 'public',
          addRandomSuffix: true,
        });
        inspectionReport = blob.url;
      } else {
        console.warn("BLOB_READ_WRITE_TOKEN is missing. Falling back to local filesystem for upload.");
        try {
          const uploadDir = join(process.cwd(), 'public', 'uploads', 'accomplishments');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const filePath = join(uploadDir, fileName);
          await writeFile(filePath, buffer);
          inspectionReport = `/uploads/accomplishments/${fileName}`;
        } catch (err) {
          console.warn("Could not save file to local filesystem (likely Vercel read-only environment). Continuing without saving file.", err);
        }
      }
    }

    const packageId = formData.get('packageId') as string | null;
    const jobOrderId = formData.get('jobOrderId') as string | null;
    const isJobOrder = formData.get('isJobOrder') === 'true';
    const workDescription = formData.get('workDescription') as string;
    const prevPercent = parseFloat(formData.get('prevPercent') as string) || 0;
    const currentPercent = parseFloat(formData.get('currentPercent') as string) || 0;
    const cumulativePercent = parseFloat(formData.get('cumulativePercent') as string) || 0;

    const data = {
      ...(packageId ? { packageId } : {}),
      ...(jobOrderId ? { jobOrderId } : {}),
      workDescription,
      location: '',
      prevPercent,
      currentPercent,
      cumulativePercent,
      prevQty: 0,
      currentQty: 0,
      totalQty: 0,
      remainingQty: 0,
      inspectionReport,
      status: 'FOR_REVIEW'
    };

    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/createAccomplishment`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (isJobOrder && jobOrderId) {
      revalidatePath(`/job-orders/${jobOrderId}/progress-hub`);
    } else if (packageId) {
      revalidatePath(`/subcontracting/progress-hub/${packageId}`);
    }
    
    return result;
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
}

export async function approveAccomplishment(id: string, targetId: string, isJobOrder: boolean = false) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/approveAccomplishment`, {
      method: 'POST',
      body: JSON.stringify({ id, targetId, isJobOrder })
    });
    
    if (isJobOrder) {
      revalidatePath(`/job-orders/${targetId}/progress-hub`);
    } else {
      revalidatePath(`/subcontracting/progress-hub/${targetId}`);
    }
    
    return result;
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
}

export async function createBilling(data: any) {
  try {
    // Note: billingNumber generation moved to backend to centralize logic
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/createBilling`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    if (data.isJobOrder && data.jobOrderId) {
      revalidatePath(`/job-orders/${data.jobOrderId}/progress-hub`);
    } else if (data.packageId) {
      revalidatePath(`/subcontracting/progress-hub/${data.packageId}`);
    }
    
    return result;
  } catch (error: any) {
    console.error('Create billing error:', error);
    return { success: false, error: error.message };
  }
}

export async function processPayment(billingId: string, packageId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/processPayment`, {
      method: 'POST',
      body: JSON.stringify({ billingId, packageId })
    });
    revalidatePath(`/subcontracting/progress-hub/${packageId}`);
    revalidatePath('/supplier-payables');
    return result;
  } catch (error: any) {
    console.error('Process payment error:', error);
    return { success: false, error: error.message };
  }
}

export async function submitBillingToPM(id: string, targetId: string, isJobOrder: boolean = false) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/submitBillingToPM`, {
      method: 'POST',
      body: JSON.stringify({ id, targetId, isJobOrder })
    });
    
    if (isJobOrder) {
      revalidatePath(`/job-orders/${targetId}/progress-hub`);
    } else {
      revalidatePath(`/subcontracting/progress-hub/${targetId}`);
    }
    return result;
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
}

export async function endorseBillingToPD(id: string, targetId: string, isJobOrder: boolean = false) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/endorseBillingToPD`, {
      method: 'POST',
      body: JSON.stringify({ id, targetId, isJobOrder })
    });
    
    if (isJobOrder) {
      revalidatePath(`/job-orders/${targetId}/progress-hub`);
    } else {
      revalidatePath(`/subcontracting/progress-hub/${targetId}`);
    }
    return result;
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
}

export async function approvePaymentRequest(id: string, targetId: string, isJobOrder: boolean = false) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/approvePaymentRequest`, {
      method: 'POST',
      body: JSON.stringify({ id, targetId, isJobOrder })
    });
    
    if (!isJobOrder && targetId) {
      revalidatePath(`/subcontracting/progress-hub/${targetId}`);
    } else if (isJobOrder && targetId) {
      revalidatePath(`/job-orders/${targetId}/progress-hub`);
    }
    return result;
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
}

export async function endorseSubcontractPayment(
  billingId: string,
  paymentData: { amount: number; paymentMethod: string; paymentRef: string; paidAt: string }
) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/endorseSubcontractPayment`, {
      method: 'POST',
      body: JSON.stringify({ billingId, paymentData })
    });
    revalidatePath('/supplier-payables');
    revalidatePath(`/supplier-payables/subcontract/${billingId}`);
    return result;
  } catch (error: any) {
    console.error('Endorse Subcontract Payment error:', error);
    return { success: false, error: error.message };
  }
}

export async function approveSubcontractPayment(billingId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/approveSubcontractPayment`, {
      method: 'POST',
      body: JSON.stringify({ billingId })
    });
    revalidatePath('/supplier-payables');
    revalidatePath(`/supplier-payables/subcontract/${billingId}`);
    return result;
  } catch (error: any) {
    console.error('Approve Subcontract Payment error:', error);
    return { success: false, error: error.message };
  }
}

export async function rejectSubcontractPayment(billingId: string) {
  try {
    const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/rejectSubcontractPayment`, {
      method: 'POST',
      body: JSON.stringify({ billingId })
    });
    revalidatePath('/supplier-payables');
    revalidatePath(`/supplier-payables/subcontract/${billingId}`);
    return result;
  } catch (error: any) {
    console.error('Reject Subcontract Payment error:', error);
    return { success: false, error: error.message };
  }
}
