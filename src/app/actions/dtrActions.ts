'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { promises as fs } from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { uploadToS3 as put } from '@/lib/s3';

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

export async function saveManualDtr(data: any, payrollPeriodId: string, encodedById: string) {
  try {
    await fetchWithAuth('/api/payroll/dtr/save-manual', {
      method: 'POST',
      body: JSON.stringify({ data, payrollPeriodId, encodedById })
    });
    revalidatePath(`/payroll/${payrollPeriodId}`);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving manual DTR:', error);
    return { success: false, error: error.message || 'Failed to save DTR' };
  }
}

export async function saveBulkManualDtr(workerId: string, payrollPeriodId: string, entries: { date: string, timeIn?: string, timeOut?: string, regularHours: number, overtimeHours: number }[]) {
  try {
    await fetchWithAuth('/api/payroll/dtr/save-bulk', {
      method: 'POST',
      body: JSON.stringify({ workerId, payrollPeriodId, entries })
    });
    revalidatePath(`/payroll/${payrollPeriodId}`);
    return { success: true };
  } catch (error: any) {
    console.error('Error saving bulk manual DTR:', error);
    return { success: false, error: error.message || 'Failed to save bulk DTR' };
  }
}

export async function processAIBiometrics(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    const payrollPeriodId = formData.get('periodId') as string;
    const currentUserId = formData.get('userId') as string;

    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    // Save the file to S3/Blob or local fallback
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    let fileUrl = '';
    
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(`biometrics/${safeFileName}`, buffer, {
          access: 'public',
          addRandomSuffix: false
        });
        fileUrl = blob.url;
      } catch (e) {
        console.warn("Vercel Blob upload failed, falling back to local storage:", e);
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'biometrics');
        await fs.mkdir(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, safeFileName);
        await fs.writeFile(filePath, buffer);
        fileUrl = `/uploads/biometrics/${safeFileName}`;
      }
    } else {
      // Local fallback for development
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'biometrics');
      await fs.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, safeFileName);
      await fs.writeFile(filePath, buffer);
      fileUrl = `/uploads/biometrics/${safeFileName}`;
    }
    
    let rows: any[] = [];
    
    if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
      const xlsx = require('xlsx');
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames.find((name: string) => name.toLowerCase().includes('log')) || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const rawData: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
      
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rawData.length, 20); i++) {
        if (!rawData[i]) continue;
        const rowStr = rawData[i].map((c: any) => String(c).toLowerCase());
        if (rowStr.includes('emp no') || rowStr.includes('employee no') || rowStr.includes('worker name')) {
          headerRowIdx = i;
          break;
        }
      }
      
      if (headerRowIdx !== -1 && headerRowIdx < rawData.length - 1) {
        const headers = rawData[headerRowIdx];
        for (let i = headerRowIdx + 1; i < rawData.length; i++) {
          const rowData = rawData[i];
          const obj: any = {};
          headers.forEach((header: string, index: number) => {
            if (header) {
              obj[header] = rowData[index];
            }
          });
          rows.push(obj);
        }
      } else {
        rows = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
      }
    } else {
      const csvText = buffer.toString('utf-8');
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });
      rows = parseResult.data as any[];
    }

    // Now send the parsed array of objects to the AWS Backend to handle the business logic
    const result = await fetchWithAuth('/api/payroll/dtr/biometrics-sync', {
      method: 'POST',
      body: JSON.stringify({
        rows,
        payrollPeriodId,
        fileUrl
      })
    });

    revalidatePath(`/payroll/${payrollPeriodId}`);
    return { success: true, insertedCount: result.insertedCount };
  } catch (error: any) {
    console.error('Error processing biometrics:', error);
    return { success: false, error: error.message || 'Failed to process file' };
  }
}
