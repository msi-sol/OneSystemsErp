"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { FiSave, FiAlertTriangle } from "react-icons/fi";
import { submitProjectAccomplishment } from "@/app/actions/projectAccomplishmentActions";

export default function AccomplishmentForm({ projectId, boqItems }: { projectId: string, boqItems: any[] }) {
  const [billingPeriod, setBillingPeriod] = useState("");
  const [accomplishmentDate, setAccomplishmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [claims, setClaims] = useState<{ [id: string]: number }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClaimChange = (id: string, value: string) => {
    setClaims({ ...claims, [id]: parseFloat(value) || 0 });
  };

  const calculateTotals = () => {
    let currentAmount = 0;
    boqItems.forEach((item) => {
      const claim = claims[item.id] || 0;
      currentAmount += claim * item.unitCost;
    });
    return currentAmount;
  };

  const handleSubmit = async () => {
    if (!billingPeriod) return toast.error("Please enter a billing period");
    
    // Check constraints
    let hasError = false;
    boqItems.forEach((item) => {
      const claim = claims[item.id] || 0;
      const newTotal = item.previousQuantity + claim;
      if (newTotal > item.contractQuantity) {
        toast.error(`Cannot exceed 100% completion for ${item.itemCode}`);
        hasError = true;
      }
    });

    if (hasError) return;

    const claimList = Object.entries(claims)
      .filter(([, quantity]) => quantity > 0)
      .map(([boqItemId, quantity]) => ({ boqItemId, quantity }));
    if (claimList.length === 0) return toast.error("Enter a quantity for at least one BOQ item");

    setIsSubmitting(true);
    try {
      const res = await submitProjectAccomplishment({ projectId, billingPeriod, accomplishmentDate, claims: claimList });
      if (!res.success) throw new Error(res.error);
      toast.success("Accomplishment submitted for review.");
      setTimeout(() => window.location.href = `/projects/${projectId}?tab=accomplishment`, 1200);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-4 w-full md:w-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Period</label>
            <input 
              type="text" 
              placeholder="e.g. Month 1" 
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={billingPeriod}
              onChange={(e) => setBillingPeriod(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
            <input 
              type="date" 
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              value={accomplishmentDate}
              onChange={(e) => setAccomplishmentDate(e.target.value)}
            />
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-gray-500">Current Accomplishment Value</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(calculateTotals())}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section / Item</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Qty</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Prev Qty</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">This Period Qty</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">New %</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {boqItems.map((item) => {
              const claim = claims[item.id] || 0;
              const newTotal = item.previousQuantity + claim;
              // A zero-quantity reference line has no percentage (it showed Infinity% / NaN%).
              const newPercentage = item.contractQuantity > 0 ? ((newTotal / item.contractQuantity) * 100).toFixed(2) : '0.00';
              const isOver = newTotal > item.contractQuantity;

              return (
                <tr key={item.id} className={isOver ? "bg-red-50" : ""}>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-[14rem]">
                    <span className="block text-xs text-gray-500">{item.section}</span>
                    {item.itemCode && <span className="font-medium">{item.itemCode}</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs" title={item.description}>{item.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {new Intl.NumberFormat("en-PH", { style: "decimal" }).format(item.unitCost)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{item.contractQuantity} {item.unit}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{item.previousQuantity} {item.unit}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <input 
                      type="number"
                      min="0"
                      step="0.01"
                      className={`w-24 text-right rounded-md shadow-sm sm:text-sm ${isOver ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                      value={claims[item.id] || ""}
                      onChange={(e) => handleClaimChange(item.id, e.target.value)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                    <span className={isOver ? "text-red-600" : "text-gray-900"}>
                      {newPercentage}%
                      {isOver && <FiAlertTriangle className="inline ml-2 text-red-500" title="Exceeds 100%" />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          <FiSave className="mr-2 -ml-1 h-5 w-5" aria-hidden="true" />
          {isSubmitting ? "Saving..." : "Submit for Review"}
        </button>
      </div>
    </div>
  );
}
