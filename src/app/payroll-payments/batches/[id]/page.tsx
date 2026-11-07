import { redirect } from 'next/navigation';

// This page used to be a hard-coded mockup (any id showed the same fake batch).
// Real payment batches are managed under Finance.
export default async function PaymentBatchDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/finance/payment-batches/${encodeURIComponent(id)}`);
}
