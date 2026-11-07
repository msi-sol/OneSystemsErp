'use client';

import { useState } from 'react';
import { logPettyCashExpense } from '../../actions/pettyCashActions';
import { submitAIOverrideRequest } from '../../actions/aiOverrideActions';
import { useRouter } from 'next/navigation';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Format in local time; toISOString() shifts to UTC and stores the previous day in UTC+8.
const toLocalDateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function LogPCExpenseModal({ account, users, onClose }: { account: any, users: any[], onClose: () => void }) {
  const router = useRouter();
  
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [payee, setPayee] = useState('');
  const [purpose, setPurpose] = useState('');
  const [category, setCategory] = useState('MATERIALS');
  const [netAmount, setNetAmount] = useState<number | ''>('');
  const [isVat, setIsVat] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [isNoReceipt, setIsNoReceipt] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  
  const [createGeneralExpense, setCreateGeneralExpense] = useState(true);
  const [issuedById, setIssuedById] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationLogId, setValidationLogId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSuccess, setOverrideSuccess] = useState(false);

  const numNet = Number(netAmount) || 0;
  const vatAmount = isVat ? numNet * 0.12 : 0;
  const totalAmount = numNet + vatAmount;

  const handleSubmit = async () => {
    if (!payee || !purpose || !netAmount) {
      setError('Please fill in required fields (Payee, Purpose, Net Amount).');
      return;
    }
    if (isNoReceipt && !remarks) {
      setError('Please provide an explanation in the remarks field since no receipt is available.');
      return;
    }
    if (totalAmount > account.currentBalance) {
      setError('Insufficient petty cash balance for this amount.');
      return;
    }

    setLoading(true);
    const res = await logPettyCashExpense({
      accountId: account.id,
      date: new Date(date),
      payee,
      purpose,
      category,
      amount: totalAmount,
      isVat,
      netAmount: numNet,
      vatAmount,
      billingEligibility: 'BILLABLE',
      receiptNumber: isNoReceipt ? undefined : receiptNumber,
      isNoReceipt,
      remarks: isNoReceipt ? remarks : undefined,
      attachmentUrl: attachment ? URL.createObjectURL(attachment) : undefined, // Stub for now until actual upload logic
      createGeneralExpense,
      projectId: account.projectId,
      issuedById: createGeneralExpense ? issuedById : undefined
    });

    if (res.success) {
      router.refresh();
      onClose();
    } else {
      setError(res.error || 'Failed to log expense');
      setValidationLogId(res.validationLogId || null);
      setLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!validationLogId || !overrideReason) return;
    setLoading(true);
    const res = await submitAIOverrideRequest({
      validationLogId,
      transactionId: 'PENDING_OVERRIDE',
      moduleName: 'Petty Cash',
      overriddenBy: 'user-stub', // Use actual session later
      overriddenByRole: 'USER',
      overrideReason
    });
    
    if (res.success) {
      setOverrideSuccess(true);
      setError('Override Request Submitted! A Project Director must approve it before this expense can be logged.');
      setValidationLogId(null);
    } else {
      setError(res.error || 'Failed to submit override');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)', padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-dark, #1a1a2e)',
        borderRadius: '16px',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '30px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{ margin: '0 0 5px 0', color: 'var(--accent-color)' }}>Log Petty Cash Expense</h2>
        <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '20px' }}>
          Available Balance: <strong style={{ color: '#fff' }}>₱ {account.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
        
        {error && (
          <div style={{ background: 'rgba(255,50,50,0.1)', color: '#ff6b6b', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid rgba(255,50,50,0.3)' }}>
            <div style={{ fontWeight: 600, marginBottom: '5px' }}>{error}</div>
            
            {validationLogId && !overrideSuccess && (
              <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <div style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '10px' }}>Apply for AI Exception Override:</div>
                <textarea 
                  value={overrideReason} 
                  onChange={e => setOverrideReason(e.target.value)} 
                  placeholder="Justification for bypassing policy..."
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#111', color: '#fff', border: '1px solid #444', marginBottom: '10px' }}
                />
                <button 
                  onClick={handleOverride}
                  disabled={loading || !overrideReason}
                  style={{ padding: '8px 16px', background: '#ffd43b', color: '#000', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Submit Override to Director
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Date *</label>
            <div style={{ position: 'relative' }}>
              <DatePicker 
                selected={date ? new Date(date) : new Date()} 
                onChange={(d: Date | null) => setDate(d ? toLocalDateString(d) : '')} 
                dateFormat="MMMM d, yyyy"
                wrapperClassName="date-picker-wrapper"
                className="custom-datepicker-input"
              />
            </div>
            <style jsx global>{`
              .date-picker-wrapper {
                width: 100%;
              }
              .custom-datepicker-input {
                width: 100%;
                padding: 10px;
                border-radius: 6px;
                background-color: #16213e;
                color: #fff;
                border: 1px solid var(--glass-border);
                font-family: inherit;
              }
              .react-datepicker {
                background-color: #1a1a2e;
                border: 1px solid var(--glass-border);
                color: #fff;
                font-family: inherit;
              }
              .react-datepicker__header {
                background-color: #16213e;
                border-bottom: 1px solid var(--glass-border);
              }
              .react-datepicker__current-month, .react-datepicker-time__header, .react-datepicker-year-header {
                color: #fff;
              }
              .react-datepicker__day-name, .react-datepicker__day, .react-datepicker__time-name {
                color: #ddd;
              }
              .react-datepicker__day:hover, .react-datepicker__month-text:hover, .react-datepicker__quarter-text:hover, .react-datepicker__year-text:hover {
                background-color: var(--accent-color);
                color: #000;
              }
              .react-datepicker__day--selected, .react-datepicker__day--in-selecting-range, .react-datepicker__day--in-range, .react-datepicker__month-text--selected, .react-datepicker__month-text--in-selecting-range, .react-datepicker__month-text--in-range, .react-datepicker__quarter-text--selected, .react-datepicker__quarter-text--in-selecting-range, .react-datepicker__quarter-text--in-range, .react-datepicker__year-text--selected, .react-datepicker__year-text--in-selecting-range, .react-datepicker__year-text--in-range {
                background-color: var(--accent-color);
                color: #000;
              }
              .react-datepicker__day--keyboard-selected {
                background-color: rgba(0, 255, 163, 0.2);
                color: #fff;
              }
            `}</style>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Category *</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }}>
              <option value="MATERIALS">Materials</option>
              <option value="CONSUMABLES">Consumables</option>
              <option value="RENTAL">Rental</option>
              <option value="OVERHEAD">Overhead</option>
              <option value="FUEL">Fuel</option>
              <option value="MEALS">Meals</option>
              <option value="TOLL">Toll / Parking</option>
              <option value="REPRESENTATION">Representation</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Payee / Supplier *</label>
            <input type="text" value={payee} onChange={e => setPayee(e.target.value)} placeholder="e.g. Shell Station" style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Purpose / Description *</label>
            <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2} style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }} />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Net Amount (₱) *</label>
            <input type="number" step="0.01" value={netAmount} onChange={e => setNetAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="0.00" style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: '25px', opacity: isNoReceipt ? 0.5 : 1 }}>
            <input 
              type="checkbox" 
              id="isVat" 
              checked={isVat} 
              onChange={e => setIsVat(e.target.checked)} 
              disabled={isNoReceipt}
              style={{ marginRight: '10px', transform: 'scale(1.2)', cursor: isNoReceipt ? 'not-allowed' : 'pointer' }} 
            />
            <label htmlFor="isVat" style={{ color: '#fff', cursor: isNoReceipt ? 'not-allowed' : 'pointer' }}>Apply 12% VAT?</label>
          </div>

          <div style={{ gridColumn: '1 / -1', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', border: '1px dashed var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', color: '#aaa', fontSize: '0.9rem' }}>
              <span>Net Amount:</span>
              <span>₱ {numNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            {isVat && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', color: '#a855f7', fontSize: '0.9rem' }}>
                <span>12% VAT:</span>
                <span>+ ₱ {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div style={{ height: '1px', background: 'var(--glass-border)', margin: '10px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold' }}>Calculated Total Amount:</span>
              <strong style={{ fontSize: '1.2rem', color: totalAmount > account.currentBalance ? '#ff6b6b' : 'var(--accent-color)' }}>
                ₱ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Receipt / OR No.</label>
            <input type="text" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} disabled={isNoReceipt} style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: isNoReceipt ? 'rgba(255,255,255,0.05)' : '#16213e', color: isNoReceipt ? '#666' : '#fff', border: '1px solid var(--glass-border)' }} />
            <div style={{ marginTop: '5px' }}>
              <input type="checkbox" id="noReceipt" checked={isNoReceipt} onChange={e => {
                const checked = e.target.checked;
                setIsNoReceipt(checked);
                if (checked) {
                  setReceiptNumber('');
                  setAttachment(null);
                  setIsVat(false);
                }
              }} /> <label htmlFor="noReceipt" style={{ fontSize: '0.8rem', color: '#aaa', cursor: 'pointer' }}>No Receipt Available</label>
            </div>
          </div>

          {!isNoReceipt ? (
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Upload Proof (Image/PDF)</label>
              <input type="file" accept="image/*,.pdf" onChange={e => setAttachment(e.target.files?.[0] || null)} style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }} />
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#ff6b6b', fontSize: '0.85rem' }}>Explanation / Remarks *</label>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Please explain why there is no receipt..." rows={2} style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(255,107,107,0.05)', color: '#fff', border: '1px solid rgba(255,107,107,0.3)' }} />
            </div>
          )}

          {account.projectId && (
            <div style={{ gridColumn: '1 / -1', marginTop: '10px', padding: '15px', borderTop: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <input type="checkbox" id="createGenExp" checked={createGeneralExpense} onChange={e => setCreateGeneralExpense(e.target.checked)} style={{ marginRight: '10px' }} />
                <label htmlFor="createGenExp" style={{ color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>Sync to Project General Ledger</label>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#aaa', margin: '0 0 10px 0', paddingLeft: '24px' }}>Check this if this expense should be billed to the project costs.</p>
              
              {createGeneralExpense && (
                <div style={{ paddingLeft: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#aaa', fontSize: '0.85rem' }}>Issued By *</label>
                  <select value={issuedById} onChange={e => setIssuedById(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }}>
                    <option value="">-- Select Issuer --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={loading} style={{ flex: 1, padding: '12px', background: 'var(--accent-color)', border: 'none', color: '#000', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Logging...' : 'Log Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
