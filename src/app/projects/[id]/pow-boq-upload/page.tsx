import TemplateUploadCenter from './TemplateUploadCenter';

export default async function PowBoqUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* No light page tint: on the app's dark shell a half-transparent gray-50 wrapper became a muddy gray slab. */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Upload Center</h1>
        <p className="text-gray-400 mt-2">Program of Works & Bill of Quantities</p>
      </div>
      
      <TemplateUploadCenter projectId={id} />
    </div>
  );
}
