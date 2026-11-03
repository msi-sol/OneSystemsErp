import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs'; // ExcelJS is used for modifying and creating Excel files

const router = Router();

// Assuming express.json() middleware is already configured in your main Express app
// If not, you'd need `router.use(express.json());` here or in your main app file.

router.post('/:projectId/auto-consolidate', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { force } = req.body;

    // Full auto-consolidation logic migrated from Next.js Server Actions
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { procurementBenchmarkLocked: true }
    });

    if (!project?.procurementBenchmarkLocked) {
      throw new Error('Procurement Benchmark is not locked. Lock it first before consolidating.');
    }

    const existing = await prisma.consolidatedBOQItem.count({
      where: { projectId }
    });

    if (existing > 0 && !force) {
      throw new Error('BOQ is already consolidated for this project.');
    } else if (existing > 0 && force) {
      // If forcing, clear the existing mappings first
      await prisma.bOQMapping.deleteMany({
        where: { consolidatedBoqItem: { projectId } }
      });
      await prisma.consolidatedBOQItem.deleteMany({
        where: { projectId }
      });
    }

    const benchmarkItems = await prisma.procurementBenchmarkItem.findMany({
      where: { projectId }
    });

    if (benchmarkItems.length === 0) {
      throw new Error('No Procurement Benchmark items found to consolidate.');
    }

    const groups = new Map<string, any>();

    for (const item of benchmarkItems) {
      let oldItemCode = item.itemCode || 'N/A';
      if (oldItemCode === 'N/A' || oldItemCode.trim() === '') {
        oldItemCode = item.description.trim(); // Fallback category to description if missing
      }

      // Hardcoded rule: User specifically wants this lengthy string renamed to 'ACU PUMPS'
      if (oldItemCode.includes('5.0m pump Lift') || oldItemCode.includes('BDU513A450VE')) {
        oldItemCode = 'ACU PUMPS';
      }

      const currentDescClean = item.description.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      let finalDesc = item.description.trim();
      let finalUnit = item.unit.trim();
      
      // Attempt to find an existing fuzzy-matched group
      let matchedKey: string | null = null;
      let globalIsMatch = false;

      for (const [existingKey, group] of groups.entries()) {
        const existDescClean = group.description.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Fuzzy match logic
        let localIsMatch = false;
        if (currentDescClean === existDescClean && currentDescClean.length > 0) {
          localIsMatch = true;
        } else if (currentDescClean.length > 10 && existDescClean.length > 10 && Math.abs(currentDescClean.length - existDescClean.length) <= 2) {
          if (currentDescClean.startsWith(existDescClean.substring(0, 10)) || existDescClean.startsWith(currentDescClean.substring(0, 10))) {
            localIsMatch = true;
          }
        }

        if (localIsMatch) {
          matchedKey = existingKey;
          globalIsMatch = true;
          break;
        }
      }

      let key = matchedKey;

      if (!key) {
        // Create new group key
        key = `${oldItemCode.trim().toLowerCase()}|${finalDesc.toLowerCase()}`;
        groups.set(key, {
          itemCodePrefix: oldItemCode,
          description: finalDesc,
          unit: finalUnit,
          quantity: 0,
          totalCost: 0,
          items: []
        });
      }

      const group = groups.get(key)!;

      // Prioritize "pcs" or "pc" over other units if a conflict exists in the group
      if (finalUnit.toLowerCase().includes('pc') && !group.unit.toLowerCase().includes('pc')) {
        group.unit = finalUnit;
      }
      
      // Combine total costs
      group.totalCost += item.totalCost;
      
      // If it's a lot, force quantity to 1. Otherwise, sum the quantities.
      if (group.unit.toLowerCase().includes('lot')) {
        group.quantity = 1;
      } else {
        group.quantity += item.quantity;
      }
      
      group.items.push(item);
    }

    let index = 1;

    // Use a transaction for safety with a longer timeout since there are thousands of BOQ mappings
    await prisma.$transaction(async (tx) => {
      for (const group of groups.values()) {
        // Calculate weighted unit cost. If quantity is 0, fallback to 0.
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
        for (const item of group.items) {
          await tx.bOQMapping.create({
            data: {
              mappingType: group.items.length > 1 ? 'MANY_TO_ONE' : 'ONE_TO_ONE',
              aiConfidenceScore: 98.5, // Simulated high confidence score for exact text match
              procurementBenchmarkItemId: item.id,
              consolidatedBoqItemId: consolidated.id
            }
          });
        }
      }
    }, {
      maxWait: 10000,
      timeout: 120000 // 2 minutes to accommodate thousands of AI heuristic mappings
    });

    res.json({ success: true, message: 'Auto-consolidation complete.' });
  } catch (error: any) {
    console.error('AWS Backend Error in autoConsolidateBOQ:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/upload', async (req, res) => {
  try {
    const { projectId } = req.params;
    // The Next.js Server Action preprocesses the file and sends documentData and parsedItems.
    const { documentData, parsedItems } = req.body;

    // 1. Create or Update document record
    const existingDocument = await prisma.document.findFirst({
      where: { projectId, title: documentData.title },
    });

    let documentRecord;
    if (existingDocument) {
      documentRecord = await prisma.document.update({
        where: { id: existingDocument.id },
        data: {
          fileUrl: documentData.fileUrl,
          fileType: documentData.fileType,
          fileSize: documentData.fileSize,
          updatedAt: new Date(),
        },
      });
    } else {
      documentRecord = await prisma.document.create({
        data: {
          projectId,
          title: documentData.title,
          category: 'MASTER_MATERIALS_LIST', // Assign a specific category for this document type
          fileUrl: documentData.fileUrl,
          fileType: documentData.fileType,
          fileSize: documentData.fileSize,
        },
      });
    }

    // 2. Clear existing consolidated items for this project before adding new ones
    await prisma.consolidatedBOQItem.deleteMany({
      where: { projectId },
    });

    // 3. Create new consolidated items
    await prisma.consolidatedBOQItem.createMany({
      data: parsedItems.map((item: any) => ({
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
        documentId: documentRecord.id, // Link items to the newly created/updated document
      })),
    });

    res.json({ success: true, message: 'Master materials list uploaded and consolidated successfully.' });
  } catch (error: any) {
    console.error('AWS Backend Error in uploadMasterMaterialsList:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/items', async (req, res) => {
  try {
    const { projectId, itemCode, category, description, unit, quantity, unitCost } = req.body;

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

    // Delete all consolidated items associated with the project first
    await prisma.consolidatedBOQItem.deleteMany({
      where: { projectId },
    });

    // Then delete the document record for the master materials list
    await prisma.document.deleteMany({
      where: { projectId, category: 'MASTER_MATERIALS_LIST' }, // Assuming this category for deletion
    });

    res.json({ success: true, message: 'Master materials list and associated items deleted.' });
  } catch (error: any) {
    console.error('AWS Backend Error in deleteMasterMaterialsList:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:projectId/download-template', async (req, res) => {
  try {
    const { projectId } = req.params;

    const templateDoc = await prisma.document.findFirst({
      where: { projectId, category: 'BOQ_TEMPLATE' }, // Find the BOQ template document
      orderBy: { createdAt: 'desc' }
    });

    if (!templateDoc) {
      return res.status(404).json({ success: false, error: 'No BOQ template found for this project.' });
    }

    const response = await fetch(templateDoc.fileUrl); // Fetch the template file from its URL (e.g., S3)
    if (!response.ok) {
      throw new Error(`Failed to fetch template file from storage. Status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer); // Load the Excel template

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
