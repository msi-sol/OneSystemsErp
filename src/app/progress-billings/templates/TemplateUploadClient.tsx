"use client";

import React, { useState } from "react";
import { uploadDocumentTemplate } from "@/app/actions/documentTemplateActions";
import { toast } from "sonner";
import { FiUploadCloud, FiFileText, FiCheckCircle } from "react-icons/fi";

export default function TemplateUploadClient({ initialTemplates }: { initialTemplates: any[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (templateType: string, templateName: string, file: File) => {
    setIsUploading(true);
    toast.info(`Uploading ${templateName}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", file.name);
      formData.append("templateName", templateName);
      formData.append("templateType", templateType);
      
      const res = await uploadDocumentTemplate(formData);

      if (res.success) {
        toast.success(`${templateName} successfully uploaded.`);
        setTemplates((prev) => {
          const others = prev.filter((t) => t.templateType !== templateType);
          return [...others, res.data];
        });
      } else {
        toast.error(res.error || "Failed to upload.");
      }
    } catch (e: any) {
      toast.error("An error occurred during upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const renderUploadCard = (title: string, type: string) => {
    const activeTemplate = templates.find((t) => t.templateType === type);

    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <FiFileText size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">Supported formats: .docx, .xlsx</p>
            </div>
          </div>
          {activeTemplate && (
            <div className="flex items-center text-green-600 text-sm font-medium space-x-1">
              <FiCheckCircle />
              <span>Active</span>
            </div>
          )}
        </div>

        {activeTemplate ? (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 truncate">{activeTemplate.fileName}</span>
            <span className="text-xs text-gray-400">
              {new Date(activeTemplate.updatedAt).toLocaleDateString()}
            </span>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
            <span className="text-sm text-red-600">No active template found. System will use default fallback.</span>
          </div>
        )}

        <div className="mt-4">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <FiUploadCloud className="w-8 h-8 mb-3 text-gray-400" />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept=".docx,.xlsx,.doc,.xls"
              disabled={isUploading}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleUpload(type, title, e.target.files[0]);
                }
              }}
            />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      {renderUploadCard("Progress Billing Template", "PROGRESS_BILLING")}
      {renderUploadCard("Certificate of Payment Template", "CERTIFICATE_OF_PAYMENT")}
    </div>
  );
}
