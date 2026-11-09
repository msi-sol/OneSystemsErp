import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ReceivePaymentForm from "./ReceivePaymentForm";

export default async function ReceivePaymentPage({ params }: { params: Promise<{ billingId: string }> }) {
  const { billingId } = await params;

  const billing = await prisma.billing.findUnique({
    where: { id: billingId },
    include: {
      project: { select: { name: true } },
      payments: true,
      deductions: true,
    },
  });

  if (!billing) {
    return <div className="p-6 text-gray-500">Billing record not found.</div>;
  }

  const netAmountDue = billing.deductions[0]?.netAmountDue || billing.currentBillingAmount;
  const currentTotalPaid = billing.payments.reduce((sum, p) => sum + p.amountPaid, 0);
  // Rounded to centavos so the pre-filled payment clears the balance exactly (older billings stored e.g. 22,765.681).
  const balance = Math.round((netAmountDue - currentTotalPaid) * 100) / 100;

  if (balance <= 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="bg-green-50 border border-green-200 text-green-800 p-6 rounded-lg">
          <h2 className="text-lg font-bold mb-2">Billing Fully Paid</h2>
          <p>This billing statement (<strong>{billing.billingNumber}</strong>) has already been fully collected.</p>
          <Link href="/collections" className="text-blue-600 hover:underline mt-4 inline-block">
            &larr; Back to Collections
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-2">
        <div>
          <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
            <Link href="/collections" className="hover:text-blue-600">Collections</Link>
            <span>/</span>
            <span className="text-gray-200">{billing.billingNumber}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Receive Payment</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ReceivePaymentForm 
            billingId={billingId} 
            netAmountDue={netAmountDue}
            balance={balance}
            billingNumber={billing.billingNumber}
          />
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Billing Summary</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Project</span>
                <span className="font-medium text-gray-900">{billing.project.name}</span>
              </li>
              <li className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Billing Date</span>
                <span className="font-medium text-gray-900">{new Date(billing.billingDate).toLocaleDateString()}</span>
              </li>
              <li className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Gross Amount</span>
                <span className="font-medium text-gray-900">
                  {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(billing.currentBillingAmount)}
                </span>
              </li>
              <li className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Net Due</span>
                <span className="font-medium text-gray-900">
                  {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(netAmountDue)}
                </span>
              </li>
              <li className="flex justify-between text-green-600 pt-1">
                <span>Already Paid</span>
                <span className="font-medium">
                  {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(currentTotalPaid)}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
