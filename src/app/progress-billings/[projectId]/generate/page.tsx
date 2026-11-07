import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ProgressBillingGenerator from "./ProgressBillingGenerator";
import { notFound, redirect } from "next/navigation";
import { verifySession } from "@/lib/dal/auth";
import { checkSchedulingAccess } from "@/lib/scheduling/authUtils";

export default async function GenerateProgressBillingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const actor = await verifySession();
  if (!actor) redirect("/login");
  const access = await checkSchedulingAccess(actor.id, actor.role, projectId, "canView");
  if (!access.allowed) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { 
      name: true, 
      retentionPercentage: true, 
      withholdingTaxPercentage: true,
      advanceRecoupmentMethod: true,
      contractAmount: true
    }
  });

  if (!project) {
    return <div className="p-6 text-gray-500">Project not found.</div>;
  }

  // Approved accomplishments not yet billed (billing moves them to BILLED).
  // No placeholder rows: billing fake amounts would produce real receivables.
  const unbilledAccomplishments = await prisma.accomplishment.findMany({
    where: { projectId, status: "APPROVED" },
    select: {
      id: true,
      billingPeriod: true,
      accomplishmentDate: true,
      approvedAmount: true,
    },
    orderBy: { accomplishmentDate: "asc" },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
            <Link href="/progress-billings" className="hover:text-blue-600">Progress Billings</Link>
            <span>/</span>
            <span className="text-gray-200">{project.name}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Generate Progress Billing</h1>
        </div>
      </div>

      <ProgressBillingGenerator 
        projectId={projectId} 
        unbilledAccomplishments={unbilledAccomplishments}
        projectInfo={project}
      />
    </div>
  );
}
