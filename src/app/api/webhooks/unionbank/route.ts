import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentReconciliationService } from '@/services/paymentReconciliationService';
import { configuredSecret, verifyHmacSignature } from '@/lib/integration-auth';

// Public (no user session) so the bank can reach it; only signed requests are accepted.
export async function POST(req: Request) {
  try {
    const secret = configuredSecret('UNIONBANK_WEBHOOK_SECRET');
    if (!secret) {
      console.error('UnionBank webhook rejected: UNIONBANK_WEBHOOK_SECRET is not configured.');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const bodyText = await req.text();
    if (!verifyHmacSignature(bodyText, req.headers.get('X-Signature'), secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const { senderReferenceId, status, errorCode, errorMessage, transactionReference } = payload;

    if (!senderReferenceId) {
      return NextResponse.json({ error: 'Missing senderReferenceId' }, { status: 400 });
    }

    // Find the payment line
    const paymentLine = await prisma.paymentBatchRow.findUnique({
      where: { senderReferenceId }
    });

    if (!paymentLine) {
      return NextResponse.json({ error: 'Payment line not found' }, { status: 404 });
    }

    if (paymentLine.status === 'SUCCESSFUL' || paymentLine.status === 'FAILED') {
      // Already processed
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    if (status === 'SUCCESSFUL') {
      await PaymentReconciliationService.processSuccess(paymentLine.id, transactionReference || 'UNKNOWN', new Date());
    } else if (status === 'FAILED' || status === 'REJECTED' || status === 'RETURNED') {
      await PaymentReconciliationService.processFailure(paymentLine.id, errorCode || 'ERR', errorMessage || 'Webhook reported failure');
    }

    return NextResponse.json({ message: 'Webhook received and processed' }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
