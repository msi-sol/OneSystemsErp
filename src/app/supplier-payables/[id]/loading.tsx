import PageLoading from '@/components/ui/PageLoading';

// Shown at once when "Issue Payment" is clicked, while the payment voucher loads.
export default function Loading() {
  return <PageLoading title="Payment Voucher" message="Opening the payment voucher…" />;
}
