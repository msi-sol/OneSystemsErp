-- Widen workflow evidence columns without changing their values or nullability.
-- Repeating the existing LONGTEXT definitions also repairs older local databases
-- whose pre-baseline tables still use VARCHAR(191) or TEXT for these fields.
ALTER TABLE `Project` MODIFY `location` LONGTEXT NULL;
ALTER TABLE `ProcurementBenchmarkItem` MODIFY `description` LONGTEXT NOT NULL;
ALTER TABLE `ConsolidatedBOQItem` MODIFY `description` LONGTEXT NOT NULL;
ALTER TABLE `MaterialRequest` MODIFY `purpose` LONGTEXT NULL,
    MODIFY `locationOfUse` LONGTEXT NULL,
    MODIFY `remarks` LONGTEXT NULL,
    MODIFY `aiValidationNotes` LONGTEXT NULL;
ALTER TABLE `Delivery` MODIFY `mismatchNotes` LONGTEXT NULL;
ALTER TABLE `DeliveryItem` MODIFY `remarks` LONGTEXT NULL;
ALTER TABLE `CanvassForm` MODIFY `aiSummary` LONGTEXT NULL;
ALTER TABLE `SupplierQuotation` MODIFY `aiRationale` LONGTEXT NULL;
ALTER TABLE `QuotationItem` MODIFY `remarks` LONGTEXT NULL;
ALTER TABLE `ProjectSchedule` MODIFY `holidays` LONGTEXT NULL,
    MODIFY `workDaysConfig` LONGTEXT NULL,
    MODIFY `validationMetrics` LONGTEXT NULL,
    MODIFY `feasibilityFlags` LONGTEXT NULL;
ALTER TABLE `ScheduleActivity` MODIFY `predecessorData` LONGTEXT NULL;
ALTER TABLE `UploadedWorkbookFile` MODIFY `metadataJson` LONGTEXT NULL;
ALTER TABLE `BOQExtractedItem` MODIFY `description` LONGTEXT NOT NULL,
    MODIFY `formulaMapJson` LONGTEXT NULL,
    MODIFY `validationErrorsJson` LONGTEXT NULL;
