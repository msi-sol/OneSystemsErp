import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AccomplishmentForm from "./AccomplishmentForm";
import { notFound, redirect } from "next/navigation";
import { verifySession } from "@/lib/dal/auth";
import { checkSchedulingAccess } from "@/lib/scheduling/authUtils";

export default async function NewAccomplishmentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const actor = await verifySession();
  if (!actor) redirect('/login');
  const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canView');
  if (!access.allowed) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return <div className="p-6">Project not found.</div>;
  }

  // Fetch the Awarded BOQ for this project
  const awardedBoq = await prisma.awardedBOQItem.findMany({
    where: { projectId: projectId },
    // BOQ order (rows are created in source order). Sorting by item code scattered the BOQ, and for BOQs
    // without item codes the stored code is the section name.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  // Map to the format needed by the form
  const formattedBoqItems = awardedBoq.map((item) => ({
    id: item.id,
    // Show a code only when the BOQ had one; otherwise the stored code repeats the section or description.
    itemCode: item.itemCode && item.itemCode !== item.category && item.itemCode !== item.description ? item.itemCode : "",
    section: item.category || "",
    description: item.description,
    unit: item.unit,
    // Same basis the server uses when saving (revised values after approved variation orders).
    contractQuantity: item.revisedContractQuantity || item.quantity,
    previousQuantity: item.totalQuantityAccomplished,
    unitCost: item.revisedContractUnitPrice || item.combinedUnitCost || 0,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
            <Link href="/accomplishments" className="hover:text-blue-600">Accomplishments</Link>
            <span>/</span>
            <span className="text-gray-200">{project.name}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Record Accomplishment</h1>
        </div>
      </div>

      {awardedBoq.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg">
          No Awarded BOQ items found for this project. You cannot record an accomplishment without a locked Awarded BOQ.
        </div>
      ) : (
        <AccomplishmentForm projectId={projectId} boqItems={formattedBoqItems} />
      )}
    </div>
  );
}
