import TemplateUploadCenter from './TemplateUploadCenter';

export default async function PowBoqUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen bg-gray-50/50">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Upload Center</h1>
        <p className="text-gray-500 mt-2">Program of Works & Bill of Quantities</p>
      </div>
      
      <TemplateUploadCenter projectId={id} />
    </div>
  );
}
