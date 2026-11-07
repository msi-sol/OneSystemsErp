'use server';

import { prisma } from '@/lib/prisma';
import { getAuditViewer } from '@/lib/audit-access';

// These are server actions (callable by any signed-in client), so each one checks audit access itself.

export async function getAIAuditLogs(filter?: string) {
  if (!(await getAuditViewer())) return [];
  try {
    const whereClause: any = {};
    if (filter === 'BLOCKED') {
      whereClause.validationStatus = 'BLOCKING ISSUE';
    } else if (filter === 'WARNING') {
      whereClause.validationStatus = 'WARNING';
    }

    const logs = await prisma.aITransactionValidation.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 100, // Fetch the latest 100 logs
      include: {
        reference: true, // Includes the Notebook Reference used
        overrides: true, // Includes any overrides submitted
      }
    });

    return logs;
  } catch (error) {
    console.error('Error fetching AI audit logs:', error);
    return [];
  }
}

export async function getAIAuditMetrics() {
  if (!(await getAuditViewer())) return { total: 0, blocked: 0, warnings: 0 };
  try {
    const [total, blocked, warnings] = await Promise.all([
      prisma.aITransactionValidation.count(),
      prisma.aITransactionValidation.count({ where: { validationStatus: 'BLOCKING ISSUE' } }),
      prisma.aITransactionValidation.count({ where: { validationStatus: 'WARNING' } }),
    ]);

    return { total, blocked, warnings };
  } catch (error) {
    console.error('Error fetching AI audit metrics:', error);
    return { total: 0, blocked: 0, warnings: 0 };
  }
}

export async function getChatbotAuditLogs() {
  if (!(await getAuditViewer())) return [];
  try {
    const logs = await prisma.aiAccessAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { name: true, email: true } }
      }
    });
    return logs;
  } catch (error) {
    console.error('Error fetching chatbot audit logs:', error);
    return [];
  }
}
