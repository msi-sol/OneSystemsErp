'use server';
import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';
import { actorCanAccessProject } from '@/lib/boq/workspace-service';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import * as xlsx from 'xlsx';
import { uploadToS3 as put } from '@/lib/s3'; // S3 upload utility remains in Next.js Server Action
import { consolidateMaterialRows } from '@/lib/boq/consolidation-materials';
import { randomUUID } from 'node:crypto';

const API_ROUTE_PREFIX = '/api/consolidation'; // The base route name for the AWS backend

async function requireProjectCapability(projectId: string, capabilities: string[], message: string) {
  const actor = await verifySession();
  if (!actor || actor.mustChangePassword) throw new Error('Unauthorized: sign in before changing this project.');
  if (!await actorCanAccessProject(actor, projectId, capabilities)) throw new Error(message);
  return actor;
}

// fetchWithAuth wrapper to handle session/project headers and backend response structure
async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies(); // `cookies()` is not async
  const __session = await verifySession();
  const session = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value;
  const simulatedRole = cookieStore.get('simulatedRole')?.value;

  const headers = new Headers(options.headers);
  if (session) headers.set('x-user-session', session);
  if (activeProjectId) headers.set('x-active-project-id', activeProjectId);
  if (simulatedRole) headers.set('x-simulated-role', simulatedRole);
  // Only set Content-Type if a body is present and it's JSON
  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await backendFetch(`${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Backend Error: ${res.status}: ${errorText}`);
  }
  // The backend now returns { success: true, ...data } or { success: false, error: ... }
  const result = await res.json();
  if (result.success === false) {
    throw new Error(result.error || 'Unknown backend error');
  }
  return result; // Return the entire result object, which contains the actual data
}

// --- Original Exported Functions (now acting as proxies) ---

export async function autoConsolidateBOQ(projectId: string, force: boolean = false) {
  await requireProjectCapability(projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project master materials list.');
  await fetchWithAuth(`${API_ROUTE_PREFIX}/${projectId}/auto-consolidate`, {
    method: 'POST',
    body: JSON.stringify({ force })
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function uploadMasterMaterialsList(formData: FormData) {
  const projectId = formData.get('projectId') as string;
  const materialsFile = formData.get('materialsFile') as File | null;
  if (!materialsFile || materialsFile.size === 0) {
    throw new Error('No file uploaded');
  }
  if (!projectId) throw new Error('Select a project before uploading the master materials list.');
  const actor = await requireProjectCapability(projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project master materials list.');

  const buffer = Buffer.from(await materialsFile.arrayBuffer());

  // Excel parsing and item consolidation logic remains in this Next.js Server Action
  // as it prepares the data (`parsedItems`) to be sent to the backend.
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  let headerRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && Array.isArray(row) && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('description') || cell.toLowerCase().includes('item')))) {
      headerRowIndex = i;
      break;
    }
  }

  const materialRows: Array<{ itemCode: string; category: string; description: string; unit: string; quantity: number; unitCost: number }> = [];

  if (headerRowIndex !== -1) {
    const headers = rows[headerRowIndex].map(h => (h || '').toString().toLowerCase().trim());
    
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row) || row.length === 0) continue;
      
      let itemCode = '';
      let itemDesc = '';
      let unit = '';
      let quantity = 0;
      let unitCost = 0;
      let category = '';

      headers.forEach((header, colIndex) => {
        const cellValue = row[colIndex];
        if (cellValue === undefined || cellValue === null) return;
        
        if (header.includes('item no') || header.includes('item code')) itemCode = cellValue.toString().trim();
        else if (header.includes('desc')) itemDesc = cellValue.toString().trim();
        else if (header === 'unit') unit = cellValue.toString().trim();
        else if (header.includes('qty') || header.includes('quantity')) {
          quantity = parseFloat(cellValue.toString().replace(/,/g, ''));
        }
        else if (header.includes('unit cost') || header.includes('price')) {
          unitCost = parseFloat(cellValue.toString().replace(/,/g, ''));
        }
        else if (header.includes('category')) category = cellValue.toString().trim();
      });

      if (itemDesc) {
        if (isNaN(quantity)) quantity = 0;
        if (isNaN(unitCost)) unitCost = 0;
        materialRows.push({ itemCode, category, description: itemDesc, unit, quantity, unitCost });
      }
    }
  }

  const groups = consolidateMaterialRows(materialRows);

  if (groups.length === 0) {
    throw new Error('No valid material items found in the uploaded file.');
  }

  // Validate that the current project master may be replaced before persisting the source upload.
  await fetchWithAuth(`${API_ROUTE_PREFIX}/${projectId}/check-replacement`, { method: 'POST' });
  const storedFile = await put(`templates/${projectId}/master-materials/${randomUUID()}.xlsx`, buffer, {
    contentType: materialsFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    module: 'PROJECT_MANAGEMENT',
    projectId,
    uploadedBy: actor.id,
  });
  const documentData = {
    title: 'Master Materials Template',
    fileUrl: storedFile.url,
    fileType: materialsFile.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileSize: buffer.length
  };

  const parsedItems: any[] = [];
  let index = 1;

  for (const group of groups.values()) {
    const consolidatedCode = `C${index.toString().padStart(3, '0')}`;
    parsedItems.push({
      itemCode: consolidatedCode,
      category: group.category || group.itemCodePrefix,
      description: group.description,
      unit: group.unit,
      quantity: group.quantity,
      unitCost: group.unitCost,
      totalCost: group.totalCost,
      status: 'PENDING'
    });
    index++;
  }

  // Call the AWS backend with the pre-processed document data and parsed items
  await fetchWithAuth(`${API_ROUTE_PREFIX}/${projectId}/upload`, {
    method: 'POST',
    body: JSON.stringify({ documentData, parsedItems })
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function addManualConsolidatedItem(data: {
  projectId: string;
  itemCode: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
}) {
  await requireProjectCapability(data.projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project master materials list.');
  await fetchWithAuth(`${API_ROUTE_PREFIX}/items`, {
    method: 'POST',
    body: JSON.stringify(data)
  });

  revalidatePath(`/projects/${data.projectId}`);
}

export async function deleteMasterMaterialsList(projectId: string) {
  await requireProjectCapability(projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project master materials list.');
  await fetchWithAuth(`${API_ROUTE_PREFIX}/${projectId}`, {
    method: 'DELETE'
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function downloadMasterMaterialsTemplate(projectId: string): Promise<string> {
  await requireProjectCapability(projectId, ['canView'], 'You do not have permission to view this project master materials list.');
  // The AWS backend now handles the template fetching, modification, and returns a base64 string
  const result = await fetchWithAuth(`${API_ROUTE_PREFIX}/${projectId}/download-template`, {
    method: 'POST' // Using POST for consistency with other backend routes
  });
  // The backend's response will have the base64 file data in the 'file' property
  return result.file;
}
