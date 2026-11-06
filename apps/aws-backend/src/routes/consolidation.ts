import { prisma } from '../lib/prisma';
import { readStoredUpload } from '../../../../src/lib/s3';
import { consolidateMaterialRows } from '../../../../src/lib/boq/consolidation-materials';
// @ts-nocheck
import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { getPermissionsForRole, requirePermission } from '../lib/permissions';
import ExcelJS from 'exceljs'; // ExcelJS is used for modifying and creating Excel files

const router = Router();

function getPbacContext(req: Request) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

async function requireProjectCapability(req: Request, res: Response, projectId: string, capabilities: string[]) {
  const { userId, simulatedRole } = getPbacContext(req);
  if (!userId) {
    res.status(401).json({ success: false, error: 'An authenticated user is required.' });
    return false;
  }
  if (!await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
    res.status(404).json({ success: false, error: 'Project not found.' });
    return false;
  }

  for (const capability of capabilities) {
    try {
      await requirePermission(userId, 'PROJECT_MANAGEMENT', capability, simulatedRole);
      return true;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Unauthorized Action:')) throw error;
    }
  }

  if (!simulatedRole) {
    const assignment = await prisma.projectUserAssignment.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { assignmentStatus: true, projectRole: true },
    });
    if (assignment?.assignmentStatus.toLowerCase() === 'active') {
      const permissions = await getPermissionsForRole(assignment.projectRole);
      if (capabilities.some(capability => permissions.PROJECT_MANAGEMENT?.[capability])) return true;
    }
  }

  res.status(403).json({ success: false, error: 'You do not have permission to change this project.' });
  return false;
}

class ConsolidationConflict extends Error {}

async function latestBenchmarkReview(tx: Prisma.TransactionClient, projectId: string) {
  const row = await tx.auditLog.findFirst({
    where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { newValue: true },
  });
  if (!row) return null;
  try { return JSON.parse(row.newValue || '{}'); }
  catch { throw new ConsolidationConflict('The procurement benchmark review state could not be read safely. Preserve the current master materials list and contact an administrator.'); }
}

async function assertProjectMaterialsReplaceable(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { consolidatedBOQLocked: true } });
  if (!project) throw new ConsolidationConflict('Project not found. Refresh the project and try again.');
  if (project.consolidatedBOQLocked) {
    throw new ConsolidationConflict('The master materials list is locked. Unlock the project BOQ through the existing workflow before replacing or deleting it.');
  }
  const benchmarkReview = await latestBenchmarkReview(tx, projectId);
  if (benchmarkReview && (benchmarkReview.status === 'APPROVED' || benchmarkReview.status === 'GENERATED' || benchmarkReview.materialIds?.length)) {
    throw new ConsolidationConflict('An approved procurement benchmark is linked to the master materials workflow. Use that benchmark review instead of replacing or deleting its material records.');
  }

  const items = await tx.consolidatedBOQItem.findMany({
    where: { projectId },
    select: { id: true, _count: { select: {
      mappings: true, canvassItems: true, consumptionItems: true, deliveryItems: true, expenses: true,
      issuanceItems: true, mrItems: true, pettyCashExpenses: true, poItems: true, returnItems: true,
      projectCostLedgers: true, commitmentLedgers: true, subcontractorVariationOrders: true,
      valueEngineeringRecords: true, scheduleAllocations: true, subcontractPackages: true, jobOrders: true,
    } } },
  });
  if (!items.length) return;

  const itemIds = new Set(items.map(item => item.id));
  const persistedReferences = new Set<string>();
  const auditRows = await tx.auditLog.findMany({
    where: {
      moduleName: 'PROJECT_SCHEDULING',
      actionType: { in: ['WPS_MATERIAL_REQUIREMENT_SET', 'WPS_MATERIAL_INSTALLED'] },
      newValue: { contains: `"projectId":"${projectId}"` },
    },
    select: { newValue: true },
  });
  for (const row of auditRows) {
    try {
      const event = JSON.parse(row.newValue || '{}');
      if (itemIds.has(event.materialId)) persistedReferences.add(String(event.materialId));
    } catch {
      throw new ConsolidationConflict('Work-package material history could not be checked safely. Preserve the existing master materials list and contact an administrator.');
    }
  }

  const inventoryRow = await tx.workPackageMaterialInventoryState.findUnique({ where: { id: 'global' }, select: { dataJson: true } });
  if (inventoryRow) {
    try {
      const inventory = JSON.parse(inventoryRow.dataJson);
      for (const collection of ['bindings', 'reservations', 'transfers']) {
        for (const row of inventory[collection] ?? []) {
          if (row.projectId === projectId && itemIds.has(row.materialId)) persistedReferences.add(String(row.materialId));
        }
      }
    } catch {
      throw new ConsolidationConflict('Work-package inventory references could not be checked safely. Preserve the existing master materials list and contact an administrator.');
    }
  }

  const relationLabels: Record<string, string> = {
    mappings: 'BOQ mappings', canvassItems: 'canvass lines', consumptionItems: 'consumption records',
    deliveryItems: 'delivery records', expenses: 'expenses', issuanceItems: 'issuances', mrItems: 'material requests',
    pettyCashExpenses: 'petty-cash expenses', poItems: 'purchase orders', returnItems: 'material returns',
    projectCostLedgers: 'project cost ledger entries', commitmentLedgers: 'commitment ledger entries',
    subcontractorVariationOrders: 'subcontractor variation orders', valueEngineeringRecords: 'value-engineering records',
    scheduleAllocations: 'schedule allocations', subcontractPackages: 'subcontract packages', jobOrders: 'job orders',
  };
  const references = new Set<string>();
  for (const item of items) {
    for (const [relation, count] of Object.entries(item._count)) {
      if (count > 0) references.add(relationLabels[relation] || relation);
    }
  }
  if (persistedReferences.size) references.add('work-package material requirements, installation, or inventory records');
  if (references.size) {
    throw new ConsolidationConflict(`The master materials list is in use by ${[...references].join(', ')}. The existing list was preserved; resolve or archive those references before replacing or deleting it.`);
  }
}

// Assuming express.json() middleware is already configured in your main Express app
// If not, you'd need `router.use(express.json());` here or in your main app file.

router.post('/:projectId/auto-consolidate', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { force } = req.body;
    if (!await requireProjectCapability(req, res, projectId, ['canEdit', 'canEditDraft'])) return;
    if (await latestBenchmarkReview(prisma, projectId)) {
      throw new ConsolidationConflict('A benchmark review is saved for this project. Generate master materials through its approved review workflow.');
    }

    // Full auto-consolidation logic migrated from Next.js Server Actions
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { procurementBenchmarkLocked: true, consolidatedBOQLocked: true }
    });

    if (!project?.procurementBenchmarkLocked) {
      throw new Error('Procurement Benchmark is not locked. Lock it first before consolidating.');
    }
    if (project.consolidatedBOQLocked) {
      throw new ConsolidationConflict('The master materials list is locked. Unlock the project BOQ through the existing workflow before consolidating it again.');
    }

    const existing = await prisma.consolidatedBOQItem.count({
      where: { projectId }
    });

    if (existing > 0 && !force) {
      throw new Error('BOQ is already consolidated for this project.');
    }

    const benchmarkItems = await prisma.procurementBenchmarkItem.findMany({
      where: { projectId }
    });

    if (benchmarkItems.length === 0) {
      throw new Error('No Procurement Benchmark items found to consolidate.');
    }

    const groups = consolidateMaterialRows(benchmarkItems.map(item => ({
      sourceId: item.id,
      itemCode: item.itemCode || '',
      category: '',
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost: item.totalCost,
    })));
    const benchmarkItemsById = new Map(benchmarkItems.map(item => [item.id, item]));

    let index = 1;

    // Use a transaction for safety with a longer timeout since there are thousands of BOQ mappings
    await prisma.$transaction(async (tx) => {
      const currentCount = await tx.consolidatedBOQItem.count({ where: { projectId } });
      if (currentCount > 0 && !force) throw new ConsolidationConflict('The master materials list changed while consolidation was preparing. Refresh and try again.');
      if (currentCount > 0 && force) {
        await assertProjectMaterialsReplaceable(tx, projectId);
        await tx.bOQMapping.deleteMany({ where: { consolidatedBoqItem: { projectId } } });
        await tx.consolidatedBOQItem.deleteMany({ where: { projectId } });
      }
      for (const group of groups) {
        // Preserve source benchmark totals; the shared helper calculates the weighted rate.
        const unitCost = group.quantity > 0 ? group.totalCost / group.quantity : 0;
        
        const itemCodePrefix = group.itemCodePrefix || 'N/A';
        const consolidatedCode = `C${index.toString().padStart(3, '0')}`;
        index++;

        // Create the parent consolidated item
        const consolidated = await tx.consolidatedBOQItem.create({
          data: {
            projectId,
            itemCode: consolidatedCode,
            category: itemCodePrefix,
            description: group.description,
            unit: group.unit,
            quantity: group.quantity,
            revisedQuantity: group.quantity,
            unitCost: unitCost,
            totalCost: group.totalCost,
            status: 'PENDING' // Awaiting final approval from procurement
          }
        });

        // Create mapping links to prove synchronization
        for (const sourceId of group.sourceIds) {
          const item = benchmarkItemsById.get(sourceId);
          if (!item) throw new Error('A benchmark source item is missing during consolidation.');
          await tx.bOQMapping.create({
            data: {
              mappingType: group.sourceIds.length > 1 ? 'MANY_TO_ONE' : 'ONE_TO_ONE',
              aiConfidenceScore: null,
              procurementBenchmarkItemId: item.id,
              consolidatedBoqItemId: consolidated.id
            }
          });
        }
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 120000 // 2 minutes to accommodate thousands of AI heuristic mappings
    });

    res.json({ success: true, message: 'Auto-consolidation complete using exact material identity and matching units. Source benchmark amounts were preserved; no confidence score was assigned.' });
  } catch (error: any) {
    console.error('AWS Backend Error in autoConsolidateBOQ:', error);
    res.status(error instanceof ConsolidationConflict ? 409 : 500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/check-replacement', async (req, res) => {
  try {
    if (!await requireProjectCapability(req, res, req.params.projectId, ['canView'])) return;
    await assertProjectMaterialsReplaceable(prisma, req.params.projectId);
    res.json({ success: true });
  } catch (error: unknown) {
    res.status(error instanceof ConsolidationConflict ? 409 : 500).json({ success: false, error: error instanceof Error ? error.message : 'Could not check whether the master materials list can be replaced.' });
  }
});

router.post('/:projectId/upload', async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!await requireProjectCapability(req, res, projectId, ['canEdit', 'canEditDraft'])) return;
    // The Next.js Server Action preprocesses the file and sends documentData and parsedItems.
    const { documentData, parsedItems } = req.body;
    if (!documentData || !Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({ success: false, error: 'A source document and at least one valid material line are required. The current master materials list was left unchanged.' });
    }

    await prisma.$transaction(async tx => {
      await assertProjectMaterialsReplaceable(tx, projectId);
      const existingDocument = await tx.document.findFirst({ where: { projectId, title: documentData.title } });
      if (existingDocument) {
        await tx.document.update({ where: { id: existingDocument.id }, data: {
          fileUrl: documentData.fileUrl,
          fileType: documentData.fileType,
          fileSize: documentData.fileSize,
          updatedAt: new Date(),
        } });
      } else {
        await tx.document.create({ data: {
          projectId,
          title: documentData.title,
          category: 'MASTER_MATERIALS_LIST',
          fileUrl: documentData.fileUrl,
          fileType: documentData.fileType,
          fileSize: documentData.fileSize,
        } });
      }

      await tx.consolidatedBOQItem.deleteMany({ where: { projectId } });
      await tx.consolidatedBOQItem.createMany({ data: parsedItems.map((item: any) => ({
        projectId,
        itemCode: item.itemCode,
        category: item.category,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        revisedQuantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.totalCost,
        status: item.status,
      })) });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true, message: 'Master materials list uploaded and consolidated successfully.' });
  } catch (error: any) {
    console.error('AWS Backend Error in uploadMasterMaterialsList:', error);
    res.status(error instanceof ConsolidationConflict ? 409 : 500).json({ success: false, error: error.message });
  }
});

router.post('/items', async (req, res) => {
  try {
    const { projectId, itemCode, category, description, unit, quantity, unitCost } = req.body;
    if (typeof projectId !== 'string' || !await requireProjectCapability(req, res, projectId, ['canEdit', 'canEditDraft'])) return;

    const newConsolidatedItem = await prisma.consolidatedBOQItem.create({
      data: {
        projectId,
        itemCode,
        category,
        description,
        unit,
        quantity,
        revisedQuantity: quantity,
        unitCost,
        totalCost: quantity * unitCost,
        status: 'MANUAL_ADDITION', // Or another appropriate status
      },
    });

    res.json({ success: true, item: newConsolidatedItem, message: 'Manual consolidated item added successfully.' });
  } catch (error: any) {
    console.error('AWS Backend Error in addManualConsolidatedItem:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!await requireProjectCapability(req, res, projectId, ['canEdit', 'canEditDraft'])) return;

    await prisma.$transaction(async tx => {
      await assertProjectMaterialsReplaceable(tx, projectId);
      await tx.consolidatedBOQItem.deleteMany({ where: { projectId } });
      await tx.document.deleteMany({ where: { projectId, category: 'MASTER_MATERIALS_LIST' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true, message: 'Master materials list and associated items deleted.' });
  } catch (error: any) {
    console.error('AWS Backend Error in deleteMasterMaterialsList:', error);
    res.status(error instanceof ConsolidationConflict ? 409 : 500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/download-template', async (req, res) => {
  try {
    const { projectId } = req.params;
    if (!await requireProjectCapability(req, res, projectId, ['canView'])) return;

    const templateDoc = await prisma.document.findFirst({
      where: { projectId, category: 'BOQ_TEMPLATE' }, // Find the BOQ template document
      orderBy: { createdAt: 'desc' }
    });

    if (!templateDoc) {
      return res.status(404).json({ success: false, error: 'No BOQ template found for this project.' });
    }

    const arrayBuffer = await readStoredUpload(templateDoc.fileUrl);
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as any); // Load the Excel template

    const sheet = workbook.worksheets[0];
    
    // Fetch consolidated items from the database to populate the template
    const consolidatedItems = await prisma.consolidatedBOQItem.findMany({
      where: { projectId }
    });

    const itemMap = new Map();
    consolidatedItems.forEach(item => {
      const descClean = item.description.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      itemMap.set(descClean, item);
    });

    let headerRowIndex = -1;
    let descColIndex = -1;
    let qtyColIndex = -1;
    let costColIndex = -1;

    // Iterate through the rows of the Excel sheet to find headers and populate data
    sheet.eachRow((row, rowNumber) => {
      if (headerRowIndex === -1) {
        let hasDesc = false;
        row.eachCell((cell, colNumber) => {
          const val = cell.text?.toLowerCase() || '';
          if (val.includes('desc') || val.includes('item')) {
            hasDesc = true;
            descColIndex = colNumber;
          } else if (val.includes('qty') || val.includes('quantity')) {
            qtyColIndex = colNumber;
          } else if (val.includes('unit cost') || val.includes('price')) {
            costColIndex = colNumber;
          }
        });
        if (hasDesc) {
          headerRowIndex = rowNumber; // Found the header row
        }
      } else {
        // Process data rows after the header
        if (descColIndex !== -1) {
          const descCell = row.getCell(descColIndex);
          const descVal = descCell.text?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          
          if (descVal) {
            let matchedItem = itemMap.get(descVal);
            // Implement fuzzy matching if exact match not found (as in original code)
            if (!matchedItem) {
               for (const [key, item] of itemMap.entries()) {
                 if (descVal.length > 10 && key.length > 10 && Math.abs(descVal.length - key.length) <= 2) {
                   if (descVal.startsWith(key.substring(0, 10)) || key.startsWith(descVal.substring(0, 10))) {
                     matchedItem = item;
                     break;
                   }
                 }
               }
            }

            if (matchedItem) {
              // Populate quantity and unit cost columns
              if (qtyColIndex !== -1) {
                row.getCell(qtyColIndex).value = matchedItem.quantity;
              }
              if (costColIndex !== -1) {
                row.getCell(costColIndex).value = matchedItem.unitCost;
              }
              row.commit(); // Save changes to the row
            }
          }
        }
      }
    });

    const buffer = await workbook.xlsx.writeBuffer(); // Write the modified workbook to a buffer
    // Return the buffer as a base64 encoded string
    res.json({ success: true, file: Buffer.from(buffer).toString('base64') });
  } catch (error: any) {
    console.error('AWS Backend Error in downloadMasterMaterialsTemplate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
