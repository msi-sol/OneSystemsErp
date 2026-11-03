import React from "react";
import { prisma } from "@/lib/prisma";
import SchedulingHubClient from "./SchedulingHubClient";
import { checkSchedulingAccess, getSessionActor } from "@/lib/scheduling/authUtils";
import { notFound, redirect } from "next/navigation";
import { buildWorkPackageSummary } from "@/lib/scheduling/work-package-summary";

function serializePrisma(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj?.toNumber === 'function') return obj.toNumber();
  if (obj instanceof Date) return obj; // RSC supports Date
  if (Array.isArray(obj)) return obj.map(serializePrisma);
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key in obj) {
      res[key] = serializePrisma(obj[key]);
    }
    return res;
  }
  return obj;
}

export default async function ProjectSchedulingHub({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const actor = await getSessionActor().catch(() => null);
  if (!actor) redirect('/login');
  const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canView');
  if (!access.allowed) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      projectSchedule: {
        where: {
          status: {
            notIn: ['FAILED_GENERATION', 'FAILED_VALIDATION', 'INVALID_GENERATED_DRAFT', 'LEGACY_INVALID_DRAFT', 'EMPTY_DRAFT', 'ARCHIVED']
          }
        },
        include: {
          wbsNodes: {
            orderBy: { orderIndex: 'asc' }
          },
          activities: {
            include: {
              assignedTo: { select: { id: true, name: true, email: true } },
              wbs: true,
              boqAllocations: {
                include: {
                  awardedBoqItem: { select: { id: true, itemCode: true, description: true, unit: true, quantity: true, totalCost: true, combinedUnitCost: true, directCost: true } }
                }
              },
              predecessors: true,
              successors: true
            },
            orderBy: { createdAt: 'asc' }
          },
          dependencies: true,
          approvals: true
        }
      }
    }
  });

  if (!project) {
    return <div style={{ padding: '40px', color: 'var(--text-secondary)', textAlign: 'center' }}>Project not found</div>;
  }

  // Also prefetch Awarded BOQ for the setup wizard if schedule doesn't exist
  let awardedBoq = null;

  // Since projectSchedule is now an array, we must apply selection logic
  const schedules = project.projectSchedule || [];
  
  // Exclude empty schedules
  const validSchedules = schedules.filter(s => 
    s.activities && s.activities.length > 0 &&
    s.wbsNodes && s.wbsNodes.length > 0
  );

  // Priority selection logic
  let selectedSchedule = null;
  
  // 1. ACTIVE_BASELINE
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'ACTIVE_BASELINE');
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'SUPERSEDED_BASELINE');
  
  // 2. PENDING_BASELINE_APPROVAL
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'PENDING_BASELINE_APPROVAL');

  // 3. UNDER_TECHNICAL_REVIEW / TECHNICALLY_APPROVED
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'TECHNICALLY_APPROVED');
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'UNDER_TECHNICAL_REVIEW');
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'READY_FOR_REVIEW');
  
  // 4. DRAFT / REVISIONS REQUIRED
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'TECHNICAL_REVISIONS_REQUIRED');
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.workflowStatus === 'AI_GENERATED_DRAFT');

  // Fallback to old status if workflowStatus didn't match (for legacy)
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.status === 'BASELINE');
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.status === 'DRAFT_BASELINE');
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.status === 'DRAFT');
  selectedSchedule = selectedSchedule || validSchedules.find(s => s.status === 'LEGACY_BASELINE');
  
  // Fallback to the newest if any remain and no priority match
  if (!selectedSchedule && validSchedules.length > 0) {
    selectedSchedule = validSchedules.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  if (!selectedSchedule) {
    awardedBoq = await prisma.awardedBOQItem.findMany({
      where: { projectId },
      orderBy: { itemCode: 'asc' }
    });
    
    // Fallback to Procurement Benchmark if Awarded BOQ is empty
    if (awardedBoq.length === 0) {
      awardedBoq = await prisma.procurementBenchmarkItem.findMany({
        where: { projectId },
        orderBy: { itemCode: 'asc' }
      });
    }
  }

  const serializedProject = serializePrisma(project);
  const serializedBoq = serializePrisma(awardedBoq);
  // Keep Decimal allocations intact while projecting; serializePrisma converts
  // other legacy schedule props to numbers for the existing views.
  const scopeBoq = selectedSchedule ? await prisma.awardedBOQItem.findMany({
    where: { projectId },
    select: { id: true, itemCode: true, description: true, unit: true, quantity: true, totalCost: true },
    orderBy: { itemCode: 'asc' },
  }) : [];
  const workPackageSummary = selectedSchedule ? buildWorkPackageSummary(selectedSchedule, scopeBoq) : undefined;
  const editAccess = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canEditDraft');

  return (
    <SchedulingHubClient 
      project={serializedProject} 
      initialSchedule={selectedSchedule ? serializePrisma(selectedSchedule) : null} 
      awardedBoq={serializedBoq}
      actor={actor}
      workPackageSummary={workPackageSummary}
      canEditDraft={editAccess.allowed}
    />
  );
}
