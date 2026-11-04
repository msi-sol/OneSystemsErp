-- AlterTable
ALTER TABLE `CommitmentLedger` ADD COLUMN `jobOrderId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `CommitmentLedger_jobOrderId_idx` ON `CommitmentLedger`(`jobOrderId`);

-- AddForeignKey
ALTER TABLE `CommitmentLedger` ADD CONSTRAINT `CommitmentLedger_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
