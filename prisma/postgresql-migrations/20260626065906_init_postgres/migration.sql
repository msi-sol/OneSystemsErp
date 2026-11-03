-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('CORPORATION', 'PARTNERSHIP', 'SOLE_PROPRIATOR', 'INDIVIDUAL_CONTRACTOR');

-- CreateEnum
CREATE TYPE "Specialization" AS ENUM ('CIVIL', 'ARCHITECTURAL', 'ELECTRICAL', 'MECHANICAL', 'PLUMBING', 'FIRE_PROTECTION', 'FDAS', 'AUXILIARY_ELV', 'HVAC', 'STRUCTURED_CABLING', 'TESTING_COMMISSIONING', 'HAULING', 'LABOR_ONLY', 'SUPPLY_INSTALL');

-- CreateEnum
CREATE TYPE "AccreditationStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'BLACKLISTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('LABOR_ONLY', 'SUPPLY_ONLY', 'SUPPLY_INSTALL', 'EQUIPMENT_RENTAL', 'TESTING_COMMISSIONING', 'RECTIFICATION', 'PROFESSIONAL_SERVICE', 'LUMP_SUM');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('DIRECT', 'INDIRECT', 'GENERAL_REQUIREMENT', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('PROGRESS', 'MILESTONE', 'LUMP_SUM', 'PER_QUANTITY', 'PER_LOT', 'PER_DAY', 'PER_MANPOWER');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'FOR_REVIEW', 'FOR_BUDGET_VALIDATION', 'FOR_TECHNICAL_APPROVAL', 'FOR_FINAL_APPROVAL', 'APPROVED', 'AGREEMENT_ISSUED', 'JOB_ORDER_ISSUED', 'ONGOING', 'FOR_INSPECTION', 'PARTIALLY_ACCOMPLISHED', 'FOR_BILLING', 'BILLED', 'PARTIALLY_PAID', 'FULLY_PAID', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialResponsibility" AS ENUM ('COMPANY_SUPPLIED', 'CONTRACTOR_SUPPLIED', 'MIXED');

-- CreateEnum
CREATE TYPE "JobOrderStatus" AS ENUM ('DRAFT', 'FOR_REVIEW', 'FOR_FINANCIAL_REVIEW', 'FOR_TECHNICAL_REVIEW', 'APPROVED', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccomplishmentStatus" AS ENUM ('DRAFT', 'FOR_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AccountingStatus" AS ENUM ('PENDING', 'REVIEWED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FOR_SITE_VALIDATION', 'FOR_ACCOUNTING_REVIEW', 'FOR_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'RETURNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FOR_VALIDATION', 'APPROVED_FOR_PAYMENT', 'PAID');

-- CreateEnum
CREATE TYPE "AcknowledgmentStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('NONE', 'DISPUTED');

-- CreateEnum
CREATE TYPE "BackChargeStatus" AS ENUM ('DRAFT', 'FOR_REVIEW', 'ISSUED_TO_SUBCONTRACTOR', 'ACKNOWLEDGED', 'APPROVED', 'DEDUCTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeductionStatus" AS ENUM ('PENDING', 'DEDUCTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "password" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PROJECT_ENGINEER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "defaultRole" TEXT,
    "department" TEXT,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "contractAmountVATInclusive" BOOLEAN NOT NULL DEFAULT true,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 12.0,
    "retentionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "withholdingTaxPercentage" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "mobilizationAdvanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceRecoupmentMethod" TEXT NOT NULL DEFAULT 'PRO_RATA',
    "liquidatedDamagesRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentTerms" TEXT,
    "boqLocked" BOOLEAN NOT NULL DEFAULT false,
    "consolidatedBOQLocked" BOOLEAN NOT NULL DEFAULT false,
    "procurementBenchmarkLocked" BOOLEAN NOT NULL DEFAULT false,
    "contractNumber" TEXT,
    "client" TEXT,
    "contractor" TEXT,
    "gpsLatitude" DOUBLE PRECISION,
    "gpsLongitude" DOUBLE PRECISION,
    "acceptableGeotagRadius" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "projectCategory" TEXT,
    "fundingSource" TEXT,
    "contractAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalContractDuration" INTEGER,
    "noticeToProceedDate" TIMESTAMP(3),
    "originalCompletionDate" TIMESTAMP(3),
    "revisedCompletionDate" TIMESTAMP(3),
    "implementingOffice" TEXT,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUserAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectRole" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "assignmentStatus" TEXT NOT NULL DEFAULT 'active',
    "assignedBy" TEXT,
    "dateAssigned" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRemoved" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectUserAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardedBOQItem" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "directCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "indirectCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "combinedUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "previousQuantityAccomplished" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentQuantityAccomplished" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalQuantityAccomplished" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentageAccomplished" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountAccomplished" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedClientVoQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedContractQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedContractUnitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedContractAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousBilledQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBillingQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBilledQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueRecognized" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualOrderedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualDeliveredQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualInstalledQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalApprovedInstalledQuantity" DOUBLE PRECISION,
    "materialSavingsQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialSavingsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wastageQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiValidationRequired" BOOLEAN NOT NULL DEFAULT true,
    "requiredEvidenceType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processingType" TEXT NOT NULL DEFAULT 'MATERIAL_EQUIPMENT',
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardedBOQItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementBenchmarkItem" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ProcurementBenchmarkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidatedBOQItem" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "projectId" TEXT NOT NULL,
    "deliveredQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voAdditiveQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voDeductiveQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voAdditiveCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voDeductiveCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedTotalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wasteAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedBenchmarkUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requestedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subcontractedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jobOrderQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subcontractorVoQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingBenchmarkQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "committedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantityVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "savings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overrun" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valueEngineeringSavings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isVariationItem" BOOLEAN NOT NULL DEFAULT false,
    "sourceVoNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsolidatedBOQItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOQMapping" (
    "id" TEXT NOT NULL,
    "mappingType" TEXT NOT NULL,
    "allocationPercentage" DOUBLE PRECISION,
    "allocationQuantity" DOUBLE PRECISION,
    "remarks" TEXT,
    "aiConfidenceScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "awardedBoqItemId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BOQMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "contactPerson" TEXT,
    "contactNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "website" TEXT,
    "plantLocation" TEXT,
    "isVatable" BOOLEAN NOT NULL DEFAULT true,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "mrNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "projectId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "preparerId" TEXT,
    "checkerId" TEXT,
    "approverId" TEXT,
    "purpose" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "locationOfUse" TEXT,
    "remarks" TEXT,
    "aiValidationRisk" TEXT,
    "aiValidationNotes" TEXT,
    "dateNeeded" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequestItem" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "approvedQuantity" DOUBLE PRECISION,
    "mrId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,
    "breakdownData" JSONB,

    CONSTRAINT "MaterialRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "supplierId" TEXT NOT NULL,
    "mrId" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryDate" TIMESTAMP(3),
    "paymentTermsDays" INTEGER,
    "dueDate" TIMESTAMP(3),
    "preparerId" TEXT,
    "reviewerId" TEXT,
    "approverId" TEXT,
    "aiValidationRisk" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canvassFormId" TEXT,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "poId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "totalBreakdownAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "receiptRef" TEXT,
    "supplierName" TEXT,
    "isAccrued" BOOLEAN NOT NULL DEFAULT false,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingEligibility" TEXT NOT NULL DEFAULT 'BILLABLE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "aiValidationStatus" TEXT,
    "approvalStatus" TEXT,
    "aiValidationRisk" TEXT,
    "projectId" TEXT NOT NULL,
    "loggedById" TEXT NOT NULL,
    "costType" TEXT NOT NULL DEFAULT 'DIRECT',
    "awardedBoqItemId" TEXT,
    "consolidatedBoqItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewerId" TEXT,
    "approverId" TEXT,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseBreakdownItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specification" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "supplierName" TEXT,
    "purchaseReferenceNo" TEXT,
    "receiptInvoiceNo" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseBreakdownItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseProofFile" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "breakdownItemId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileHash" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',

    CONSTRAINT "ExpenseProofFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAIValidation" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "validationScore" DOUBLE PRECISION,
    "findings" TEXT,
    "recommendations" TEXT,
    "duplicateWarning" BOOLEAN NOT NULL DEFAULT false,
    "budgetWarning" BOOLEAN NOT NULL DEFAULT false,
    "scopeAlignmentResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAIValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseApprovalLog" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionByUserId" TEXT NOT NULL,
    "comments" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashAccount" (
    "id" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "department" TEXT,
    "fundLimit" DOUBLE PRECISION NOT NULL,
    "replenishmentTrigger" DOUBLE PRECISION,
    "currentBalance" DOUBLE PRECISION NOT NULL,
    "projectId" TEXT,
    "custodianId" TEXT NOT NULL,
    "approverId" TEXT,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashExpense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "payee" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isVat" BOOLEAN NOT NULL DEFAULT false,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingEligibility" TEXT NOT NULL DEFAULT 'BILLABLE',
    "receiptNumber" TEXT,
    "attachmentUrl" TEXT,
    "isNoReceipt" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expenseId" TEXT,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT,
    "replenishmentId" TEXT,
    "costType" TEXT NOT NULL DEFAULT 'DIRECT',
    "awardedBoqItemId" TEXT,
    "consolidatedBoqItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashReplenishment" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fundLimit" DOUBLE PRECISION NOT NULL,
    "beginningBalance" DOUBLE PRECISION NOT NULL,
    "totalExpenses" DOUBLE PRECISION NOT NULL,
    "cashOnHand" DOUBLE PRECISION NOT NULL,
    "amountRequested" DOUBLE PRECISION NOT NULL,
    "reviewerAction" TEXT,
    "reviewerRemarks" TEXT,
    "approverId" TEXT,
    "approvalDate" TIMESTAMP(3),
    "releaseDate" TIMESTAMP(3),
    "releaseMode" TEXT,
    "releaseRefNo" TEXT,
    "receiverId" TEXT,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashReplenishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "suffix" TEXT,
    "nickname" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "civilStatus" TEXT,
    "mobileNumber" TEXT,
    "emailAddress" TEXT,
    "completeAddress" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactNumber" TEXT,
    "emergencyContactRelation" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'PROJECT_BASED',
    "workerCategory" TEXT NOT NULL DEFAULT 'SKILLED',
    "designation" TEXT,
    "department" TEXT,
    "dateHired" TIMESTAMP(3),
    "engagementStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "restDay" TEXT,
    "standardWorkHours" DOUBLE PRECISION DEFAULT 8,
    "overtimeEligible" BOOLEAN NOT NULL DEFAULT true,
    "nightDifferentialEligible" BOOLEAN NOT NULL DEFAULT true,
    "holidayPayEligible" BOOLEAN NOT NULL DEFAULT true,
    "subjectToAttendance" BOOLEAN NOT NULL DEFAULT true,
    "subjectToPayrollCutoff" BOOLEAN NOT NULL DEFAULT true,
    "rateType" TEXT NOT NULL DEFAULT 'DAILY_RATE',
    "basicMonthlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pieceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitDescription" TEXT,
    "contractAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "professionalFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentBasis" TEXT,
    "billingFrequency" TEXT,
    "prorationMethod" TEXT,
    "retentionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withholdingTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tinNumber" TEXT,
    "sssNumber" TEXT,
    "philHealthNumber" TEXT,
    "pagIbigNumber" TEXT,
    "umidNumber" TEXT,
    "nationalIdNumber" TEXT,
    "validIdType" TEXT,
    "validIdNumber" TEXT,
    "validIdExpiryDate" TIMESTAMP(3),
    "withholdingTaxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sssDeductionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "philHealthDeductionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pagibigDeductionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "otherGovernmentDeductionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxClassification" TEXT NOT NULL DEFAULT 'COMPENSATION_EMPLOYEE',
    "withholdingTaxType" TEXT NOT NULL DEFAULT 'COMPENSATION_WITHHOLDING_TAX',
    "taxExemptionReason" TEXT,
    "birFormType" TEXT,
    "registeredBusinessName" TEXT,
    "officialReceiptRequired" BOOLEAN NOT NULL DEFAULT false,
    "taxStatus" TEXT NOT NULL DEFAULT 'SINGLE',
    "payrollMode" TEXT NOT NULL DEFAULT 'CASH',
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "gcashAccountName" TEXT,
    "gcashNumber" TEXT,
    "checkPayeeName" TEXT,
    "billingPayeeName" TEXT,
    "billingAddress" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allowedPaymentMethod" TEXT DEFAULT 'Manual Hold',
    "bankAccountType" TEXT,
    "bankApprovedBy" TEXT,
    "bankBranch" TEXT,
    "bankLastUpdatedDate" TIMESTAMP(3),
    "bankSupportingAttachment" TEXT,
    "bankUpdatedBy" TEXT,
    "bankVerificationStatus" TEXT DEFAULT 'Pending',
    "gcashApprovedBy" TEXT,
    "gcashLastUpdatedDate" TIMESTAMP(3),
    "gcashSupportingAttachment" TEXT,
    "gcashUpdatedBy" TEXT,
    "gcashVerificationStatus" TEXT DEFAULT 'Pending',
    "paymentHoldReason" TEXT,
    "paymentProfileStatus" TEXT DEFAULT 'Pending',
    "paymentRemarks" TEXT,
    "payrollCategory" TEXT DEFAULT 'Other',
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIWorkerValidationResult" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fieldRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ignoreReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIWorkerValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerDocument" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "remarks" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTimeRecord" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nightDiffHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restDayHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holidayHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "absenceStatus" TEXT,
    "sourceFile" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "encodedById" TEXT,
    "payrollPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTimeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "payrollBatchNumber" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "calendarRule" TEXT NOT NULL DEFAULT 'SEMI_MONTHLY',
    "periodType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "payrollDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "projectId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "dateApproved" TIMESTAMP(3),
    "dateReleased" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "dummyField" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destinationAddress" TEXT,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "projectId" TEXT,
    "compensationType" TEXT NOT NULL DEFAULT 'DAILY',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daysWorked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basicPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nightDiffPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holidayPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restDayPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nonTaxableAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossTaxablePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sssDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sssEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sssEcEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sssWispDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sssWispEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "philhealthDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "philhealthEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pagibigDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pagibigEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableCompensation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "birPayrollFrequency" TEXT,
    "birEffectiveYear" INTEGER,
    "birBracketNo" INTEGER,
    "birBaseTax" DOUBLE PRECISION,
    "birTaxRatePercent" DOUBLE PRECISION,
    "birExcessOver" DOUBLE PRECISION,
    "withholdingTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualTaxAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalWithholdingTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashAdvance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loanDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateUndertimeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "paymentMethod" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentHoldReason" TEXT,
    "paymentBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "transactionReference" TEXT,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEarning" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "earningType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "taxableStatus" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,

    CONSTRAINT "PayrollEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDeduction" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "deductionType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "recurringStatus" BOOLEAN NOT NULL DEFAULT false,
    "governmentMandatedStatus" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,

    CONSTRAINT "PayrollDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollApproval" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "approvalLevel" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalDate" TIMESTAMP(3),
    "remarks" TEXT,

    CONSTRAINT "PayrollApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeductionLedger" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "deductionPerPayroll" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeductionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeductionLog" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "amountDeducted" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeductionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allowance" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL DEFAULT 'PER_PAYROLL',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernmentSettings" (
    "id" TEXT NOT NULL,
    "phEmployeeRate" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "phEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "phSalaryFloor" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "phSalaryCeiling" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "pagibigEmployeeRate" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "pagibigEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "pagibigMaxSalary" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "deductionSchedule" TEXT NOT NULL DEFAULT 'SPLIT',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernmentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SSSTable" (
    "id" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL DEFAULT 2025,
    "minCompensation" DOUBLE PRECISION NOT NULL,
    "maxCompensation" DOUBLE PRECISION NOT NULL,
    "monthlySalaryCredit" DOUBLE PRECISION NOT NULL,
    "regularSsEmployer" DOUBLE PRECISION NOT NULL,
    "regularSsEmployee" DOUBLE PRECISION NOT NULL,
    "ecEmployer" DOUBLE PRECISION NOT NULL,
    "wispEmployer" DOUBLE PRECISION NOT NULL,
    "wispEmployee" DOUBLE PRECISION NOT NULL,
    "totalEmployer" DOUBLE PRECISION NOT NULL,
    "totalEmployee" DOUBLE PRECISION NOT NULL,
    "totalContribution" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SSSTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BIRWithholdingTaxTable" (
    "id" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL DEFAULT 2025,
    "payrollFrequency" TEXT NOT NULL,
    "bracketNo" INTEGER,
    "compensationFrom" DOUBLE PRECISION NOT NULL,
    "compensationTo" DOUBLE PRECISION,
    "baseTax" DOUBLE PRECISION NOT NULL,
    "taxRatePercent" DOUBLE PRECISION NOT NULL,
    "excessOver" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BIRWithholdingTaxTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "actionType" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "remarks" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "projectId" TEXT,
    "uploaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "poId" TEXT NOT NULL,
    "receivedById" TEXT,
    "verifierId" TEXT,
    "reviewerId" TEXT,
    "approverId" TEXT,
    "proofFileUrl" TEXT,
    "hasProof" BOOLEAN NOT NULL DEFAULT true,
    "isMismatch" BOOLEAN NOT NULL DEFAULT false,
    "mismatchNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryItem" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,
    "remarks" TEXT,
    "drQuantity" DOUBLE PRECISION,

    CONSTRAINT "DeliveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionLog" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "loggedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumptionItem" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "logId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,

    CONSTRAINT "ConsumptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIssuance" (
    "id" TEXT NOT NULL,
    "misNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activity" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "foremanId" TEXT NOT NULL,
    "warehousemanId" TEXT,
    "accountantId" TEXT,
    "releasedById" TEXT,
    "releaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuanceItem" (
    "id" TEXT NOT NULL,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "releasedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuanceId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,

    CONSTRAINT "IssuanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReturn" (
    "id" TEXT NOT NULL,
    "mrsNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "issuanceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "foremanId" TEXT NOT NULL,
    "warehousemanId" TEXT,
    "receiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" TEXT NOT NULL,
    "returnedQty" DOUBLE PRECISION NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "returnId" TEXT NOT NULL,
    "issuanceItemId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountsPayable" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voucherNumber" TEXT,

    CONSTRAINT "AccountsPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOQLotBreakdown" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weightPercentage" DOUBLE PRECISION NOT NULL,
    "boqItemId" TEXT NOT NULL,

    CONSTRAINT "BOQLotBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accomplishment" (
    "id" TEXT NOT NULL,
    "billingPeriod" TEXT NOT NULL,
    "accomplishmentDate" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "preparedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAmount" DOUBLE PRECISION,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accomplishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccomplishmentItem" (
    "id" TEXT NOT NULL,
    "workCategory" TEXT,
    "descriptionOfWork" TEXT,
    "previousQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentQuantityClaimed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedQuantity" DOUBLE PRECISION,
    "totalQuantityToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentAccomplishmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAccomplishmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentageAccomplished" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiValidationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "inspectionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "accomplishmentId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,

    CONSTRAINT "AccomplishmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "inspectionDateRequested" TIMESTAMP(3),
    "actualQuantityVerified" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inspectionFindings" TEXT,
    "deficiencies" TEXT,
    "punchlistItems" TEXT,
    "inspectorName" TEXT,
    "dateInspected" TIMESTAMP(3),
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "accomplishmentItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Billing" (
    "id" TEXT NOT NULL,
    "billingNumber" TEXT NOT NULL,
    "billingPeriodFrom" TIMESTAMP(3) NOT NULL,
    "billingPeriodTo" TIMESTAMP(3) NOT NULL,
    "billingDate" TIMESTAMP(3) NOT NULL,
    "billingType" TEXT NOT NULL,
    "contractAmount" DOUBLE PRECISION NOT NULL,
    "revisedContractAmount" DOUBLE PRECISION NOT NULL,
    "totalPreviousBilling" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBillingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBillingToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceContractAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiBillingRiskStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "preparedById" TEXT,
    "checkedById" TEXT,
    "approvedById" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingItem" (
    "id" TEXT NOT NULL,
    "contractQuantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "contractAmount" DOUBLE PRECISION NOT NULL,
    "previousQuantityBilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentQuantityForBilling" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalQuantityBilledToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousAmountBilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmountToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentageAccomplished" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiStatus" TEXT,
    "aiRiskLevel" TEXT,
    "billingId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,

    CONSTRAINT "BillingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDeduction" (
    "id" TEXT NOT NULL,
    "grossBilling" DOUBLE PRECISION NOT NULL,
    "retention" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withholdingTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mobilizationAdvanceRecoupment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousOverpayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liquidatedDamages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "backCharges" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmountDue" DOUBLE PRECISION NOT NULL,
    "billingId" TEXT NOT NULL,

    CONSTRAINT "BillingDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "billingAmount" DOUBLE PRECISION NOT NULL,
    "approvedAmount" DOUBLE PRECISION NOT NULL,
    "netAmountDue" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentReferenceNumber" TEXT,
    "bankOrCheckNumber" TEXT,
    "orNumber" TEXT,
    "ewtCertificateReference" TEXT,
    "paymentStatus" TEXT NOT NULL,
    "remarks" TEXT,
    "billingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationOrder" (
    "id" TEXT NOT NULL,
    "voNumber" TEXT NOT NULL,
    "dateRequested" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT,
    "requestingDepartment" TEXT,
    "variationType" TEXT NOT NULL,
    "variationCategory" TEXT,
    "sourceOfVariation" TEXT,
    "reasonForVariation" TEXT,
    "detailedDescription" TEXT,
    "affectedLocation" TEXT,
    "affectedFloorZone" TEXT,
    "originalContractAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPreviouslyApprovedAdditive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPreviouslyApprovedDeductive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentRevisedContractAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductiveAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netVariationAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentageImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeImpact" TEXT NOT NULL DEFAULT 'TO_BE_EVALUATED',
    "additionalCalendarDaysRequested" INTEGER NOT NULL DEFAULT 0,
    "effectOnCriticalPath" TEXT NOT NULL DEFAULT 'TO_BE_EVALUATED',
    "effectOnProjectCompletionDate" TIMESTAMP(3),
    "technicalJustification" TEXT,
    "commercialJustification" TEXT,
    "safetyJustification" TEXT,
    "clientInstructionReference" TEXT,
    "consultantInstructionReference" TEXT,
    "drawingReference" TEXT,
    "siteInstructionReference" TEXT,
    "inspectionReportReference" TEXT,
    "quantityTakeOffReference" TEXT,
    "costEstimateReference" TEXT,
    "supplierQuotationReference" TEXT,
    "subcontractorQuotationReference" TEXT,
    "aiValidationResult" TEXT,
    "aiRiskRating" TEXT,
    "currentStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvalHistory" TEXT,
    "remarks" TEXT,
    "approvedForImplementation" BOOLEAN NOT NULL DEFAULT false,
    "approvedForProcurement" BOOLEAN NOT NULL DEFAULT false,
    "approvedForSubcontracting" BOOLEAN NOT NULL DEFAULT false,
    "approvedForJobOrder" BOOLEAN NOT NULL DEFAULT false,
    "approvedForBilling" BOOLEAN NOT NULL DEFAULT false,
    "subcontractPackageId" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationOrderItem" (
    "id" TEXT NOT NULL,
    "voItemNumber" TEXT NOT NULL,
    "itemClassification" TEXT NOT NULL,
    "workCategory" TEXT,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "originalQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previouslyApprovedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentProposedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proposedUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductiveAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costSource" TEXT,
    "pricingBasis" TEXT,
    "materialCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equipmentCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subcontractCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transportationCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consumables" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overhead" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitMarkup" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherDirectCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierQuotationReference" TEXT,
    "subcontractorQuotationReference" TEXT,
    "canvassReference" TEXT,
    "attachmentReference" TEXT,
    "procurementStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "subcontractStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "accomplishmentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "billingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "variationOrderId" TEXT NOT NULL,
    "originalBoqItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationOrderDocument" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "documentCategory" TEXT NOT NULL,
    "remarks" TEXT,
    "uploadedById" TEXT,
    "variationOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationOrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationOrderApproval" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionById" TEXT,
    "remarks" TEXT,
    "variationOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationOrderApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIVariationOrderValidation" (
    "id" TEXT NOT NULL,
    "validationType" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "confidenceLevel" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "findings" TEXT,
    "missingRequirements" TEXT,
    "duplicateWarnings" TEXT,
    "recommendedAction" TEXT,
    "variationOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIVariationOrderValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLatitude" DOUBLE PRECISION,
    "gpsLongitude" DOUBLE PRECISION,
    "dateTaken" TIMESTAMP(3),
    "metadataStatus" TEXT,
    "description" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "projectId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "accomplishmentId" TEXT,

    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCamera" (
    "id" TEXT NOT NULL,
    "cameraName" TEXT NOT NULL,
    "cameraLocation" TEXT,
    "cameraType" TEXT,
    "streamUrl" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "gpsLatitude" DOUBLE PRECISION,
    "gpsLongitude" DOUBLE PRECISION,
    "installationDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "ProjectCamera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveCameraSnapshot" (
    "id" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedById" TEXT,
    "cameraId" TEXT NOT NULL,

    CONSTRAINT "LiveCameraSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationRun" (
    "id" TEXT NOT NULL,
    "validationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "visualScore" DOUBLE PRECISION,
    "locationScore" DOUBLE PRECISION,
    "dateScore" DOUBLE PRECISION,
    "boqMatchScore" DOUBLE PRECISION,
    "planMatchScore" DOUBLE PRECISION,
    "duplicateRiskScore" DOUBLE PRECISION,
    "recommendation" TEXT,
    "summaryFindings" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "accomplishmentId" TEXT,
    "billingId" TEXT,
    "boqItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIValidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationEvidence" (
    "id" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "capturedFromLiveCamera" BOOLEAN NOT NULL DEFAULT false,
    "cameraId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3),
    "metadataStatus" TEXT,
    "aiValidationRunId" TEXT NOT NULL,
    "evidenceFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIValidationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationFinding" (
    "id" TEXT NOT NULL,
    "findingCategory" TEXT NOT NULL,
    "findingTitle" TEXT NOT NULL,
    "findingDescription" TEXT,
    "severity" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "relatedFileId" TEXT,
    "relatedBoqItemId" TEXT,
    "recommendedAction" TEXT,
    "aiValidationRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIValidationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIDuplicatePhotoCheck" (
    "id" TEXT NOT NULL,
    "currentFileId" TEXT NOT NULL,
    "matchedFileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "matchType" TEXT NOT NULL,
    "previousBillingId" TEXT,
    "previousAccomplishmentId" TEXT,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIDuplicatePhotoCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIHumanReview" (
    "id" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "remarks" TEXT,
    "overrideReason" TEXT,
    "aiValidationRunId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIHumanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "businessType" "BusinessType" NOT NULL,
    "address" TEXT,
    "contactPerson" TEXT,
    "contactNumber" TEXT,
    "email" TEXT,
    "tin" TEXT,
    "birReg" TEXT,
    "dtiSecReg" TEXT,
    "mayorPermit" TEXT,
    "pcabLicense" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "specialization" JSONB,
    "accreditation" "AccreditationStatus" NOT NULL DEFAULT 'PENDING',
    "contractType" TEXT NOT NULL DEFAULT 'SUBCONTRACTOR',
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "requiredDocs" JSONB,
    "docExpiries" JSONB,
    "safetyRecords" JSONB,
    "evaluationRating" INTEGER,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcontractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramOfWorks" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "activities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramOfWorks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorBOQItem" (
    "id" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "awardedBoqItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractorBOQItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccomplishmentRecord" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "description" TEXT,
    "quantityCompleted" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photos" JSONB,
    "videos" JSONB,
    "aiValidationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccomplishmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationResult" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractPackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "packageNumber" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "workCategory" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "awardedBoqItemId" TEXT,
    "masterBoqItemId" TEXT,
    "scopeOfWork" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "floorBuildingZone" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "contractAmount" DOUBLE PRECISION NOT NULL,
    "internalBudget" DOUBLE PRECISION,
    "costType" "CostType" NOT NULL,
    "paymentTerms" "PaymentTerms" NOT NULL,
    "retentionPct" DOUBLE PRECISION,
    "whtPct" DOUBLE PRECISION,
    "mobilizationAdvance" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "targetCompletion" TIMESTAMP(3),
    "warrantyPeriod" INTEGER,
    "attachments" JSONB,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consolidatedBoqItemId" TEXT,

    CONSTRAINT "SubcontractPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrder" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT,
    "packageId" TEXT,
    "description" TEXT NOT NULL,
    "boqReferenceId" TEXT,
    "location" TEXT NOT NULL,
    "contractAmount" DOUBLE PRECISION NOT NULL,
    "paymentBasis" "PaymentTerms" NOT NULL,
    "startDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "requiredOutput" TEXT,
    "materialResponsibility" "MaterialResponsibility" NOT NULL,
    "safetyRequirements" TEXT,
    "acceptanceCriteria" TEXT,
    "attachments" JSONB,
    "preparedBy" TEXT,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "status" "JobOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consolidatedBoqItemId" TEXT,

    CONSTRAINT "JobOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractAccomplishment" (
    "id" TEXT NOT NULL,
    "packageId" TEXT,
    "jobOrderId" TEXT,
    "workDescription" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "prevPercent" DOUBLE PRECISION NOT NULL,
    "currentPercent" DOUBLE PRECISION NOT NULL,
    "cumulativePercent" DOUBLE PRECISION NOT NULL,
    "prevQty" DOUBLE PRECISION NOT NULL,
    "currentQty" DOUBLE PRECISION NOT NULL,
    "totalQty" DOUBLE PRECISION NOT NULL,
    "remainingQty" DOUBLE PRECISION NOT NULL,
    "photos" JSONB,
    "videos" JSONB,
    "inspectionReport" TEXT,
    "qaQcStatus" TEXT,
    "materialIssuedRef" TEXT,
    "deliveryRef" TEXT,
    "remarks" TEXT,
    "preparedBy" TEXT,
    "verifiedBy" TEXT,
    "approvedBy" TEXT,
    "status" "AccomplishmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractAccomplishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractBilling" (
    "id" TEXT NOT NULL,
    "billingNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "packageId" TEXT,
    "jobOrderId" TEXT,
    "contractAmount" DOUBLE PRECISION NOT NULL,
    "previousGross" DOUBLE PRECISION NOT NULL,
    "currentGross" DOUBLE PRECISION NOT NULL,
    "totalGross" DOUBLE PRECISION NOT NULL,
    "remainingBalance" DOUBLE PRECISION NOT NULL,
    "retentionDeduction" DOUBLE PRECISION,
    "whtDeduction" DOUBLE PRECISION,
    "mobilizationDeduction" DOUBLE PRECISION,
    "backCharges" DOUBLE PRECISION,
    "materialCharges" DOUBLE PRECISION,
    "penalties" DOUBLE PRECISION,
    "otherDeductions" DOUBLE PRECISION,
    "netPayable" DOUBLE PRECISION NOT NULL,
    "billingPeriod" TEXT,
    "supportingDocs" JSONB,
    "aiValidationResult" JSONB,
    "accountingStatus" "AccountingStatus" NOT NULL DEFAULT 'PENDING',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "status" "BillingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubcontractBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackCharge" (
    "id" TEXT NOT NULL,
    "backChargeNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "packageId" TEXT,
    "jobOrderId" TEXT,
    "description" TEXT NOT NULL,
    "incidentDate" TIMESTAMP(3),
    "costComputation" DOUBLE PRECISION NOT NULL,
    "photos" JSONB,
    "inspectionReport" TEXT,
    "materialRef" TEXT,
    "manpowerRef" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "acknowledgment" "AcknowledgmentStatus" NOT NULL DEFAULT 'PENDING',
    "disputeStatus" "DisputeStatus" NOT NULL DEFAULT 'NONE',
    "approvalStatus" "BackChargeStatus" NOT NULL DEFAULT 'DRAFT',
    "deductionStatus" "DeductionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCutoffSetting" (
    "id" TEXT NOT NULL,
    "cutoffName" TEXT NOT NULL,
    "cutoffType" TEXT NOT NULL,
    "startDay" INTEGER,
    "endDay" INTEGER,
    "payrollReleaseDay" INTEGER,
    "crossesMonth" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "appliesTo" TEXT NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollCutoffSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRecord" (
    "id" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notebookType" TEXT NOT NULL,
    "notebookUrl" TEXT,
    "relatedModule" TEXT,
    "documentType" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1.0',
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "owner" TEXT,
    "preparedBy" TEXT,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateReviewed" TIMESTAMP(3),
    "dateApproved" TIMESTAMP(3),
    "tags" TEXT,
    "uploadedFileUrl" TEXT,
    "summary" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeReference" (
    "id" TEXT NOT NULL,
    "knowledgeRecordId" TEXT NOT NULL,
    "projectId" TEXT,
    "workerId" TEXT,
    "payrollPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeAuditTrail" (
    "id" TEXT NOT NULL,
    "knowledgeRecordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeAuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollBankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankBranch" TEXT,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "beginningBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentAvailableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedPayrollBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualBankBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastBalanceSyncDate" TIMESTAMP(3),
    "apiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bankApiProvider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "PayrollBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollBankLedger" (
    "id" TEXT NOT NULL,
    "payrollBankAccountId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "referenceId" TEXT,
    "referenceNumber" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "PayrollBankLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollFundingRequest" (
    "id" TEXT NOT NULL,
    "fundingRequestNumber" TEXT NOT NULL,
    "payrollBatchId" TEXT,
    "payrollPeriodId" TEXT NOT NULL,
    "totalNetPay" DOUBLE PRECISION NOT NULL,
    "estimatedCharges" DOUBLE PRECISION NOT NULL,
    "totalRequiredFunding" DOUBLE PRECISION NOT NULL,
    "availablePayrollBalance" DOUBLE PRECISION NOT NULL,
    "fundingShortage" DOUBLE PRECISION NOT NULL,
    "fundingSourceAccount" TEXT,
    "destinationAccountId" TEXT NOT NULL,
    "fundingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "preparedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "dateFunded" TIMESTAMP(3),
    "fundingBankReferenceNumber" TEXT,
    "proofOfTransferUrl" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollFundingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "payrollBatchId" TEXT,
    "payrollPeriodId" TEXT NOT NULL,
    "paymentMethodType" TEXT NOT NULL,
    "transferRail" TEXT,
    "providerId" TEXT,
    "providerBatchReference" TEXT,
    "expectedSettlementDate" TIMESTAMP(3),
    "payrollBankAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "totalWorkers" INTEGER NOT NULL,
    "preparedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "releasedById" TEXT,
    "dateReleased" TIMESTAMP(3),
    "reconciliationFileUrl" TEXT,
    "remarks" TEXT,
    "aiRiskLevel" TEXT,
    "aiAuditNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatchRow" (
    "id" TEXT NOT NULL,
    "paymentBatchId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "transferRail" TEXT,
    "recipientBankName" TEXT,
    "recipientBankCode" TEXT,
    "recipientAccountNumber" TEXT,
    "recipientAccountName" TEXT,
    "gcashMobileNumber" TEXT,
    "gcashAccountName" TEXT,
    "remarks" TEXT,
    "senderReferenceId" TEXT,
    "idempotencyKey" TEXT,
    "originalInstaPayReference" TEXT,
    "unionBankTransactionReference" TEXT,
    "providerResponseCode" TEXT,
    "providerResponseMessage" TEXT,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "expectedSettlementDate" TIMESTAMP(3),
    "datePaid" TIMESTAMP(3),
    "rawApiResponseReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transactionReference" TEXT,
    "exceptionReason" TEXT,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "PaymentBatchRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentException" (
    "id" TEXT NOT NULL,
    "payrollBatchId" TEXT,
    "payrollId" TEXT,
    "workerId" TEXT NOT NULL,
    "requiredPaymentMethod" TEXT,
    "exceptionReason" TEXT NOT NULL,
    "correctiveAction" TEXT,
    "assignedToId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "approvedById" TEXT,
    "dateResolved" TIMESTAMP(3),
    "reprocessedTransactionRef" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION,
    "apiPaymentBatchId" TEXT,
    "payslipNumber" TEXT,
    "recipientBankCode" TEXT,
    "recipientBankName" TEXT,
    "transferRail" TEXT,
    "unionBankResponseCode" TEXT,
    "unionBankResponseMessage" TEXT,

    CONSTRAINT "PaymentException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "transferRail" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'Sandbox',
    "apiBaseUrlSandbox" TEXT,
    "apiBaseUrlProduction" TEXT,
    "oauthTokenUrl" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "partnerId" TEXT,
    "corporateAccountNumber" TEXT,
    "debitAccountNumber" TEXT,
    "debitAccountName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "webhookUrl" TEXT,
    "webhookSigningSecret" TEXT,
    "statusCallbackUrl" TEXT,
    "singleTransactionLimit" DOUBLE PRECISION,
    "dailyTransactionLimit" DOUBLE PRECISION,
    "monthlyTransactionLimit" DOUBLE PRECISION,
    "cutOffTime" TEXT,
    "expectedSettlementTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "lastConnectionTest" TIMESTAMP(3),
    "createdById" TEXT,
    "approvedById" TEXT,
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateActivated" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivingBank" (
    "id" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "shortName" TEXT,
    "instaPayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pesonetEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "rawApiReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivingBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentFallbackRecommendation" (
    "id" TEXT NOT NULL,
    "payslipNumber" TEXT,
    "workerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "originalIntendedRoute" TEXT NOT NULL DEFAULT 'InstaPay',
    "fallbackRoute" TEXT NOT NULL DEFAULT 'PESONet',
    "fallbackReason" TEXT NOT NULL,
    "originalInstaPayRef" TEXT,
    "recommendedBy" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvalDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentFallbackRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "parsedData" JSONB,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAccomplishmentFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "billingId" TEXT,
    "fileName" TEXT NOT NULL,
    "originalFilePath" TEXT NOT NULL,
    "workingFilePath" TEXT,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileVersion" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isLockedOriginal" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "ProjectAccomplishmentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAccomplishmentFileVersion" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "savedBy" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "ProjectAccomplishmentFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAccomplishmentAIFinding" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "billingId" TEXT,
    "findingType" TEXT NOT NULL,
    "sheetName" TEXT,
    "cellReference" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAccomplishmentAIFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRuleReference" (
    "id" TEXT NOT NULL,
    "notebookName" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "ruleCategory" TEXT NOT NULL,
    "ruleTitle" TEXT NOT NULL,
    "ruleDescription" TEXT NOT NULL,
    "affectedProcess" TEXT,
    "validationType" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'BLOCK',
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedDate" TIMESTAMP(3),
    "sourceLink" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeRuleReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRuleAuditLog" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT,
    "moduleName" TEXT NOT NULL,
    "notebookName" TEXT NOT NULL,
    "ruleApplied" TEXT NOT NULL,
    "validationResult" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "userAction" TEXT,
    "overrideRequested" BOOLEAN NOT NULL DEFAULT false,
    "overrideApprovedBy" TEXT,
    "overrideReason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRuleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEditDraft" BOOLEAN NOT NULL DEFAULT false,
    "canSubmit" BOOLEAN NOT NULL DEFAULT false,
    "canReview" BOOLEAN NOT NULL DEFAULT false,
    "canRecommend" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canReject" BOOLEAN NOT NULL DEFAULT false,
    "canReturnForCorrection" BOOLEAN NOT NULL DEFAULT false,
    "canCancel" BOOLEAN NOT NULL DEFAULT false,
    "canRevise" BOOLEAN NOT NULL DEFAULT false,
    "canLock" BOOLEAN NOT NULL DEFAULT false,
    "canUnlockWithAuthorization" BOOLEAN NOT NULL DEFAULT false,
    "canReleasePayment" BOOLEAN NOT NULL DEFAULT false,
    "canMarkAsPaid" BOOLEAN NOT NULL DEFAULT false,
    "canUploadAttachment" BOOLEAN NOT NULL DEFAULT false,
    "canDownloadAttachment" BOOLEAN NOT NULL DEFAULT false,
    "canPrint" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteDraft" BOOLEAN NOT NULL DEFAULT false,
    "canVoidRecord" BOOLEAN NOT NULL DEFAULT false,
    "canViewAuditLogs" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stageName" TEXT NOT NULL,
    "requiredRole" TEXT NOT NULL,
    "actionRequired" TEXT NOT NULL,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionWorkflow" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "preparedBy" TEXT,
    "preparedByRole" TEXT,
    "reviewedBy" TEXT,
    "reviewedByRole" TEXT,
    "recommendedBy" TEXT,
    "recommendedByRole" TEXT,
    "approvedBy" TEXT,
    "approvedByRole" TEXT,
    "paidBy" TEXT,
    "paidByRole" TEXT,
    "currentStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentStage" TEXT NOT NULL DEFAULT 'PREPARATION',
    "nextRequiredRole" TEXT,
    "datePrepared" TIMESTAMP(3),
    "dateReviewed" TIMESTAMP(3),
    "dateRecommended" TIMESTAMP(3),
    "dateApproved" TIMESTAMP(3),
    "datePaid" TIMESTAMP(3),
    "remarks" TEXT,
    "auditReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT,
    "moduleName" TEXT NOT NULL,
    "transactionId" TEXT,
    "actionType" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "remarks" TEXT,
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationLog" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT,
    "userRole" TEXT,
    "validationType" TEXT NOT NULL,
    "validationResult" TEXT NOT NULL,
    "riskLevel" TEXT,
    "aiFindings" TEXT,
    "aiRecommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIValidationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockedRecord" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "LockedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionRequest" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLog" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "processedBy" TEXT NOT NULL,
    "processedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLoginLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLoginLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleConflictRule" (
    "id" TEXT NOT NULL,
    "role1Code" TEXT NOT NULL,
    "role2Code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleConflictRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AINotebookReference" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedByRole" TEXT,
    "projectAssignment" TEXT,
    "moduleAssignment" TEXT,
    "referenceCategory" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING_AI_INDEXING',
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "supersededById" TEXT,
    "approvedBy" TEXT,
    "approvedDate" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "aiIndexingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "aiSummary" TEXT,
    "keywords" TEXT,
    "validationUseCase" TEXT,
    "fileHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AINotebookReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookReference" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "moduleScope" TEXT,
    "projectScope" TEXT,
    "companyWide" BOOLEAN NOT NULL DEFAULT false,
    "mandatoryFlag" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_UPLOAD',
    "activeVersionId" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedByRole" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedByRole" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookReferenceVersion" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "aiSummary" TEXT,
    "aiKeywords" TEXT,
    "fileHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "indexedStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "uploadedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "supersededDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotebookReferenceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookReferenceModule" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,

    CONSTRAINT "NotebookReferenceModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookReferenceRole" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,

    CONSTRAINT "NotebookReferenceRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookReferenceProject" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "NotebookReferenceProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookReferenceApprovalLog" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionByUserId" TEXT NOT NULL,
    "actionByUserRole" TEXT,
    "comments" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotebookReferenceApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotebookReferenceIndexLog" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotebookReferenceIndexLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationRule" (
    "id" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITransactionValidation" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "validationType" TEXT NOT NULL,
    "referenceId" TEXT,
    "referenceVersionId" TEXT,
    "validationStatus" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "aiFindings" TEXT,
    "aiRecommendation" TEXT,
    "blockingFlag" BOOLEAN NOT NULL DEFAULT false,
    "overrideAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AITransactionValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationOverride" (
    "id" TEXT NOT NULL,
    "validationResultId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "overriddenBy" TEXT NOT NULL,
    "overriddenByRole" TEXT NOT NULL,
    "overrideReason" TEXT NOT NULL,
    "supportingAttachment" TEXT,
    "approvedBy" TEXT,
    "approvedByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIValidationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRiskScore" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModulePrompt" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "promptTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModulePrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAuditFinding" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT,
    "moduleName" TEXT,
    "findingType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISearchLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "moduleScope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AINotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "moduleName" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AINotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIReferenceUsageLog" (
    "id" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "transactionId" TEXT,
    "moduleName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIReferenceUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvassForm" (
    "id" TEXT NOT NULL,
    "canvassNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mrId" TEXT,
    "projectId" TEXT NOT NULL,
    "preparedById" TEXT,
    "recommendedSupplierId" TEXT,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvassForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvassItem" (
    "id" TEXT NOT NULL,
    "quantityRequired" DOUBLE PRECISION NOT NULL,
    "canvassFormId" TEXT NOT NULL,
    "consolidatedBoqItemId" TEXT NOT NULL,

    CONSTRAINT "CanvassItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierQuotation" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "deliveryPeriod" TEXT,
    "paymentTerms" TEXT,
    "aiRank" INTEGER,
    "aiRationale" TEXT,
    "canvassFormId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,

    CONSTRAINT "SupplierQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "quantityAvailable" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "brand" TEXT,
    "remarks" TEXT,
    "quotationId" TEXT NOT NULL,
    "canvassItemId" TEXT NOT NULL,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "plateNumber" TEXT,
    "ownershipType" TEXT NOT NULL DEFAULT 'OWNED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hourlyRate" DOUBLE PRECISION DEFAULT 0,
    "purchaseDate" TIMESTAMP(3),
    "fmsDeviceId" TEXT,
    "fmsProvider" TEXT,
    "lastOdometer" DOUBLE PRECISION DEFAULT 0,
    "lastEngineHours" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedDepartment" TEXT,
    "chassisNumber" TEXT,
    "engineNumber" TEXT,
    "fuelType" TEXT DEFAULT 'DIESEL',

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentDeployment" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "driverId" TEXT,
    "targetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" TIMESTAMP(3),
    "dateDeployed" TIMESTAMP(3),
    "dateReturned" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "purpose" TEXT,
    "notes" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "destinationAddress" TEXT,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,

    CONSTRAINT "EquipmentDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentUtilization" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hoursUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelConsumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taskDescription" TEXT,
    "loggedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentUtilization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentMaintenance" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "fmsFaultCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentTelemetry" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "engineState" TEXT,
    "odometer" DOUBLE PRECISION,
    "engineHours" DOUBLE PRECISION,
    "fuelLevel" DOUBLE PRECISION,
    "faultCodes" TEXT,
    "gpsAccuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "ignitionStatus" BOOLEAN,
    "locationSource" TEXT,
    "rawPayloadJson" TEXT,
    "receivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "satelliteCount" INTEGER,

    CONSTRAINT "EquipmentTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAIValidation" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentAIValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HikvisionDevice" (
    "id" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceModel" TEXT,
    "deviceSerialNumber" TEXT NOT NULL,
    "imeiOrUniqueId" TEXT,
    "firmwareVersion" TEXT,
    "integrationType" TEXT NOT NULL DEFAULT 'DEVICE_GATEWAY',
    "ipAddress" TEXT,
    "domainName" TEXT,
    "port" INTEGER,
    "usernameEncrypted" TEXT,
    "passwordEncrypted" TEXT,
    "apiKeyReference" TEXT,
    "rtspUrlEncrypted" TEXT,
    "deviceGatewayId" TEXT,
    "hikcentralResourceId" TEXT,
    "hikconnectDeviceId" TEXT,
    "simNumber" TEXT,
    "simProvider" TEXT,
    "installationDate" TIMESTAMP(3),
    "installedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "lastGpsAt" TIMESTAMP(3),
    "remarks" TEXT,
    "equipmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HikvisionDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetEvent" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT,
    "deviceId" TEXT,
    "driverId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventCategory" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "eventTime" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "rawPayloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoEvidence" (
    "id" TEXT NOT NULL,
    "fleetEventId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "deviceId" TEXT,
    "channelNo" INTEGER,
    "evidenceType" TEXT NOT NULL DEFAULT 'SNAPSHOT',
    "fileUrl" TEXT,
    "playbackStartTime" TIMESTAMP(3),
    "playbackEndTime" TIMESTAMP(3),
    "thumbnailUrl" TEXT,
    "storageLocation" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetTrip" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "deviceId" TEXT,
    "tripStartTime" TIMESTAMP(3) NOT NULL,
    "tripEndTime" TIMESTAMP(3),
    "startLatitude" DOUBLE PRECISION,
    "startLongitude" DOUBLE PRECISION,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "startAddress" TEXT,
    "endAddress" TEXT,
    "totalDistanceKm" DOUBLE PRECISION,
    "maxSpeedKph" DOUBLE PRECISION,
    "averageSpeedKph" DOUBLE PRECISION,
    "idleDurationMinutes" DOUBLE PRECISION,
    "tripStatus" TEXT NOT NULL DEFAULT 'ONGOING',
    "projectId" TEXT,
    "purpose" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subcontractPackageId" TEXT,

    CONSTRAINT "FleetTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Geofence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PROJECT_SITE',
    "polygonOrRadiusJson" TEXT NOT NULL,
    "address" TEXT,
    "projectId" TEXT,
    "alertOnEntry" BOOLEAN NOT NULL DEFAULT true,
    "alertOnExit" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subcontractPackageId" TEXT,

    CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetAIReview" (
    "id" TEXT NOT NULL,
    "fleetEventId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "driverId" TEXT,
    "aiSummary" TEXT NOT NULL,
    "aiRiskScore" DOUBLE PRECISION,
    "aiRecommendation" TEXT,
    "aiValidationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetAIReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveDashboardPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultView" TEXT NOT NULL DEFAULT 'HOME',
    "defaultDateRange" TEXT NOT NULL DEFAULT 'THIS_MONTH',
    "defaultProjectFilter" TEXT,
    "visibleWidgets" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveDashboardPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveAlertLog" (
    "id" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "projectId" TEXT,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceTransactionId" TEXT,
    "financialImpact" DOUBLE PRECISION,
    "operationalImpact" TEXT,
    "recommendedAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedTo" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutiveAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveAccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "moduleAccessed" TEXT NOT NULL,
    "projectId" TEXT,
    "transactionId" TEXT,
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExecutiveQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "scopeType" TEXT,
    "projectId" TEXT,
    "dateRangeStart" TIMESTAMP(3),
    "dateRangeEnd" TIMESTAMP(3),
    "aiResponse" TEXT NOT NULL,
    "sourceReferences" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIExecutiveQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGeneratedReport" (
    "id" TEXT NOT NULL,
    "reportCode" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "projectId" TEXT,
    "departmentId" TEXT,
    "dateRangeStart" TIMESTAMP(3),
    "dateRangeEnd" TIMESTAMP(3),
    "generatedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "aiSummary" TEXT,
    "aiFindings" TEXT,
    "aiRecommendations" TEXT,
    "sourceReferences" TEXT,
    "filePdfUrl" TEXT,
    "fileExcelUrl" TEXT,
    "fileDocxUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIGeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGeneratedReportVersion" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "editedById" TEXT NOT NULL,
    "aiSummary" TEXT,
    "aiFindings" TEXT,
    "aiRecommendations" TEXT,
    "managementRemarks" TEXT,
    "sourceReferences" TEXT,
    "filePdfUrl" TEXT,
    "fileExcelUrl" TEXT,
    "fileDocxUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIGeneratedReportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationSettings" (
    "id" TEXT NOT NULL,
    "boqWeight" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "plansWeight" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "photoWeight" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "droneWeight" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "cctvWeight" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "satelliteWeight" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "deliveryWeight" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "scheduleWeight" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "approvalWeight" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIValidationRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "moduleSource" TEXT NOT NULL,
    "relatedDocumentId" TEXT,
    "relatedBillingId" TEXT,
    "relatedBoqItemId" TEXT,
    "evidenceType" TEXT NOT NULL,
    "evidenceFileUrl" TEXT,
    "aiFindings" TEXT NOT NULL,
    "aiConfidenceScore" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "recommendation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvalAction" TEXT,
    "overrideReason" TEXT,
    "auditTrailRef" TEXT,
    "findingsData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIValidationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectValidationScore" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportedProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiValidatedProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduleVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costVariance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validationConfidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'GRAY',
    "evidenceCompletenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "executiveRecommendation" TEXT,
    "requiredAction" TEXT,
    "latestValidationDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectValidationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationEvidencePack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "relatedBillingId" TEXT,
    "relatedAccomplishId" TEXT,
    "executiveSummary" TEXT,
    "claimedAccomplish" DOUBLE PRECISION,
    "aiValidatedAccomplish" DOUBLE PRECISION,
    "billingAmount" DOUBLE PRECISION,
    "riskFindings" TEXT,
    "finalRecommendation" TEXT,
    "filePdfUrl" TEXT,
    "fileExcelUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationEvidencePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationAuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "validationRecordId" TEXT,
    "aiScoreAtTime" DOUBLE PRECISION,
    "aiFindingsAtTime" TEXT,
    "manualOverrideReason" TEXT,
    "approvalRemarks" TEXT,
    "evidenceVersion" TEXT,
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCostLedger" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costDate" TIMESTAMP(3) NOT NULL,
    "costCategory" TEXT NOT NULL,
    "costType" TEXT NOT NULL DEFAULT 'DIRECT',
    "directIndirect" TEXT NOT NULL DEFAULT 'DIRECT',
    "supplierName" TEXT,
    "subcontractorName" TEXT,
    "workerName" TEXT,
    "referenceDocumentType" TEXT,
    "referenceDocumentNo" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withholdingTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpaidBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "encodedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consolidatedBoqItemId" TEXT,
    "awardedBoqItemId" TEXT,

    CONSTRAINT "ProjectCostLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitmentLedger" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "commitmentType" TEXT NOT NULL,
    "supplierName" TEXT,
    "subcontractorName" TEXT,
    "workerName" TEXT,
    "approvedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingCommitment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consolidatedBoqItemId" TEXT,
    "awardedBoqItemId" TEXT,

    CONSTRAINT "CommitmentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorVariationOrder" (
    "id" TEXT NOT NULL,
    "svoNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalSubcontractId" TEXT,
    "originalBenchmarkQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalBenchmarkAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalSubcontractQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originalSubcontractAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proposedAdditionalQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proposedAdditionalAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedSubcontractQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisedSubcontractAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "costImpact" TEXT,
    "scheduleImpact" TEXT,
    "profitabilityImpact" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "preparedById" TEXT,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consolidatedBoqItemId" TEXT,
    "awardedBoqItemId" TEXT,

    CONSTRAINT "SubcontractorVariationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientVariationOrder" (
    "id" TEXT NOT NULL,
    "cvoNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "awardedBoqItemId" TEXT,

    CONSTRAINT "ClientVariationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueEngineeringRecord" (
    "id" TEXT NOT NULL,
    "veNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT,
    "currentCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proposedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedSavings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualSavingsAchieved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityImpact" TEXT,
    "safetyImpact" TEXT,
    "contractImpact" TEXT,
    "requiredApproval" TEXT,
    "aiRecommendation" TEXT,
    "humanReviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "finalApprovalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "consolidatedBoqItemId" TEXT,
    "awardedBoqItemId" TEXT,

    CONSTRAINT "ValueEngineeringRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSchedule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baselineStartDate" TIMESTAMP(3),
    "baselineFinishDate" TIMESTAMP(3),
    "currentStartDate" TIMESTAMP(3),
    "currentFinishDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "actualFinishDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "calendarDays" INTEGER NOT NULL DEFAULT 0,
    "workingDays" INTEGER NOT NULL DEFAULT 0,
    "holidays" TEXT,
    "workDaysConfig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleWBS" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleWBS_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleActivity" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "wbsId" TEXT,
    "activityCode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT,
    "plannedStartDate" TIMESTAMP(3),
    "plannedFinishDate" TIMESTAMP(3),
    "plannedDuration" INTEGER NOT NULL DEFAULT 0,
    "actualStartDate" TIMESTAMP(3),
    "actualFinishDate" TIMESTAMP(3),
    "actualDuration" INTEGER,
    "baselineStartDate" TIMESTAMP(3),
    "baselineFinishDate" TIMESTAMP(3),
    "plannedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "plannedWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualProgressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "criticalPath" BOOLEAN NOT NULL DEFAULT false,
    "totalFloat" INTEGER NOT NULL DEFAULT 0,
    "freeFloat" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "subcontractorId" TEXT,
    "jobOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDependency" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "ScheduleDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleMilestone" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "actualDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBOQMapping" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "awardedBoqItemId" TEXT NOT NULL,
    "mappedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mappedWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ScheduleBOQMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePOWMapping" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "programOfWorksId" TEXT NOT NULL,

    CONSTRAINT "SchedulePOWMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleProgressUpdate" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "updateDate" TIMESTAMP(3) NOT NULL,
    "progressPercent" DOUBLE PRECISION NOT NULL,
    "actualQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "reportedById" TEXT,
    "accomplishmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDelayRecord" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "delayStartDate" TIMESTAMP(3) NOT NULL,
    "delayEndDate" TIMESTAMP(3),
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "cause" TEXT NOT NULL,
    "impactToCriticalPath" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reportedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleDelayRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRecoveryPlan" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "targetActivityId" TEXT,
    "delayCause" TEXT NOT NULL,
    "requiredAction" TEXT NOT NULL,
    "targetRecoveryDate" TIMESTAMP(3),
    "estimatedRecoveredDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleRecoveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRevisionRequest" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "delayImpact" INTEGER NOT NULL DEFAULT 0,
    "costImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleRevisionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiKnowledgeSource" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "moduleName" TEXT,
    "projectId" TEXT,
    "filePath" TEXT,
    "storageUrl" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "uploadedById" TEXT NOT NULL,
    "visibilityScope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "allowedRoles" TEXT,
    "allowedProjects" TEXT,
    "confidentialityLevel" TEXT NOT NULL DEFAULT 'PUBLIC_INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiKnowledgeChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "chunkSummary" TEXT,
    "moduleName" TEXT,
    "projectId" TEXT,
    "allowedRoles" TEXT,
    "visibilityScope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "confidentialityLevel" TEXT NOT NULL DEFAULT 'PUBLIC_INTERNAL',
    "vectorEmbedding" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "moduleName" TEXT,
    "sessionTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorizedContextUsed" TEXT,
    "citedSources" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAccessAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userRole" TEXT,
    "projectId" TEXT,
    "question" TEXT NOT NULL,
    "answerStatus" TEXT NOT NULL DEFAULT 'SUCCESS',
    "denialReason" TEXT,
    "sourcesRetrieved" INTEGER NOT NULL DEFAULT 0,
    "sourcesDenied" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAccessAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiIndexingJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiIndexingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotFeedback" (
    "id" TEXT NOT NULL,
    "auditLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "correctionNote" TEXT,
    "adminAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRagKeywordRegistry" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "keywordType" TEXT NOT NULL,
    "moduleName" TEXT,
    "relatedModule" TEXT,
    "databaseTable" TEXT,
    "databaseField" TEXT,
    "businessMeaning" TEXT,
    "synonyms" TEXT,
    "aliases" TEXT,
    "abbreviations" TEXT,
    "relatedTerms" TEXT,
    "exampleUserQuestions" TEXT,
    "requiredRoleAccess" TEXT,
    "requiredModulePermission" TEXT,
    "confidentialityLevel" TEXT NOT NULL DEFAULT 'PUBLIC',
    "projectScoped" BOOLEAN NOT NULL DEFAULT false,
    "documentScoped" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourcePriority" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mergedIntoId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "cleanupNotes" TEXT,
    "sourceOrigin" TEXT,
    "generatedBy" TEXT,
    "adminApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRagKeywordRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRagSchemaMap" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldAlias" TEXT,
    "fieldDescription" TEXT,
    "dataType" TEXT NOT NULL,
    "relationshipTable" TEXT,
    "relationshipField" TEXT,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "comparable" BOOLEAN NOT NULL DEFAULT false,
    "aggregatable" BOOLEAN NOT NULL DEFAULT false,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "requiredAccessRole" TEXT,
    "requiredPermission" TEXT,
    "projectScoped" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRagSchemaMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRagEmbedding" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceRecordId" TEXT,
    "sourceTitle" TEXT NOT NULL,
    "sourceTextChunk" TEXT NOT NULL,
    "embeddingVector" TEXT NOT NULL,
    "metadataJson" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'PUBLIC',
    "projectId" TEXT,
    "modulePermissionRequired" TEXT,
    "confidentialityLevel" TEXT NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRagEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiKnowledgeMap" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "moduleName" TEXT,
    "tableName" TEXT,
    "fieldName" TEXT,
    "fieldLabel" TEXT,
    "normalizedName" TEXT NOT NULL,
    "businessMeaning" TEXT,
    "detectedKeywords" TEXT,
    "generatedAliases" TEXT,
    "generatedSynonyms" TEXT,
    "abbreviations" TEXT,
    "relatedTerms" TEXT,
    "relatedModules" TEXT,
    "relatedTables" TEXT,
    "relatedFields" TEXT,
    "relationshipType" TEXT,
    "sampleQuestions" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'PUBLIC',
    "requiredRole" TEXT,
    "requiredPermission" TEXT,
    "projectScoped" BOOLEAN NOT NULL DEFAULT false,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "comparable" BOOLEAN NOT NULL DEFAULT false,
    "aggregatable" BOOLEAN NOT NULL DEFAULT false,
    "sourcePriority" INTEGER NOT NULL DEFAULT 1,
    "lastScannedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKnowledgeMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiComparisonMap" (
    "id" TEXT NOT NULL,
    "comparisonName" TEXT NOT NULL,
    "userQuestionPattern" TEXT,
    "primaryModule" TEXT NOT NULL,
    "primaryTable" TEXT NOT NULL,
    "primaryField" TEXT NOT NULL,
    "relatedModules" TEXT,
    "relatedTables" TEXT,
    "relatedFields" TEXT,
    "comparisonLogic" TEXT NOT NULL,
    "calculationFormula" TEXT,
    "requiredPermission" TEXT,
    "projectScoped" BOOLEAN NOT NULL DEFAULT true,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiComparisonMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUiActionRegistry" (
    "id" TEXT NOT NULL,
    "uiLabel" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "componentOrPage" TEXT,
    "actionType" TEXT,
    "aliases" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUiActionRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSystemEnumRegistry" (
    "id" TEXT NOT NULL,
    "enumValue" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "enumCategory" TEXT,
    "businessMeaning" TEXT,
    "aliases" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSystemEnumRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRagNoiseExclusion" (
    "id" TEXT NOT NULL,
    "noiseTerm" TEXT NOT NULL,
    "normalizedTerm" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRagNoiseExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRegistryCleanupReport" (
    "id" TEXT NOT NULL,
    "runBy" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalRowsScanned" INTEGER NOT NULL,
    "duplicateGroupsFound" INTEGER NOT NULL,
    "rowsMerged" INTEGER NOT NULL,
    "aliasesMerged" INTEGER NOT NULL,
    "schemaFieldsMoved" INTEGER NOT NULL,
    "uiLabelsMoved" INTEGER NOT NULL,
    "noiseTermsExcluded" INTEGER NOT NULL,
    "acronymsFixed" INTEGER NOT NULL,
    "activeRowsRemaining" INTEGER NOT NULL,
    "rollbackSupported" BOOLEAN NOT NULL DEFAULT true,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,

    CONSTRAINT "AiRegistryCleanupReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION,
    "category" TEXT NOT NULL,
    "threatType" TEXT NOT NULL,
    "sourceIp" TEXT,
    "country" TEXT,
    "city" TEXT,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isp" TEXT,
    "asn" TEXT,
    "organization" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "projectId" TEXT,
    "targetProjectId" TEXT,
    "module" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "actionAttempted" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "payloadSummary" TEXT,
    "fieldsAttempted" TEXT,
    "rbacResult" TEXT,
    "pbacResult" TEXT,
    "dataClassification" TEXT,
    "threatDetected" TEXT,
    "systemResponse" TEXT,
    "result" TEXT,
    "status" TEXT NOT NULL,
    "dataExposure" TEXT,
    "adminActionRequired" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "incidentId" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "message" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityIncident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "assignedTo" TEXT,
    "affectedUserId" TEXT,
    "affectedProjectId" TEXT,
    "affectedModule" TEXT,
    "sourceIp" TEXT,
    "countermeasure" TEXT,
    "result" TEXT,
    "dataExposure" TEXT,
    "relatedEventIds" TEXT,
    "rootCause" TEXT,
    "resolutionNotes" TEXT,
    "adminNotes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "countermeasure" TEXT NOT NULL,
    "notifyAdmins" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSessionSecurityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceIp" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "approximateLocation" TEXT,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "riskScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSessionSecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIQuerySecurityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "projectScope" TEXT,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT,
    "detectedThreat" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "retrievedDocumentIds" TEXT,
    "blockedDocumentIds" TEXT,
    "dataClassificationUsed" TEXT,
    "responseStatus" TEXT,
    "tokenUsage" INTEGER,
    "costEstimate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIQuerySecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileSecurityLog" (
    "id" TEXT NOT NULL,
    "fileId" TEXT,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "module" TEXT,
    "action" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "threatDetected" TEXT,
    "countermeasure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileSecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreatIp" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isp" TEXT,
    "asn" TEXT,
    "organization" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreatIp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountermeasureLog" (
    "id" TEXT NOT NULL,
    "securityEventId" TEXT,
    "countermeasureType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT,
    "performedBySystem" BOOLEAN NOT NULL DEFAULT true,
    "performedByUserId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountermeasureLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensitiveExportLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "role" TEXT,
    "projectId" TEXT,
    "module" TEXT NOT NULL,
    "exportType" TEXT NOT NULL,
    "recordCount" INTEGER,
    "dataClassification" TEXT,
    "sourceIp" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensitiveExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SystemRole_name_key" ON "SystemRole"("name");

-- CreateIndex
CREATE INDEX "ProjectUserAssignment_userId_idx" ON "ProjectUserAssignment"("userId");

-- CreateIndex
CREATE INDEX "ProjectUserAssignment_projectId_idx" ON "ProjectUserAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectUserAssignment_assignmentStatus_idx" ON "ProjectUserAssignment"("assignmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUserAssignment_userId_projectId_key" ON "ProjectUserAssignment"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequest_mrNumber_key" ON "MaterialRequest"("mrNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseAIValidation_expenseId_key" ON "ExpenseAIValidation"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashExpense_expenseId_key" ON "PettyCashExpense"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashReplenishment_requestNumber_key" ON "PettyCashReplenishment"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_workerId_key" ON "Worker"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTimeRecord_workerId_date_key" ON "DailyTimeRecord"("workerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_payrollBatchNumber_key" ON "PayrollPeriod"("payrollBatchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_workerId_payrollPeriodId_key" ON "Payroll"("workerId", "payrollPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssuance_misNumber_key" ON "MaterialIssuance"("misNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReturn_mrsNumber_key" ON "MaterialReturn"("mrsNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AccountsPayable_deliveryId_key" ON "AccountsPayable"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountsPayable_voucherNumber_key" ON "AccountsPayable"("voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_billingNumber_key" ON "Billing"("billingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VariationOrder_voNumber_key" ON "VariationOrder"("voNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractPackage_packageNumber_key" ON "SubcontractPackage"("packageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "JobOrder_jobNumber_key" ON "JobOrder"("jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractBilling_billingNumber_key" ON "SubcontractBilling"("billingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BackCharge_backChargeNumber_key" ON "BackCharge"("backChargeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRecord_knowledgeId_key" ON "KnowledgeRecord"("knowledgeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollFundingRequest_fundingRequestNumber_key" ON "PayrollFundingRequest"("fundingRequestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatch_batchNumber_key" ON "PaymentBatch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatchRow_senderReferenceId_key" ON "PaymentBatchRow"("senderReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatchRow_idempotencyKey_key" ON "PaymentBatchRow"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivingBank_bankCode_key" ON "ReceivingBank"("bankCode");

-- CreateIndex
CREATE UNIQUE INDEX "Role_roleName_key" ON "Role"("roleName");

-- CreateIndex
CREATE UNIQUE INDEX "Role_roleCode_key" ON "Role"("roleCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Module_moduleName_key" ON "Module"("moduleName");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_moduleId_key" ON "RolePermission"("roleId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_moduleName_key" ON "WorkflowTemplate"("moduleName");

-- CreateIndex
CREATE INDEX "TransactionWorkflow_moduleName_transactionId_idx" ON "TransactionWorkflow"("moduleName", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LockedRecord_moduleName_transactionId_key" ON "LockedRecord"("moduleName", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "NotebookReference_referenceCode_key" ON "NotebookReference"("referenceCode");

-- CreateIndex
CREATE UNIQUE INDEX "AIValidationRule_ruleCode_key" ON "AIValidationRule"("ruleCode");

-- CreateIndex
CREATE UNIQUE INDEX "CanvassForm_canvassNumber_key" ON "CanvassForm"("canvassNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_fmsDeviceId_key" ON "Equipment"("fmsDeviceId");

-- CreateIndex
CREATE INDEX "EquipmentTelemetry_equipmentId_timestamp_idx" ON "EquipmentTelemetry"("equipmentId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "HikvisionDevice_deviceSerialNumber_key" ON "HikvisionDevice"("deviceSerialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "HikvisionDevice_imeiOrUniqueId_key" ON "HikvisionDevice"("imeiOrUniqueId");

-- CreateIndex
CREATE UNIQUE INDEX "HikvisionDevice_equipmentId_key" ON "HikvisionDevice"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveDashboardPreference_userId_key" ON "ExecutiveDashboardPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AIGeneratedReport_reportCode_key" ON "AIGeneratedReport"("reportCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectValidationScore_projectId_key" ON "ProjectValidationScore"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorVariationOrder_svoNumber_key" ON "SubcontractorVariationOrder"("svoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ClientVariationOrder_cvoNumber_key" ON "ClientVariationOrder"("cvoNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ValueEngineeringRecord_veNumber_key" ON "ValueEngineeringRecord"("veNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSchedule_projectId_key" ON "ProjectSchedule"("projectId");

-- CreateIndex
CREATE INDEX "AiRagKeywordRegistry_normalizedKeyword_idx" ON "AiRagKeywordRegistry"("normalizedKeyword");

-- CreateIndex
CREATE INDEX "AiRagKeywordRegistry_keywordType_idx" ON "AiRagKeywordRegistry"("keywordType");

-- CreateIndex
CREATE UNIQUE INDEX "AiRagKeywordRegistry_normalizedKeyword_keywordType_key" ON "AiRagKeywordRegistry"("normalizedKeyword", "keywordType");

-- CreateIndex
CREATE UNIQUE INDEX "AiRagSchemaMap_tableName_fieldName_key" ON "AiRagSchemaMap"("tableName", "fieldName");

-- CreateIndex
CREATE INDEX "AiRagEmbedding_sourceType_idx" ON "AiRagEmbedding"("sourceType");

-- CreateIndex
CREATE INDEX "AiRagEmbedding_projectId_idx" ON "AiRagEmbedding"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AiUiActionRegistry_normalizedLabel_actionType_key" ON "AiUiActionRegistry"("normalizedLabel", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "AiSystemEnumRegistry_normalizedValue_enumCategory_key" ON "AiSystemEnumRegistry"("normalizedValue", "enumCategory");

-- CreateIndex
CREATE UNIQUE INDEX "AiRagNoiseExclusion_normalizedTerm_key" ON "AiRagNoiseExclusion"("normalizedTerm");

-- CreateIndex
CREATE UNIQUE INDEX "ThreatIp_ipAddress_key" ON "ThreatIp"("ipAddress");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUserAssignment" ADD CONSTRAINT "ProjectUserAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUserAssignment" ADD CONSTRAINT "ProjectUserAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardedBOQItem" ADD CONSTRAINT "AwardedBOQItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementBenchmarkItem" ADD CONSTRAINT "ProcurementBenchmarkItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedBOQItem" ADD CONSTRAINT "ConsolidatedBOQItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOQMapping" ADD CONSTRAINT "BOQMapping_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOQMapping" ADD CONSTRAINT "BOQMapping_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_preparerId_fkey" FOREIGN KEY ("preparerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT "MaterialRequestItem_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT "MaterialRequestItem_mrId_fkey" FOREIGN KEY ("mrId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_canvassFormId_fkey" FOREIGN KEY ("canvassFormId") REFERENCES "CanvassForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_preparerId_fkey" FOREIGN KEY ("preparerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_mrId_fkey" FOREIGN KEY ("mrId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBreakdownItem" ADD CONSTRAINT "ExpenseBreakdownItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProofFile" ADD CONSTRAINT "ExpenseProofFile_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProofFile" ADD CONSTRAINT "ExpenseProofFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProofFile" ADD CONSTRAINT "ExpenseProofFile_breakdownItemId_fkey" FOREIGN KEY ("breakdownItemId") REFERENCES "ExpenseBreakdownItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProofFile" ADD CONSTRAINT "ExpenseProofFile_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAIValidation" ADD CONSTRAINT "ExpenseAIValidation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApprovalLog" ADD CONSTRAINT "ExpenseApprovalLog_actionByUserId_fkey" FOREIGN KEY ("actionByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApprovalLog" ADD CONSTRAINT "ExpenseApprovalLog_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashAccount" ADD CONSTRAINT "PettyCashAccount_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashAccount" ADD CONSTRAINT "PettyCashAccount_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashAccount" ADD CONSTRAINT "PettyCashAccount_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashAccount" ADD CONSTRAINT "PettyCashAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashExpense" ADD CONSTRAINT "PettyCashExpense_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashExpense" ADD CONSTRAINT "PettyCashExpense_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashExpense" ADD CONSTRAINT "PettyCashExpense_replenishmentId_fkey" FOREIGN KEY ("replenishmentId") REFERENCES "PettyCashReplenishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashExpense" ADD CONSTRAINT "PettyCashExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PettyCashAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashExpense" ADD CONSTRAINT "PettyCashExpense_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashReplenishment" ADD CONSTRAINT "PettyCashReplenishment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PettyCashAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIWorkerValidationResult" ADD CONSTRAINT "AIWorkerValidationResult_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimeRecord" ADD CONSTRAINT "DailyTimeRecord_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimeRecord" ADD CONSTRAINT "DailyTimeRecord_encodedById_fkey" FOREIGN KEY ("encodedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimeRecord" ADD CONSTRAINT "DailyTimeRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTimeRecord" ADD CONSTRAINT "DailyTimeRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEarning" ADD CONSTRAINT "PayrollEarning_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDeduction" ADD CONSTRAINT "PayrollDeduction_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollApproval" ADD CONSTRAINT "PayrollApproval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollApproval" ADD CONSTRAINT "PayrollApproval_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionLedger" ADD CONSTRAINT "DeductionLedger_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionLedger" ADD CONSTRAINT "DeductionLedger_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionLog" ADD CONSTRAINT "DeductionLog_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionLog" ADD CONSTRAINT "DeductionLog_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "DeductionLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_verifierId_fkey" FOREIGN KEY ("verifierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionLog" ADD CONSTRAINT "ConsumptionLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionLog" ADD CONSTRAINT "ConsumptionLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionItem" ADD CONSTRAINT "ConsumptionItem_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumptionItem" ADD CONSTRAINT "ConsumptionItem_logId_fkey" FOREIGN KEY ("logId") REFERENCES "ConsumptionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssuance" ADD CONSTRAINT "MaterialIssuance_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssuance" ADD CONSTRAINT "MaterialIssuance_accountantId_fkey" FOREIGN KEY ("accountantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssuance" ADD CONSTRAINT "MaterialIssuance_warehousemanId_fkey" FOREIGN KEY ("warehousemanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssuance" ADD CONSTRAINT "MaterialIssuance_foremanId_fkey" FOREIGN KEY ("foremanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssuance" ADD CONSTRAINT "MaterialIssuance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuanceItem" ADD CONSTRAINT "IssuanceItem_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuanceItem" ADD CONSTRAINT "IssuanceItem_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "MaterialIssuance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReturn" ADD CONSTRAINT "MaterialReturn_warehousemanId_fkey" FOREIGN KEY ("warehousemanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReturn" ADD CONSTRAINT "MaterialReturn_foremanId_fkey" FOREIGN KEY ("foremanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReturn" ADD CONSTRAINT "MaterialReturn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReturn" ADD CONSTRAINT "MaterialReturn_issuanceId_fkey" FOREIGN KEY ("issuanceId") REFERENCES "MaterialIssuance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_issuanceItemId_fkey" FOREIGN KEY ("issuanceItemId") REFERENCES "IssuanceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "MaterialReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountsPayable" ADD CONSTRAINT "AccountsPayable_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOQLotBreakdown" ADD CONSTRAINT "BOQLotBreakdown_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accomplishment" ADD CONSTRAINT "Accomplishment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccomplishmentItem" ADD CONSTRAINT "AccomplishmentItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccomplishmentItem" ADD CONSTRAINT "AccomplishmentItem_accomplishmentId_fkey" FOREIGN KEY ("accomplishmentId") REFERENCES "Accomplishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_accomplishmentItemId_fkey" FOREIGN KEY ("accomplishmentItemId") REFERENCES "AccomplishmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingItem" ADD CONSTRAINT "BillingItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingItem" ADD CONSTRAINT "BillingItem_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "Billing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDeduction" ADD CONSTRAINT "BillingDeduction_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "Billing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "Billing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrder" ADD CONSTRAINT "VariationOrder_subcontractPackageId_fkey" FOREIGN KEY ("subcontractPackageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrder" ADD CONSTRAINT "VariationOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrderItem" ADD CONSTRAINT "VariationOrderItem_originalBoqItemId_fkey" FOREIGN KEY ("originalBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrderItem" ADD CONSTRAINT "VariationOrderItem_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrderDocument" ADD CONSTRAINT "VariationOrderDocument_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationOrderApproval" ADD CONSTRAINT "VariationOrderApproval_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIVariationOrderValidation" ADD CONSTRAINT "AIVariationOrderValidation_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES "VariationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_accomplishmentId_fkey" FOREIGN KEY ("accomplishmentId") REFERENCES "Accomplishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCamera" ADD CONSTRAINT "ProjectCamera_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCameraSnapshot" ADD CONSTRAINT "LiveCameraSnapshot_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "ProjectCamera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationRun" ADD CONSTRAINT "AIValidationRun_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationRun" ADD CONSTRAINT "AIValidationRun_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "Billing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationRun" ADD CONSTRAINT "AIValidationRun_accomplishmentId_fkey" FOREIGN KEY ("accomplishmentId") REFERENCES "Accomplishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationRun" ADD CONSTRAINT "AIValidationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationEvidence" ADD CONSTRAINT "AIValidationEvidence_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationEvidence" ADD CONSTRAINT "AIValidationEvidence_aiValidationRunId_fkey" FOREIGN KEY ("aiValidationRunId") REFERENCES "AIValidationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationFinding" ADD CONSTRAINT "AIValidationFinding_aiValidationRunId_fkey" FOREIGN KEY ("aiValidationRunId") REFERENCES "AIValidationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIHumanReview" ADD CONSTRAINT "AIHumanReview_aiValidationRunId_fkey" FOREIGN KEY ("aiValidationRunId") REFERENCES "AIValidationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramOfWorks" ADD CONSTRAINT "ProgramOfWorks_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorBOQItem" ADD CONSTRAINT "SubcontractorBOQItem_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorBOQItem" ADD CONSTRAINT "SubcontractorBOQItem_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccomplishmentRecord" ADD CONSTRAINT "AccomplishmentRecord_aiValidationId_fkey" FOREIGN KEY ("aiValidationId") REFERENCES "AIValidationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccomplishmentRecord" ADD CONSTRAINT "AccomplishmentRecord_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "SubcontractBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractPackage" ADD CONSTRAINT "SubcontractPackage_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractPackage" ADD CONSTRAINT "SubcontractPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractPackage" ADD CONSTRAINT "SubcontractPackage_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrder" ADD CONSTRAINT "JobOrder_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractAccomplishment" ADD CONSTRAINT "SubcontractAccomplishment_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractAccomplishment" ADD CONSTRAINT "SubcontractAccomplishment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBilling" ADD CONSTRAINT "SubcontractBilling_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBilling" ADD CONSTRAINT "SubcontractBilling_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBilling" ADD CONSTRAINT "SubcontractBilling_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractBilling" ADD CONSTRAINT "SubcontractBilling_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackCharge" ADD CONSTRAINT "BackCharge_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackCharge" ADD CONSTRAINT "BackCharge_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackCharge" ADD CONSTRAINT "BackCharge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeReference" ADD CONSTRAINT "KnowledgeReference_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeReference" ADD CONSTRAINT "KnowledgeReference_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeReference" ADD CONSTRAINT "KnowledgeReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeReference" ADD CONSTRAINT "KnowledgeReference_knowledgeRecordId_fkey" FOREIGN KEY ("knowledgeRecordId") REFERENCES "KnowledgeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeAuditTrail" ADD CONSTRAINT "KnowledgeAuditTrail_knowledgeRecordId_fkey" FOREIGN KEY ("knowledgeRecordId") REFERENCES "KnowledgeRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollBankLedger" ADD CONSTRAINT "PayrollBankLedger_payrollBankAccountId_fkey" FOREIGN KEY ("payrollBankAccountId") REFERENCES "PayrollBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollFundingRequest" ADD CONSTRAINT "PayrollFundingRequest_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "PayrollBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollFundingRequest" ADD CONSTRAINT "PayrollFundingRequest_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_payrollBankAccountId_fkey" FOREIGN KEY ("payrollBankAccountId") REFERENCES "PayrollBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchRow" ADD CONSTRAINT "PaymentBatchRow_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchRow" ADD CONSTRAINT "PaymentBatchRow_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatchRow" ADD CONSTRAINT "PaymentBatchRow_paymentBatchId_fkey" FOREIGN KEY ("paymentBatchId") REFERENCES "PaymentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentException" ADD CONSTRAINT "PaymentException_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentFallbackRecommendation" ADD CONSTRAINT "PaymentFallbackRecommendation_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccomplishmentFile" ADD CONSTRAINT "ProjectAccomplishmentFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccomplishmentFile" ADD CONSTRAINT "ProjectAccomplishmentFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccomplishmentFile" ADD CONSTRAINT "ProjectAccomplishmentFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccomplishmentFileVersion" ADD CONSTRAINT "ProjectAccomplishmentFileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectAccomplishmentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccomplishmentAIFinding" ADD CONSTRAINT "ProjectAccomplishmentAIFinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAccomplishmentAIFinding" ADD CONSTRAINT "ProjectAccomplishmentAIFinding_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectAccomplishmentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationLog" ADD CONSTRAINT "AIValidationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLoginLog" ADD CONSTRAINT "UserLoginLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookReferenceVersion" ADD CONSTRAINT "NotebookReferenceVersion_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookReferenceModule" ADD CONSTRAINT "NotebookReferenceModule_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookReferenceRole" ADD CONSTRAINT "NotebookReferenceRole_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookReferenceProject" ADD CONSTRAINT "NotebookReferenceProject_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookReferenceApprovalLog" ADD CONSTRAINT "NotebookReferenceApprovalLog_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotebookReferenceIndexLog" ADD CONSTRAINT "NotebookReferenceIndexLog_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITransactionValidation" ADD CONSTRAINT "AITransactionValidation_referenceVersionId_fkey" FOREIGN KEY ("referenceVersionId") REFERENCES "NotebookReferenceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITransactionValidation" ADD CONSTRAINT "AITransactionValidation_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationOverride" ADD CONSTRAINT "AIValidationOverride_validationResultId_fkey" FOREIGN KEY ("validationResultId") REFERENCES "AITransactionValidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReferenceUsageLog" ADD CONSTRAINT "AIReferenceUsageLog_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "NotebookReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassForm" ADD CONSTRAINT "CanvassForm_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassForm" ADD CONSTRAINT "CanvassForm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassForm" ADD CONSTRAINT "CanvassForm_mrId_fkey" FOREIGN KEY ("mrId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassItem" ADD CONSTRAINT "CanvassItem_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassItem" ADD CONSTRAINT "CanvassItem_canvassFormId_fkey" FOREIGN KEY ("canvassFormId") REFERENCES "CanvassForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierQuotation" ADD CONSTRAINT "SupplierQuotation_canvassFormId_fkey" FOREIGN KEY ("canvassFormId") REFERENCES "CanvassForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_canvassItemId_fkey" FOREIGN KEY ("canvassItemId") REFERENCES "CanvassItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SupplierQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeployment" ADD CONSTRAINT "EquipmentDeployment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentUtilization" ADD CONSTRAINT "EquipmentUtilization_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentUtilization" ADD CONSTRAINT "EquipmentUtilization_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentMaintenance" ADD CONSTRAINT "EquipmentMaintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentTelemetry" ADD CONSTRAINT "EquipmentTelemetry_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAIValidation" ADD CONSTRAINT "EquipmentAIValidation_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HikvisionDevice" ADD CONSTRAINT "HikvisionDevice_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetEvent" ADD CONSTRAINT "FleetEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetEvent" ADD CONSTRAINT "FleetEvent_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoEvidence" ADD CONSTRAINT "VideoEvidence_fleetEventId_fkey" FOREIGN KEY ("fleetEventId") REFERENCES "FleetEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetTrip" ADD CONSTRAINT "FleetTrip_subcontractPackageId_fkey" FOREIGN KEY ("subcontractPackageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetTrip" ADD CONSTRAINT "FleetTrip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetTrip" ADD CONSTRAINT "FleetTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetTrip" ADD CONSTRAINT "FleetTrip_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_subcontractPackageId_fkey" FOREIGN KEY ("subcontractPackageId") REFERENCES "SubcontractPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetAIReview" ADD CONSTRAINT "FleetAIReview_fleetEventId_fkey" FOREIGN KEY ("fleetEventId") REFERENCES "FleetEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveDashboardPreference" ADD CONSTRAINT "ExecutiveDashboardPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveAccessLog" ADD CONSTRAINT "ExecutiveAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExecutiveQuery" ADD CONSTRAINT "AIExecutiveQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedReport" ADD CONSTRAINT "AIGeneratedReport_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedReport" ADD CONSTRAINT "AIGeneratedReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedReport" ADD CONSTRAINT "AIGeneratedReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedReportVersion" ADD CONSTRAINT "AIGeneratedReportVersion_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedReportVersion" ADD CONSTRAINT "AIGeneratedReportVersion_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AIGeneratedReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationSettings" ADD CONSTRAINT "ValidationSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationRecord" ADD CONSTRAINT "AIValidationRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationRecord" ADD CONSTRAINT "AIValidationRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIValidationRecord" ADD CONSTRAINT "AIValidationRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectValidationScore" ADD CONSTRAINT "ProjectValidationScore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvidencePack" ADD CONSTRAINT "ValidationEvidencePack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvidencePack" ADD CONSTRAINT "ValidationEvidencePack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationAuditLog" ADD CONSTRAINT "ValidationAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCostLedger" ADD CONSTRAINT "ProjectCostLedger_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCostLedger" ADD CONSTRAINT "ProjectCostLedger_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCostLedger" ADD CONSTRAINT "ProjectCostLedger_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentLedger" ADD CONSTRAINT "CommitmentLedger_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentLedger" ADD CONSTRAINT "CommitmentLedger_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentLedger" ADD CONSTRAINT "CommitmentLedger_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorVariationOrder" ADD CONSTRAINT "SubcontractorVariationOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorVariationOrder" ADD CONSTRAINT "SubcontractorVariationOrder_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorVariationOrder" ADD CONSTRAINT "SubcontractorVariationOrder_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientVariationOrder" ADD CONSTRAINT "ClientVariationOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientVariationOrder" ADD CONSTRAINT "ClientVariationOrder_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueEngineeringRecord" ADD CONSTRAINT "ValueEngineeringRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueEngineeringRecord" ADD CONSTRAINT "ValueEngineeringRecord_consolidatedBoqItemId_fkey" FOREIGN KEY ("consolidatedBoqItemId") REFERENCES "ConsolidatedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueEngineeringRecord" ADD CONSTRAINT "ValueEngineeringRecord_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSchedule" ADD CONSTRAINT "ProjectSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleWBS" ADD CONSTRAINT "ScheduleWBS_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleWBS" ADD CONSTRAINT "ScheduleWBS_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ScheduleWBS"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_wbsId_fkey" FOREIGN KEY ("wbsId") REFERENCES "ScheduleWBS"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleMilestone" ADD CONSTRAINT "ScheduleMilestone_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBOQMapping" ADD CONSTRAINT "ScheduleBOQMapping_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBOQMapping" ADD CONSTRAINT "ScheduleBOQMapping_awardedBoqItemId_fkey" FOREIGN KEY ("awardedBoqItemId") REFERENCES "AwardedBOQItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePOWMapping" ADD CONSTRAINT "SchedulePOWMapping_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePOWMapping" ADD CONSTRAINT "SchedulePOWMapping_programOfWorksId_fkey" FOREIGN KEY ("programOfWorksId") REFERENCES "ProgramOfWorks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleProgressUpdate" ADD CONSTRAINT "ScheduleProgressUpdate_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleProgressUpdate" ADD CONSTRAINT "ScheduleProgressUpdate_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleProgressUpdate" ADD CONSTRAINT "ScheduleProgressUpdate_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDelayRecord" ADD CONSTRAINT "ScheduleDelayRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDelayRecord" ADD CONSTRAINT "ScheduleDelayRecord_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDelayRecord" ADD CONSTRAINT "ScheduleDelayRecord_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRecoveryPlan" ADD CONSTRAINT "ScheduleRecoveryPlan_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRevisionRequest" ADD CONSTRAINT "ScheduleRevisionRequest_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ProjectSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiKnowledgeSource" ADD CONSTRAINT "AiKnowledgeSource_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiKnowledgeChunk" ADD CONSTRAINT "AiKnowledgeChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AiKnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatSession" ADD CONSTRAINT "AiChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAccessAuditLog" ADD CONSTRAINT "AiAccessAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotFeedback" ADD CONSTRAINT "ChatbotFeedback_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AiAccessAuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotFeedback" ADD CONSTRAINT "ChatbotFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRagKeywordRegistry" ADD CONSTRAINT "AiRagKeywordRegistry_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "AiRagKeywordRegistry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
