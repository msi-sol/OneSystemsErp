-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(320) NULL,
    `password` VARCHAR(191) NULL,
    `emailVerified` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'PROJECT_ENGINEER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `defaultRole` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `passwordChangedAt` DATETIME(3) NULL,
    `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemRole` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SystemRole_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `location` LONGTEXT NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PLANNING',
    `contractAmountVATInclusive` BOOLEAN NOT NULL DEFAULT true,
    `vatRate` DOUBLE NOT NULL DEFAULT 12.0,
    `retentionPercentage` DOUBLE NOT NULL DEFAULT 10.0,
    `withholdingTaxPercentage` DOUBLE NOT NULL DEFAULT 2.0,
    `mobilizationAdvanceAmount` DOUBLE NOT NULL DEFAULT 0,
    `advanceRecoupmentMethod` VARCHAR(191) NOT NULL DEFAULT 'PRO_RATA',
    `liquidatedDamagesRate` DOUBLE NOT NULL DEFAULT 0.1,
    `otherDeductions` DOUBLE NOT NULL DEFAULT 0,
    `paymentTerms` VARCHAR(191) NULL,
    `boqLocked` BOOLEAN NOT NULL DEFAULT false,
    `consolidatedBOQLocked` BOOLEAN NOT NULL DEFAULT false,
    `procurementBenchmarkLocked` BOOLEAN NOT NULL DEFAULT false,
    `contractNumber` VARCHAR(191) NULL,
    `client` VARCHAR(191) NULL,
    `contractor` VARCHAR(191) NULL,
    `gpsLatitude` DOUBLE NULL,
    `gpsLongitude` DOUBLE NULL,
    `acceptableGeotagRadius` DOUBLE NOT NULL DEFAULT 100,
    `projectCategory` VARCHAR(191) NULL,
    `fundingSource` VARCHAR(191) NULL,
    `contractAmount` DOUBLE NOT NULL DEFAULT 0,
    `originalContractDuration` INTEGER NULL,
    `noticeToProceedDate` DATETIME(3) NULL,
    `originalCompletionDate` DATETIME(3) NULL,
    `revisedCompletionDate` DATETIME(3) NULL,
    `implementingOffice` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectUserAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `projectRole` VARCHAR(191) NOT NULL,
    `accessLevel` VARCHAR(191) NOT NULL,
    `assignmentStatus` VARCHAR(191) NOT NULL DEFAULT 'active',
    `assignedBy` VARCHAR(191) NULL,
    `dateAssigned` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateRemoved` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectUserAssignment_userId_idx`(`userId`),
    INDEX `ProjectUserAssignment_projectId_idx`(`projectId`),
    INDEX `ProjectUserAssignment_assignmentStatus_idx`(`assignmentStatus`),
    UNIQUE INDEX `ProjectUserAssignment_userId_projectId_key`(`userId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AwardedBOQItem` (
    `id` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `description` LONGTEXT NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `directCost` DOUBLE NOT NULL DEFAULT 0,
    `indirectCost` DOUBLE NOT NULL DEFAULT 0,
    `combinedUnitCost` DOUBLE NOT NULL DEFAULT 0,
    `totalCost` DOUBLE NOT NULL,
    `previousQuantityAccomplished` DOUBLE NOT NULL DEFAULT 0,
    `currentQuantityAccomplished` DOUBLE NOT NULL DEFAULT 0,
    `totalQuantityAccomplished` DOUBLE NOT NULL DEFAULT 0,
    `remainingQuantity` DOUBLE NOT NULL DEFAULT 0,
    `percentageAccomplished` DOUBLE NOT NULL DEFAULT 0,
    `amountAccomplished` DOUBLE NOT NULL DEFAULT 0,
    `balanceAmount` DOUBLE NOT NULL DEFAULT 0,
    `approvedClientVoQuantity` DOUBLE NOT NULL DEFAULT 0,
    `revisedContractQuantity` DOUBLE NOT NULL DEFAULT 0,
    `revisedContractUnitPrice` DOUBLE NOT NULL DEFAULT 0,
    `revisedContractAmount` DOUBLE NOT NULL DEFAULT 0,
    `previousBilledQuantity` DOUBLE NOT NULL DEFAULT 0,
    `currentBillingQuantity` DOUBLE NOT NULL DEFAULT 0,
    `totalBilledQuantity` DOUBLE NOT NULL DEFAULT 0,
    `revenueRecognized` DOUBLE NOT NULL DEFAULT 0,
    `actualOrderedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `actualDeliveredQuantity` DOUBLE NOT NULL DEFAULT 0,
    `actualInstalledQuantity` DOUBLE NOT NULL DEFAULT 0,
    `finalApprovedInstalledQuantity` DOUBLE NULL,
    `materialSavingsQuantity` DOUBLE NOT NULL DEFAULT 0,
    `materialSavingsAmount` DOUBLE NOT NULL DEFAULT 0,
    `wastageQuantity` DOUBLE NOT NULL DEFAULT 0,
    `actualCost` DOUBLE NOT NULL DEFAULT 0,
    `costVariance` DOUBLE NOT NULL DEFAULT 0,
    `aiValidationRequired` BOOLEAN NOT NULL DEFAULT true,
    `requiredEvidenceType` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `processingType` VARCHAR(191) NOT NULL DEFAULT 'MATERIAL_EQUIPMENT',
    `projectId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProcurementBenchmarkItem` (
    `id` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `description` LONGTEXT NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `totalCost` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `projectId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsolidatedBOQItem` (
    `id` VARCHAR(191) NOT NULL,
    `itemCode` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `description` LONGTEXT NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `totalCost` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `projectId` VARCHAR(191) NOT NULL,
    `deliveredQty` DOUBLE NOT NULL DEFAULT 0,
    `consumedQty` DOUBLE NOT NULL DEFAULT 0,
    `voAdditiveQty` DOUBLE NOT NULL DEFAULT 0,
    `voDeductiveQty` DOUBLE NOT NULL DEFAULT 0,
    `revisedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `voAdditiveCost` DOUBLE NOT NULL DEFAULT 0,
    `voDeductiveCost` DOUBLE NOT NULL DEFAULT 0,
    `revisedTotalCost` DOUBLE NOT NULL DEFAULT 0,
    `wasteAllowance` DOUBLE NOT NULL DEFAULT 0,
    `revisedBenchmarkUnitCost` DOUBLE NOT NULL DEFAULT 0,
    `requestedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `purchasedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `issuedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `subcontractedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `jobOrderQuantity` DOUBLE NOT NULL DEFAULT 0,
    `subcontractorVoQuantity` DOUBLE NOT NULL DEFAULT 0,
    `remainingBenchmarkQuantity` DOUBLE NOT NULL DEFAULT 0,
    `actualUnitCost` DOUBLE NOT NULL DEFAULT 0,
    `actualCost` DOUBLE NOT NULL DEFAULT 0,
    `committedCost` DOUBLE NOT NULL DEFAULT 0,
    `quantityVariance` DOUBLE NOT NULL DEFAULT 0,
    `costVariance` DOUBLE NOT NULL DEFAULT 0,
    `savings` DOUBLE NOT NULL DEFAULT 0,
    `overrun` DOUBLE NOT NULL DEFAULT 0,
    `valueEngineeringSavings` DOUBLE NOT NULL DEFAULT 0,
    `isVariationItem` BOOLEAN NOT NULL DEFAULT false,
    `sourceVoNumber` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BOQMapping` (
    `id` VARCHAR(191) NOT NULL,
    `mappingType` VARCHAR(191) NOT NULL,
    `allocationPercentage` DOUBLE NULL,
    `allocationQuantity` DOUBLE NULL,
    `remarks` LONGTEXT NULL,
    `aiConfidenceScore` DOUBLE NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'APPROVED',
    `awardedBoqItemId` VARCHAR(191) NULL,
    `procurementBenchmarkItemId` VARCHAR(191) NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `tin` VARCHAR(191) NULL,
    `contactPerson` VARCHAR(191) NULL,
    `contactNumber` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` LONGTEXT NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `plantLocation` LONGTEXT NULL,
    `isVatable` BOOLEAN NOT NULL DEFAULT true,
    `isSeedData` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialRequest` (
    `id` VARCHAR(191) NOT NULL,
    `mrNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `projectId` VARCHAR(191) NOT NULL,
    `requesterId` VARCHAR(191) NOT NULL,
    `preparerId` VARCHAR(191) NULL,
    `checkerId` VARCHAR(191) NULL,
    `approverId` VARCHAR(191) NULL,
    `purpose` LONGTEXT NULL,
    `priority` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `locationOfUse` LONGTEXT NULL,
    `remarks` LONGTEXT NULL,
    `aiValidationRisk` VARCHAR(191) NULL,
    `aiValidationNotes` LONGTEXT NULL,
    `dateNeeded` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MaterialRequest_mrNumber_key`(`mrNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialRequestItem` (
    `id` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `approvedQuantity` DOUBLE NULL,
    `mrId` VARCHAR(191) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,
    `breakdownData` JSON NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseOrder` (
    `id` VARCHAR(191) NOT NULL,
    `poNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `supplierId` VARCHAR(191) NOT NULL,
    `mrId` VARCHAR(191) NOT NULL,
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `netAmount` DOUBLE NOT NULL DEFAULT 0,
    `vatAmount` DOUBLE NOT NULL DEFAULT 0,
    `deliveryDate` DATETIME(3) NULL,
    `paymentTermsDays` INTEGER NULL,
    `dueDate` DATETIME(3) NULL,
    `preparerId` VARCHAR(191) NULL,
    `reviewerId` VARCHAR(191) NULL,
    `approverId` VARCHAR(191) NULL,
    `aiValidationRisk` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `canvassFormId` VARCHAR(191) NULL,

    UNIQUE INDEX `PurchaseOrder_poNumber_key`(`poNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseOrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `poId` VARCHAR(191) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `totalBreakdownAmount` DOUBLE NOT NULL DEFAULT 0,
    `date` DATETIME(3) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `receiptRef` VARCHAR(191) NULL,
    `supplierName` VARCHAR(191) NULL,
    `isAccrued` BOOLEAN NOT NULL DEFAULT false,
    `netAmount` DOUBLE NOT NULL DEFAULT 0,
    `vatAmount` DOUBLE NOT NULL DEFAULT 0,
    `billingEligibility` VARCHAR(191) NOT NULL DEFAULT 'BILLABLE',
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `aiValidationStatus` VARCHAR(191) NULL,
    `approvalStatus` VARCHAR(191) NULL,
    `aiValidationRisk` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `loggedById` VARCHAR(191) NOT NULL,
    `costType` VARCHAR(191) NOT NULL DEFAULT 'DIRECT',
    `awardedBoqItemId` VARCHAR(191) NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `approverId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseBreakdownItem` (
    `id` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `specification` VARCHAR(191) NULL,
    `quantity` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `totalCost` DOUBLE NOT NULL,
    `supplierName` VARCHAR(191) NULL,
    `purchaseReferenceNo` VARCHAR(191) NULL,
    `receiptInvoiceNo` VARCHAR(191) NULL,
    `purchaseDate` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseProofFile` (
    `id` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `breakdownItemId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileHash` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `verifiedById` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UPLOADED',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseAIValidation` (
    `id` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `validationStatus` VARCHAR(191) NOT NULL,
    `validationScore` DOUBLE NULL,
    `findings` LONGTEXT NULL,
    `recommendations` LONGTEXT NULL,
    `duplicateWarning` BOOLEAN NOT NULL DEFAULT false,
    `budgetWarning` BOOLEAN NOT NULL DEFAULT false,
    `scopeAlignmentResult` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExpenseAIValidation_expenseId_key`(`expenseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExpenseApprovalLog` (
    `id` VARCHAR(191) NOT NULL,
    `expenseId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `actionByUserId` VARCHAR(191) NOT NULL,
    `comments` LONGTEXT NULL,
    `previousStatus` VARCHAR(191) NULL,
    `newStatus` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PettyCashAccount` (
    `id` VARCHAR(191) NOT NULL,
    `accountName` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NULL,
    `fundLimit` DOUBLE NOT NULL,
    `replenishmentTrigger` DOUBLE NULL,
    `currentBalance` DOUBLE NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `custodianId` VARCHAR(191) NOT NULL,
    `approverId` VARCHAR(191) NULL,
    `reviewerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PettyCashExpense` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `payee` VARCHAR(191) NOT NULL,
    `purpose` LONGTEXT NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `isVat` BOOLEAN NOT NULL DEFAULT false,
    `netAmount` DOUBLE NOT NULL DEFAULT 0,
    `vatAmount` DOUBLE NOT NULL DEFAULT 0,
    `billingEligibility` VARCHAR(191) NOT NULL DEFAULT 'BILLABLE',
    `receiptNumber` VARCHAR(191) NULL,
    `attachmentUrl` VARCHAR(191) NULL,
    `isNoReceipt` BOOLEAN NOT NULL DEFAULT false,
    `remarks` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `expenseId` VARCHAR(191) NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `replenishmentId` VARCHAR(191) NULL,
    `costType` VARCHAR(191) NOT NULL DEFAULT 'DIRECT',
    `awardedBoqItemId` VARCHAR(191) NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PettyCashExpense_expenseId_key`(`expenseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PettyCashReplenishment` (
    `id` VARCHAR(191) NOT NULL,
    `requestNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `fundLimit` DOUBLE NOT NULL,
    `beginningBalance` DOUBLE NOT NULL,
    `totalExpenses` DOUBLE NOT NULL,
    `cashOnHand` DOUBLE NOT NULL,
    `amountRequested` DOUBLE NOT NULL,
    `reviewerAction` VARCHAR(191) NULL,
    `reviewerRemarks` VARCHAR(191) NULL,
    `approverId` VARCHAR(191) NULL,
    `approvalDate` DATETIME(3) NULL,
    `releaseDate` DATETIME(3) NULL,
    `releaseMode` VARCHAR(191) NULL,
    `releaseRefNo` VARCHAR(191) NULL,
    `receiverId` VARCHAR(191) NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PettyCashReplenishment_requestNumber_key`(`requestNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Worker` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `middleName` VARCHAR(191) NULL,
    `suffix` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `gender` VARCHAR(191) NULL,
    `civilStatus` VARCHAR(191) NULL,
    `mobileNumber` VARCHAR(191) NULL,
    `emailAddress` VARCHAR(320) NULL,
    `completeAddress` LONGTEXT NULL,
    `emergencyContactName` VARCHAR(191) NULL,
    `emergencyContactNumber` VARCHAR(191) NULL,
    `emergencyContactRelation` VARCHAR(191) NULL,
    `employmentType` VARCHAR(191) NOT NULL DEFAULT 'PROJECT_BASED',
    `workerCategory` VARCHAR(191) NOT NULL DEFAULT 'SKILLED',
    `designation` VARCHAR(191) NULL,
    `department` VARCHAR(191) NULL,
    `dateHired` DATETIME(3) NULL,
    `engagementStartDate` DATETIME(3) NULL,
    `contractEndDate` DATETIME(3) NULL,
    `employmentStatus` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `restDay` VARCHAR(191) NULL,
    `standardWorkHours` DOUBLE NULL DEFAULT 8,
    `overtimeEligible` BOOLEAN NOT NULL DEFAULT true,
    `nightDifferentialEligible` BOOLEAN NOT NULL DEFAULT true,
    `holidayPayEligible` BOOLEAN NOT NULL DEFAULT true,
    `subjectToAttendance` BOOLEAN NOT NULL DEFAULT true,
    `subjectToPayrollCutoff` BOOLEAN NOT NULL DEFAULT true,
    `rateType` VARCHAR(191) NOT NULL DEFAULT 'DAILY_RATE',
    `basicMonthlySalary` DOUBLE NOT NULL DEFAULT 0,
    `dailyRate` DOUBLE NOT NULL DEFAULT 0,
    `hourlyRate` DOUBLE NOT NULL DEFAULT 0,
    `pieceRate` DOUBLE NOT NULL DEFAULT 0,
    `unitDescription` LONGTEXT NULL,
    `contractAmount` DOUBLE NOT NULL DEFAULT 0,
    `professionalFee` DOUBLE NOT NULL DEFAULT 0,
    `paymentBasis` VARCHAR(191) NULL,
    `billingFrequency` VARCHAR(191) NULL,
    `prorationMethod` VARCHAR(191) NULL,
    `retentionPercentage` DOUBLE NOT NULL DEFAULT 0,
    `withholdingTaxRate` DOUBLE NOT NULL DEFAULT 0,
    `allowance` DOUBLE NOT NULL DEFAULT 0,
    `tinNumber` VARCHAR(191) NULL,
    `sssNumber` VARCHAR(191) NULL,
    `philHealthNumber` VARCHAR(191) NULL,
    `pagIbigNumber` VARCHAR(191) NULL,
    `umidNumber` VARCHAR(191) NULL,
    `nationalIdNumber` VARCHAR(191) NULL,
    `validIdType` VARCHAR(191) NULL,
    `validIdNumber` VARCHAR(191) NULL,
    `validIdExpiryDate` DATETIME(3) NULL,
    `withholdingTaxEnabled` BOOLEAN NOT NULL DEFAULT false,
    `sssDeductionEnabled` BOOLEAN NOT NULL DEFAULT false,
    `philHealthDeductionEnabled` BOOLEAN NOT NULL DEFAULT false,
    `pagibigDeductionEnabled` BOOLEAN NOT NULL DEFAULT false,
    `otherGovernmentDeductionEnabled` BOOLEAN NOT NULL DEFAULT false,
    `taxClassification` VARCHAR(191) NOT NULL DEFAULT 'COMPENSATION_EMPLOYEE',
    `withholdingTaxType` VARCHAR(191) NOT NULL DEFAULT 'COMPENSATION_WITHHOLDING_TAX',
    `taxExemptionReason` LONGTEXT NULL,
    `birFormType` VARCHAR(191) NULL,
    `registeredBusinessName` VARCHAR(191) NULL,
    `officialReceiptRequired` BOOLEAN NOT NULL DEFAULT false,
    `taxStatus` VARCHAR(191) NOT NULL DEFAULT 'SINGLE',
    `payrollMode` VARCHAR(191) NOT NULL DEFAULT 'CASH',
    `bankName` VARCHAR(191) NULL,
    `bankAccountName` VARCHAR(191) NULL,
    `bankAccountNumber` VARCHAR(191) NULL,
    `gcashAccountName` VARCHAR(191) NULL,
    `gcashNumber` VARCHAR(191) NULL,
    `checkPayeeName` VARCHAR(191) NULL,
    `billingPayeeName` VARCHAR(191) NULL,
    `billingAddress` LONGTEXT NULL,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `allowedPaymentMethod` VARCHAR(191) NULL DEFAULT 'Manual Hold',
    `bankAccountType` VARCHAR(191) NULL,
    `bankApprovedBy` VARCHAR(191) NULL,
    `bankBranch` VARCHAR(191) NULL,
    `bankLastUpdatedDate` DATETIME(3) NULL,
    `bankSupportingAttachment` VARCHAR(191) NULL,
    `bankUpdatedBy` VARCHAR(191) NULL,
    `bankVerificationStatus` VARCHAR(191) NULL DEFAULT 'Pending',
    `gcashApprovedBy` VARCHAR(191) NULL,
    `gcashLastUpdatedDate` DATETIME(3) NULL,
    `gcashSupportingAttachment` VARCHAR(191) NULL,
    `gcashUpdatedBy` VARCHAR(191) NULL,
    `gcashVerificationStatus` VARCHAR(191) NULL DEFAULT 'Pending',
    `paymentHoldReason` LONGTEXT NULL,
    `paymentProfileStatus` VARCHAR(191) NULL DEFAULT 'Pending',
    `paymentRemarks` VARCHAR(191) NULL,
    `payrollCategory` VARCHAR(191) NULL DEFAULT 'Other',
    `isSeedData` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Worker_workerId_key`(`workerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIWorkerValidationResult` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `message` LONGTEXT NOT NULL,
    `fieldRef` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `ignoreReason` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkerDocument` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `expiryDate` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyTimeRecord` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `timeIn` DATETIME(3) NULL,
    `timeOut` DATETIME(3) NULL,
    `regularHours` DOUBLE NOT NULL DEFAULT 0,
    `overtimeHours` DOUBLE NOT NULL DEFAULT 0,
    `nightDiffHours` DOUBLE NOT NULL DEFAULT 0,
    `restDayHours` DOUBLE NOT NULL DEFAULT 0,
    `holidayHours` DOUBLE NOT NULL DEFAULT 0,
    `lateMinutes` INTEGER NOT NULL DEFAULT 0,
    `undertimeMinutes` INTEGER NOT NULL DEFAULT 0,
    `isAbsent` BOOLEAN NOT NULL DEFAULT false,
    `absenceStatus` VARCHAR(191) NULL,
    `sourceFile` VARCHAR(191) NULL,
    `validationStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `remarks` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `encodedById` VARCHAR(191) NULL,
    `payrollPeriodId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DailyTimeRecord_workerId_date_key`(`workerId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollPeriod` (
    `id` VARCHAR(191) NOT NULL,
    `payrollBatchNumber` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `calendarRule` VARCHAR(191) NOT NULL DEFAULT 'SEMI_MONTHLY',
    `periodType` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `payrollDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `projectId` VARCHAR(191) NULL,
    `notes` LONGTEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `dateApproved` DATETIME(3) NULL,
    `dateReleased` DATETIME(3) NULL,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `lockedAt` DATETIME(3) NULL,
    `lockedById` VARCHAR(191) NULL,
    `dummyField` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `destinationAddress` LONGTEXT NULL,
    `destinationLat` DOUBLE NULL,
    `destinationLng` DOUBLE NULL,

    UNIQUE INDEX `PayrollPeriod_payrollBatchNumber_key`(`payrollBatchNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payroll` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `payrollPeriodId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `compensationType` VARCHAR(191) NOT NULL DEFAULT 'DAILY',
    `rate` DOUBLE NOT NULL DEFAULT 0,
    `daysWorked` DOUBLE NOT NULL DEFAULT 0,
    `regularHours` DOUBLE NOT NULL DEFAULT 0,
    `overtimeHours` DOUBLE NOT NULL DEFAULT 0,
    `basicPay` DOUBLE NOT NULL DEFAULT 0,
    `overtimePay` DOUBLE NOT NULL DEFAULT 0,
    `nightDiffPay` DOUBLE NOT NULL DEFAULT 0,
    `holidayPay` DOUBLE NOT NULL DEFAULT 0,
    `restDayPay` DOUBLE NOT NULL DEFAULT 0,
    `allowances` DOUBLE NOT NULL DEFAULT 0,
    `nonTaxableAllowances` DOUBLE NOT NULL DEFAULT 0,
    `otherEarnings` DOUBLE NOT NULL DEFAULT 0,
    `grossPay` DOUBLE NOT NULL DEFAULT 0,
    `grossTaxablePay` DOUBLE NOT NULL DEFAULT 0,
    `sssDeduction` DOUBLE NOT NULL DEFAULT 0,
    `sssEmployerShare` DOUBLE NOT NULL DEFAULT 0,
    `sssEcEmployerShare` DOUBLE NOT NULL DEFAULT 0,
    `sssWispDeduction` DOUBLE NOT NULL DEFAULT 0,
    `sssWispEmployerShare` DOUBLE NOT NULL DEFAULT 0,
    `philhealthDeduction` DOUBLE NOT NULL DEFAULT 0,
    `philhealthEmployerShare` DOUBLE NOT NULL DEFAULT 0,
    `pagibigDeduction` DOUBLE NOT NULL DEFAULT 0,
    `pagibigEmployerShare` DOUBLE NOT NULL DEFAULT 0,
    `taxableCompensation` DOUBLE NOT NULL DEFAULT 0,
    `birPayrollFrequency` VARCHAR(191) NULL,
    `birEffectiveYear` INTEGER NULL,
    `birBracketNo` INTEGER NULL,
    `birBaseTax` DOUBLE NULL,
    `birTaxRatePercent` DOUBLE NULL,
    `birExcessOver` DOUBLE NULL,
    `withholdingTax` DOUBLE NOT NULL DEFAULT 0,
    `manualTaxAdjustment` DOUBLE NOT NULL DEFAULT 0,
    `finalWithholdingTax` DOUBLE NOT NULL DEFAULT 0,
    `cashAdvance` DOUBLE NOT NULL DEFAULT 0,
    `loanDeduction` DOUBLE NOT NULL DEFAULT 0,
    `otherDeductions` DOUBLE NOT NULL DEFAULT 0,
    `lateUndertimeAmount` DOUBLE NOT NULL DEFAULT 0,
    `totalDeductions` DOUBLE NOT NULL DEFAULT 0,
    `netPay` DOUBLE NOT NULL DEFAULT 0,
    `remarks` LONGTEXT NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `paymentHoldReason` LONGTEXT NULL,
    `paymentBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `transactionReference` VARCHAR(191) NULL,

    UNIQUE INDEX `Payroll_workerId_payrollPeriodId_key`(`workerId`, `payrollPeriodId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollEarning` (
    `id` VARCHAR(191) NOT NULL,
    `payrollId` VARCHAR(191) NOT NULL,
    `earningType` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `taxableStatus` BOOLEAN NOT NULL DEFAULT true,
    `remarks` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollDeduction` (
    `id` VARCHAR(191) NOT NULL,
    `payrollId` VARCHAR(191) NOT NULL,
    `deductionType` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `recurringStatus` BOOLEAN NOT NULL DEFAULT false,
    `governmentMandatedStatus` BOOLEAN NOT NULL DEFAULT false,
    `remarks` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollApproval` (
    `id` VARCHAR(191) NOT NULL,
    `payrollPeriodId` VARCHAR(191) NOT NULL,
    `approvalLevel` INTEGER NOT NULL,
    `approverUserId` VARCHAR(191) NOT NULL,
    `approverRole` VARCHAR(191) NOT NULL,
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approvalDate` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeductionLedger` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `principalAmount` DOUBLE NOT NULL,
    `deductionPerPayroll` DOUBLE NOT NULL,
    `balance` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `remarks` LONGTEXT NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeductionLog` (
    `id` VARCHAR(191) NOT NULL,
    `ledgerId` VARCHAR(191) NOT NULL,
    `payrollPeriodId` VARCHAR(191) NOT NULL,
    `amountDeducted` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Allowance` (
    `id` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `isTaxable` BOOLEAN NOT NULL DEFAULT false,
    `frequency` VARCHAR(191) NOT NULL DEFAULT 'PER_PAYROLL',
    `effectiveDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GovernmentSettings` (
    `id` VARCHAR(191) NOT NULL,
    `phEmployeeRate` DOUBLE NOT NULL DEFAULT 2.5,
    `phEmployerRate` DOUBLE NOT NULL DEFAULT 2.5,
    `phSalaryFloor` DOUBLE NOT NULL DEFAULT 10000,
    `phSalaryCeiling` DOUBLE NOT NULL DEFAULT 100000,
    `pagibigEmployeeRate` DOUBLE NOT NULL DEFAULT 2.0,
    `pagibigEmployerRate` DOUBLE NOT NULL DEFAULT 2.0,
    `pagibigMaxSalary` DOUBLE NOT NULL DEFAULT 10000,
    `deductionSchedule` VARCHAR(191) NOT NULL DEFAULT 'SPLIT',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SSSTable` (
    `id` VARCHAR(191) NOT NULL,
    `effectiveYear` INTEGER NOT NULL DEFAULT 2025,
    `minCompensation` DOUBLE NOT NULL,
    `maxCompensation` DOUBLE NOT NULL,
    `monthlySalaryCredit` DOUBLE NOT NULL,
    `regularSsEmployer` DOUBLE NOT NULL,
    `regularSsEmployee` DOUBLE NOT NULL,
    `ecEmployer` DOUBLE NOT NULL,
    `wispEmployer` DOUBLE NOT NULL,
    `wispEmployee` DOUBLE NOT NULL,
    `totalEmployer` DOUBLE NOT NULL,
    `totalEmployee` DOUBLE NOT NULL,
    `totalContribution` DOUBLE NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BIRWithholdingTaxTable` (
    `id` VARCHAR(191) NOT NULL,
    `effectiveYear` INTEGER NOT NULL DEFAULT 2025,
    `payrollFrequency` VARCHAR(191) NOT NULL,
    `bracketNo` INTEGER NULL,
    `compensationFrom` DOUBLE NOT NULL,
    `compensationTo` DOUBLE NULL,
    `baseTax` DOUBLE NOT NULL,
    `taxRatePercent` DOUBLE NOT NULL,
    `excessOver` DOUBLE NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `createdBy` VARCHAR(191) NULL,
    `updatedBy` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `actionType` VARCHAR(191) NOT NULL,
    `module` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NULL,
    `fileSize` INTEGER NULL,
    `projectId` VARCHAR(191) NULL,
    `uploaderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Delivery` (
    `id` VARCHAR(191) NOT NULL,
    `receiptNumber` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NOT NULL DEFAULT 'RECEIVED',
    `poId` VARCHAR(191) NOT NULL,
    `receivedById` VARCHAR(191) NULL,
    `verifierId` VARCHAR(191) NULL,
    `reviewerId` VARCHAR(191) NULL,
    `approverId` VARCHAR(191) NULL,
    `proofFileUrl` VARCHAR(191) NULL,
    `hasProof` BOOLEAN NOT NULL DEFAULT true,
    `isMismatch` BOOLEAN NOT NULL DEFAULT false,
    `mismatchNotes` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryItem` (
    `id` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `deliveryId` VARCHAR(191) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,
    `remarks` LONGTEXT NULL,
    `drQuantity` DOUBLE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsumptionLog` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `description` LONGTEXT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `loggedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsumptionItem` (
    `id` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `logId` VARCHAR(191) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialIssuance` (
    `id` VARCHAR(191) NOT NULL,
    `misNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `activity` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `foremanId` VARCHAR(191) NOT NULL,
    `warehousemanId` VARCHAR(191) NULL,
    `accountantId` VARCHAR(191) NULL,
    `releasedById` VARCHAR(191) NULL,
    `releaseDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MaterialIssuance_misNumber_key`(`misNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IssuanceItem` (
    `id` VARCHAR(191) NOT NULL,
    `requestedQty` DOUBLE NOT NULL,
    `releasedQty` DOUBLE NOT NULL DEFAULT 0,
    `issuanceId` VARCHAR(191) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MaterialReturn` (
    `id` VARCHAR(191) NOT NULL,
    `mrsNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `remarks` LONGTEXT NULL,
    `issuanceId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `foremanId` VARCHAR(191) NOT NULL,
    `warehousemanId` VARCHAR(191) NULL,
    `receiveDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MaterialReturn_mrsNumber_key`(`mrsNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReturnItem` (
    `id` VARCHAR(191) NOT NULL,
    `returnedQty` DOUBLE NOT NULL,
    `condition` VARCHAR(191) NOT NULL DEFAULT 'GOOD',
    `returnId` VARCHAR(191) NOT NULL,
    `issuanceItemId` VARCHAR(191) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountsPayable` (
    `id` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `paymentMethod` VARCHAR(191) NULL,
    `paymentRef` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `paidAmount` DOUBLE NOT NULL DEFAULT 0,
    `netAmount` DOUBLE NOT NULL DEFAULT 0,
    `vatAmount` DOUBLE NOT NULL DEFAULT 0,
    `deliveryId` VARCHAR(191) NOT NULL,
    `poId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `voucherNumber` VARCHAR(191) NULL,

    UNIQUE INDEX `AccountsPayable_deliveryId_key`(`deliveryId`),
    UNIQUE INDEX `AccountsPayable_voucherNumber_key`(`voucherNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BOQLotBreakdown` (
    `id` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `weightPercentage` DOUBLE NOT NULL,
    `boqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Accomplishment` (
    `id` VARCHAR(191) NOT NULL,
    `billingPeriod` VARCHAR(191) NOT NULL,
    `accomplishmentDate` DATETIME(3) NOT NULL,
    `remarks` LONGTEXT NULL,
    `preparedById` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `approvedAmount` DOUBLE NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccomplishmentItem` (
    `id` VARCHAR(191) NOT NULL,
    `workCategory` VARCHAR(191) NULL,
    `descriptionOfWork` LONGTEXT NULL,
    `previousQuantity` DOUBLE NOT NULL DEFAULT 0,
    `currentQuantityClaimed` DOUBLE NOT NULL DEFAULT 0,
    `approvedQuantity` DOUBLE NULL,
    `totalQuantityToDate` DOUBLE NOT NULL DEFAULT 0,
    `contractQuantity` DOUBLE NOT NULL DEFAULT 0,
    `remainingQuantity` DOUBLE NOT NULL DEFAULT 0,
    `unitCost` DOUBLE NOT NULL DEFAULT 0,
    `currentAccomplishmentAmount` DOUBLE NOT NULL DEFAULT 0,
    `totalAccomplishmentAmount` DOUBLE NOT NULL DEFAULT 0,
    `percentageAccomplished` DOUBLE NOT NULL DEFAULT 0,
    `aiValidationStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `inspectionStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `remarks` LONGTEXT NULL,
    `accomplishmentId` VARCHAR(191) NOT NULL,
    `boqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inspection` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionDateRequested` DATETIME(3) NULL,
    `actualQuantityVerified` DOUBLE NOT NULL DEFAULT 0,
    `approvedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `approvedPercentage` DOUBLE NOT NULL DEFAULT 0,
    `inspectionFindings` LONGTEXT NULL,
    `deficiencies` VARCHAR(191) NULL,
    `punchlistItems` VARCHAR(191) NULL,
    `inspectorName` VARCHAR(191) NULL,
    `dateInspected` DATETIME(3) NULL,
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `remarks` LONGTEXT NULL,
    `accomplishmentItemId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Billing` (
    `id` VARCHAR(191) NOT NULL,
    `billingNumber` VARCHAR(191) NOT NULL,
    `billingPeriodFrom` DATETIME(3) NOT NULL,
    `billingPeriodTo` DATETIME(3) NOT NULL,
    `billingDate` DATETIME(3) NOT NULL,
    `billingType` VARCHAR(191) NOT NULL,
    `contractAmount` DOUBLE NOT NULL,
    `revisedContractAmount` DOUBLE NOT NULL,
    `totalPreviousBilling` DOUBLE NOT NULL DEFAULT 0,
    `currentBillingAmount` DOUBLE NOT NULL DEFAULT 0,
    `totalBillingToDate` DOUBLE NOT NULL DEFAULT 0,
    `balanceContractAmount` DOUBLE NOT NULL DEFAULT 0,
    `aiBillingRiskStatus` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `preparedById` VARCHAR(191) NULL,
    `checkedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Billing_billingNumber_key`(`billingNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BillingItem` (
    `id` VARCHAR(191) NOT NULL,
    `contractQuantity` DOUBLE NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `contractAmount` DOUBLE NOT NULL,
    `previousQuantityBilled` DOUBLE NOT NULL DEFAULT 0,
    `currentQuantityForBilling` DOUBLE NOT NULL DEFAULT 0,
    `totalQuantityBilledToDate` DOUBLE NOT NULL DEFAULT 0,
    `previousAmountBilled` DOUBLE NOT NULL DEFAULT 0,
    `currentAmount` DOUBLE NOT NULL DEFAULT 0,
    `totalAmountToDate` DOUBLE NOT NULL DEFAULT 0,
    `balanceQuantity` DOUBLE NOT NULL DEFAULT 0,
    `balanceAmount` DOUBLE NOT NULL DEFAULT 0,
    `percentageAccomplished` DOUBLE NOT NULL DEFAULT 0,
    `aiStatus` VARCHAR(191) NULL,
    `aiRiskLevel` VARCHAR(191) NULL,
    `billingId` VARCHAR(191) NOT NULL,
    `boqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BillingDeduction` (
    `id` VARCHAR(191) NOT NULL,
    `grossBilling` DOUBLE NOT NULL,
    `retention` DOUBLE NOT NULL DEFAULT 0,
    `withholdingTax` DOUBLE NOT NULL DEFAULT 0,
    `vat` DOUBLE NOT NULL DEFAULT 0,
    `mobilizationAdvanceRecoupment` DOUBLE NOT NULL DEFAULT 0,
    `previousOverpayment` DOUBLE NOT NULL DEFAULT 0,
    `liquidatedDamages` DOUBLE NOT NULL DEFAULT 0,
    `backCharges` DOUBLE NOT NULL DEFAULT 0,
    `otherDeductions` DOUBLE NOT NULL DEFAULT 0,
    `netAmountDue` DOUBLE NOT NULL,
    `billingId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `billingAmount` DOUBLE NOT NULL,
    `approvedAmount` DOUBLE NOT NULL,
    `netAmountDue` DOUBLE NOT NULL,
    `amountPaid` DOUBLE NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    `paymentReferenceNumber` VARCHAR(191) NULL,
    `bankOrCheckNumber` VARCHAR(191) NULL,
    `orNumber` VARCHAR(191) NULL,
    `ewtCertificateReference` VARCHAR(191) NULL,
    `paymentStatus` VARCHAR(191) NOT NULL,
    `remarks` LONGTEXT NULL,
    `billingId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VariationOrder` (
    `id` VARCHAR(191) NOT NULL,
    `voNumber` VARCHAR(191) NOT NULL,
    `dateRequested` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `requestedById` VARCHAR(191) NULL,
    `requestingDepartment` VARCHAR(191) NULL,
    `variationType` VARCHAR(191) NOT NULL,
    `variationCategory` VARCHAR(191) NULL,
    `sourceOfVariation` VARCHAR(191) NULL,
    `reasonForVariation` LONGTEXT NULL,
    `detailedDescription` LONGTEXT NULL,
    `affectedLocation` VARCHAR(191) NULL,
    `affectedFloorZone` VARCHAR(191) NULL,
    `originalContractAmount` DOUBLE NOT NULL DEFAULT 0,
    `totalPreviouslyApprovedAdditive` DOUBLE NOT NULL DEFAULT 0,
    `totalPreviouslyApprovedDeductive` DOUBLE NOT NULL DEFAULT 0,
    `currentRevisedContractAmount` DOUBLE NOT NULL DEFAULT 0,
    `additionalAmount` DOUBLE NOT NULL DEFAULT 0,
    `deductiveAmount` DOUBLE NOT NULL DEFAULT 0,
    `netVariationAmount` DOUBLE NOT NULL DEFAULT 0,
    `percentageImpact` DOUBLE NOT NULL DEFAULT 0,
    `timeImpact` VARCHAR(191) NOT NULL DEFAULT 'TO_BE_EVALUATED',
    `additionalCalendarDaysRequested` INTEGER NOT NULL DEFAULT 0,
    `effectOnCriticalPath` VARCHAR(191) NOT NULL DEFAULT 'TO_BE_EVALUATED',
    `effectOnProjectCompletionDate` DATETIME(3) NULL,
    `technicalJustification` VARCHAR(191) NULL,
    `commercialJustification` VARCHAR(191) NULL,
    `safetyJustification` VARCHAR(191) NULL,
    `clientInstructionReference` VARCHAR(191) NULL,
    `consultantInstructionReference` VARCHAR(191) NULL,
    `drawingReference` VARCHAR(191) NULL,
    `siteInstructionReference` VARCHAR(191) NULL,
    `inspectionReportReference` VARCHAR(191) NULL,
    `quantityTakeOffReference` VARCHAR(191) NULL,
    `costEstimateReference` VARCHAR(191) NULL,
    `supplierQuotationReference` VARCHAR(191) NULL,
    `subcontractorQuotationReference` VARCHAR(191) NULL,
    `aiValidationResult` LONGTEXT NULL,
    `aiRiskRating` VARCHAR(191) NULL,
    `currentStatus` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `approvalHistory` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `approvedForImplementation` BOOLEAN NOT NULL DEFAULT false,
    `approvedForProcurement` BOOLEAN NOT NULL DEFAULT false,
    `approvedForSubcontracting` BOOLEAN NOT NULL DEFAULT false,
    `approvedForJobOrder` BOOLEAN NOT NULL DEFAULT false,
    `approvedForBilling` BOOLEAN NOT NULL DEFAULT false,
    `subcontractPackageId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VariationOrder_voNumber_key`(`voNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VariationOrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `voItemNumber` VARCHAR(191) NOT NULL,
    `itemClassification` VARCHAR(191) NOT NULL,
    `workCategory` VARCHAR(191) NULL,
    `location` LONGTEXT NULL,
    `description` LONGTEXT NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `originalQuantity` DOUBLE NOT NULL DEFAULT 0,
    `previouslyApprovedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `currentProposedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `revisedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `originalUnitCost` DOUBLE NOT NULL DEFAULT 0,
    `proposedUnitCost` DOUBLE NOT NULL DEFAULT 0,
    `approvedUnitCost` DOUBLE NOT NULL DEFAULT 0,
    `originalAmount` DOUBLE NOT NULL DEFAULT 0,
    `additionalAmount` DOUBLE NOT NULL DEFAULT 0,
    `deductiveAmount` DOUBLE NOT NULL DEFAULT 0,
    `netAmount` DOUBLE NOT NULL DEFAULT 0,
    `costSource` VARCHAR(191) NULL,
    `pricingBasis` VARCHAR(191) NULL,
    `materialCost` DOUBLE NOT NULL DEFAULT 0,
    `laborCost` DOUBLE NOT NULL DEFAULT 0,
    `equipmentCost` DOUBLE NOT NULL DEFAULT 0,
    `subcontractCost` DOUBLE NOT NULL DEFAULT 0,
    `transportationCost` DOUBLE NOT NULL DEFAULT 0,
    `consumables` DOUBLE NOT NULL DEFAULT 0,
    `overhead` DOUBLE NOT NULL DEFAULT 0,
    `profitMarkup` DOUBLE NOT NULL DEFAULT 0,
    `tax` DOUBLE NOT NULL DEFAULT 0,
    `otherDirectCost` DOUBLE NOT NULL DEFAULT 0,
    `supplierQuotationReference` VARCHAR(191) NULL,
    `subcontractorQuotationReference` VARCHAR(191) NULL,
    `canvassReference` VARCHAR(191) NULL,
    `attachmentReference` VARCHAR(191) NULL,
    `procurementStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `subcontractStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `accomplishmentStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `billingStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `remarks` LONGTEXT NULL,
    `variationOrderId` VARCHAR(191) NOT NULL,
    `originalBoqItemId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VariationOrderDocument` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `documentCategory` VARCHAR(191) NOT NULL,
    `remarks` LONGTEXT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `variationOrderId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VariationOrderApproval` (
    `id` VARCHAR(191) NOT NULL,
    `stage` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `actionById` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `variationOrderId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIVariationOrderValidation` (
    `id` VARCHAR(191) NOT NULL,
    `validationType` VARCHAR(191) NOT NULL,
    `result` LONGTEXT NOT NULL,
    `confidenceLevel` VARCHAR(191) NOT NULL,
    `riskLevel` VARCHAR(191) NOT NULL,
    `findings` LONGTEXT NULL,
    `missingRequirements` VARCHAR(191) NULL,
    `duplicateWarnings` VARCHAR(191) NULL,
    `recommendedAction` VARCHAR(191) NULL,
    `variationOrderId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EvidenceFile` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `evidenceType` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NULL,
    `uploadDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `gpsLatitude` DOUBLE NULL,
    `gpsLongitude` DOUBLE NULL,
    `dateTaken` DATETIME(3) NULL,
    `metadataStatus` VARCHAR(191) NULL,
    `description` LONGTEXT NULL,
    `versionNumber` INTEGER NOT NULL DEFAULT 1,
    `projectId` VARCHAR(191) NOT NULL,
    `boqItemId` VARCHAR(191) NULL,
    `accomplishmentId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectCamera` (
    `id` VARCHAR(191) NOT NULL,
    `cameraName` VARCHAR(191) NOT NULL,
    `cameraLocation` VARCHAR(191) NULL,
    `cameraType` VARCHAR(191) NULL,
    `streamUrl` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `gpsLatitude` DOUBLE NULL,
    `gpsLongitude` DOUBLE NULL,
    `installationDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `remarks` LONGTEXT NULL,
    `projectId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveCameraSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `capturedById` VARCHAR(191) NULL,
    `cameraId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationRun` (
    `id` VARCHAR(191) NOT NULL,
    `validationType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `overallScore` DOUBLE NULL,
    `visualScore` DOUBLE NULL,
    `locationScore` DOUBLE NULL,
    `dateScore` DOUBLE NULL,
    `boqMatchScore` DOUBLE NULL,
    `planMatchScore` DOUBLE NULL,
    `duplicateRiskScore` DOUBLE NULL,
    `recommendation` VARCHAR(191) NULL,
    `summaryFindings` LONGTEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `accomplishmentId` VARCHAR(191) NULL,
    `billingId` VARCHAR(191) NULL,
    `boqItemId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationEvidence` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceType` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `capturedFromLiveCamera` BOOLEAN NOT NULL DEFAULT false,
    `cameraId` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `timestamp` DATETIME(3) NULL,
    `metadataStatus` VARCHAR(191) NULL,
    `aiValidationRunId` VARCHAR(191) NOT NULL,
    `evidenceFileId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationFinding` (
    `id` VARCHAR(191) NOT NULL,
    `findingCategory` VARCHAR(191) NOT NULL,
    `findingTitle` VARCHAR(191) NOT NULL,
    `findingDescription` LONGTEXT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `confidenceScore` DOUBLE NULL,
    `relatedFileId` VARCHAR(191) NULL,
    `relatedBoqItemId` VARCHAR(191) NULL,
    `recommendedAction` VARCHAR(191) NULL,
    `aiValidationRunId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIDuplicatePhotoCheck` (
    `id` VARCHAR(191) NOT NULL,
    `currentFileId` VARCHAR(191) NOT NULL,
    `matchedFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `similarityScore` DOUBLE NOT NULL,
    `matchType` VARCHAR(191) NOT NULL,
    `previousBillingId` VARCHAR(191) NULL,
    `previousAccomplishmentId` VARCHAR(191) NULL,
    `result` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIHumanReview` (
    `id` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `reviewerRole` VARCHAR(191) NOT NULL,
    `decision` VARCHAR(191) NOT NULL,
    `remarks` LONGTEXT NULL,
    `overrideReason` LONGTEXT NULL,
    `aiValidationRunId` VARCHAR(191) NOT NULL,
    `reviewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subcontractor` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `businessName` VARCHAR(191) NULL,
    `businessType` ENUM('CORPORATION', 'PARTNERSHIP', 'SOLE_PROPRIATOR', 'INDIVIDUAL_CONTRACTOR') NOT NULL,
    `address` LONGTEXT NULL,
    `contactPerson` VARCHAR(191) NULL,
    `contactNumber` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `tin` VARCHAR(191) NULL,
    `birReg` VARCHAR(191) NULL,
    `dtiSecReg` VARCHAR(191) NULL,
    `mayorPermit` VARCHAR(191) NULL,
    `pcabLicense` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NULL,
    `bankAccountName` VARCHAR(191) NULL,
    `bankAccountNumber` VARCHAR(191) NULL,
    `specialization` JSON NULL,
    `accreditation` ENUM('PENDING', 'APPROVED', 'SUSPENDED', 'BLACKLISTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `contractType` VARCHAR(191) NOT NULL DEFAULT 'SUBCONTRACTOR',
    `isSeedData` BOOLEAN NOT NULL DEFAULT false,
    `requiredDocs` JSON NULL,
    `docExpiries` JSON NULL,
    `safetyRecords` JSON NULL,
    `evaluationRating` INTEGER NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramOfWorks` (
    `id` VARCHAR(191) NOT NULL,
    `packageId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `activities` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubcontractorBOQItem` (
    `id` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `awardedBoqItemId` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `totalCost` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccomplishmentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `jobOrderId` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `quantityCompleted` DOUBLE NULL,
    `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `photos` JSON NULL,
    `videos` JSON NULL,
    `aiValidationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `billingId` VARCHAR(191) NOT NULL,
    `amountPaid` DOUBLE NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `method` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationResult` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `score` DOUBLE NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubcontractPackage` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `packageNumber` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `workCategory` VARCHAR(191) NOT NULL,
    `contractType` ENUM('LABOR_ONLY', 'SUPPLY_ONLY', 'SUPPLY_INSTALL', 'EQUIPMENT_RENTAL', 'TESTING_COMMISSIONING', 'RECTIFICATION', 'PROFESSIONAL_SERVICE', 'LUMP_SUM') NOT NULL,
    `awardedBoqItemId` VARCHAR(191) NULL,
    `masterBoqItemId` VARCHAR(191) NULL,
    `scopeOfWork` LONGTEXT NOT NULL,
    `location` LONGTEXT NOT NULL,
    `floorBuildingZone` VARCHAR(191) NULL,
    `quantity` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `contractAmount` DOUBLE NOT NULL,
    `internalBudget` DOUBLE NULL,
    `costType` ENUM('DIRECT', 'INDIRECT', 'GENERAL_REQUIREMENT', 'TEMPORARY') NOT NULL,
    `paymentTerms` ENUM('PROGRESS', 'MILESTONE', 'LUMP_SUM', 'PER_QUANTITY', 'PER_LOT', 'PER_DAY', 'PER_MANPOWER') NOT NULL,
    `retentionPct` DOUBLE NULL,
    `whtPct` DOUBLE NULL,
    `mobilizationAdvance` DOUBLE NULL,
    `startDate` DATETIME(3) NULL,
    `targetCompletion` DATETIME(3) NULL,
    `warrantyPeriod` INTEGER NULL,
    `attachments` JSON NULL,
    `status` ENUM('DRAFT', 'FOR_REVIEW', 'FOR_BUDGET_VALIDATION', 'FOR_TECHNICAL_APPROVAL', 'FOR_FINAL_APPROVAL', 'APPROVED', 'AGREEMENT_ISSUED', 'JOB_ORDER_ISSUED', 'ONGOING', 'FOR_INSPECTION', 'PARTIALLY_ACCOMPLISHED', 'FOR_BILLING', 'BILLED', 'PARTIALLY_PAID', 'FULLY_PAID', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,

    UNIQUE INDEX `SubcontractPackage_packageNumber_key`(`packageNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobOrder` (
    `id` VARCHAR(191) NOT NULL,
    `jobNumber` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NULL,
    `packageId` VARCHAR(191) NULL,
    `description` LONGTEXT NOT NULL,
    `boqReferenceId` VARCHAR(191) NULL,
    `location` LONGTEXT NOT NULL,
    `contractAmount` DOUBLE NOT NULL,
    `paymentBasis` ENUM('PROGRESS', 'MILESTONE', 'LUMP_SUM', 'PER_QUANTITY', 'PER_LOT', 'PER_DAY', 'PER_MANPOWER') NOT NULL,
    `startDate` DATETIME(3) NULL,
    `completionDate` DATETIME(3) NULL,
    `requiredOutput` VARCHAR(191) NULL,
    `materialResponsibility` ENUM('COMPANY_SUPPLIED', 'CONTRACTOR_SUPPLIED', 'MIXED') NOT NULL,
    `safetyRequirements` VARCHAR(191) NULL,
    `acceptanceCriteria` VARCHAR(191) NULL,
    `attachments` JSON NULL,
    `preparedBy` VARCHAR(191) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'FOR_REVIEW', 'FOR_FINANCIAL_REVIEW', 'FOR_TECHNICAL_REVIEW', 'APPROVED', 'ISSUED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,

    UNIQUE INDEX `JobOrder_jobNumber_key`(`jobNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubcontractAccomplishment` (
    `id` VARCHAR(191) NOT NULL,
    `packageId` VARCHAR(191) NULL,
    `jobOrderId` VARCHAR(191) NULL,
    `workDescription` LONGTEXT NOT NULL,
    `location` LONGTEXT NOT NULL,
    `prevPercent` DOUBLE NOT NULL,
    `currentPercent` DOUBLE NOT NULL,
    `cumulativePercent` DOUBLE NOT NULL,
    `prevQty` DOUBLE NOT NULL,
    `currentQty` DOUBLE NOT NULL,
    `totalQty` DOUBLE NOT NULL,
    `remainingQty` DOUBLE NOT NULL,
    `photos` JSON NULL,
    `videos` JSON NULL,
    `inspectionReport` VARCHAR(191) NULL,
    `qaQcStatus` VARCHAR(191) NULL,
    `materialIssuedRef` VARCHAR(191) NULL,
    `deliveryRef` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `preparedBy` VARCHAR(191) NULL,
    `verifiedBy` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'FOR_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubcontractBilling` (
    `id` VARCHAR(191) NOT NULL,
    `billingNumber` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `packageId` VARCHAR(191) NULL,
    `jobOrderId` VARCHAR(191) NULL,
    `contractAmount` DOUBLE NOT NULL,
    `previousGross` DOUBLE NOT NULL,
    `currentGross` DOUBLE NOT NULL,
    `totalGross` DOUBLE NOT NULL,
    `remainingBalance` DOUBLE NOT NULL,
    `retentionDeduction` DOUBLE NULL,
    `whtDeduction` DOUBLE NULL,
    `mobilizationDeduction` DOUBLE NULL,
    `backCharges` DOUBLE NULL,
    `materialCharges` DOUBLE NULL,
    `penalties` DOUBLE NULL,
    `otherDeductions` DOUBLE NULL,
    `netPayable` DOUBLE NOT NULL,
    `billingPeriod` VARCHAR(191) NULL,
    `supportingDocs` JSON NULL,
    `aiValidationResult` JSON NULL,
    `accountingStatus` ENUM('PENDING', 'REVIEWED') NOT NULL DEFAULT 'PENDING',
    `approvalStatus` ENUM('DRAFT', 'SUBMITTED', 'FOR_SITE_VALIDATION', 'FOR_ACCOUNTING_REVIEW', 'FOR_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `paymentStatus` ENUM('PENDING', 'PAID', 'RETURNED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `status` ENUM('DRAFT', 'SUBMITTED', 'FOR_VALIDATION', 'APPROVED_FOR_PAYMENT', 'PAID') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubcontractBilling_billingNumber_key`(`billingNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackCharge` (
    `id` VARCHAR(191) NOT NULL,
    `backChargeNumber` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `subcontractorId` VARCHAR(191) NOT NULL,
    `packageId` VARCHAR(191) NULL,
    `jobOrderId` VARCHAR(191) NULL,
    `description` LONGTEXT NOT NULL,
    `incidentDate` DATETIME(3) NULL,
    `costComputation` DOUBLE NOT NULL,
    `photos` JSON NULL,
    `inspectionReport` VARCHAR(191) NULL,
    `materialRef` VARCHAR(191) NULL,
    `manpowerRef` VARCHAR(191) NULL,
    `amount` DOUBLE NOT NULL,
    `acknowledgment` ENUM('PENDING', 'ACKNOWLEDGED') NOT NULL DEFAULT 'PENDING',
    `disputeStatus` ENUM('NONE', 'DISPUTED') NOT NULL DEFAULT 'NONE',
    `approvalStatus` ENUM('DRAFT', 'FOR_REVIEW', 'ISSUED_TO_SUBCONTRACTOR', 'ACKNOWLEDGED', 'APPROVED', 'DEDUCTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `deductionStatus` ENUM('PENDING', 'DEDUCTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BackCharge_backChargeNumber_key`(`backChargeNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollCutoffSetting` (
    `id` VARCHAR(191) NOT NULL,
    `cutoffName` VARCHAR(191) NOT NULL,
    `cutoffType` VARCHAR(191) NOT NULL,
    `startDay` INTEGER NULL,
    `endDay` INTEGER NULL,
    `payrollReleaseDay` INTEGER NULL,
    `crossesMonth` BOOLEAN NOT NULL DEFAULT false,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `appliesTo` VARCHAR(191) NOT NULL DEFAULT 'ALL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeRecord` (
    `id` VARCHAR(191) NOT NULL,
    `knowledgeId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `notebookType` VARCHAR(191) NOT NULL,
    `notebookUrl` VARCHAR(191) NULL,
    `relatedModule` VARCHAR(191) NULL,
    `documentType` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL DEFAULT 'v1.0',
    `status` VARCHAR(191) NOT NULL DEFAULT 'Draft',
    `owner` VARCHAR(191) NULL,
    `preparedBy` VARCHAR(191) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `dateCreated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateReviewed` DATETIME(3) NULL,
    `dateApproved` DATETIME(3) NULL,
    `tags` VARCHAR(191) NULL,
    `uploadedFileUrl` VARCHAR(191) NULL,
    `summary` LONGTEXT NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KnowledgeRecord_knowledgeId_key`(`knowledgeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeReference` (
    `id` VARCHAR(191) NOT NULL,
    `knowledgeRecordId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `workerId` VARCHAR(191) NULL,
    `payrollPeriodId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeAuditTrail` (
    `id` VARCHAR(191) NOT NULL,
    `knowledgeRecordId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `performedBy` VARCHAR(191) NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `reason` LONGTEXT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollBankAccount` (
    `id` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `bankBranch` VARCHAR(191) NULL,
    `accountNumber` VARCHAR(191) NOT NULL,
    `accountName` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PHP',
    `beginningBalance` DOUBLE NOT NULL DEFAULT 0,
    `currentAvailableBalance` DOUBLE NOT NULL DEFAULT 0,
    `reservedPayrollBalance` DOUBLE NOT NULL DEFAULT 0,
    `actualBankBalance` DOUBLE NOT NULL DEFAULT 0,
    `lastBalanceSyncDate` DATETIME(3) NULL,
    `apiEnabled` BOOLEAN NOT NULL DEFAULT false,
    `bankApiProvider` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `dateCreated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remarks` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollBankLedger` (
    `id` VARCHAR(191) NOT NULL,
    `payrollBankAccountId` VARCHAR(191) NOT NULL,
    `transactionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `transactionType` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `balanceAfter` DOUBLE NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollFundingRequest` (
    `id` VARCHAR(191) NOT NULL,
    `fundingRequestNumber` VARCHAR(191) NOT NULL,
    `payrollBatchId` VARCHAR(191) NULL,
    `payrollPeriodId` VARCHAR(191) NOT NULL,
    `totalNetPay` DOUBLE NOT NULL,
    `estimatedCharges` DOUBLE NOT NULL,
    `totalRequiredFunding` DOUBLE NOT NULL,
    `availablePayrollBalance` DOUBLE NOT NULL,
    `fundingShortage` DOUBLE NOT NULL,
    `fundingSourceAccount` VARCHAR(191) NULL,
    `destinationAccountId` VARCHAR(191) NOT NULL,
    `fundingStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `preparedById` VARCHAR(191) NOT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `dateFunded` DATETIME(3) NULL,
    `fundingBankReferenceNumber` VARCHAR(191) NULL,
    `proofOfTransferUrl` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PayrollFundingRequest_fundingRequestNumber_key`(`fundingRequestNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentBatch` (
    `id` VARCHAR(191) NOT NULL,
    `batchNumber` VARCHAR(191) NOT NULL,
    `payrollBatchId` VARCHAR(191) NULL,
    `payrollPeriodId` VARCHAR(191) NOT NULL,
    `paymentMethodType` VARCHAR(191) NOT NULL,
    `transferRail` VARCHAR(191) NULL,
    `providerId` VARCHAR(191) NULL,
    `providerBatchReference` VARCHAR(191) NULL,
    `expectedSettlementDate` DATETIME(3) NULL,
    `payrollBankAccountId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `totalAmount` DOUBLE NOT NULL,
    `totalWorkers` INTEGER NOT NULL,
    `preparedById` VARCHAR(191) NOT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `releasedById` VARCHAR(191) NULL,
    `dateReleased` DATETIME(3) NULL,
    `reconciliationFileUrl` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `aiRiskLevel` VARCHAR(191) NULL,
    `aiAuditNotes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentBatch_batchNumber_key`(`batchNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentBatchRow` (
    `id` VARCHAR(191) NOT NULL,
    `paymentBatchId` VARCHAR(191) NOT NULL,
    `payrollId` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `transferRail` VARCHAR(191) NULL,
    `recipientBankName` VARCHAR(191) NULL,
    `recipientBankCode` VARCHAR(191) NULL,
    `recipientAccountNumber` VARCHAR(191) NULL,
    `recipientAccountName` VARCHAR(191) NULL,
    `gcashMobileNumber` VARCHAR(191) NULL,
    `gcashAccountName` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `senderReferenceId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `originalInstaPayReference` VARCHAR(191) NULL,
    `unionBankTransactionReference` VARCHAR(191) NULL,
    `providerResponseCode` VARCHAR(191) NULL,
    `providerResponseMessage` LONGTEXT NULL,
    `failureReason` LONGTEXT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `expectedSettlementDate` DATETIME(3) NULL,
    `datePaid` DATETIME(3) NULL,
    `rawApiResponseReference` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `transactionReference` VARCHAR(191) NULL,
    `exceptionReason` LONGTEXT NULL,
    `reconciledAt` DATETIME(3) NULL,

    UNIQUE INDEX `PaymentBatchRow_senderReferenceId_key`(`senderReferenceId`),
    UNIQUE INDEX `PaymentBatchRow_idempotencyKey_key`(`idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentException` (
    `id` VARCHAR(191) NOT NULL,
    `payrollBatchId` VARCHAR(191) NULL,
    `payrollId` VARCHAR(191) NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `requiredPaymentMethod` VARCHAR(191) NULL,
    `exceptionReason` LONGTEXT NOT NULL,
    `correctiveAction` VARCHAR(191) NULL,
    `assignedToId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `approvedById` VARCHAR(191) NULL,
    `dateResolved` DATETIME(3) NULL,
    `reprocessedTransactionRef` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `amount` DOUBLE NULL,
    `apiPaymentBatchId` VARCHAR(191) NULL,
    `payslipNumber` VARCHAR(191) NULL,
    `recipientBankCode` VARCHAR(191) NULL,
    `recipientBankName` VARCHAR(191) NULL,
    `transferRail` VARCHAR(191) NULL,
    `unionBankResponseCode` VARCHAR(191) NULL,
    `unionBankResponseMessage` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentProvider` (
    `id` VARCHAR(191) NOT NULL,
    `providerName` VARCHAR(191) NOT NULL,
    `providerType` VARCHAR(191) NOT NULL,
    `transferRail` VARCHAR(191) NOT NULL,
    `environment` VARCHAR(191) NOT NULL DEFAULT 'Sandbox',
    `apiBaseUrlSandbox` VARCHAR(191) NULL,
    `apiBaseUrlProduction` VARCHAR(191) NULL,
    `oauthTokenUrl` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NULL,
    `clientSecret` VARCHAR(191) NULL,
    `partnerId` VARCHAR(191) NULL,
    `corporateAccountNumber` VARCHAR(191) NULL,
    `debitAccountNumber` VARCHAR(191) NULL,
    `debitAccountName` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'PHP',
    `webhookUrl` VARCHAR(191) NULL,
    `webhookSigningSecret` VARCHAR(191) NULL,
    `statusCallbackUrl` VARCHAR(191) NULL,
    `singleTransactionLimit` DOUBLE NULL,
    `dailyTransactionLimit` DOUBLE NULL,
    `monthlyTransactionLimit` DOUBLE NULL,
    `cutOffTime` VARCHAR(191) NULL,
    `expectedSettlementTime` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Draft',
    `lastConnectionTest` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `dateCreated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateActivated` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReceivingBank` (
    `id` VARCHAR(191) NOT NULL,
    `bankCode` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(191) NOT NULL,
    `shortName` VARCHAR(191) NULL,
    `instaPayEnabled` BOOLEAN NOT NULL DEFAULT false,
    `pesonetEnabled` BOOLEAN NOT NULL DEFAULT false,
    `lastSyncedDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `rawApiReference` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ReceivingBank_bankCode_key`(`bankCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentFallbackRecommendation` (
    `id` VARCHAR(191) NOT NULL,
    `payslipNumber` VARCHAR(191) NULL,
    `workerId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `originalIntendedRoute` VARCHAR(191) NOT NULL DEFAULT 'InstaPay',
    `fallbackRoute` VARCHAR(191) NOT NULL DEFAULT 'PESONet',
    `fallbackReason` LONGTEXT NOT NULL,
    `originalInstaPayRef` VARCHAR(191) NULL,
    `recommendedBy` VARCHAR(191) NOT NULL,
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approvedById` VARCHAR(191) NULL,
    `approvalDate` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `templateName` VARCHAR(191) NOT NULL,
    `templateType` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `parsedData` JSON NULL,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `uploadedById` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectAccomplishmentFile` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `billingId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `originalFilePath` VARCHAR(191) NOT NULL,
    `workingFilePath` VARCHAR(191) NULL,
    `fileSize` INTEGER NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileVersion` INTEGER NOT NULL DEFAULT 1,
    `uploadedById` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `isLockedOriginal` BOOLEAN NOT NULL DEFAULT true,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectAccomplishmentFileVersion` (
    `id` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `savedBy` VARCHAR(191) NULL,
    `savedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remarks` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectAccomplishmentAIFinding` (
    `id` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `billingId` VARCHAR(191) NULL,
    `findingType` VARCHAR(191) NOT NULL,
    `sheetName` VARCHAR(191) NULL,
    `cellReference` VARCHAR(191) NULL,
    `description` LONGTEXT NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'INFO',
    `recommendation` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeRuleReference` (
    `id` VARCHAR(191) NOT NULL,
    `notebookName` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `ruleCategory` VARCHAR(191) NOT NULL,
    `ruleTitle` VARCHAR(191) NOT NULL,
    `ruleDescription` LONGTEXT NOT NULL,
    `affectedProcess` VARCHAR(191) NULL,
    `validationType` VARCHAR(191) NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'BLOCK',
    `isMandatory` BOOLEAN NOT NULL DEFAULT true,
    `effectiveDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastReviewedDate` DATETIME(3) NULL,
    `sourceLink` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NULL,
    `updatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeRuleAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `notebookName` VARCHAR(191) NOT NULL,
    `ruleApplied` VARCHAR(191) NOT NULL,
    `validationResult` LONGTEXT NOT NULL,
    `actionTaken` VARCHAR(191) NOT NULL,
    `userAction` VARCHAR(191) NULL,
    `overrideRequested` BOOLEAN NOT NULL DEFAULT false,
    `overrideApprovedBy` VARCHAR(191) NULL,
    `overrideReason` LONGTEXT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `roleName` VARCHAR(191) NOT NULL,
    `roleCode` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_roleName_key`(`roleName`),
    UNIQUE INDEX `Role_roleCode_key`(`roleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserRole_userId_roleId_key`(`userId`, `roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Module` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Module_moduleName_key`(`moduleName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `id` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `canView` BOOLEAN NOT NULL DEFAULT false,
    `canCreate` BOOLEAN NOT NULL DEFAULT false,
    `canEditDraft` BOOLEAN NOT NULL DEFAULT false,
    `canSubmit` BOOLEAN NOT NULL DEFAULT false,
    `canReview` BOOLEAN NOT NULL DEFAULT false,
    `canRecommend` BOOLEAN NOT NULL DEFAULT false,
    `canApprove` BOOLEAN NOT NULL DEFAULT false,
    `canReject` BOOLEAN NOT NULL DEFAULT false,
    `canReturnForCorrection` BOOLEAN NOT NULL DEFAULT false,
    `canCancel` BOOLEAN NOT NULL DEFAULT false,
    `canRevise` BOOLEAN NOT NULL DEFAULT false,
    `canLock` BOOLEAN NOT NULL DEFAULT false,
    `canUnlockWithAuthorization` BOOLEAN NOT NULL DEFAULT false,
    `canReleasePayment` BOOLEAN NOT NULL DEFAULT false,
    `canMarkAsPaid` BOOLEAN NOT NULL DEFAULT false,
    `canUploadAttachment` BOOLEAN NOT NULL DEFAULT false,
    `canDownloadAttachment` BOOLEAN NOT NULL DEFAULT false,
    `canPrint` BOOLEAN NOT NULL DEFAULT false,
    `canExport` BOOLEAN NOT NULL DEFAULT false,
    `canDeleteDraft` BOOLEAN NOT NULL DEFAULT false,
    `canVoidRecord` BOOLEAN NOT NULL DEFAULT false,
    `canViewAuditLogs` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RolePermission_roleId_moduleId_key`(`roleId`, `moduleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkflowTemplate_moduleName_key`(`moduleName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowStep` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `stepOrder` INTEGER NOT NULL,
    `stageName` VARCHAR(191) NOT NULL,
    `requiredRole` VARCHAR(191) NOT NULL,
    `actionRequired` VARCHAR(191) NOT NULL,
    `isTerminal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransactionWorkflow` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `preparedBy` VARCHAR(191) NULL,
    `preparedByRole` VARCHAR(191) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedByRole` VARCHAR(191) NULL,
    `recommendedBy` VARCHAR(191) NULL,
    `recommendedByRole` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedByRole` VARCHAR(191) NULL,
    `paidBy` VARCHAR(191) NULL,
    `paidByRole` VARCHAR(191) NULL,
    `currentStatus` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `currentStage` VARCHAR(191) NOT NULL DEFAULT 'PREPARATION',
    `nextRequiredRole` VARCHAR(191) NULL,
    `datePrepared` DATETIME(3) NULL,
    `dateReviewed` DATETIME(3) NULL,
    `dateRecommended` DATETIME(3) NULL,
    `dateApproved` DATETIME(3) NULL,
    `datePaid` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `auditReference` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TransactionWorkflow_moduleName_transactionId_idx`(`moduleName`, `transactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userRole` VARCHAR(191) NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `actionType` VARCHAR(191) NOT NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `deviceInfo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationLog` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userRole` VARCHAR(191) NULL,
    `validationType` VARCHAR(191) NOT NULL,
    `validationResult` LONGTEXT NOT NULL,
    `riskLevel` VARCHAR(191) NULL,
    `aiFindings` LONGTEXT NULL,
    `aiRecommendation` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LockedRecord` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `lockedBy` VARCHAR(191) NULL,
    `lockedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` LONGTEXT NULL,

    UNIQUE INDEX `LockedRecord_moduleName_transactionId_key`(`moduleName`, `transactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RevisionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `reason` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentLog` (
    `id` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `processedBy` VARCHAR(191) NOT NULL,
    `processedByRole` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserLoginLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `deviceInfo` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoleConflictRule` (
    `id` VARCHAR(191) NOT NULL,
    `role1Code` VARCHAR(191) NOT NULL,
    `role2Code` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AINotebookReference` (
    `id` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `uploadedBy` VARCHAR(191) NOT NULL,
    `uploadedByRole` VARCHAR(191) NULL,
    `projectAssignment` VARCHAR(191) NULL,
    `moduleAssignment` VARCHAR(191) NULL,
    `referenceCategory` VARCHAR(191) NOT NULL,
    `effectiveDate` DATETIME(3) NULL,
    `expiryDate` DATETIME(3) NULL,
    `versionNumber` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_AI_INDEXING',
    `isMandatory` BOOLEAN NOT NULL DEFAULT false,
    `supersededById` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedDate` DATETIME(3) NULL,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `aiIndexingStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `aiSummary` LONGTEXT NULL,
    `keywords` VARCHAR(191) NULL,
    `validationUseCase` VARCHAR(191) NULL,
    `fileHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotebookReference` (
    `id` VARCHAR(191) NOT NULL,
    `referenceCode` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `moduleScope` VARCHAR(191) NULL,
    `projectScope` VARCHAR(191) NULL,
    `companyWide` BOOLEAN NOT NULL DEFAULT false,
    `mandatoryFlag` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT_UPLOAD',
    `activeVersionId` VARCHAR(191) NULL,
    `uploadedBy` VARCHAR(191) NOT NULL,
    `uploadedByRole` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedByRole` VARCHAR(191) NULL,
    `effectiveDate` DATETIME(3) NULL,
    `expiryDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotebookReference_referenceCode_key`(`referenceCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotebookReferenceVersion` (
    `id` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `extractedText` VARCHAR(191) NULL,
    `aiSummary` LONGTEXT NULL,
    `aiKeywords` VARCHAR(191) NULL,
    `fileHash` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `indexedStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `uploadedBy` VARCHAR(191) NOT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `effectiveDate` DATETIME(3) NULL,
    `supersededDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotebookReferenceModule` (
    `id` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotebookReferenceRole` (
    `id` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `roleName` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotebookReferenceProject` (
    `id` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotebookReferenceApprovalLog` (
    `id` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `actionByUserId` VARCHAR(191) NOT NULL,
    `actionByUserRole` VARCHAR(191) NULL,
    `comments` LONGTEXT NULL,
    `previousStatus` VARCHAR(191) NULL,
    `newStatus` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotebookReferenceIndexLog` (
    `id` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `details` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationRule` (
    `id` VARCHAR(191) NOT NULL,
    `ruleCode` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AIValidationRule_ruleCode_key`(`ruleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AITransactionValidation` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userRole` VARCHAR(191) NOT NULL,
    `validationType` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `referenceVersionId` VARCHAR(191) NULL,
    `validationStatus` VARCHAR(191) NOT NULL,
    `riskLevel` VARCHAR(191) NOT NULL,
    `aiFindings` LONGTEXT NULL,
    `aiRecommendation` VARCHAR(191) NULL,
    `blockingFlag` BOOLEAN NOT NULL DEFAULT false,
    `overrideAllowed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationOverride` (
    `id` VARCHAR(191) NOT NULL,
    `validationResultId` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `overriddenBy` VARCHAR(191) NOT NULL,
    `overriddenByRole` VARCHAR(191) NOT NULL,
    `overrideReason` LONGTEXT NOT NULL,
    `supportingAttachment` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedByRole` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIRiskScore` (
    `id` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `riskLevel` VARCHAR(191) NOT NULL,
    `score` DOUBLE NOT NULL,
    `reasons` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIModulePrompt` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `promptTemplate` LONGTEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIAuditFinding` (
    `id` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `moduleName` VARCHAR(191) NULL,
    `findingType` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `riskLevel` VARCHAR(191) NOT NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AISearchLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userRole` VARCHAR(191) NOT NULL,
    `searchQuery` LONGTEXT NOT NULL,
    `moduleScope` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AINotification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userRole` VARCHAR(191) NOT NULL,
    `message` LONGTEXT NOT NULL,
    `moduleName` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIReferenceUsageLog` (
    `id` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CanvassForm` (
    `id` VARCHAR(191) NOT NULL,
    `canvassNumber` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `mrId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `preparedById` VARCHAR(191) NULL,
    `recommendedSupplierId` VARCHAR(191) NULL,
    `aiSummary` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CanvassForm_canvassNumber_key`(`canvassNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CanvassItem` (
    `id` VARCHAR(191) NOT NULL,
    `quantityRequired` DOUBLE NOT NULL,
    `canvassFormId` VARCHAR(191) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierQuotation` (
    `id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RECEIVED',
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `isRecommended` BOOLEAN NOT NULL DEFAULT false,
    `deliveryPeriod` VARCHAR(191) NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `aiRank` INTEGER NULL,
    `aiRationale` VARCHAR(191) NULL,
    `canvassFormId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `fileUrl` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuotationItem` (
    `id` VARCHAR(191) NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `quantityAvailable` DOUBLE NOT NULL,
    `totalCost` DOUBLE NOT NULL,
    `brand` VARCHAR(191) NULL,
    `remarks` LONGTEXT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `canvassItemId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipment` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `plateNumber` VARCHAR(191) NULL,
    `ownershipType` VARCHAR(191) NOT NULL DEFAULT 'OWNED',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `hourlyRate` DOUBLE NULL DEFAULT 0,
    `purchaseDate` DATETIME(3) NULL,
    `fmsDeviceId` VARCHAR(191) NULL,
    `fmsProvider` VARCHAR(191) NULL,
    `lastOdometer` DOUBLE NULL DEFAULT 0,
    `lastEngineHours` DOUBLE NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `assignedDepartment` VARCHAR(191) NULL,
    `chassisNumber` VARCHAR(191) NULL,
    `engineNumber` VARCHAR(191) NULL,
    `fuelType` VARCHAR(191) NULL DEFAULT 'DIESEL',

    UNIQUE INDEX `Equipment_code_key`(`code`),
    UNIQUE INDEX `Equipment_fmsDeviceId_key`(`fmsDeviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentDeployment` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NULL,
    `targetDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expectedReturnDate` DATETIME(3) NULL,
    `dateDeployed` DATETIME(3) NULL,
    `dateReturned` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'REQUESTED',
    `purpose` LONGTEXT NULL,
    `notes` LONGTEXT NULL,
    `requestedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `destinationAddress` LONGTEXT NULL,
    `destinationLat` DOUBLE NULL,
    `destinationLng` DOUBLE NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentUtilization` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `hoursUsed` DOUBLE NOT NULL DEFAULT 0,
    `fuelConsumed` DOUBLE NOT NULL DEFAULT 0,
    `taskDescription` LONGTEXT NULL,
    `loggedBy` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentMaintenance` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `scheduledDate` DATETIME(3) NULL,
    `completedDate` DATETIME(3) NULL,
    `cost` DOUBLE NOT NULL DEFAULT 0,
    `description` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED',
    `fmsFaultCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentTelemetry` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `speed` DOUBLE NULL,
    `engineState` VARCHAR(191) NULL,
    `odometer` DOUBLE NULL,
    `engineHours` DOUBLE NULL,
    `fuelLevel` DOUBLE NULL,
    `faultCodes` VARCHAR(191) NULL,
    `gpsAccuracy` DOUBLE NULL,
    `heading` DOUBLE NULL,
    `ignitionStatus` BOOLEAN NULL,
    `locationSource` VARCHAR(191) NULL,
    `rawPayloadJson` LONGTEXT NULL,
    `receivedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `satelliteCount` INTEGER NULL,

    INDEX `EquipmentTelemetry_equipmentId_timestamp_idx`(`equipmentId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentAIValidation` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `findings` LONGTEXT NOT NULL,
    `recommendations` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HikvisionDevice` (
    `id` VARCHAR(191) NOT NULL,
    `deviceName` VARCHAR(191) NOT NULL,
    `deviceModel` VARCHAR(191) NULL,
    `deviceSerialNumber` VARCHAR(191) NOT NULL,
    `imeiOrUniqueId` VARCHAR(191) NULL,
    `firmwareVersion` VARCHAR(191) NULL,
    `integrationType` VARCHAR(191) NOT NULL DEFAULT 'DEVICE_GATEWAY',
    `ipAddress` VARCHAR(191) NULL,
    `domainName` VARCHAR(191) NULL,
    `port` INTEGER NULL,
    `usernameEncrypted` VARCHAR(191) NULL,
    `passwordEncrypted` VARCHAR(191) NULL,
    `apiKeyReference` VARCHAR(191) NULL,
    `rtspUrlEncrypted` VARCHAR(191) NULL,
    `deviceGatewayId` VARCHAR(191) NULL,
    `hikcentralResourceId` VARCHAR(191) NULL,
    `hikconnectDeviceId` VARCHAR(191) NULL,
    `simNumber` VARCHAR(191) NULL,
    `simProvider` VARCHAR(191) NULL,
    `installationDate` DATETIME(3) NULL,
    `installedBy` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `lastSeenAt` DATETIME(3) NULL,
    `lastGpsAt` DATETIME(3) NULL,
    `remarks` LONGTEXT NULL,
    `equipmentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HikvisionDevice_deviceSerialNumber_key`(`deviceSerialNumber`),
    UNIQUE INDEX `HikvisionDevice_imeiOrUniqueId_key`(`imeiOrUniqueId`),
    UNIQUE INDEX `HikvisionDevice_equipmentId_key`(`equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FleetEvent` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NULL,
    `driverId` VARCHAR(191) NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `eventCategory` VARCHAR(191) NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'LOW',
    `eventTime` DATETIME(3) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `speedKph` DOUBLE NULL,
    `heading` DOUBLE NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `acknowledgedById` VARCHAR(191) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `rawPayloadJson` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoEvidence` (
    `id` VARCHAR(191) NOT NULL,
    `fleetEventId` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NULL,
    `channelNo` INTEGER NULL,
    `evidenceType` VARCHAR(191) NOT NULL DEFAULT 'SNAPSHOT',
    `fileUrl` VARCHAR(191) NULL,
    `playbackStartTime` DATETIME(3) NULL,
    `playbackEndTime` DATETIME(3) NULL,
    `thumbnailUrl` VARCHAR(191) NULL,
    `storageLocation` VARCHAR(191) NULL,
    `retentionUntil` DATETIME(3) NULL,
    `checksum` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FleetTrip` (
    `id` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NULL,
    `deviceId` VARCHAR(191) NULL,
    `tripStartTime` DATETIME(3) NOT NULL,
    `tripEndTime` DATETIME(3) NULL,
    `startLatitude` DOUBLE NULL,
    `startLongitude` DOUBLE NULL,
    `endLatitude` DOUBLE NULL,
    `endLongitude` DOUBLE NULL,
    `startAddress` LONGTEXT NULL,
    `endAddress` LONGTEXT NULL,
    `totalDistanceKm` DOUBLE NULL,
    `maxSpeedKph` DOUBLE NULL,
    `averageSpeedKph` DOUBLE NULL,
    `idleDurationMinutes` DOUBLE NULL,
    `tripStatus` VARCHAR(191) NOT NULL DEFAULT 'ONGOING',
    `projectId` VARCHAR(191) NULL,
    `purpose` LONGTEXT NULL,
    `remarks` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `subcontractPackageId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Geofence` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'PROJECT_SITE',
    `polygonOrRadiusJson` LONGTEXT NOT NULL,
    `address` LONGTEXT NULL,
    `projectId` VARCHAR(191) NULL,
    `alertOnEntry` BOOLEAN NOT NULL DEFAULT true,
    `alertOnExit` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `subcontractPackageId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FleetAIReview` (
    `id` VARCHAR(191) NOT NULL,
    `fleetEventId` VARCHAR(191) NOT NULL,
    `equipmentId` VARCHAR(191) NULL,
    `driverId` VARCHAR(191) NULL,
    `aiSummary` LONGTEXT NOT NULL,
    `aiRiskScore` DOUBLE NULL,
    `aiRecommendation` VARCHAR(191) NULL,
    `aiValidationStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reviewedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExecutiveDashboardPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `defaultView` VARCHAR(191) NOT NULL DEFAULT 'HOME',
    `defaultDateRange` VARCHAR(191) NOT NULL DEFAULT 'THIS_MONTH',
    `defaultProjectFilter` VARCHAR(191) NULL,
    `visibleWidgets` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ExecutiveDashboardPreference_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExecutiveAlertLog` (
    `id` VARCHAR(191) NOT NULL,
    `alertType` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `severity` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `sourceModule` VARCHAR(191) NULL,
    `sourceTransactionId` VARCHAR(191) NULL,
    `financialImpact` DOUBLE NULL,
    `operationalImpact` VARCHAR(191) NULL,
    `recommendedAction` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `assignedTo` VARCHAR(191) NULL,
    `dueDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExecutiveAccessLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `moduleAccessed` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `transactionId` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `deviceInfo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIExecutiveQuery` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userRole` VARCHAR(191) NOT NULL,
    `queryText` LONGTEXT NOT NULL,
    `scopeType` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `dateRangeStart` DATETIME(3) NULL,
    `dateRangeEnd` DATETIME(3) NULL,
    `aiResponse` LONGTEXT NOT NULL,
    `sourceReferences` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIGeneratedReport` (
    `id` VARCHAR(191) NOT NULL,
    `reportCode` VARCHAR(191) NOT NULL,
    `reportType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `dateRangeStart` DATETIME(3) NULL,
    `dateRangeEnd` DATETIME(3) NULL,
    `generatedById` VARCHAR(191) NOT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `aiSummary` LONGTEXT NULL,
    `aiFindings` LONGTEXT NULL,
    `aiRecommendations` LONGTEXT NULL,
    `sourceReferences` VARCHAR(191) NULL,
    `filePdfUrl` VARCHAR(191) NULL,
    `fileExcelUrl` VARCHAR(191) NULL,
    `fileDocxUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AIGeneratedReport_reportCode_key`(`reportCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIGeneratedReportVersion` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `editedById` VARCHAR(191) NOT NULL,
    `aiSummary` LONGTEXT NULL,
    `aiFindings` LONGTEXT NULL,
    `aiRecommendations` LONGTEXT NULL,
    `managementRemarks` VARCHAR(191) NULL,
    `sourceReferences` VARCHAR(191) NULL,
    `filePdfUrl` VARCHAR(191) NULL,
    `fileExcelUrl` VARCHAR(191) NULL,
    `fileDocxUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationSettings` (
    `id` VARCHAR(191) NOT NULL,
    `boqWeight` DOUBLE NOT NULL DEFAULT 20,
    `plansWeight` DOUBLE NOT NULL DEFAULT 15,
    `photoWeight` DOUBLE NOT NULL DEFAULT 15,
    `droneWeight` DOUBLE NOT NULL DEFAULT 15,
    `cctvWeight` DOUBLE NOT NULL DEFAULT 10,
    `satelliteWeight` DOUBLE NOT NULL DEFAULT 10,
    `deliveryWeight` DOUBLE NOT NULL DEFAULT 5,
    `scheduleWeight` DOUBLE NOT NULL DEFAULT 5,
    `approvalWeight` DOUBLE NOT NULL DEFAULT 5,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIValidationRecord` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `moduleSource` VARCHAR(191) NOT NULL,
    `relatedDocumentId` VARCHAR(191) NULL,
    `relatedBillingId` VARCHAR(191) NULL,
    `relatedBoqItemId` VARCHAR(191) NULL,
    `evidenceType` VARCHAR(191) NOT NULL,
    `evidenceFileUrl` VARCHAR(191) NULL,
    `aiFindings` LONGTEXT NOT NULL,
    `aiConfidenceScore` DOUBLE NOT NULL,
    `riskLevel` VARCHAR(191) NOT NULL,
    `recommendation` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `approvalAction` VARCHAR(191) NULL,
    `overrideReason` LONGTEXT NULL,
    `auditTrailRef` VARCHAR(191) NULL,
    `findingsData` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectValidationScore` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `reportedProgress` DOUBLE NOT NULL DEFAULT 0,
    `aiValidatedProgress` DOUBLE NOT NULL DEFAULT 0,
    `billingProgress` DOUBLE NOT NULL DEFAULT 0,
    `paidProgress` DOUBLE NOT NULL DEFAULT 0,
    `scheduleVariance` DOUBLE NOT NULL DEFAULT 0,
    `costVariance` DOUBLE NOT NULL DEFAULT 0,
    `validationConfidenceScore` DOUBLE NOT NULL DEFAULT 0,
    `riskLevel` VARCHAR(191) NOT NULL DEFAULT 'GRAY',
    `evidenceCompletenessScore` DOUBLE NOT NULL DEFAULT 0,
    `executiveRecommendation` VARCHAR(191) NULL,
    `requiredAction` VARCHAR(191) NULL,
    `latestValidationDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectValidationScore_projectId_key`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationEvidencePack` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `relatedBillingId` VARCHAR(191) NULL,
    `relatedAccomplishId` VARCHAR(191) NULL,
    `executiveSummary` LONGTEXT NULL,
    `claimedAccomplish` DOUBLE NULL,
    `aiValidatedAccomplish` DOUBLE NULL,
    `billingAmount` DOUBLE NULL,
    `riskFindings` LONGTEXT NULL,
    `finalRecommendation` VARCHAR(191) NULL,
    `filePdfUrl` VARCHAR(191) NULL,
    `fileExcelUrl` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'GENERATED',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userRole` VARCHAR(191) NOT NULL,
    `actionType` VARCHAR(191) NOT NULL,
    `validationRecordId` VARCHAR(191) NULL,
    `aiScoreAtTime` DOUBLE NULL,
    `aiFindingsAtTime` VARCHAR(191) NULL,
    `manualOverrideReason` VARCHAR(191) NULL,
    `approvalRemarks` VARCHAR(191) NULL,
    `evidenceVersion` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `deviceInfo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectCostLedger` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `costDate` DATETIME(3) NOT NULL,
    `costCategory` VARCHAR(191) NOT NULL,
    `costType` VARCHAR(191) NOT NULL DEFAULT 'DIRECT',
    `directIndirect` VARCHAR(191) NOT NULL DEFAULT 'DIRECT',
    `supplierName` VARCHAR(191) NULL,
    `subcontractorName` VARCHAR(191) NULL,
    `workerName` VARCHAR(191) NULL,
    `referenceDocumentType` VARCHAR(191) NULL,
    `referenceDocumentNo` VARCHAR(191) NULL,
    `quantity` DOUBLE NOT NULL DEFAULT 0,
    `unitCost` DOUBLE NOT NULL DEFAULT 0,
    `grossAmount` DOUBLE NOT NULL DEFAULT 0,
    `vatAmount` DOUBLE NOT NULL DEFAULT 0,
    `withholdingTaxAmount` DOUBLE NOT NULL DEFAULT 0,
    `netAmount` DOUBLE NOT NULL DEFAULT 0,
    `paidAmount` DOUBLE NOT NULL DEFAULT 0,
    `unpaidBalance` DOUBLE NOT NULL DEFAULT 0,
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'UNPAID',
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'APPROVED',
    `encodedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,
    `awardedBoqItemId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommitmentLedger` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `commitmentType` VARCHAR(191) NOT NULL,
    `supplierName` VARCHAR(191) NULL,
    `subcontractorName` VARCHAR(191) NULL,
    `workerName` VARCHAR(191) NULL,
    `approvedAmount` DOUBLE NOT NULL DEFAULT 0,
    `deliveredAmount` DOUBLE NOT NULL DEFAULT 0,
    `billedAmount` DOUBLE NOT NULL DEFAULT 0,
    `paidAmount` DOUBLE NOT NULL DEFAULT 0,
    `remainingCommitment` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,
    `awardedBoqItemId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubcontractorVariationOrder` (
    `id` VARCHAR(191) NOT NULL,
    `svoNumber` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `originalSubcontractId` VARCHAR(191) NULL,
    `originalBenchmarkQty` DOUBLE NOT NULL DEFAULT 0,
    `originalBenchmarkAmt` DOUBLE NOT NULL DEFAULT 0,
    `originalSubcontractQty` DOUBLE NOT NULL DEFAULT 0,
    `originalSubcontractAmt` DOUBLE NOT NULL DEFAULT 0,
    `proposedAdditionalQty` DOUBLE NOT NULL DEFAULT 0,
    `proposedAdditionalAmt` DOUBLE NOT NULL DEFAULT 0,
    `revisedSubcontractQty` DOUBLE NOT NULL DEFAULT 0,
    `revisedSubcontractAmt` DOUBLE NOT NULL DEFAULT 0,
    `reason` LONGTEXT NULL,
    `costImpact` VARCHAR(191) NULL,
    `scheduleImpact` VARCHAR(191) NULL,
    `profitabilityImpact` VARCHAR(191) NULL,
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `preparedById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,
    `awardedBoqItemId` VARCHAR(191) NULL,

    UNIQUE INDEX `SubcontractorVariationOrder_svoNumber_key`(`svoNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientVariationOrder` (
    `id` VARCHAR(191) NOT NULL,
    `cvoNumber` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `description` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `awardedBoqItemId` VARCHAR(191) NULL,

    UNIQUE INDEX `ClientVariationOrder_cvoNumber_key`(`cvoNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValueEngineeringRecord` (
    `id` VARCHAR(191) NOT NULL,
    `veNumber` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `currentCost` DOUBLE NOT NULL DEFAULT 0,
    `proposedCost` DOUBLE NOT NULL DEFAULT 0,
    `estimatedSavings` DOUBLE NOT NULL DEFAULT 0,
    `actualSavingsAchieved` DOUBLE NOT NULL DEFAULT 0,
    `qualityImpact` VARCHAR(191) NULL,
    `safetyImpact` VARCHAR(191) NULL,
    `contractImpact` VARCHAR(191) NULL,
    `requiredApproval` VARCHAR(191) NULL,
    `aiRecommendation` VARCHAR(191) NULL,
    `humanReviewStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `finalApprovalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `consolidatedBoqItemId` VARCHAR(191) NULL,
    `awardedBoqItemId` VARCHAR(191) NULL,

    UNIQUE INDEX `ValueEngineeringRecord_veNumber_key`(`veNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `baselineStartDate` DATETIME(3) NULL,
    `baselineFinishDate` DATETIME(3) NULL,
    `currentStartDate` DATETIME(3) NULL,
    `currentFinishDate` DATETIME(3) NULL,
    `actualStartDate` DATETIME(3) NULL,
    `actualFinishDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `calendarDays` INTEGER NOT NULL DEFAULT 0,
    `workingDays` INTEGER NOT NULL DEFAULT 0,
    `holidays` VARCHAR(191) NULL,
    `workDaysConfig` LONGTEXT NULL,
    `lockedBOQVersionId` VARCHAR(191) NULL,
    `lockedBOQChecksum` VARCHAR(191) NULL,
    `baselineRevision` INTEGER NOT NULL DEFAULT 0,
    `awardedContractAmount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `scheduledAmount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `differenceAmount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `generatedBy` VARCHAR(191) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `generatedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `generationRulesVersion` VARCHAR(191) NULL,
    `validationMetrics` LONGTEXT NULL,
    `feasibilityFlags` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `workflowStatus` ENUM('AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'READY_FOR_REVIEW', 'UNDER_TECHNICAL_REVIEW', 'TECHNICAL_REVISIONS_REQUIRED', 'TECHNICALLY_APPROVED', 'UNDER_CONTRACT_REVIEW', 'CONTRACT_REVISIONS_REQUIRED', 'CONTRACT_APPROVED', 'UNDER_FINANCE_REVIEW', 'FINANCE_REVISIONS_REQUIRED', 'FINANCE_APPROVED', 'PENDING_BASELINE_APPROVAL', 'ACTIVE_BASELINE', 'SUPERSEDED_BASELINE', 'ARCHIVED_BASELINE', 'REJECTED') NOT NULL DEFAULT 'AI_GENERATED_DRAFT',
    `reviewRound` INTEGER NOT NULL DEFAULT 1,
    `revisionNumber` INTEGER NULL,
    `revisionCode` VARCHAR(191) NULL,
    `parentScheduleId` VARCHAR(191) NULL,
    `previousBaselineId` VARCHAR(191) NULL,
    `projectStartDate` DATETIME(3) NULL,
    `projectCompletionDate` DATETIME(3) NULL,
    `openAiModelIdentifier` VARCHAR(191) NULL,
    `promptVersion` VARCHAR(191) NULL,
    `schedulingEngineVersion` VARCHAR(191) NULL,
    `validationRulesVersion` VARCHAR(191) NULL,
    `generatedById` VARCHAR(191) NULL,
    `activatedById` VARCHAR(191) NULL,
    `activatedAt` DATETIME(3) NULL,
    `baselineCode` VARCHAR(191) NULL,
    `activationSnapshotHash` VARCHAR(191) NULL,
    `rowVersion` INTEGER NOT NULL DEFAULT 1,

    INDEX `ProjectSchedule_projectId_workflowStatus_idx`(`projectId`, `workflowStatus`),
    INDEX `ProjectSchedule_parentScheduleId_idx`(`parentScheduleId`),
    INDEX `ProjectSchedule_previousBaselineId_idx`(`previousBaselineId`),
    INDEX `ProjectSchedule_lockedBOQVersionId_idx`(`lockedBOQVersionId`),
    UNIQUE INDEX `ProjectSchedule_id_projectId_key`(`id`, `projectId`),
    UNIQUE INDEX `ProjectSchedule_projectId_revisionNumber_key`(`projectId`, `revisionNumber`),
    UNIQUE INDEX `ProjectSchedule_projectId_revisionCode_key`(`projectId`, `revisionCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleWBS` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `level` INTEGER NOT NULL,
    `orderIndex` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleActivity` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `wbsId` VARCHAR(191) NULL,
    `activityCode` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `discipline` VARCHAR(191) NULL,
    `plannedStartDate` DATETIME(3) NULL,
    `plannedFinishDate` DATETIME(3) NULL,
    `plannedDuration` INTEGER NOT NULL DEFAULT 0,
    `actualStartDate` DATETIME(3) NULL,
    `actualFinishDate` DATETIME(3) NULL,
    `actualDuration` INTEGER NULL,
    `baselineStartDate` DATETIME(3) NULL,
    `baselineFinishDate` DATETIME(3) NULL,
    `plannedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `actualQuantity` DOUBLE NOT NULL DEFAULT 0,
    `unit` VARCHAR(191) NULL,
    `plannedWeight` DOUBLE NOT NULL DEFAULT 0,
    `actualProgressPercent` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'NOT_STARTED',
    `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
    `criticalPath` BOOLEAN NOT NULL DEFAULT false,
    `totalFloat` INTEGER NOT NULL DEFAULT 0,
    `freeFloat` INTEGER NOT NULL DEFAULT 0,
    `activityType` VARCHAR(191) NULL,
    `systemOrArea` VARCHAR(191) NULL,
    `predecessorData` VARCHAR(191) NULL,
    `allocatedAmount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `classificationConfidence` DOUBLE NULL,
    `aiRationale` VARCHAR(191) NULL,
    `durationMethod` VARCHAR(191) NULL,
    `productivityAssumption` DOUBLE NULL,
    `crewCountAssumption` INTEGER NULL,
    `workFrontAssumption` INTEGER NULL,
    `assignedToId` VARCHAR(191) NULL,
    `subcontractorId` VARCHAR(191) NULL,
    `jobOrderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleDependency` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `predecessorId` VARCHAR(191) NOT NULL,
    `successorId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'FS',
    `lagDays` INTEGER NOT NULL DEFAULT 0,
    `remarks` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleMilestone` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `targetDate` DATETIME(3) NOT NULL,
    `actualDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleBOQAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `awardedBoqItemId` VARCHAR(191) NOT NULL,
    `mappedQuantity` DOUBLE NOT NULL DEFAULT 0,
    `mappedWeight` DOUBLE NOT NULL DEFAULT 0,
    `scheduleId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `phaseId` VARCHAR(191) NULL,
    `boqLineId` VARCHAR(191) NULL,
    `allocationMode` VARCHAR(191) NULL,
    `awardedQuantity` DECIMAL(65, 30) NULL,
    `allocatedQuantity` DECIMAL(65, 30) NULL,
    `allocatedPercentage` DECIMAL(65, 30) NULL,
    `awardedAmount` DECIMAL(65, 30) NULL,
    `allocatedAmount` DECIMAL(65, 30) NULL,
    `allocationReason` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchedulePOWMapping` (
    `id` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `programOfWorksId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleProgressUpdate` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `updateDate` DATETIME(3) NOT NULL,
    `progressPercent` DOUBLE NOT NULL,
    `actualQuantity` DOUBLE NOT NULL DEFAULT 0,
    `remarks` LONGTEXT NULL,
    `reportedById` VARCHAR(191) NULL,
    `accomplishmentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleDelayRecord` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `delayStartDate` DATETIME(3) NOT NULL,
    `delayEndDate` DATETIME(3) NULL,
    `delayDays` INTEGER NOT NULL DEFAULT 0,
    `category` VARCHAR(191) NOT NULL DEFAULT 'UNKNOWN',
    `cause` VARCHAR(191) NOT NULL,
    `impactToCriticalPath` BOOLEAN NOT NULL DEFAULT false,
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reportedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleRecoveryPlan` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `targetActivityId` VARCHAR(191) NULL,
    `delayCause` VARCHAR(191) NOT NULL,
    `requiredAction` VARCHAR(191) NOT NULL,
    `targetRecoveryDate` DATETIME(3) NULL,
    `estimatedRecoveredDays` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approvalStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleRevisionRequest` (
    `id` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `reason` LONGTEXT NOT NULL,
    `delayImpact` INTEGER NOT NULL DEFAULT 0,
    `costImpact` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `requestedById` VARCHAR(191) NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiKnowledgeSource` (
    `id` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `moduleName` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `filePath` VARCHAR(191) NULL,
    `storageUrl` VARCHAR(191) NULL,
    `originalFilename` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `visibilityScope` VARCHAR(191) NOT NULL DEFAULT 'GLOBAL',
    `allowedRoles` VARCHAR(191) NULL,
    `allowedProjects` VARCHAR(191) NULL,
    `confidentialityLevel` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC_INTERNAL',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `indexedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiKnowledgeChunk` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `chunkIndex` INTEGER NOT NULL,
    `chunkText` VARCHAR(191) NOT NULL,
    `chunkSummary` LONGTEXT NULL,
    `moduleName` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `allowedRoles` VARCHAR(191) NULL,
    `visibilityScope` VARCHAR(191) NOT NULL DEFAULT 'GLOBAL',
    `confidentialityLevel` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC_INTERNAL',
    `vectorEmbedding` VARCHAR(191) NOT NULL,
    `tokenCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiChatSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `moduleName` VARCHAR(191) NULL,
    `sessionTitle` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `message` LONGTEXT NOT NULL,
    `authorizedContextUsed` LONGTEXT NULL,
    `citedSources` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiAccessAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userRole` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `question` VARCHAR(191) NOT NULL,
    `answerStatus` VARCHAR(191) NOT NULL DEFAULT 'SUCCESS',
    `denialReason` LONGTEXT NULL,
    `sourcesRetrieved` INTEGER NOT NULL DEFAULT 0,
    `sourcesDenied` INTEGER NOT NULL DEFAULT 0,
    `tokensUsed` INTEGER NOT NULL DEFAULT 0,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiIndexingJob` (
    `id` VARCHAR(191) NOT NULL,
    `jobType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `sourceCount` INTEGER NOT NULL DEFAULT 0,
    `chunkCount` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` LONGTEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatbotFeedback` (
    `id` VARCHAR(191) NOT NULL,
    `auditLogId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `feedbackType` VARCHAR(191) NOT NULL,
    `correctionNote` VARCHAR(191) NULL,
    `adminAction` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiRagKeywordRegistry` (
    `id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `normalizedKeyword` VARCHAR(191) NOT NULL,
    `keywordType` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NULL,
    `relatedModule` VARCHAR(191) NULL,
    `databaseTable` VARCHAR(191) NULL,
    `databaseField` VARCHAR(191) NULL,
    `businessMeaning` VARCHAR(191) NULL,
    `synonyms` VARCHAR(191) NULL,
    `aliases` VARCHAR(191) NULL,
    `abbreviations` VARCHAR(191) NULL,
    `relatedTerms` VARCHAR(191) NULL,
    `exampleUserQuestions` VARCHAR(191) NULL,
    `requiredRoleAccess` VARCHAR(191) NULL,
    `requiredModulePermission` LONGTEXT NULL,
    `confidentialityLevel` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC',
    `projectScoped` BOOLEAN NOT NULL DEFAULT false,
    `documentScoped` BOOLEAN NOT NULL DEFAULT false,
    `sourceType` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `sourcePriority` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `mergedIntoId` VARCHAR(191) NULL,
    `mergedAt` DATETIME(3) NULL,
    `cleanupNotes` LONGTEXT NULL,
    `sourceOrigin` VARCHAR(191) NULL,
    `generatedBy` VARCHAR(191) NULL,
    `adminApproved` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiRagKeywordRegistry_normalizedKeyword_idx`(`normalizedKeyword`),
    INDEX `AiRagKeywordRegistry_keywordType_idx`(`keywordType`),
    UNIQUE INDEX `AiRagKeywordRegistry_normalizedKeyword_keywordType_key`(`normalizedKeyword`, `keywordType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiRagSchemaMap` (
    `id` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NOT NULL,
    `tableName` VARCHAR(191) NOT NULL,
    `fieldName` VARCHAR(191) NOT NULL,
    `fieldAlias` VARCHAR(191) NULL,
    `fieldDescription` LONGTEXT NULL,
    `dataType` VARCHAR(191) NOT NULL,
    `relationshipTable` VARCHAR(191) NULL,
    `relationshipField` VARCHAR(191) NULL,
    `searchable` BOOLEAN NOT NULL DEFAULT false,
    `filterable` BOOLEAN NOT NULL DEFAULT false,
    `comparable` BOOLEAN NOT NULL DEFAULT false,
    `aggregatable` BOOLEAN NOT NULL DEFAULT false,
    `confidential` BOOLEAN NOT NULL DEFAULT false,
    `requiredAccessRole` VARCHAR(191) NULL,
    `requiredPermission` LONGTEXT NULL,
    `projectScoped` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AiRagSchemaMap_tableName_fieldName_key`(`tableName`, `fieldName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiRagEmbedding` (
    `id` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL,
    `sourceModule` VARCHAR(191) NULL,
    `sourceRecordId` VARCHAR(191) NULL,
    `sourceTitle` VARCHAR(191) NOT NULL,
    `sourceTextChunk` LONGTEXT NOT NULL,
    `embeddingVector` VARCHAR(191) NOT NULL,
    `metadataJson` LONGTEXT NULL,
    `accessLevel` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC',
    `projectId` VARCHAR(191) NULL,
    `modulePermissionRequired` LONGTEXT NULL,
    `confidentialityLevel` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiRagEmbedding_sourceType_idx`(`sourceType`),
    INDEX `AiRagEmbedding_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiKnowledgeMap` (
    `id` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL,
    `sourceName` VARCHAR(191) NOT NULL,
    `moduleName` VARCHAR(191) NULL,
    `tableName` VARCHAR(191) NULL,
    `fieldName` VARCHAR(191) NULL,
    `fieldLabel` VARCHAR(191) NULL,
    `normalizedName` VARCHAR(191) NOT NULL,
    `businessMeaning` VARCHAR(191) NULL,
    `detectedKeywords` VARCHAR(191) NULL,
    `generatedAliases` VARCHAR(191) NULL,
    `generatedSynonyms` VARCHAR(191) NULL,
    `abbreviations` VARCHAR(191) NULL,
    `relatedTerms` VARCHAR(191) NULL,
    `relatedModules` VARCHAR(191) NULL,
    `relatedTables` VARCHAR(191) NULL,
    `relatedFields` VARCHAR(191) NULL,
    `relationshipType` VARCHAR(191) NULL,
    `sampleQuestions` VARCHAR(191) NULL,
    `accessLevel` VARCHAR(191) NOT NULL DEFAULT 'PUBLIC',
    `requiredRole` VARCHAR(191) NULL,
    `requiredPermission` LONGTEXT NULL,
    `projectScoped` BOOLEAN NOT NULL DEFAULT false,
    `confidential` BOOLEAN NOT NULL DEFAULT false,
    `searchable` BOOLEAN NOT NULL DEFAULT false,
    `filterable` BOOLEAN NOT NULL DEFAULT false,
    `comparable` BOOLEAN NOT NULL DEFAULT false,
    `aggregatable` BOOLEAN NOT NULL DEFAULT false,
    `sourcePriority` INTEGER NOT NULL DEFAULT 1,
    `lastScannedAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiComparisonMap` (
    `id` VARCHAR(191) NOT NULL,
    `comparisonName` VARCHAR(191) NOT NULL,
    `userQuestionPattern` VARCHAR(191) NULL,
    `primaryModule` VARCHAR(191) NOT NULL,
    `primaryTable` VARCHAR(191) NOT NULL,
    `primaryField` VARCHAR(191) NOT NULL,
    `relatedModules` VARCHAR(191) NULL,
    `relatedTables` VARCHAR(191) NULL,
    `relatedFields` VARCHAR(191) NULL,
    `comparisonLogic` VARCHAR(191) NOT NULL,
    `calculationFormula` LONGTEXT NULL,
    `requiredPermission` LONGTEXT NULL,
    `projectScoped` BOOLEAN NOT NULL DEFAULT true,
    `confidential` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiUiActionRegistry` (
    `id` VARCHAR(191) NOT NULL,
    `uiLabel` VARCHAR(191) NOT NULL,
    `normalizedLabel` VARCHAR(191) NOT NULL,
    `componentOrPage` VARCHAR(191) NULL,
    `actionType` VARCHAR(191) NULL,
    `aliases` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AiUiActionRegistry_normalizedLabel_actionType_key`(`normalizedLabel`, `actionType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiSystemEnumRegistry` (
    `id` VARCHAR(191) NOT NULL,
    `enumValue` VARCHAR(191) NOT NULL,
    `normalizedValue` VARCHAR(191) NOT NULL,
    `enumCategory` VARCHAR(191) NULL,
    `businessMeaning` VARCHAR(191) NULL,
    `aliases` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AiSystemEnumRegistry_normalizedValue_enumCategory_key`(`normalizedValue`, `enumCategory`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiRagNoiseExclusion` (
    `id` VARCHAR(191) NOT NULL,
    `noiseTerm` VARCHAR(191) NOT NULL,
    `normalizedTerm` VARCHAR(191) NOT NULL,
    `reason` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AiRagNoiseExclusion_normalizedTerm_key`(`normalizedTerm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiRegistryCleanupReport` (
    `id` VARCHAR(191) NOT NULL,
    `runBy` VARCHAR(191) NOT NULL,
    `runAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `totalRowsScanned` INTEGER NOT NULL,
    `duplicateGroupsFound` INTEGER NOT NULL,
    `rowsMerged` INTEGER NOT NULL,
    `aliasesMerged` INTEGER NOT NULL,
    `schemaFieldsMoved` INTEGER NOT NULL,
    `uiLabelsMoved` INTEGER NOT NULL,
    `noiseTermsExcluded` INTEGER NOT NULL,
    `acronymsFixed` INTEGER NOT NULL,
    `activeRowsRemaining` INTEGER NOT NULL,
    `rollbackSupported` BOOLEAN NOT NULL DEFAULT true,
    `rolledBackAt` DATETIME(3) NULL,
    `rolledBackBy` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityEvent` (
    `id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `severity` VARCHAR(191) NOT NULL,
    `riskScore` DOUBLE NULL,
    `category` VARCHAR(191) NOT NULL,
    `threatType` VARCHAR(191) NOT NULL,
    `sourceIp` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `isp` VARCHAR(191) NULL,
    `asn` VARCHAR(191) NULL,
    `organization` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NULL,
    `userRole` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `targetProjectId` VARCHAR(191) NULL,
    `module` VARCHAR(191) NULL,
    `endpoint` VARCHAR(191) NULL,
    `method` VARCHAR(191) NULL,
    `actionAttempted` VARCHAR(191) NULL,
    `resourceType` VARCHAR(191) NULL,
    `resourceId` VARCHAR(191) NULL,
    `payloadSummary` LONGTEXT NULL,
    `fieldsAttempted` VARCHAR(191) NULL,
    `rbacResult` LONGTEXT NULL,
    `pbacResult` LONGTEXT NULL,
    `dataClassification` VARCHAR(191) NULL,
    `threatDetected` VARCHAR(191) NULL,
    `systemResponse` LONGTEXT NULL,
    `result` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL,
    `dataExposure` VARCHAR(191) NULL,
    `adminActionRequired` VARCHAR(191) NULL,
    `reviewed` BOOLEAN NOT NULL DEFAULT false,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `incidentId` VARCHAR(191) NULL,
    `simulated` BOOLEAN NOT NULL DEFAULT false,
    `environment` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NULL,
    `message` LONGTEXT NULL,
    `blocked` BOOLEAN NOT NULL DEFAULT false,
    `simulationRunId` VARCHAR(191) NULL,
    `expectedResponse` LONGTEXT NULL,
    `actualResponse` LONGTEXT NULL,
    `simulationPassed` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityIncident` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `assignedTo` VARCHAR(191) NULL,
    `affectedUserId` VARCHAR(191) NULL,
    `affectedProjectId` VARCHAR(191) NULL,
    `affectedModule` VARCHAR(191) NULL,
    `sourceIp` VARCHAR(191) NULL,
    `countermeasure` VARCHAR(191) NULL,
    `result` LONGTEXT NULL,
    `dataExposure` VARCHAR(191) NULL,
    `relatedEventIds` VARCHAR(191) NULL,
    `timelineJson` LONGTEXT NULL,
    `evidenceJson` LONGTEXT NULL,
    `linkedSimulationRunId` VARCHAR(191) NULL,
    `rootCause` VARCHAR(191) NULL,
    `resolutionNotes` LONGTEXT NULL,
    `adminNotes` LONGTEXT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecurityRule` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `severity` VARCHAR(191) NOT NULL,
    `condition` VARCHAR(191) NOT NULL,
    `countermeasure` VARCHAR(191) NOT NULL,
    `notifyAdmins` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSessionSecurityLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sourceIp` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `device` VARCHAR(191) NULL,
    `approximateLocation` LONGTEXT NULL,
    `loginAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revokedBy` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `riskScore` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIQuerySecurityLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NULL,
    `projectScope` VARCHAR(191) NULL,
    `query` LONGTEXT NOT NULL,
    `normalizedQuery` LONGTEXT NULL,
    `detectedThreat` VARCHAR(191) NULL,
    `blocked` BOOLEAN NOT NULL DEFAULT false,
    `retrievedDocumentIds` LONGTEXT NULL,
    `blockedDocumentIds` LONGTEXT NULL,
    `dataClassificationUsed` VARCHAR(191) NULL,
    `responseStatus` VARCHAR(191) NULL,
    `tokenUsage` INTEGER NULL,
    `costEstimate` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FileSecurityLog` (
    `id` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `module` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NULL,
    `size` INTEGER NULL,
    `scanStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `threatDetected` VARCHAR(191) NULL,
    `countermeasure` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ThreatIp` (
    `id` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `isp` VARCHAR(191) NULL,
    `asn` VARCHAR(191) NULL,
    `organization` VARCHAR(191) NULL,
    `firstSeen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeen` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `attemptCount` INTEGER NOT NULL DEFAULT 0,
    `severity` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'NEW',
    `notes` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ThreatIp_ipAddress_key`(`ipAddress`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CountermeasureLog` (
    `id` VARCHAR(191) NOT NULL,
    `securityEventId` VARCHAR(191) NULL,
    `countermeasureType` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NOT NULL,
    `result` LONGTEXT NULL,
    `responseTimeMs` INTEGER NULL,
    `expectedResult` LONGTEXT NULL,
    `actualResult` LONGTEXT NULL,
    `passed` BOOLEAN NULL,
    `performedBySystem` BOOLEAN NOT NULL DEFAULT true,
    `performedByUserId` VARCHAR(191) NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SensitiveExportLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userEmail` VARCHAR(191) NULL,
    `role` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `module` VARCHAR(191) NOT NULL,
    `exportType` VARCHAR(191) NOT NULL,
    `recordCount` INTEGER NULL,
    `dataClassification` VARCHAR(191) NULL,
    `sourceIp` VARCHAR(191) NULL,
    `approved` BOOLEAN NOT NULL DEFAULT true,
    `blocked` BOOLEAN NOT NULL DEFAULT false,
    `reason` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecuritySimulationScenario` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `targetModule` VARCHAR(191) NOT NULL,
    `targetRoute` VARCHAR(191) NULL,
    `simulatedRole` VARCHAR(191) NULL,
    `simulatedSourceIp` VARCHAR(191) NULL,
    `simulatedCountry` VARCHAR(191) NULL,
    `simulatedCity` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `mitreTechnique` VARCHAR(191) NULL,
    `owaspCategory` VARCHAR(191) NULL,
    `expectedDetection` VARCHAR(191) NULL,
    `expectedCountermeasure` VARCHAR(191) NULL,
    `passFailCriteria` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecuritySimulationCampaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `scenarioSequenceJson` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecuritySimulationRun` (
    `id` VARCHAR(191) NOT NULL,
    `scenarioId` VARCHAR(191) NULL,
    `campaignId` VARCHAR(191) NULL,
    `runMode` VARCHAR(191) NOT NULL,
    `environment` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `initiatedBy` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `detectionScore` DOUBLE NULL,
    `responseScore` DOUBLE NULL,
    `evidenceScore` DOUBLE NULL,
    `finalScore` DOUBLE NULL,
    `overallResult` LONGTEXT NULL,
    `notes` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecuritySimulationArchive` (
    `id` VARCHAR(191) NOT NULL,
    `archiveNumber` VARCHAR(191) NOT NULL,
    `simulationRunId` VARCHAR(191) NULL,
    `campaignId` VARCHAR(191) NULL,
    `scenarioName` VARCHAR(191) NULL,
    `runMode` VARCHAR(191) NULL,
    `environment` VARCHAR(191) NULL,
    `initiatedBy` VARCHAR(191) NULL,
    `clearedBy` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `clearedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `totalEventsArchived` INTEGER NULL,
    `totalIncidentsArchived` INTEGER NULL,
    `totalCountermeasuresArchived` INTEGER NULL,
    `detectionScore` DOUBLE NULL,
    `responseScore` DOUBLE NULL,
    `evidenceScore` DOUBLE NULL,
    `finalScore` DOUBLE NULL,
    `overallResult` LONGTEXT NULL,
    `archiveJson` LONGTEXT NULL,
    `exportedPdfUrl` VARCHAR(191) NULL,
    `exportedExcelUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UploadedWorkbookFile` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `templateCode` VARCHAR(191) NULL,
    `templateName` VARCHAR(191) NULL,
    `templateVersion` VARCHAR(191) NULL,
    `documentType` VARCHAR(191) NULL,
    `originalFilename` VARCHAR(191) NOT NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `storagePath` VARCHAR(191) NOT NULL,
    `preservedOriginalUrl` VARCHAR(191) NULL,
    `latestPreservedVersionId` VARCHAR(191) NULL,
    `uploadedBy` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recognizedTemplate` VARCHAR(191) NULL,
    `validationStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `extractionStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `commitStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `onlyOfficeDocumentKey` VARCHAR(191) NULL,
    `metadataJson` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkbookVersion` (
    `id` VARCHAR(191) NOT NULL,
    `uploadedWorkbookFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `versionLabel` VARCHAR(191) NULL,
    `sourceType` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `fileHash` VARCHAR(191) NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remarks` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnlyOfficeSession` (
    `id` VARCHAR(191) NOT NULL,
    `uploadedWorkbookFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `workbookVersionId` VARCHAR(191) NULL,
    `documentKey` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'view',
    `userId` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NULL,
    `permissionsJson` LONGTEXT NULL,
    `configJson` LONGTEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `lastCallbackAt` DATETIME(3) NULL,

    UNIQUE INDEX `OnlyOfficeSession_documentKey_key`(`documentKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BOQExtractedSection` (
    `id` VARCHAR(191) NOT NULL,
    `uploadedWorkbookFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `sheetName` VARCHAR(191) NULL,
    `sourceRowNumber` INTEGER NULL,
    `sectionCode` VARCHAR(191) NULL,
    `sectionName` VARCHAR(191) NOT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BOQExtractedItem` (
    `id` VARCHAR(191) NOT NULL,
    `uploadedWorkbookFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NULL,
    `sheetName` VARCHAR(191) NULL,
    `sourceRowNumber` INTEGER NULL,
    `itemNumber` VARCHAR(191) NULL,
    `description` LONGTEXT NOT NULL,
    `unit` VARCHAR(191) NULL,
    `quantity` DOUBLE NULL,
    `materialUnitCost` DOUBLE NULL,
    `laborUnitCost` DOUBLE NULL,
    `equipmentUnitCost` DOUBLE NULL,
    `totalDirectCost` DOUBLE NULL,
    `ocm` DOUBLE NULL,
    `cp` DOUBLE NULL,
    `vat` DOUBLE NULL,
    `totalIndirectCost` DOUBLE NULL,
    `unitCost` DOUBLE NULL,
    `amount` DOUBLE NULL,
    `percentage` DOUBLE NULL,
    `formulaMapJson` LONGTEXT NULL,
    `validationStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `validationErrorsJson` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkbookFormulaValidation` (
    `id` VARCHAR(191) NOT NULL,
    `uploadedWorkbookFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `sheetName` VARCHAR(191) NULL,
    `cellAddress` VARCHAR(191) NOT NULL,
    `sourceRowNumber` INTEGER NULL,
    `expectedFormula` VARCHAR(191) NULL,
    `actualFormula` VARCHAR(191) NULL,
    `expectedValue` DOUBLE NULL,
    `actualValue` DOUBLE NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'INFO',
    `validationStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `message` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkbookTemplateValidation` (
    `id` VARCHAR(191) NOT NULL,
    `uploadedWorkbookFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `validationType` VARCHAR(191) NOT NULL,
    `validationKey` VARCHAR(191) NOT NULL,
    `expectedValue` VARCHAR(191) NULL,
    `actualValue` VARCHAR(191) NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'INFO',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `message` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectBOQVersion` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `sourceUploadedWorkbookFileId` VARCHAR(191) NULL,
    `versionNumber` INTEGER NOT NULL,
    `versionLabel` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `committedBy` VARCHAR(191) NULL,
    `committedAt` DATETIME(3) NULL,
    `approvedBy` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `totalDirectCost` DOUBLE NULL,
    `totalIndirectCost` DOUBLE NULL,
    `totalAmount` DOUBLE NULL,
    `remarks` LONGTEXT NULL,
    `checksum` VARCHAR(191) NULL,
    `checksumAlgorithm` VARCHAR(191) NULL,
    `checksumVersion` VARCHAR(191) NULL,
    `sourceProvenance` VARCHAR(191) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleGenerationAudit` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `previousScheduleId` VARCHAR(191) NULL,
    `newScheduleId` VARCHAR(191) NULL,
    `lockedBOQVersionId` VARCHAR(191) NULL,
    `lockedBOQChecksum` VARCHAR(191) NULL,
    `generationRequestId` VARCHAR(191) NULL,
    `modelIdentifier` VARCHAR(191) NULL,
    `promptVersion` VARCHAR(191) NULL,
    `schemaVersion` VARCHAR(191) NULL,
    `schedulingRulesVersion` VARCHAR(191) NULL,
    `reasoningSetting` VARCHAR(191) NULL,
    `requestTimestamp` DATETIME(3) NULL,
    `responseTimestamp` DATETIME(3) NULL,
    `tokenUsage` VARCHAR(191) NULL,
    `resultStatus` VARCHAR(191) NULL,
    `validationResults` LONGTEXT NULL,
    `correctionAttemptCount` INTEGER NOT NULL DEFAULT 0,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkbookExtractionAudit` (
    `id` VARCHAR(191) NOT NULL,
    `uploadedWorkbookFileId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SUCCESS',
    `message` LONGTEXT NULL,
    `detailsJson` LONGTEXT NULL,
    `performedBy` VARCHAR(191) NULL,
    `performedByRole` VARCHAR(191) NULL,
    `performedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIConfiguration` (
    `id` VARCHAR(191) NOT NULL,
    `primaryPlanningModel` VARCHAR(191) NOT NULL DEFAULT 'gpt-4o',
    `secondaryClassificationModel` VARCHAR(191) NOT NULL DEFAULT 'gpt-4o-mini',
    `fallbackModel` VARCHAR(191) NOT NULL DEFAULT 'gpt-3.5-turbo',
    `reasoningEffort` VARCHAR(191) NOT NULL DEFAULT 'high',
    `maxOutputTokens` INTEGER NOT NULL DEFAULT 4096,
    `timeoutMs` INTEGER NOT NULL DEFAULT 60000,
    `retryLimit` INTEGER NOT NULL DEFAULT 2,
    `promptVersion` VARCHAR(191) NOT NULL DEFAULT 'v1.0',
    `jsonSchemaVersion` VARCHAR(191) NOT NULL DEFAULT 'v1.0',
    `schedulingRulesVersion` VARCHAR(191) NOT NULL DEFAULT 'v1.0',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleApproval` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `reviewRound` INTEGER NOT NULL,
    `revisionCode` VARCHAR(191) NULL,
    `approvalStage` ENUM('TECHNICAL', 'CONTRACT', 'FINANCE', 'FINAL_ACTIVATION') NOT NULL,
    `decision` ENUM('APPROVE', 'RETURN_FOR_REVISION', 'REJECT', 'REQUEST_CLARIFICATION') NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `reviewerNameSnapshot` VARCHAR(191) NOT NULL,
    `reviewerRoleSnapshot` VARCHAR(191) NOT NULL,
    `comments` LONGTEXT NULL,
    `validationSnapshot` JSON NULL,
    `snapshotVersion` VARCHAR(191) NOT NULL,
    `scheduleSnapshotHash` VARCHAR(191) NULL,
    `lockedBOQChecksum` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `idempotencyKey` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,

    UNIQUE INDEX `ScheduleApproval_idempotencyKey_key`(`idempotencyKey`),
    INDEX `ScheduleApproval_projectId_scheduleId_idx`(`projectId`, `scheduleId`),
    INDEX `ScheduleApproval_scheduleId_reviewRound_idx`(`scheduleId`, `reviewRound`),
    INDEX `ScheduleApproval_scheduleId_approvalStage_idx`(`scheduleId`, `approvalStage`),
    INDEX `ScheduleApproval_reviewerId_idx`(`reviewerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleReviewComment` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `reviewRound` INTEGER NOT NULL,
    `activityId` VARCHAR(191) NULL,
    `phaseId` VARCHAR(191) NULL,
    `commentType` ENUM('TECHNICAL', 'FINANCIAL', 'BOQ_ALLOCATION', 'SEQUENCE', 'DURATION', 'PRODUCTIVITY', 'CREW', 'WORK_FRONT', 'CPM', 'CONTRACT_DATE', 'COMMISSIONING', 'CLOSEOUT') NOT NULL,
    `comment` LONGTEXT NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `createdById` VARCHAR(191) NOT NULL,
    `createdByNameSnapshot` VARCHAR(191) NOT NULL,
    `createdByRoleSnapshot` VARCHAR(191) NOT NULL,
    `resolvedById` VARCHAR(191) NULL,
    `resolutionComment` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BaselineActivation` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `reviewRound` INTEGER NOT NULL,
    `revisionCode` VARCHAR(191) NOT NULL,
    `previousBaselineId` VARCHAR(191) NULL,
    `validationSnapshot` JSON NOT NULL,
    `snapshotVersion` VARCHAR(191) NOT NULL,
    `scheduleSnapshotHash` VARCHAR(191) NOT NULL,
    `lockedBOQChecksum` VARCHAR(191) NULL,
    `activatedById` VARCHAR(191) NOT NULL,
    `activatedByNameSnapshot` VARCHAR(191) NOT NULL,
    `activatedByRoleSnapshot` VARCHAR(191) NOT NULL,
    `activatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `idempotencyKey` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `isAuthoritative` BOOLEAN NOT NULL DEFAULT false,
    `invalidatedAt` DATETIME(3) NULL,
    `invalidationReason` LONGTEXT NULL,

    UNIQUE INDEX `BaselineActivation_idempotencyKey_key`(`idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialDataWaiver` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `reason` LONGTEXT NOT NULL,
    `affectedFields` JSON NOT NULL,
    `normalizationMethod` VARCHAR(191) NOT NULL,
    `migrationDeadline` DATETIME(3) NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `requestedByNameSnapshot` VARCHAR(191) NOT NULL,
    `requestedByRoleSnapshot` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedByNameSnapshot` VARCHAR(191) NULL,
    `approvedByRoleSnapshot` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revocationReason` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleRevisionReason` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `parentScheduleId` VARCHAR(191) NULL,
    `revisionType` ENUM('AI_REGENERATION', 'TECHNICAL_CORRECTION', 'CONTRACT_CORRECTION', 'FINANCIAL_CORRECTION', 'RECOVERY', 'VARIATION_ORDER', 'TIME_EXTENSION', 'SUSPENSION_RESUMPTION', 'METHODOLOGY_CHANGE', 'RESOURCE_CHANGE', 'CLIENT_INSTRUCTION') NOT NULL,
    `reason` LONGTEXT NOT NULL,
    `supportingReference` LONGTEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdByNameSnapshot` VARCHAR(191) NOT NULL,
    `createdByRoleSnapshot` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleWorkflowTransition` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `scheduleId` VARCHAR(191) NOT NULL,
    `action` ENUM('SUBMIT_DRAFT_FOR_REVIEW', 'START_TECHNICAL_REVIEW') NOT NULL,
    `fromStatus` ENUM('AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'READY_FOR_REVIEW', 'UNDER_TECHNICAL_REVIEW', 'TECHNICAL_REVISIONS_REQUIRED', 'TECHNICALLY_APPROVED', 'UNDER_CONTRACT_REVIEW', 'CONTRACT_REVISIONS_REQUIRED', 'CONTRACT_APPROVED', 'UNDER_FINANCE_REVIEW', 'FINANCE_REVISIONS_REQUIRED', 'FINANCE_APPROVED', 'PENDING_BASELINE_APPROVAL', 'ACTIVE_BASELINE', 'SUPERSEDED_BASELINE', 'ARCHIVED_BASELINE', 'REJECTED') NOT NULL,
    `toStatus` ENUM('AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'READY_FOR_REVIEW', 'UNDER_TECHNICAL_REVIEW', 'TECHNICAL_REVISIONS_REQUIRED', 'TECHNICALLY_APPROVED', 'UNDER_CONTRACT_REVIEW', 'CONTRACT_REVISIONS_REQUIRED', 'CONTRACT_APPROVED', 'UNDER_FINANCE_REVIEW', 'FINANCE_REVISIONS_REQUIRED', 'FINANCE_APPROVED', 'PENDING_BASELINE_APPROVAL', 'ACTIVE_BASELINE', 'SUPERSEDED_BASELINE', 'ARCHIVED_BASELINE', 'REJECTED') NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `actorSessionVersion` INTEGER NOT NULL,
    `expectedRowVersion` INTEGER NOT NULL,
    `resultingRowVersion` INTEGER NOT NULL,
    `idempotencyKeyHash` VARCHAR(191) NOT NULL,
    `correlationId` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `metadata` LONGTEXT NULL,

    INDEX `ScheduleWorkflowTransition_scheduleId_occurredAt_idx`(`scheduleId`, `occurredAt`),
    INDEX `ScheduleWorkflowTransition_projectId_action_occurredAt_idx`(`projectId`, `action`, `occurredAt`),
    INDEX `ScheduleWorkflowTransition_actorUserId_occurredAt_idx`(`actorUserId`, `occurredAt`),
    UNIQUE INDEX `ScheduleWorkflowTransition_scheduleId_action_idempotencyKeyH_key`(`scheduleId`, `action`, `idempotencyKeyHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordRecoveryToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(191) NOT NULL DEFAULT 'PASSWORD_RESET',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `requestedIpHash` VARCHAR(191) NULL,
    `requestedUserAgentHash` VARCHAR(191) NULL,

    UNIQUE INDEX `PasswordRecoveryToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordRecoveryToken_userId_idx`(`userId`),
    INDEX `PasswordRecoveryToken_purpose_expiresAt_idx`(`purpose`, `expiresAt`),
    INDEX `PasswordRecoveryToken_tokenHash_consumedAt_revokedAt_idx`(`tokenHash`, `consumedAt`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordRecoveryRateLimit` (
    `id` VARCHAR(191) NOT NULL,
    `identifierHash` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 1,
    `lastAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `blockedUntil` DATETIME(3) NULL,

    INDEX `PasswordRecoveryRateLimit_identifierHash_idx`(`identifierHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUserAssignment` ADD CONSTRAINT `ProjectUserAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectUserAssignment` ADD CONSTRAINT `ProjectUserAssignment_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AwardedBOQItem` ADD CONSTRAINT `AwardedBOQItem_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcurementBenchmarkItem` ADD CONSTRAINT `ProcurementBenchmarkItem_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsolidatedBOQItem` ADD CONSTRAINT `ConsolidatedBOQItem_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQMapping` ADD CONSTRAINT `BOQMapping_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQMapping` ADD CONSTRAINT `BOQMapping_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQMapping` ADD CONSTRAINT `BOQMapping_procurementBenchmarkItemId_fkey` FOREIGN KEY (`procurementBenchmarkItemId`) REFERENCES `ProcurementBenchmarkItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_checkerId_fkey` FOREIGN KEY (`checkerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_preparerId_fkey` FOREIGN KEY (`preparerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequest` ADD CONSTRAINT `MaterialRequest_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialRequestItem` ADD CONSTRAINT `MaterialRequestItem_mrId_fkey` FOREIGN KEY (`mrId`) REFERENCES `MaterialRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_canvassFormId_fkey` FOREIGN KEY (`canvassFormId`) REFERENCES `CanvassForm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_preparerId_fkey` FOREIGN KEY (`preparerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_mrId_fkey` FOREIGN KEY (`mrId`) REFERENCES `MaterialRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderItem` ADD CONSTRAINT `PurchaseOrderItem_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrderItem` ADD CONSTRAINT `PurchaseOrderItem_poId_fkey` FOREIGN KEY (`poId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_loggedById_fkey` FOREIGN KEY (`loggedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseBreakdownItem` ADD CONSTRAINT `ExpenseBreakdownItem_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseProofFile` ADD CONSTRAINT `ExpenseProofFile_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseProofFile` ADD CONSTRAINT `ExpenseProofFile_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseProofFile` ADD CONSTRAINT `ExpenseProofFile_breakdownItemId_fkey` FOREIGN KEY (`breakdownItemId`) REFERENCES `ExpenseBreakdownItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseProofFile` ADD CONSTRAINT `ExpenseProofFile_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseAIValidation` ADD CONSTRAINT `ExpenseAIValidation_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseApprovalLog` ADD CONSTRAINT `ExpenseApprovalLog_actionByUserId_fkey` FOREIGN KEY (`actionByUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExpenseApprovalLog` ADD CONSTRAINT `ExpenseApprovalLog_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashAccount` ADD CONSTRAINT `PettyCashAccount_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashAccount` ADD CONSTRAINT `PettyCashAccount_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashAccount` ADD CONSTRAINT `PettyCashAccount_custodianId_fkey` FOREIGN KEY (`custodianId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashAccount` ADD CONSTRAINT `PettyCashAccount_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashExpense` ADD CONSTRAINT `PettyCashExpense_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashExpense` ADD CONSTRAINT `PettyCashExpense_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashExpense` ADD CONSTRAINT `PettyCashExpense_replenishmentId_fkey` FOREIGN KEY (`replenishmentId`) REFERENCES `PettyCashReplenishment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashExpense` ADD CONSTRAINT `PettyCashExpense_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `PettyCashAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashExpense` ADD CONSTRAINT `PettyCashExpense_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PettyCashReplenishment` ADD CONSTRAINT `PettyCashReplenishment_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `PettyCashAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Worker` ADD CONSTRAINT `Worker_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIWorkerValidationResult` ADD CONSTRAINT `AIWorkerValidationResult_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkerDocument` ADD CONSTRAINT `WorkerDocument_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkerDocument` ADD CONSTRAINT `WorkerDocument_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTimeRecord` ADD CONSTRAINT `DailyTimeRecord_payrollPeriodId_fkey` FOREIGN KEY (`payrollPeriodId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTimeRecord` ADD CONSTRAINT `DailyTimeRecord_encodedById_fkey` FOREIGN KEY (`encodedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTimeRecord` ADD CONSTRAINT `DailyTimeRecord_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyTimeRecord` ADD CONSTRAINT `DailyTimeRecord_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollPeriod` ADD CONSTRAINT `PayrollPeriod_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollPeriod` ADD CONSTRAINT `PayrollPeriod_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollPeriod` ADD CONSTRAINT `PayrollPeriod_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_payrollPeriodId_fkey` FOREIGN KEY (`payrollPeriodId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payroll` ADD CONSTRAINT `Payroll_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollEarning` ADD CONSTRAINT `PayrollEarning_payrollId_fkey` FOREIGN KEY (`payrollId`) REFERENCES `Payroll`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollDeduction` ADD CONSTRAINT `PayrollDeduction_payrollId_fkey` FOREIGN KEY (`payrollId`) REFERENCES `Payroll`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollApproval` ADD CONSTRAINT `PayrollApproval_approverUserId_fkey` FOREIGN KEY (`approverUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollApproval` ADD CONSTRAINT `PayrollApproval_payrollPeriodId_fkey` FOREIGN KEY (`payrollPeriodId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeductionLedger` ADD CONSTRAINT `DeductionLedger_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeductionLedger` ADD CONSTRAINT `DeductionLedger_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeductionLog` ADD CONSTRAINT `DeductionLog_payrollPeriodId_fkey` FOREIGN KEY (`payrollPeriodId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeductionLog` ADD CONSTRAINT `DeductionLog_ledgerId_fkey` FOREIGN KEY (`ledgerId`) REFERENCES `DeductionLedger`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allowance` ADD CONSTRAINT `Allowance_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_uploaderId_fkey` FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_verifierId_fkey` FOREIGN KEY (`verifierId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_poId_fkey` FOREIGN KEY (`poId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryItem` ADD CONSTRAINT `DeliveryItem_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryItem` ADD CONSTRAINT `DeliveryItem_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumptionLog` ADD CONSTRAINT `ConsumptionLog_loggedById_fkey` FOREIGN KEY (`loggedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumptionLog` ADD CONSTRAINT `ConsumptionLog_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumptionItem` ADD CONSTRAINT `ConsumptionItem_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsumptionItem` ADD CONSTRAINT `ConsumptionItem_logId_fkey` FOREIGN KEY (`logId`) REFERENCES `ConsumptionLog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialIssuance` ADD CONSTRAINT `MaterialIssuance_releasedById_fkey` FOREIGN KEY (`releasedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialIssuance` ADD CONSTRAINT `MaterialIssuance_accountantId_fkey` FOREIGN KEY (`accountantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialIssuance` ADD CONSTRAINT `MaterialIssuance_warehousemanId_fkey` FOREIGN KEY (`warehousemanId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialIssuance` ADD CONSTRAINT `MaterialIssuance_foremanId_fkey` FOREIGN KEY (`foremanId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialIssuance` ADD CONSTRAINT `MaterialIssuance_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssuanceItem` ADD CONSTRAINT `IssuanceItem_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssuanceItem` ADD CONSTRAINT `IssuanceItem_issuanceId_fkey` FOREIGN KEY (`issuanceId`) REFERENCES `MaterialIssuance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturn` ADD CONSTRAINT `MaterialReturn_warehousemanId_fkey` FOREIGN KEY (`warehousemanId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturn` ADD CONSTRAINT `MaterialReturn_foremanId_fkey` FOREIGN KEY (`foremanId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturn` ADD CONSTRAINT `MaterialReturn_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaterialReturn` ADD CONSTRAINT `MaterialReturn_issuanceId_fkey` FOREIGN KEY (`issuanceId`) REFERENCES `MaterialIssuance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnItem` ADD CONSTRAINT `ReturnItem_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnItem` ADD CONSTRAINT `ReturnItem_issuanceItemId_fkey` FOREIGN KEY (`issuanceItemId`) REFERENCES `IssuanceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReturnItem` ADD CONSTRAINT `ReturnItem_returnId_fkey` FOREIGN KEY (`returnId`) REFERENCES `MaterialReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountsPayable` ADD CONSTRAINT `AccountsPayable_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountsPayable` ADD CONSTRAINT `AccountsPayable_poId_fkey` FOREIGN KEY (`poId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountsPayable` ADD CONSTRAINT `AccountsPayable_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQLotBreakdown` ADD CONSTRAINT `BOQLotBreakdown_boqItemId_fkey` FOREIGN KEY (`boqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Accomplishment` ADD CONSTRAINT `Accomplishment_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentItem` ADD CONSTRAINT `AccomplishmentItem_boqItemId_fkey` FOREIGN KEY (`boqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentItem` ADD CONSTRAINT `AccomplishmentItem_accomplishmentId_fkey` FOREIGN KEY (`accomplishmentId`) REFERENCES `Accomplishment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inspection` ADD CONSTRAINT `Inspection_accomplishmentItemId_fkey` FOREIGN KEY (`accomplishmentItemId`) REFERENCES `AccomplishmentItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Billing` ADD CONSTRAINT `Billing_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingItem` ADD CONSTRAINT `BillingItem_boqItemId_fkey` FOREIGN KEY (`boqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingItem` ADD CONSTRAINT `BillingItem_billingId_fkey` FOREIGN KEY (`billingId`) REFERENCES `Billing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BillingDeduction` ADD CONSTRAINT `BillingDeduction_billingId_fkey` FOREIGN KEY (`billingId`) REFERENCES `Billing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_billingId_fkey` FOREIGN KEY (`billingId`) REFERENCES `Billing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariationOrder` ADD CONSTRAINT `VariationOrder_subcontractPackageId_fkey` FOREIGN KEY (`subcontractPackageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariationOrder` ADD CONSTRAINT `VariationOrder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariationOrderItem` ADD CONSTRAINT `VariationOrderItem_originalBoqItemId_fkey` FOREIGN KEY (`originalBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariationOrderItem` ADD CONSTRAINT `VariationOrderItem_variationOrderId_fkey` FOREIGN KEY (`variationOrderId`) REFERENCES `VariationOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariationOrderDocument` ADD CONSTRAINT `VariationOrderDocument_variationOrderId_fkey` FOREIGN KEY (`variationOrderId`) REFERENCES `VariationOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VariationOrderApproval` ADD CONSTRAINT `VariationOrderApproval_variationOrderId_fkey` FOREIGN KEY (`variationOrderId`) REFERENCES `VariationOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIVariationOrderValidation` ADD CONSTRAINT `AIVariationOrderValidation_variationOrderId_fkey` FOREIGN KEY (`variationOrderId`) REFERENCES `VariationOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_accomplishmentId_fkey` FOREIGN KEY (`accomplishmentId`) REFERENCES `Accomplishment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_boqItemId_fkey` FOREIGN KEY (`boqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EvidenceFile` ADD CONSTRAINT `EvidenceFile_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCamera` ADD CONSTRAINT `ProjectCamera_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveCameraSnapshot` ADD CONSTRAINT `LiveCameraSnapshot_cameraId_fkey` FOREIGN KEY (`cameraId`) REFERENCES `ProjectCamera`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationRun` ADD CONSTRAINT `AIValidationRun_boqItemId_fkey` FOREIGN KEY (`boqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationRun` ADD CONSTRAINT `AIValidationRun_billingId_fkey` FOREIGN KEY (`billingId`) REFERENCES `Billing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationRun` ADD CONSTRAINT `AIValidationRun_accomplishmentId_fkey` FOREIGN KEY (`accomplishmentId`) REFERENCES `Accomplishment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationRun` ADD CONSTRAINT `AIValidationRun_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationEvidence` ADD CONSTRAINT `AIValidationEvidence_evidenceFileId_fkey` FOREIGN KEY (`evidenceFileId`) REFERENCES `EvidenceFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationEvidence` ADD CONSTRAINT `AIValidationEvidence_aiValidationRunId_fkey` FOREIGN KEY (`aiValidationRunId`) REFERENCES `AIValidationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationFinding` ADD CONSTRAINT `AIValidationFinding_aiValidationRunId_fkey` FOREIGN KEY (`aiValidationRunId`) REFERENCES `AIValidationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIHumanReview` ADD CONSTRAINT `AIHumanReview_aiValidationRunId_fkey` FOREIGN KEY (`aiValidationRunId`) REFERENCES `AIValidationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramOfWorks` ADD CONSTRAINT `ProgramOfWorks_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractorBOQItem` ADD CONSTRAINT `SubcontractorBOQItem_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractorBOQItem` ADD CONSTRAINT `SubcontractorBOQItem_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `Subcontractor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentRecord` ADD CONSTRAINT `AccomplishmentRecord_aiValidationId_fkey` FOREIGN KEY (`aiValidationId`) REFERENCES `AIValidationResult`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentRecord` ADD CONSTRAINT `AccomplishmentRecord_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_billingId_fkey` FOREIGN KEY (`billingId`) REFERENCES `SubcontractBilling`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractPackage` ADD CONSTRAINT `SubcontractPackage_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `Subcontractor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractPackage` ADD CONSTRAINT `SubcontractPackage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractPackage` ADD CONSTRAINT `SubcontractPackage_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobOrder` ADD CONSTRAINT `JobOrder_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobOrder` ADD CONSTRAINT `JobOrder_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `Subcontractor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobOrder` ADD CONSTRAINT `JobOrder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobOrder` ADD CONSTRAINT `JobOrder_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractAccomplishment` ADD CONSTRAINT `SubcontractAccomplishment_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractAccomplishment` ADD CONSTRAINT `SubcontractAccomplishment_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractBilling` ADD CONSTRAINT `SubcontractBilling_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractBilling` ADD CONSTRAINT `SubcontractBilling_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractBilling` ADD CONSTRAINT `SubcontractBilling_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `Subcontractor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractBilling` ADD CONSTRAINT `SubcontractBilling_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackCharge` ADD CONSTRAINT `BackCharge_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackCharge` ADD CONSTRAINT `BackCharge_subcontractorId_fkey` FOREIGN KEY (`subcontractorId`) REFERENCES `Subcontractor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BackCharge` ADD CONSTRAINT `BackCharge_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeReference` ADD CONSTRAINT `KnowledgeReference_payrollPeriodId_fkey` FOREIGN KEY (`payrollPeriodId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeReference` ADD CONSTRAINT `KnowledgeReference_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeReference` ADD CONSTRAINT `KnowledgeReference_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeReference` ADD CONSTRAINT `KnowledgeReference_knowledgeRecordId_fkey` FOREIGN KEY (`knowledgeRecordId`) REFERENCES `KnowledgeRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `KnowledgeAuditTrail` ADD CONSTRAINT `KnowledgeAuditTrail_knowledgeRecordId_fkey` FOREIGN KEY (`knowledgeRecordId`) REFERENCES `KnowledgeRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollBankLedger` ADD CONSTRAINT `PayrollBankLedger_payrollBankAccountId_fkey` FOREIGN KEY (`payrollBankAccountId`) REFERENCES `PayrollBankAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollFundingRequest` ADD CONSTRAINT `PayrollFundingRequest_destinationAccountId_fkey` FOREIGN KEY (`destinationAccountId`) REFERENCES `PayrollBankAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollFundingRequest` ADD CONSTRAINT `PayrollFundingRequest_payrollPeriodId_fkey` FOREIGN KEY (`payrollPeriodId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentBatch` ADD CONSTRAINT `PaymentBatch_payrollBankAccountId_fkey` FOREIGN KEY (`payrollBankAccountId`) REFERENCES `PayrollBankAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentBatch` ADD CONSTRAINT `PaymentBatch_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `PaymentProvider`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentBatch` ADD CONSTRAINT `PaymentBatch_payrollPeriodId_fkey` FOREIGN KEY (`payrollPeriodId`) REFERENCES `PayrollPeriod`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentBatchRow` ADD CONSTRAINT `PaymentBatchRow_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentBatchRow` ADD CONSTRAINT `PaymentBatchRow_payrollId_fkey` FOREIGN KEY (`payrollId`) REFERENCES `Payroll`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentBatchRow` ADD CONSTRAINT `PaymentBatchRow_paymentBatchId_fkey` FOREIGN KEY (`paymentBatchId`) REFERENCES `PaymentBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentException` ADD CONSTRAINT `PaymentException_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentFallbackRecommendation` ADD CONSTRAINT `PaymentFallbackRecommendation_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentTemplate` ADD CONSTRAINT `DocumentTemplate_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentTemplate` ADD CONSTRAINT `DocumentTemplate_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccomplishmentFile` ADD CONSTRAINT `ProjectAccomplishmentFile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccomplishmentFile` ADD CONSTRAINT `ProjectAccomplishmentFile_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccomplishmentFile` ADD CONSTRAINT `ProjectAccomplishmentFile_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccomplishmentFileVersion` ADD CONSTRAINT `ProjectAccomplishmentFileVersion_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `ProjectAccomplishmentFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccomplishmentAIFinding` ADD CONSTRAINT `ProjectAccomplishmentAIFinding_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectAccomplishmentAIFinding` ADD CONSTRAINT `ProjectAccomplishmentAIFinding_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `ProjectAccomplishmentFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_moduleId_fkey` FOREIGN KEY (`moduleId`) REFERENCES `Module`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkflowStep` ADD CONSTRAINT `WorkflowStep_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `WorkflowTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationLog` ADD CONSTRAINT `AIValidationLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserLoginLog` ADD CONSTRAINT `UserLoginLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotebookReferenceVersion` ADD CONSTRAINT `NotebookReferenceVersion_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotebookReferenceModule` ADD CONSTRAINT `NotebookReferenceModule_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotebookReferenceRole` ADD CONSTRAINT `NotebookReferenceRole_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotebookReferenceProject` ADD CONSTRAINT `NotebookReferenceProject_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotebookReferenceApprovalLog` ADD CONSTRAINT `NotebookReferenceApprovalLog_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotebookReferenceIndexLog` ADD CONSTRAINT `NotebookReferenceIndexLog_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AITransactionValidation` ADD CONSTRAINT `AITransactionValidation_referenceVersionId_fkey` FOREIGN KEY (`referenceVersionId`) REFERENCES `NotebookReferenceVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AITransactionValidation` ADD CONSTRAINT `AITransactionValidation_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationOverride` ADD CONSTRAINT `AIValidationOverride_validationResultId_fkey` FOREIGN KEY (`validationResultId`) REFERENCES `AITransactionValidation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIReferenceUsageLog` ADD CONSTRAINT `AIReferenceUsageLog_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `NotebookReference`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CanvassForm` ADD CONSTRAINT `CanvassForm_preparedById_fkey` FOREIGN KEY (`preparedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CanvassForm` ADD CONSTRAINT `CanvassForm_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CanvassForm` ADD CONSTRAINT `CanvassForm_mrId_fkey` FOREIGN KEY (`mrId`) REFERENCES `MaterialRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CanvassItem` ADD CONSTRAINT `CanvassItem_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CanvassItem` ADD CONSTRAINT `CanvassItem_canvassFormId_fkey` FOREIGN KEY (`canvassFormId`) REFERENCES `CanvassForm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuotation` ADD CONSTRAINT `SupplierQuotation_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuotation` ADD CONSTRAINT `SupplierQuotation_canvassFormId_fkey` FOREIGN KEY (`canvassFormId`) REFERENCES `CanvassForm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_canvassItemId_fkey` FOREIGN KEY (`canvassItemId`) REFERENCES `CanvassItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuotationItem` ADD CONSTRAINT `QuotationItem_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `SupplierQuotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentDeployment` ADD CONSTRAINT `EquipmentDeployment_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentDeployment` ADD CONSTRAINT `EquipmentDeployment_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentDeployment` ADD CONSTRAINT `EquipmentDeployment_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentDeployment` ADD CONSTRAINT `EquipmentDeployment_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentDeployment` ADD CONSTRAINT `EquipmentDeployment_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentUtilization` ADD CONSTRAINT `EquipmentUtilization_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentUtilization` ADD CONSTRAINT `EquipmentUtilization_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentMaintenance` ADD CONSTRAINT `EquipmentMaintenance_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentTelemetry` ADD CONSTRAINT `EquipmentTelemetry_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentAIValidation` ADD CONSTRAINT `EquipmentAIValidation_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HikvisionDevice` ADD CONSTRAINT `HikvisionDevice_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FleetEvent` ADD CONSTRAINT `FleetEvent_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FleetEvent` ADD CONSTRAINT `FleetEvent_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoEvidence` ADD CONSTRAINT `VideoEvidence_fleetEventId_fkey` FOREIGN KEY (`fleetEventId`) REFERENCES `FleetEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FleetTrip` ADD CONSTRAINT `FleetTrip_subcontractPackageId_fkey` FOREIGN KEY (`subcontractPackageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FleetTrip` ADD CONSTRAINT `FleetTrip_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FleetTrip` ADD CONSTRAINT `FleetTrip_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Worker`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FleetTrip` ADD CONSTRAINT `FleetTrip_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Geofence` ADD CONSTRAINT `Geofence_subcontractPackageId_fkey` FOREIGN KEY (`subcontractPackageId`) REFERENCES `SubcontractPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Geofence` ADD CONSTRAINT `Geofence_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FleetAIReview` ADD CONSTRAINT `FleetAIReview_fleetEventId_fkey` FOREIGN KEY (`fleetEventId`) REFERENCES `FleetEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExecutiveDashboardPreference` ADD CONSTRAINT `ExecutiveDashboardPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExecutiveAccessLog` ADD CONSTRAINT `ExecutiveAccessLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIExecutiveQuery` ADD CONSTRAINT `AIExecutiveQuery_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIGeneratedReport` ADD CONSTRAINT `AIGeneratedReport_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIGeneratedReport` ADD CONSTRAINT `AIGeneratedReport_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIGeneratedReport` ADD CONSTRAINT `AIGeneratedReport_generatedById_fkey` FOREIGN KEY (`generatedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIGeneratedReportVersion` ADD CONSTRAINT `AIGeneratedReportVersion_editedById_fkey` FOREIGN KEY (`editedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIGeneratedReportVersion` ADD CONSTRAINT `AIGeneratedReportVersion_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `AIGeneratedReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationSettings` ADD CONSTRAINT `ValidationSettings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationRecord` ADD CONSTRAINT `AIValidationRecord_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationRecord` ADD CONSTRAINT `AIValidationRecord_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AIValidationRecord` ADD CONSTRAINT `AIValidationRecord_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectValidationScore` ADD CONSTRAINT `ProjectValidationScore_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationEvidencePack` ADD CONSTRAINT `ValidationEvidencePack_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationEvidencePack` ADD CONSTRAINT `ValidationEvidencePack_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValidationAuditLog` ADD CONSTRAINT `ValidationAuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCostLedger` ADD CONSTRAINT `ProjectCostLedger_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCostLedger` ADD CONSTRAINT `ProjectCostLedger_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCostLedger` ADD CONSTRAINT `ProjectCostLedger_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitmentLedger` ADD CONSTRAINT `CommitmentLedger_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitmentLedger` ADD CONSTRAINT `CommitmentLedger_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommitmentLedger` ADD CONSTRAINT `CommitmentLedger_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractorVariationOrder` ADD CONSTRAINT `SubcontractorVariationOrder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractorVariationOrder` ADD CONSTRAINT `SubcontractorVariationOrder_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubcontractorVariationOrder` ADD CONSTRAINT `SubcontractorVariationOrder_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientVariationOrder` ADD CONSTRAINT `ClientVariationOrder_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientVariationOrder` ADD CONSTRAINT `ClientVariationOrder_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValueEngineeringRecord` ADD CONSTRAINT `ValueEngineeringRecord_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValueEngineeringRecord` ADD CONSTRAINT `ValueEngineeringRecord_consolidatedBoqItemId_fkey` FOREIGN KEY (`consolidatedBoqItemId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ValueEngineeringRecord` ADD CONSTRAINT `ValueEngineeringRecord_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSchedule` ADD CONSTRAINT `ProjectSchedule_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSchedule` ADD CONSTRAINT `ProjectSchedule_parentScheduleId_fkey` FOREIGN KEY (`parentScheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSchedule` ADD CONSTRAINT `ProjectSchedule_previousBaselineId_fkey` FOREIGN KEY (`previousBaselineId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSchedule` ADD CONSTRAINT `ProjectSchedule_generatedById_fkey` FOREIGN KEY (`generatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSchedule` ADD CONSTRAINT `ProjectSchedule_activatedById_fkey` FOREIGN KEY (`activatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleWBS` ADD CONSTRAINT `ScheduleWBS_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleWBS` ADD CONSTRAINT `ScheduleWBS_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ScheduleWBS`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleActivity` ADD CONSTRAINT `ScheduleActivity_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleActivity` ADD CONSTRAINT `ScheduleActivity_wbsId_fkey` FOREIGN KEY (`wbsId`) REFERENCES `ScheduleWBS`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleActivity` ADD CONSTRAINT `ScheduleActivity_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleDependency` ADD CONSTRAINT `ScheduleDependency_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleDependency` ADD CONSTRAINT `ScheduleDependency_predecessorId_fkey` FOREIGN KEY (`predecessorId`) REFERENCES `ScheduleActivity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleDependency` ADD CONSTRAINT `ScheduleDependency_successorId_fkey` FOREIGN KEY (`successorId`) REFERENCES `ScheduleActivity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleMilestone` ADD CONSTRAINT `ScheduleMilestone_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleBOQAllocation` ADD CONSTRAINT `ScheduleBOQAllocation_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `ScheduleActivity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleBOQAllocation` ADD CONSTRAINT `ScheduleBOQAllocation_awardedBoqItemId_fkey` FOREIGN KEY (`awardedBoqItemId`) REFERENCES `AwardedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleBOQAllocation` ADD CONSTRAINT `ScheduleBOQAllocation_boqLineId_fkey` FOREIGN KEY (`boqLineId`) REFERENCES `ConsolidatedBOQItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleBOQAllocation` ADD CONSTRAINT `ScheduleBOQAllocation_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleBOQAllocation` ADD CONSTRAINT `ScheduleBOQAllocation_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchedulePOWMapping` ADD CONSTRAINT `SchedulePOWMapping_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `ScheduleActivity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchedulePOWMapping` ADD CONSTRAINT `SchedulePOWMapping_programOfWorksId_fkey` FOREIGN KEY (`programOfWorksId`) REFERENCES `ProgramOfWorks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleProgressUpdate` ADD CONSTRAINT `ScheduleProgressUpdate_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleProgressUpdate` ADD CONSTRAINT `ScheduleProgressUpdate_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `ScheduleActivity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleProgressUpdate` ADD CONSTRAINT `ScheduleProgressUpdate_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleDelayRecord` ADD CONSTRAINT `ScheduleDelayRecord_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleDelayRecord` ADD CONSTRAINT `ScheduleDelayRecord_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `ScheduleActivity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleDelayRecord` ADD CONSTRAINT `ScheduleDelayRecord_reportedById_fkey` FOREIGN KEY (`reportedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleRecoveryPlan` ADD CONSTRAINT `ScheduleRecoveryPlan_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleRevisionRequest` ADD CONSTRAINT `ScheduleRevisionRequest_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ProjectSchedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiKnowledgeSource` ADD CONSTRAINT `AiKnowledgeSource_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiKnowledgeChunk` ADD CONSTRAINT `AiKnowledgeChunk_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `AiKnowledgeSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiChatSession` ADD CONSTRAINT `AiChatSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiChatMessage` ADD CONSTRAINT `AiChatMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AiChatSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiChatMessage` ADD CONSTRAINT `AiChatMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiAccessAuditLog` ADD CONSTRAINT `AiAccessAuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatbotFeedback` ADD CONSTRAINT `ChatbotFeedback_auditLogId_fkey` FOREIGN KEY (`auditLogId`) REFERENCES `AiAccessAuditLog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatbotFeedback` ADD CONSTRAINT `ChatbotFeedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiRagKeywordRegistry` ADD CONSTRAINT `AiRagKeywordRegistry_mergedIntoId_fkey` FOREIGN KEY (`mergedIntoId`) REFERENCES `AiRagKeywordRegistry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecurityEvent` ADD CONSTRAINT `SecurityEvent_simulationRunId_fkey` FOREIGN KEY (`simulationRunId`) REFERENCES `SecuritySimulationRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecurityEvent` ADD CONSTRAINT `SecurityEvent_incidentId_fkey` FOREIGN KEY (`incidentId`) REFERENCES `SecurityIncident`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecurityIncident` ADD CONSTRAINT `SecurityIncident_linkedSimulationRunId_fkey` FOREIGN KEY (`linkedSimulationRunId`) REFERENCES `SecuritySimulationRun`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecuritySimulationRun` ADD CONSTRAINT `SecuritySimulationRun_scenarioId_fkey` FOREIGN KEY (`scenarioId`) REFERENCES `SecuritySimulationScenario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecuritySimulationRun` ADD CONSTRAINT `SecuritySimulationRun_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `SecuritySimulationCampaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UploadedWorkbookFile` ADD CONSTRAINT `UploadedWorkbookFile_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkbookVersion` ADD CONSTRAINT `WorkbookVersion_uploadedWorkbookFileId_fkey` FOREIGN KEY (`uploadedWorkbookFileId`) REFERENCES `UploadedWorkbookFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnlyOfficeSession` ADD CONSTRAINT `OnlyOfficeSession_uploadedWorkbookFileId_fkey` FOREIGN KEY (`uploadedWorkbookFileId`) REFERENCES `UploadedWorkbookFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnlyOfficeSession` ADD CONSTRAINT `OnlyOfficeSession_workbookVersionId_fkey` FOREIGN KEY (`workbookVersionId`) REFERENCES `WorkbookVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQExtractedSection` ADD CONSTRAINT `BOQExtractedSection_uploadedWorkbookFileId_fkey` FOREIGN KEY (`uploadedWorkbookFileId`) REFERENCES `UploadedWorkbookFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQExtractedSection` ADD CONSTRAINT `BOQExtractedSection_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQExtractedItem` ADD CONSTRAINT `BOQExtractedItem_uploadedWorkbookFileId_fkey` FOREIGN KEY (`uploadedWorkbookFileId`) REFERENCES `UploadedWorkbookFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQExtractedItem` ADD CONSTRAINT `BOQExtractedItem_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BOQExtractedItem` ADD CONSTRAINT `BOQExtractedItem_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `BOQExtractedSection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkbookFormulaValidation` ADD CONSTRAINT `WorkbookFormulaValidation_uploadedWorkbookFileId_fkey` FOREIGN KEY (`uploadedWorkbookFileId`) REFERENCES `UploadedWorkbookFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkbookTemplateValidation` ADD CONSTRAINT `WorkbookTemplateValidation_uploadedWorkbookFileId_fkey` FOREIGN KEY (`uploadedWorkbookFileId`) REFERENCES `UploadedWorkbookFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleGenerationAudit` ADD CONSTRAINT `ScheduleGenerationAudit_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleGenerationAudit` ADD CONSTRAINT `ScheduleGenerationAudit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkbookExtractionAudit` ADD CONSTRAINT `WorkbookExtractionAudit_uploadedWorkbookFileId_fkey` FOREIGN KEY (`uploadedWorkbookFileId`) REFERENCES `UploadedWorkbookFile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkbookExtractionAudit` ADD CONSTRAINT `WorkbookExtractionAudit_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleApproval` ADD CONSTRAINT `ScheduleApproval_scheduleId_projectId_fkey` FOREIGN KEY (`scheduleId`, `projectId`) REFERENCES `ProjectSchedule`(`id`, `projectId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleApproval` ADD CONSTRAINT `ScheduleApproval_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleReviewComment` ADD CONSTRAINT `ScheduleReviewComment_scheduleId_projectId_fkey` FOREIGN KEY (`scheduleId`, `projectId`) REFERENCES `ProjectSchedule`(`id`, `projectId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleReviewComment` ADD CONSTRAINT `ScheduleReviewComment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleReviewComment` ADD CONSTRAINT `ScheduleReviewComment_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BaselineActivation` ADD CONSTRAINT `BaselineActivation_scheduleId_projectId_fkey` FOREIGN KEY (`scheduleId`, `projectId`) REFERENCES `ProjectSchedule`(`id`, `projectId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BaselineActivation` ADD CONSTRAINT `BaselineActivation_activatedById_fkey` FOREIGN KEY (`activatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialDataWaiver` ADD CONSTRAINT `FinancialDataWaiver_scheduleId_projectId_fkey` FOREIGN KEY (`scheduleId`, `projectId`) REFERENCES `ProjectSchedule`(`id`, `projectId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialDataWaiver` ADD CONSTRAINT `FinancialDataWaiver_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialDataWaiver` ADD CONSTRAINT `FinancialDataWaiver_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleRevisionReason` ADD CONSTRAINT `ScheduleRevisionReason_scheduleId_projectId_fkey` FOREIGN KEY (`scheduleId`, `projectId`) REFERENCES `ProjectSchedule`(`id`, `projectId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleRevisionReason` ADD CONSTRAINT `ScheduleRevisionReason_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleWorkflowTransition` ADD CONSTRAINT `ScheduleWorkflowTransition_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleWorkflowTransition` ADD CONSTRAINT `ScheduleWorkflowTransition_scheduleId_projectId_fkey` FOREIGN KEY (`scheduleId`, `projectId`) REFERENCES `ProjectSchedule`(`id`, `projectId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduleWorkflowTransition` ADD CONSTRAINT `ScheduleWorkflowTransition_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordRecoveryToken` ADD CONSTRAINT `PasswordRecoveryToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Restore PostgreSQL partial-unique invariants using MySQL nullable generated columns.
ALTER TABLE `ProjectSchedule`
  ADD COLUMN `_activeBaselineProjectId` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `workflowStatus` = 'ACTIVE_BASELINE' THEN `projectId` ELSE NULL END) VIRTUAL,
  ADD UNIQUE INDEX `ProjectSchedule_one_active_baseline_per_project` (`_activeBaselineProjectId`),
  ADD UNIQUE INDEX `ProjectSchedule_unique_baseline_code_per_project` (`projectId`, `baselineCode`);

ALTER TABLE `BaselineActivation`
  ADD COLUMN `_authoritativeScheduleId` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `isAuthoritative` = true AND `invalidatedAt` IS NULL THEN `scheduleId` ELSE NULL END) VIRTUAL,
  ADD UNIQUE INDEX `BaselineActivation_one_authoritative_per_schedule` (`_authoritativeScheduleId`);
