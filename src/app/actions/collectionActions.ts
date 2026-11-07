"use server";

import { recordCollection } from "@/services/collectionService";
import { revalidatePath } from "next/cache";

export async function processPaymentAction(formData: FormData) {
  try {
    const billingId = formData.get("billingId") as string;
    const amountPaid = parseFloat(formData.get("amountPaid") as string);
    const paymentDate = new Date(formData.get("paymentDate") as string);
    const paymentReferenceNumber = (formData.get("paymentReferenceNumber") as string) || null;
    const bankOrCheckNumber = (formData.get("bankOrCheckNumber") as string) || null;
    const orNumber = (formData.get("orNumber") as string) || null;
    const ewtCertificateReference = (formData.get("ewtCertificateReference") as string) || null;
    const remarks = (formData.get("remarks") as string) || null;

    if (!billingId || isNaN(amountPaid) || isNaN(paymentDate.getTime())) {
      throw new Error("Missing required fields: Billing ID, Amount, or Date.");
    }
    if (amountPaid <= 0) {
      throw new Error("Amount paid must be greater than zero.");
    }

    const payment = await recordCollection(
      billingId,
      amountPaid,
      paymentDate,
      paymentReferenceNumber,
      bankOrCheckNumber,
      orNumber,
      ewtCertificateReference,
      remarks
    );

    revalidatePath("/collections");
    revalidatePath(`/collections/${billingId}/receive`);

    return { success: true, data: payment };
  } catch (error: any) {
    console.error("Payment Processing Error:", error);
    return { success: false, error: error.message || "Failed to process payment." };
  }
}
