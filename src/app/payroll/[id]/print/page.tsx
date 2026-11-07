import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ type: string }> }) {
  const { type } = await searchParams;
  return {
    title: `Print - ${type === 'summary' ? 'Payroll Summary' : 'Payslips'}`,
  };
}

export default async function PrintPayrollPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ type: string, workerId?: string }> }) {
  const { id } = await params;
  const { type, workerId } = await searchParams;

  const period = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      // Payslip header shows the contracting company recorded on the project (was a literal "COMPANY NAME").
      project: { select: { contractor: true, name: true } },
      payrolls: {
        // A single-worker payslip print (from PayslipModal) must not include other workers' pay.
        where: type !== 'summary' && workerId ? { workerId } : undefined,
        include: { worker: true }
      }
    }
  });

  if (!period) return notFound();

  // Ensure it prints immediately
  const printScript = `
    window.onload = function() {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  `;

  return (
    <div style={{ background: '#fff', color: '#000', minHeight: '100vh', padding: '20px' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .print-container { font-family: 'Inter', sans-serif; background: #fff; color: #000; }
        .print-container table { width: 100%; border-collapse: collapse; margin-bottom: 20px; color: #000; }
        .print-container th, .print-container td { border: 1px solid #000; padding: 8px; text-align: left; }
        .print-container th { background: #f4f4f4; color: #000; }
        .payslip { border: 2px solid #000; margin-bottom: 40px; padding: 20px; page-break-inside: avoid; color: #000; }
        .payslip-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
        .payslip-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
        @media print {
          @page { margin: 1cm; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
      ` }} />
      <script dangerouslySetInnerHTML={{ __html: printScript }} />
      
      <div id="print-area" className="print-container">
        {type === 'summary' ? (
          <div>
            <h1 style={{ textAlign: 'center' }}>Payroll Summary</h1>
            <h3 style={{ textAlign: 'center' }}>{period.month}/{period.year} - {period.periodType}</h3>
            <table>
              <thead>
                <tr>
                  <th>Worker Name</th>
                  <th>Gross Pay</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Signature</th>
                </tr>
              </thead>
              <tbody>
                {period.payrolls.sort((a:any,b:any) => a.worker.lastName.localeCompare(b.worker.lastName)).map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.worker.lastName}, {p.worker.firstName}</td>
                    <td>P {p.grossPay.toLocaleString()}</td>
                    <td>P {p.totalDeductions.toLocaleString()}</td>
                    <td><strong>P {p.netPay.toLocaleString()}</strong></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>TOTAL</th>
                  <th>P {period.payrolls.reduce((sum:number, p:any) => sum + p.grossPay, 0).toLocaleString()}</th>
                  <th>P {period.payrolls.reduce((sum:number, p:any) => sum + p.totalDeductions, 0).toLocaleString()}</th>
                  <th>P {period.payrolls.reduce((sum:number, p:any) => sum + p.netPay, 0).toLocaleString()}</th>
                  <th></th>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div>
            {period.payrolls.sort((a:any,b:any) => a.worker.lastName.localeCompare(b.worker.lastName)).map((p: any) => (
              <div key={p.id} className="payslip">
                <div className="payslip-header">
                  <h2>{period.project?.contractor || process.env.NEXT_PUBLIC_COMPANY_NAME || 'Payslip'}</h2>
                  <p>PAYSLIP - {period.month}/{period.year}</p>
                </div>
                <div className="payslip-row">
                  <strong>Name:</strong> <span>{p.worker.lastName}, {p.worker.firstName}</span>
                </div>
                <div className="payslip-row">
                  <strong>ID / EMP NO:</strong> <span>{p.worker.workerId || 'N/A'}</span>
                </div>
                <hr />
                <div className="payslip-row">
                  <span>Basic Pay:</span> <span>P {p.basicPay.toLocaleString()}</span>
                </div>
                <div className="payslip-row">
                  <span>Overtime Pay:</span> <span>P {p.overtimePay.toLocaleString()}</span>
                </div>
                <div className="payslip-row" style={{ fontWeight: 'bold' }}>
                  <span>Gross Pay:</span> <span>P {p.grossPay.toLocaleString()}</span>
                </div>
                <hr />
                <div className="payslip-row">
                  <span>SSS Deduction:</span> <span>P {p.sssDeduction.toLocaleString()}</span>
                </div>
                <div className="payslip-row">
                  <span>PhilHealth Deduction:</span> <span>P {p.philhealthDeduction.toLocaleString()}</span>
                </div>
                <div className="payslip-row">
                  <span>Pag-IBIG Deduction:</span> <span>P {p.pagibigDeduction.toLocaleString()}</span>
                </div>
                <div className="payslip-row">
                  <span>Withholding Tax:</span> <span>P {p.withholdingTax.toLocaleString()}</span>
                </div>
                <div className="payslip-row" style={{ color: 'red' }}>
                  <span>Loans/Advances:</span> <span>P {(p.loanDeduction + p.cashAdvance).toLocaleString()}</span>
                </div>
                <hr />
                <div className="payslip-row" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                  <span>NET PAY:</span> <span>P {p.netPay.toLocaleString()}</span>
                </div>
                <br /><br />
                <div className="payslip-row">
                  <span>Received By: __________________</span>
                  <span>Date: __________________</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
