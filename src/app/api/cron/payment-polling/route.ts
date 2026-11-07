import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UnionBankApiService } from '@/services/unionBankApiService';
import { PaymentReconciliationService } from '@/services/paymentReconciliationService';
import { configuredSecret, verifyBearerSecret } from '@/lib/integration-auth';

export const maxDuration = 60; // Next.js edge/serverless execution timeout

export async function GET(req: Request) {
  try {
    // Public (no user session) so the scheduler can call it; requires CRON_SECRET and fails closed.
    const secret = configuredSecret('CRON_SECRET');
    if (!secret) {
      console.error('Payment polling rejected: CRON_SECRET is not configured.');
      return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
    }
    if (!verifyBearerSecret(req.headers.get('authorization'), secret)) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Find all payment lines that are currently Processing or Awaiting Settlement
    const pendingLines = await prisma.paymentBatchRow.findMany({
      where: {
        status: { in: ['PROCESSING', 'AWAITING_SETTLEMENT'] },
        senderReferenceId: { not: null }
      },
      take: 50 // Limit batch size for cron
    });

    let successCount = 0;
    let failureCount = 0;

    for (const line of pendingLines) {
      try {
        // Ping UnionBank API Status
        const status = await UnionBankApiService.checkTransactionStatus(line.id);

        if (status === 'SUCCESSFUL') {
          await PaymentReconciliationService.processSuccess(line.id, line.unionBankTransactionReference || 'POLL-UNKNOWN', new Date());
          successCount++;
        } else if (status === 'FAILED' || status === 'REJECTED' || status === 'RETURNED') {
          await PaymentReconciliationService.processFailure(line.id, 'POLL_ERR', 'Bank returned failure via polling');
          failureCount++;
        }
      } catch (err) {
        console.error(`Failed to poll status for line ${line.id}:`, err);
      }
    }

    return NextResponse.json({
      message: 'Polling complete',
      processed: pendingLines.length,
      successCount,
      failureCount
    }, { status: 200 });

  } catch (error) {
    console.error('Cron polling error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
