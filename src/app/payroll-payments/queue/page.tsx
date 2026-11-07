import { redirect } from 'next/navigation';

// This page used to be a static mockup with invented workers and counts.
// The real queue of approved, locked payslips lives under Finance.
export default function ApprovedPayslipQueue() {
  redirect('/finance/approved-payslips');
}
