"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { FiFileText, FiDownload, FiCheckCircle } from "react-icons/fi";
import { generateProjectProgressBilling } from "@/app/actions/projectAccomplishmentActions";

export default function ProgressBillingGenerator({ projectId, unbilledAccomplishments, projectInfo }: any) {
  const [selectedAccs, setSelectedAccs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const toggleAcc = (id: string) => {
    setSelectedAccs((prev) => 
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (selectedAccs.length === 0) return toast.error("Please select at least one accomplishment to bill.");
    
    setIsGenerating(true);

    try {
      const res = await generateProjectProgressBilling(projectId, selectedAccs);
      if (!res.success) throw new Error(res.error);
      toast.success(`Progress Billing ${res.data?.billingNumber ?? ""} generated.`);
      setTimeout(() => window.location.href = `/projects/${projectId}?tab=billing`, 1200);
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate billing");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-2/3">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Accomplishments to Bill</h2>
          {unbilledAccomplishments.length === 0 ? (
            <p className="text-sm text-gray-500">No unbilled accomplishments available. Ensure accomplishments are approved first.</p>
          ) : (
            <div className="space-y-3">
              {unbilledAccomplishments.map((acc: any) => (
                <label key={acc.id} className={`flex items-start p-4 border rounded-lg cursor-pointer transition ${selectedAccs.includes(acc.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input 
                    type="checkbox" 
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    checked={selectedAccs.includes(acc.id)}
                    onChange={() => toggleAcc(acc.id)}
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex justify-between">
                      <p className="text-sm font-medium text-gray-900">Period: {acc.billingPeriod}</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(acc.approvedAmount || 0)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Date: {new Date(acc.accomplishmentDate).toLocaleDateString()}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="w-full md:w-1/3">
          <div className="bg-gray-50 p-5 rounded-lg border border-gray-200 h-full flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Project Billing Settings</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex justify-between">
                  <span>Retention:</span>
                  <span className="font-medium text-gray-900">{projectInfo.retentionPercentage}%</span>
                </li>
                <li className="flex justify-between">
                  <span>Withholding Tax:</span>
                  <span className="font-medium text-gray-900">{projectInfo.withholdingTaxPercentage}%</span>
                </li>
                <li className="flex justify-between">
                  <span>Recoupment Method:</span>
                  <span className="font-medium text-gray-900">{projectInfo.advanceRecoupmentMethod}</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || selectedAccs.length === 0}
                className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {isGenerating ? "Processing..." : (
                  <>
                    <FiDownload className="mr-2 h-4 w-4" />
                    Generate Progress Billing
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
