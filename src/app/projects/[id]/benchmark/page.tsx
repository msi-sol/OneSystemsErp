import BenchmarkReviewClient from './BenchmarkReviewClient';

export default async function BenchmarkReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BenchmarkReviewClient projectId={id} />;
}
