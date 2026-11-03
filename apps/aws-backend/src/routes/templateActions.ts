import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/saveTemplateAction', async (req, res) => {
  try {
    const { projectId, templateType, fileName, parsedData } = req.body;

    const templateName = templateType === 'ar' ? "Accomplishment Report Template" : "Certificate of Payment Template";
    const mappedType = templateType === 'ar' ? "ACCOMPLISHMENT_REPORT" : "CERTIFICATE_OF_PAYMENT";

    // Sanitize parsedData to replace undefined with null for Prisma compatibility
    const sanitizedData = JSON.parse(JSON.stringify(parsedData, (key, value) => 
      value === undefined ? null : value
    ));

    // Create the template record
    await prisma.documentTemplate.create({
      data: {
        projectId,
        templateName,
        templateType: mappedType,
        fileName,
        fileUrl: `/virtual/templates/${Date.now()}`,
        parsedData: sanitizedData,
        isLocked: false,
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Save Template Error (AWS Backend):", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/deleteTemplateAction', async (req, res) => {
  try {
    const { templateId } = req.body;

    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (template?.isLocked) {
      throw new Error("Cannot delete a locked template.");
    }
    await prisma.documentTemplate.delete({ where: { id: templateId } });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Template Error (AWS Backend):", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/toggleLockTemplateAction', async (req, res) => {
  try {
    const { templateId, currentLockState } = req.body;

    await prisma.documentTemplate.update({
      where: { id: templateId },
      data: { isLocked: !currentLockState }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Lock Template Error (AWS Backend):", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/updateTemplateDataAction', async (req, res) => {
  try {
    const { templateId, parsedData } = req.body;

    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (template?.isLocked) {
      throw new Error("Cannot edit a locked template.");
    }

    const sanitizedData = JSON.parse(JSON.stringify(parsedData, (key, value) => 
      value === undefined ? null : value
    ));

    await prisma.documentTemplate.update({
      where: { id: templateId },
      data: { parsedData: sanitizedData }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Update Template Error (AWS Backend):", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/syncTemplateWithBOQAction', async (req, res) => {
  try {
    const { projectId, parsedData } = req.body;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { awardedBoqItems: true }
    });

    if (!project) throw new Error("Project not found.");

    const boqItems = project.awardedBoqItems;
    if (boqItems.length === 0) throw new Error("No Awarded BOQ items found for this project.");

    // Create a deep copy of parsedData (FortuneSheet Sheet[]) to mutate
    const newData = JSON.parse(JSON.stringify(parsedData));

    let synchronizedCount = 0;

    for (const sheet of newData) {
      if (!sheet.celldata || !Array.isArray(sheet.celldata)) continue;

      // Group celldata by row for easier searching
      const rows: { [r: number]: any[] } = {};
      for (const cell of sheet.celldata) {
        if (!rows[cell.r]) rows[cell.r] = [];
        rows[cell.r].push(cell);
      }

      // Try to auto-detect columns based on common header names
      let itemNoCol = -1;
      let qtyCol = -1;
      let unitCostCol = -1;
      let totalCostCol = -1;

      for (const r in rows) {
        const rowCells = rows[r];
        for (const cell of rowCells) {
          const cellVal = String(cell.v?.m || cell.v?.v || "").toLowerCase().trim();
          if (cellVal.includes("item") && cellVal.includes("no")) itemNoCol = cell.c;
          if (cellVal === "qty" || cellVal === "quantity") qtyCol = cell.c;
          if (cellVal.includes("unit") && cellVal.includes("cost")) unitCostCol = cell.c;
          if (cellVal.includes("total") && cellVal.includes("cost")) totalCostCol = cell.c;
        }

        if (itemNoCol !== -1 && qtyCol !== -1 && unitCostCol !== -1) break;
      }

      // Process rows if columns were found
      if (itemNoCol !== -1) {
        for (const r in rows) {
          const rowCells = rows[r];
          const itemNoCell = rowCells.find(c => c.c === itemNoCol);
          if (!itemNoCell) continue;

          const cellItemNo = String(itemNoCell.v?.m || itemNoCell.v?.v || "").trim();
          if (!cellItemNo) continue;

          // Find match in BOQ
          const match = boqItems.find(b => b.itemCode === cellItemNo);
          if (match) {
            let updated = false;

            const updateCell = (colIdx: number, val: any) => {
              let cell = rowCells.find(c => c.c === colIdx);
              if (!cell) {
                cell = { r: Number(r), c: colIdx, v: {} };
                sheet.celldata.push(cell);
              }
              if (!cell.v) cell.v = {};
              if (cell.v.v !== val) {
                cell.v.v = val;
                cell.v.m = String(val);
                updated = true;
              }
            };

            if (qtyCol !== -1) updateCell(qtyCol, match.quantity);
            if (unitCostCol !== -1) updateCell(unitCostCol, match.combinedUnitCost);
            if (totalCostCol !== -1) updateCell(totalCostCol, match.totalCost);
            
            if (updated) synchronizedCount++;
          }
        }
      }

      // Look for Total Contract Amount
      for (const r in rows) {
        const rowCells = rows[r];
        for (const cell of rowCells) {
          const cellVal = String(cell.v?.m || cell.v?.v || "").toLowerCase().trim();
          if (cellVal.includes("contract amount") || cellVal.includes("total project cost") || cellVal.includes("contract cost")) {
            // Update the immediate next cell
            let nextCell = rowCells.find(c => c.c === cell.c + 1);
            if (!nextCell) {
              nextCell = { r: Number(r), c: cell.c + 1, v: {} };
              sheet.celldata.push(nextCell);
            }
            if (!nextCell.v) nextCell.v = {};
            if (nextCell.v.v !== project.contractAmount) {
              nextCell.v.v = project.contractAmount;
              nextCell.v.m = String(project.contractAmount);
              synchronizedCount++;
            }
          }
        }
      }
    }

    res.json({ success: true, data: newData, count: synchronizedCount });
  } catch (error: any) {
    console.error("Sync Template Error (AWS Backend):", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
