import { prisma } from "@/lib/prisma";

export async function fetchOutstandingReceivables() {
  return await prisma.billing.findMany({
    where: {
      status: { in: ["APPROVED", "SUBMITTED", "PARTIALLY_PAID"] }, // Assuming these statuses represent billings that need collection
    },
    include: {
      project: { select: { name: true } },
      payments: true,
      deductions: true,
    },
    orderBy: { billingDate: "desc" },
  });
}

export async function recordCollection(
  billingId: string,
  amountPaid: number,
  paymentDate: Date,
  paymentReferenceNumber: string | null,
  bankOrCheckNumber: string | null,
  orNumber: string | null,
  ewtCertificateReference: string | null,
  remarks: string | null
) {
  // 1. Fetch the billing and current payments
  const billing = await prisma.billing.findUnique({
    where: { id: billingId },
    include: { payments: true, deductions: true },
  });

  if (!billing) throw new Error("Billing not found");

  // `??`, not `||`: a legitimate ₱0 net amount must not fall back to the gross billing.
  const netAmountDue = billing.deductions[0]?.netAmountDue ?? billing.currentBillingAmount;
  const currentTotalPaid = billing.payments.reduce((sum, p) => sum + p.amountPaid, 0);

  // 2. Validate payment amount
  if (currentTotalPaid + amountPaid > netAmountDue + 0.01) { // 0.01 for floating point safety
    throw new Error(`Payment exceeds the net amount due. Remaining balance is ${netAmountDue - currentTotalPaid}`);
  }

  // 3. Create the Payment record
  const payment = await prisma.payment.create({
    data: {
      billingId,
      billingAmount: billing.currentBillingAmount,
      approvedAmount: billing.currentBillingAmount, // Assuming approved is same as billed
      netAmountDue,
      amountPaid,
      paymentDate,
      paymentReferenceNumber,
      bankOrCheckNumber,
      orNumber,
      ewtCertificateReference,
      paymentStatus: "PAID",
      remarks,
    },
  });

  // 4. Update the Billing status
  const newTotalPaid = currentTotalPaid + amountPaid;
  let newStatus = billing.status;

  // Due to JS floating point math, use a small epsilon for exact match
  if (Math.abs(newTotalPaid - netAmountDue) < 0.01) {
    newStatus = "PAID";
  } else if (newTotalPaid > 0) {
    newStatus = "PARTIALLY_PAID";
  }

  if (newStatus !== billing.status) {
    await prisma.billing.update({
      where: { id: billingId },
      data: { status: newStatus },
    });
  }

  return payment;
}
