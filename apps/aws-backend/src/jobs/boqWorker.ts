import { prisma } from '../lib/prisma';
// @ts-nocheck
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { uploadFileToS3 as put } from "../services/s3.service";
import fs from "fs";
import path from "path";
function normalizeHeader(text: string) {
  if (!text) return "";
  return text
    .toString()
    .toUpperCase()
    .replace(/\s/g, "")
    .replace(/[^A-Z0-9%]/g, "");
}

export async function runBoqUploadJob(jobId: string, projectId: string | null | undefined, fileBufferBase64: string, fileName: string, user: any) {
  try {
    if (!user) {
      throw new Error("Unauthorized: User session not found.");
    }

    const buffer = Buffer.from(fileBufferBase64, 'base64');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet("BOQ_DATA_ENTRY");
    if (!sheet) {
      throw new Error("BOQ_DATA_ENTRY sheet was not found. Please use the official downloaded template.");
    }

    // Step 1: Extract Metadata
    let projectName = "";
    let location = "";
    let subject = "";
    let ocmRate = 8;
    let cpRate = 8;
    let vatRate = 5;
    let templateVersion = "Unknown";

    // Read instructions sheet for version
    const instructionsSheet = workbook.getWorksheet("Instructions");
    if (instructionsSheet) {
      instructionsSheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.type === ExcelJS.ValueType.String && cell.value?.toString()?.includes("Template Version:")) {
            templateVersion = cell.value.toString().replace("Template Version:", "").trim() || "Unknown";
          }
        });
      });
    }

    // Search top rows for metadata and percentages
    for (let i = 1; i <= 20; i++) {
      const row = sheet.getRow(i);
      row.eachCell((cell, colNum) => {
        const val = cell.value?.toString().trim().toUpperCase() || "";
        if (val === "PROJECT:") projectName = row.getCell(colNum + 1).value?.toString() || "";
        if (val === "LOCATION:") location = row.getCell(colNum + 1).value?.toString() || "";
        if (val === "SUBJECT:") subject = row.getCell(colNum + 1).value?.toString() || "";
        
        // Sometimes percentages are just labels above the cells, but instruction says they are at I4, J4, K4
        if (colNum === 9 && i === 4) ocmRate = (Number(cell.value) || 0) * 100; // I4
        if (colNum === 10 && i === 4) cpRate = (Number(cell.value) || 0) * 100; // J4
        if (colNum === 11 && i === 4) vatRate = (Number(cell.value) || 0) * 100; // K4
      });
    }

    let targetProjectId = projectId;
    if (!targetProjectId) {
      if (!projectName) {
        // Fallback to fileName without extension if no project name is found inside the sheet
        projectName = fileName.replace(/\.[^/.]+$/, "") || `New Project ${new Date().toISOString().split('T')[0]}`;
      }
      const newProject = await prisma.project.create({
        data: {
          name: projectName,
          location: location || "",
          description: subject || "Uploaded from BOQ Template Center",
          status: "PLANNING",
          startDate: new Date(),
          endDate: new Date(),
        }
      });
      targetProjectId = newProject.id;
    }

    // Helper to safely get string from cell (handles rich text)
    const getCellString = (cell: ExcelJS.Cell) => {
      if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
        // @ts-ignore
        return cell.value.richText.map(rt => rt.text).join("");
      }
      return cell.value?.toString() || "";
    };

    // Extract Letterhead
    const line1 = getCellString(sheet.getRow(1).getCell(3)) || getCellString(sheet.getRow(2).getCell(1)) || "REPUBLIC OF THE PHILIPPINES";
    const line2 = getCellString(sheet.getRow(2).getCell(3)) || getCellString(sheet.getRow(3).getCell(1)) || "";
    const line3 = getCellString(sheet.getRow(3).getCell(3)) || getCellString(sheet.getRow(4).getCell(1)) || "";

    // Extract Logo
    let logoData = null;
    const imgObj = sheet.getImages()[0];
    if (imgObj) {
      try {
        const img = workbook.getImage(imgObj.imageId as unknown as number);
        if (img && img.buffer) {
          const bufferAny = img.buffer as any;
          const base64Str = Buffer.isBuffer(bufferAny) 
            ? bufferAny.toString('base64') 
            : Buffer.from(bufferAny).toString('base64');
          logoData = `data:image/${img.extension};base64,${base64Str}`;
        }
      } catch (e) {
        console.warn("Failed to extract image", e);
      }
    }

    // The uploaded workbook retains its letterhead. Project has no letterhead storage fields;
    // return extracted metadata in the report instead of issuing an invalid database write.

    // Step 2: Locate BOQ Table Anchor
    let anchorRowNumber = -1;
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        const val = normalizeHeader(getCellString(cell));
        if (val.includes("BIDDETAILEDCOSTBREAKDOWN") || val.includes("ITEM")) {
          if (anchorRowNumber === -1) anchorRowNumber = rowNumber;
        }
      });
    });

    if (anchorRowNumber === -1) {
      throw new Error("Could not find 'BID DETAILED COST BREAKDOWN' anchor in the sheet.");
    }

    // Step 3: Parse Headers
    let headerRowNumber = anchorRowNumber;
    // Find the actual row with "DESCRIPTION"
    while (headerRowNumber < anchorRowNumber + 5) {
      const row = sheet.getRow(headerRowNumber);
      let found = false;
      row.eachCell((cell) => {
        const val = normalizeHeader(getCellString(cell));
        if (val.includes("DESCRIPTION") || val.includes("PARTICULARS") || val.includes("SCOPE")) found = true;
      });
      if (found) break;
      headerRowNumber++;
    }

    const colMap: Record<string, number> = {};
    for (let c = 1; c <= 30; c++) {
      const v1 = normalizeHeader(getCellString(sheet.getRow(headerRowNumber).getCell(c)));
      const v2 = normalizeHeader(getCellString(sheet.getRow(headerRowNumber + 1).getCell(c)));
      const v3 = normalizeHeader(getCellString(sheet.getRow(headerRowNumber + 2).getCell(c)));
      const combined = v1 + "|" + v2 + "|" + v3;
      if (combined !== "||") {
        colMap[combined] = c;
      }
    }

    // Required columns according to Master Instruction
    const requiredCols = [
      "ITEM", "DESCRIPTION", "UNIT", "QUANTITY", "MATERIAL", "LABOR", "EQUIPMENT",
      "TOTALDIRECTCOST", "OCM", "CP", "VAT", "TOTALINDIRECTCOST", "UNITCOST", "AMOUNT"
    ];

    for (const req of requiredCols) {
      let found = false;
      for (const key of Object.keys(colMap)) {
        if (key.includes(req)) found = true;
      }
      if (!found) {
        throw new Error(`Required BOQ header containing '${req}' was modified or missing. Found: ${Object.keys(colMap).join(", ")}`);
      }
    }

    // Map strict columns to numbers for easier access
    const cItem = colMap[Object.keys(colMap).find(k => k.includes("ITEM")) || ""];
    const cDesc = colMap[Object.keys(colMap).find(k => k.includes("DESCRIPTION")) || ""];
    const cUnit = colMap[Object.keys(colMap).find(k => k.includes("UNIT") && !k.includes("COST")) || ""];
    const cQty = colMap[Object.keys(colMap).find(k => k.includes("QUANTITY")) || ""];
    const cMat = colMap[Object.keys(colMap).find(k => k.includes("MATERIAL")) || ""];
    const cLab = colMap[Object.keys(colMap).find(k => k.includes("LABOR")) || ""];
    const cEqu = colMap[Object.keys(colMap).find(k => k.includes("EQUIPMENT")) || ""];
    const cTdc = colMap[Object.keys(colMap).find(k => k.includes("TOTALDIRECTCOST")) || ""];
    const cOcm = colMap[Object.keys(colMap).find(k => k.includes("OCM")) || ""];
    const cCp = colMap[Object.keys(colMap).find(k => k.includes("CP")) || ""];
    const cVat = colMap[Object.keys(colMap).find(k => k.includes("VAT")) || ""];
    const cTic = colMap[Object.keys(colMap).find(k => k.includes("TOTALINDIRECTCOST")) || ""];
    const cUc = colMap[Object.keys(colMap).find(k => k.includes("UNITCOST")) || ""];
    const cAmt = colMap[Object.keys(colMap).find(k => k.includes("AMOUNT")) || ""];
    const cPct = colMap[Object.keys(colMap).find(k => k.includes("OFTOTAL") || k.includes("PERCENT")) || ""];

    // Step 4: Read Rows
    const items = [];
    const errors = [];
    const warnings = [];
    let grandTotal = 0;
    let totalPercentage = 0;
    let validRowsCount = 0;
    let errorRowsCount = 0;
    let warningRowsCount = 0;

    let consecutiveBlank = 0;

    // According to instructions, formulas start around row 5. The actual data row is headerRowNumber + 1 (might be +2 if headers are merged)
    let currentRowNum = headerRowNumber + 1;
    // Skip remaining header rows (rows 2, 3, 4 etc) by checking if the ITEM col or DESC col contains header-like text
    while (currentRowNum <= anchorRowNumber + 5) {
      const descText = normalizeHeader(getCellString(sheet.getRow(currentRowNum).getCell(cDesc)));
      const firstText = normalizeHeader(getCellString(sheet.getRow(currentRowNum).getCell(1)));
      if (descText.includes("DESCRIPTION") || descText.includes("PARTICULARS") || descText === "" || firstText.includes("ITEM")) {
        currentRowNum++;
      } else {
        break;
      }
    }

    while (currentRowNum <= 505) {
      const row = sheet.getRow(currentRowNum);
      const firstCell = normalizeHeader(getCellString(row.getCell(1)));
      let descCell = getCellString(row.getCell(cDesc)).trim();
      let itemNumberRaw = getCellString(row.getCell(cItem)).trim();
      
      if (firstCell === "GRANDTOTAL" || normalizeHeader(descCell) === "GRANDTOTAL" || normalizeHeader(itemNumberRaw) === "GRANDTOTAL") {
        grandTotal = Number(row.getCell(cAmt).result !== undefined ? row.getCell(cAmt).result : row.getCell(cAmt).value) || 0;
        totalPercentage = Number(row.getCell(cPct).result !== undefined ? row.getCell(cPct).result : row.getCell(cPct).value) || 0;
        break;
      }

      if (!descCell && !itemNumberRaw) {
        consecutiveBlank++;
        if (consecutiveBlank >= 10) break;
        currentRowNum++;
        continue;
      }
      consecutiveBlank = 0;

      let itemNumber = itemNumberRaw;
      
      // If user merged Item and Description into the Item column
      if (!descCell && itemNumberRaw) {
        descCell = itemNumberRaw;
        const match = itemNumberRaw.match(/^([IVXLCDM]+\.?|\d+\.)\s*(.*)/i);
        if (match) {
          itemNumber = match[1].trim();
        } else {
          itemNumber = "";
        }
      }

      const getNum = (cell: ExcelJS.Cell) => {
        const val = cell.result !== undefined ? cell.result : cell.value;
        return Number(val) || 0;
      };

      const unit = getCellString(row.getCell(cUnit)).trim();
      const qty = getNum(row.getCell(cQty));
      const amount = getNum(row.getCell(cAmt));

      let hasError = false;
      let hasWarning = false;

      if (!itemNumber && qty > 0) {
        errors.push({ row: currentRowNum, field: "ITEM", issue: "Item number is missing", suggested: "Provide an item number" });
        hasError = true;
      }
      if (!unit && qty > 0) {
        errors.push({ row: currentRowNum, field: "UNIT", issue: "Unit is missing", suggested: "Provide a unit" });
        hasError = true;
      }
      if (qty <= 0 && amount > 0) {
        warnings.push({ row: currentRowNum, field: "QUANTITY", issue: "Quantity is zero but amount exists", suggested: "Check quantity" });
        hasWarning = true;
      }

      const itemData = {
        sourceRowNumber: currentRowNum,
        itemCode: itemNumber || `ROW-${currentRowNum}`,
        description: descCell,
        unit: unit || "LOT",
        quantity: qty,
        materialUnitCost: getNum(row.getCell(cMat)),
        laborUnitCost: getNum(row.getCell(cLab)),
        equipmentUnitCost: getNum(row.getCell(cEqu)),
        directCost: getNum(row.getCell(cTdc)),
        ocmAmount: getNum(row.getCell(cOcm)),
        cpAmount: getNum(row.getCell(cCp)),
        vatAmount: getNum(row.getCell(cVat)),
        indirectCost: getNum(row.getCell(cTic)),
        combinedUnitCost: getNum(row.getCell(cUc)),
        totalCost: amount,
        percentageOfTotal: getNum(row.getCell(cPct)) * 100, // stored as percentage
      };

      items.push(itemData);

      if (hasError) errorRowsCount++;
      else if (hasWarning) warningRowsCount++;
      else validRowsCount++;

      currentRowNum++;
    }

    // Step 5: Validate Grand Total
    const computedTotal = items.reduce((acc, item) => acc + item.totalCost, 0);
    if (Math.abs(computedTotal - grandTotal) > 0.05) {
      errors.push({ row: "ALL", field: "AMOUNT", issue: "Grand Total does not match sum of item amounts", suggested: "Check item amounts" });
      errorRowsCount++;
    }

    if (Math.abs(totalPercentage - 1) > 0.05) { // Assuming it's 1.0 = 100%
      errors.push({ row: "ALL", field: "% OF TOTAL", issue: "Total percentage is not 100%", suggested: "Check amount and percentage calculations" });
      errorRowsCount++;
    }

    const validationStatus = errors.length > 0 ? "VALIDATION_FAILED" : "DRAFT_UPLOADED";

    // Securely preserve original file
    let blobUrl = '';
    if (process.env.AWS_ACCESS_KEY_ID) {
      const mimeType = fileName.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream';
      const key = `boq-uploads/${targetProjectId}/${Date.now()}-${fileName}`;
      await put(buffer, key, mimeType);
      blobUrl = `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
    } else {
      console.warn("BLOB_READ_WRITE_TOKEN is missing. Falling back to local filesystem for upload.");
      try {
        const dir = path.join(process.cwd(), 'public', 'uploads', 'boq-uploads', targetProjectId);
        fs.mkdirSync(dir, { recursive: true });
        const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = path.join(dir, safeName);
        fs.writeFileSync(filePath, buffer);
        blobUrl = `/uploads/boq-uploads/${targetProjectId}/${safeName}`;
      } catch (err) {
        console.warn("Could not save file to local filesystem (likely Vercel read-only environment). Continuing without saving file.", err);
      }
    }

    // Step 6: Save BOQTemplateUpload record
    // @ts-ignore - Prisma client typing mismatch for BOQTemplateUpload
    let uploadRecord = await prisma.bOQTemplateUpload.create({
      data: {
        projectId: targetProjectId,
        uploadedByUserId: user.id,
        uploadedByName: user.name || "Unknown",
        fileName,
        templateVersion,
        status: validationStatus,
        grandTotal,
        totalPercentage: totalPercentage * 100, // store as 100.00
        ocmRate,
        cpRate,
        vatRate,
        validRows: validRowsCount,
        errorRows: errorRowsCount,
        warningRows: warningRowsCount,
        fileUrl: blobUrl,
        validationReport: JSON.stringify({ errors, warnings, items }),
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userRole: user.role,
        moduleName: "BOQ_TEMPLATE_CENTER",
        transactionId: uploadRecord.id,
        actionType: "FILE_UPLOADED_AND_VALIDATED",
        remarks: `Uploaded BOQ ${fileName}. Status: ${validationStatus}. ValidRows: ${validRowsCount}, Errors: ${errorRowsCount}`,
      }
    });

    return {
      success: true,
      uploadId: uploadRecord.id,
      status: validationStatus,
      report: {
        fileName,
        fileUrl: blobUrl,
        templateVersion,
        projectName,
        location,
        subject,
        letterhead: { line1, line2, line3, logo: logoData },
        ocmRate,
        cpRate,
        vatRate,
        validRowsCount,
        errorRowsCount,
        warningRowsCount,
        grandTotal,
        totalPercentage: totalPercentage * 100,
        errors,
        warnings,
      }
    };

  } catch (error: any) {
    console.error("BOQ Upload Parse Error:", error);
    return {
      success: false,
      error: error.message || "Failed to process BOQ upload"
    };
  }
}
