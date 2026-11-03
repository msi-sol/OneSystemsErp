-- CreateEnum
CREATE TYPE "ScheduleWorkflowAction" AS ENUM ('SUBMIT_DRAFT_FOR_REVIEW', 'START_TECHNICAL_REVIEW');

-- CreateTable
CREATE TABLE "ScheduleWorkflowTransition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "action" "ScheduleWorkflowAction" NOT NULL,
    "fromStatus" "ProjectScheduleWorkflowStatus" NOT NULL,
    "toStatus" "ProjectScheduleWorkflowStatus" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorSessionVersion" INTEGER NOT NULL,
    "expectedRowVersion" INTEGER NOT NULL,
    "resultingRowVersion" INTEGER NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "correlationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "ScheduleWorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleWorkflowTransition_scheduleId_occurredAt_idx" ON "ScheduleWorkflowTransition"("scheduleId", "occurredAt");
CREATE INDEX "ScheduleWorkflowTransition_projectId_action_occurredAt_idx" ON "ScheduleWorkflowTransition"("projectId", "action", "occurredAt");
CREATE INDEX "ScheduleWorkflowTransition_actorUserId_occurredAt_idx" ON "ScheduleWorkflowTransition"("actorUserId", "occurredAt");
CREATE UNIQUE INDEX "ScheduleWorkflowTransition_scheduleId_action_idempotencyKeyHash_key" ON "ScheduleWorkflowTransition"("scheduleId", "action", "idempotencyKeyHash");

-- Foreign keys omitted due to live DB constraint absence
