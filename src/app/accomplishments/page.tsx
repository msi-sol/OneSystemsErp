import React from "react";
import { prisma } from "@/lib/prisma";
import AccomplishmentDashboardClient from "./AccomplishmentDashboardClient";

export default async function AccomplishmentDashboard() {
  const projects = await prisma.project.findMany({
    where: { status: { notIn: ["PLANNING", "COMPLETED", "CLOSED"] } },
    select: { 
      id: true, 
      name: true, 
      contractAmount: true, 
      status: true,
      documentTemplates: true,
      projectAccomplishmentFiles: {
        orderBy: { createdAt: 'desc' }
      },
      // Progress billing records (same ones the Executive dashboard counts as billed).
      billings: {
        where: { status: { not: 'DRAFT' } },
        orderBy: { billingDate: 'desc' },
        select: { id: true, billingNumber: true, billingDate: true, billingPeriodFrom: true, billingPeriodTo: true, currentBillingAmount: true, totalBillingToDate: true, status: true }
      }
    },
  });

  return <AccomplishmentDashboardClient projects={projects} />;
}
