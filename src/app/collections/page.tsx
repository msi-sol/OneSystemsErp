import React from "react";
import Link from "next/link";
import { fetchOutstandingReceivables } from "@/services/collectionService";

export default async function CollectionsDashboard() {
  const receivables = await fetchOutstandingReceivables();

  // Aggregate stats
  let totalOutstanding = 0;
  let totalOverdue = 0; // Simplified for now
  
  const formattedReceivables = receivables.map(r => {
    const netAmountDue = r.deductions[0]?.netAmountDue || r.currentBillingAmount;
    const amountPaid = r.payments.reduce((sum, p) => sum + p.amountPaid, 0);
    const balance = Math.round((netAmountDue - amountPaid) * 100) / 100;
    
    totalOutstanding += balance;

    return {
      ...r,
      netAmountDue,
      amountPaid,
      balance
    };
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Collections</h1>
          <p className="text-gray-500">Track and receive payments for approved Progress Billings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">Total Outstanding</p>
          <p className="text-3xl font-bold text-gray-900">
            {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(totalOutstanding)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500 mb-1">Open Invoices</p>
          <p className="text-3xl font-bold text-gray-900">{receivables.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900">Outstanding Receivables</h3>
        </div>
        
        {formattedReceivables.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No outstanding receivables found. All Progress Billings have been paid.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Billing No.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net Due</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {formattedReceivables.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                      {rec.billingNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {rec.project.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(rec.billingDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        rec.status === "PARTIALLY_PAID" ? "bg-yellow-100 text-yellow-800" : "bg-blue-100 text-blue-800"
                      }`}>
                        {rec.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {new Intl.NumberFormat("en-PH", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rec.netAmountDue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                      {new Intl.NumberFormat("en-PH", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rec.balance)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <Link 
                        href={`/collections/${rec.id}/receive`}
                        className="text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-md shadow-sm transition"
                      >
                        Receive Payment
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
