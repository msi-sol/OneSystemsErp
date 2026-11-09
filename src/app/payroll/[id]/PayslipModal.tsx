'use client';

import { useState } from 'react';
import { explainPayslipWithAI } from '../../actions/payslipAi';

export default function PayslipModal({ payroll, dtrs, onClose }: { payroll: any, dtrs?: any[], onClose: () => void }) {
  const workerDtrs = dtrs?.filter(d => d.workerId === payroll.workerId) || [];
  const daysWorked = workerDtrs.filter(d => d.regularHours > 0 || d.overtimeHours > 0).length;
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [error, setError] = useState('');

  const handleExplain = async () => {
    setIsExplaining(true);
    setError('');
    
    const res = await explainPayslipWithAI(payroll.id);
    if (res.success) {
      setExplanation(res.explanation || null);
    } else {
      setError(res.error || 'Failed to generate explanation');
    }
    
    setIsExplaining(false);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '16px', border: '1px solid var(--glass-border)', width: '90%', maxWidth: '600px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '1.5rem' }}>Payslip Detail</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '5px 0 0 0' }}>{payroll.worker?.firstName} {payroll.worker?.lastName}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        {error && <div style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(231, 76, 60, 0.3)' }}>{error}</div>}

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Earnings</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ccc' }}>
            <span>{payroll.worker?.rateType === 'MONTHLY_SALARY' ? 'Monthly Rate' : payroll.worker?.rateType === 'HOURLY_RATE' ? 'Hourly Rate' : 'Daily Rate'}</span>
            <span>₱{(payroll.worker?.rateType === 'MONTHLY_SALARY' ? payroll.worker?.basicMonthlySalary : payroll.worker?.rateType === 'HOURLY_RATE' ? payroll.worker?.hourlyRate : payroll.worker?.dailyRate)?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ccc' }}>
            <span>Days Worked</span>
            <span>{daysWorked} days</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#fff' }}>
            <span>Basic Pay</span>
            <span>₱{payroll.basicPay?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#fff' }}>
            <span>Overtime Pay</span>
            <span>₱{payroll.overtimePay?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)', color: '#00ffa3', fontWeight: 'bold' }}>
            <span>Gross Pay</span>
            <span>₱{payroll.grossPay?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deductions</h3>
          {payroll.sssDeduction > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ffcccb' }}>
              <span>SSS Contribution</span>
              <span>- ₱{payroll.sssDeduction?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {payroll.philhealthDeduction > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ffcccb' }}>
              <span>PhilHealth</span>
              <span>- ₱{payroll.philhealthDeduction?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {payroll.pagibigDeduction > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ffcccb' }}>
              <span>Pag-IBIG</span>
              <span>- ₱{payroll.pagibigDeduction?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {payroll.withholdingTax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ffcccb' }}>
              <span>Withholding Tax (BIR)</span>
              <span>- ₱{payroll.withholdingTax?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {payroll.cashAdvance > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ffcccb' }}>
              <span>Cash Advance</span>
              <span>- ₱{payroll.cashAdvance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          {payroll.loanDeduction > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ffcccb' }}>
              <span>Loan Installment</span>
              <span>- ₱{payroll.loanDeduction?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)', color: '#ff6b6b', fontWeight: 'bold' }}>
            <span>Total Deductions</span>
            <span>- ₱{payroll.totalDeductions?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(46, 204, 113, 0.1)', border: '1px solid rgba(46, 204, 113, 0.3)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
          <span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Net Take Home Pay</span>
          <span style={{ color: '#2ecc71', fontSize: '1.5rem', fontWeight: 'bold' }}>₱{payroll.netPay?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
          <details style={{ cursor: 'pointer' }}>
            <summary style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', outline: 'none', fontWeight: 'bold' }}>
              View Attendance Records ({workerDtrs.length} days logged)
            </summary>
            <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {workerDtrs.length === 0 ? (
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No attendance records found.</span>
              ) : workerDtrs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem', color: '#ddd' }}>
                  <span>{new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span>Reg: {d.regularHours}h {d.overtimeHours > 0 && `| OT: ${d.overtimeHours}h`}</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        {!explanation ? (
          <div style={{ display: 'flex', gap: '15px' }}>
            <button 
              onClick={handleExplain}
              disabled={isExplaining}
              style={{ flex: 1, background: 'linear-gradient(90deg, #9b59b6, #8e44ad)', color: '#fff', border: 'none', padding: '15px', borderRadius: '12px', cursor: isExplaining ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(155, 89, 182, 0.3)', transition: 'all 0.2s', opacity: isExplaining ? 0.7 : 1 }}
            >
              {isExplaining ? '🤖 AI is analyzing...' : '✨ Explain Payslip with AI'}
            </button>
            <button 
              onClick={() => window.open(`/payroll/${payroll.payrollPeriodId}/print?type=payslip&workerId=${payroll.workerId}`, '_blank')}
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', padding: '15px 25px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s' }}
              onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--text-primary)'; }} 
              onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
            >
              🖨️ Print
            </button>
          </div>
        ) : (
          <div style={{ background: 'linear-gradient(180deg, rgba(155, 89, 182, 0.1) 0%, rgba(142, 68, 173, 0.05) 100%)', border: '1px solid rgba(155, 89, 182, 0.3)', borderRadius: '12px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#d2b4de', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>✨</span> AI Explanation
            </h4>
            <div style={{ color: '#fff', fontSize: '0.95rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {/* Replace markdown bold with strong tags manually for this simple view */}
              {explanation.split('**').map((text, i) => i % 2 === 1 ? <strong key={i} style={{ color: '#fff' }}>{text}</strong> : <span key={i} style={{ color: 'var(--text-secondary)' }}>{text}</span>)}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
