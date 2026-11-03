-- AlterTable
ALTER TABLE "BaselineActivation" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
ADD COLUMN     "invalidationReason" TEXT,
ADD COLUMN     "isAuthoritative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "ProjectSchedule" ADD COLUMN     "baselineCode" TEXT;

-- AlterTable
ALTER TABLE "ScheduleApproval" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BaselineActivation_idempotencyKey_key" ON "BaselineActivation"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleApproval_idempotencyKey_key" ON "ScheduleApproval"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineActivation_one_authoritative_per_schedule"
ON "BaselineActivation" ("scheduleId")
WHERE "isAuthoritative" = true
  AND "invalidatedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSchedule_unique_baseline_code_per_project"
ON "ProjectSchedule" ("projectId", "baselineCode")
WHERE "baselineCode" IS NOT NULL;
