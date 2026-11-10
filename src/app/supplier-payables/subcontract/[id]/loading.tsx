import PageLoading from '@/components/ui/PageLoading';

// Shown at once when "Issue Payment" is clicked, while the subcontract payment loads.
export default function Loading() {
  return <PageLoading title="Subcontract Payment" message="Opening the payment…" />;
}
