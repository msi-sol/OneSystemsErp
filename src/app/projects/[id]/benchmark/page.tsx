import { redirect } from 'next/navigation';

// The separate Benchmark review page was removed; the procurement benchmark lives in the project's
// Procurement Benchmark tab. Old links and bookmarks land there.
export default async function BenchmarkReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${encodeURIComponent(id)}?tab=benchmark`);
}
