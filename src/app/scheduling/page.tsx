import { verifySession } from '@/lib/dal/auth';
import React from "react";
import { prisma } from "@/lib/prisma";
import SchedulingDashboardClient from "./SchedulingDashboardClient";

import { cookies } from 'next/headers';

export default async function SchedulingDashboard() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const userId = __session?.id || '';
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN';

  const projects = await prisma.project.findMany({
    where: { 
      status: { notIn: ["COMPLETED", "CLOSED"] },
      ...(isSuperAdmin ? {} : {
        userAssignments: {
          some: {
            userId: userId,
            assignmentStatus: 'active'
          }
        }
      })
    },
    select: { 
      id: true, 
      name: true, 
      contractAmount: true, 
      status: true,
      projectSchedule: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          status: true,
          currentFinishDate: true
        }
      }
    },
  });

  return <SchedulingDashboardClient projects={projects} />;
}
