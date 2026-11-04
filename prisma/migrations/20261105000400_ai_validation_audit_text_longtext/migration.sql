-- AlterTable
ALTER TABLE `AiAccessAuditLog` MODIFY `question` LONGTEXT NOT NULL;

-- AlterTable
ALTER TABLE `AIVariationOrderValidation` MODIFY `missingRequirements` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `AITransactionValidation` MODIFY `aiRecommendation` LONGTEXT NULL;
