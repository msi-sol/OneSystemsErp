'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { logDirectExpense, getConsolidatedItemsForProject } from '@/app/actions/financeActions';
import { useRouter } from 'next/navigation';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface Props {
  projects: { id: string; name: string }[];
  users: { id: string; name: string | null }[];
  onClose: () => void;
}

// Format in local time; toISOString() shifts to UTC and stores the previous day in UTC+8.
const toLocalDateString = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function LogExpenseModal({ projects, users, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [boqItems, setBoqItems] = useState<any[]>([]);
  const [selectedBoqItemId, setSelectedBoqItemId] = useState('');
  const [isBoqDropdownOpen, setIsBoqDropdownOpen] = useState(false);
  const [boqSearchQuery, setBoqSearchQuery] = useState('');

  const [voucherNo, setVoucherNo] = useState('');
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [category, setCategory] = useState('MATERIALS');
  const [description, setDescription] = useState('');
  const [issuedById, setIssuedById] = useState(users[0]?.id || '');
  const [supplierName, setSupplierName] = useState('');
  const [netAmount, setNetAmount] = useState<number | ''>('');
  const [isVat, setIsVat] = useState(false);
  const [isAccrued, setIsAccrued] = useState(false);

  const [loggingMode, setLoggingMode] = useState<'SINGLE' | 'ITEMIZED'>('SINGLE');

  const [breakdowns, setBreakdowns] = useState<Array<{
    id: string;
    description: string;
    quantity: number | '';
    unit: string;
    unitPrice: number | '';
    supplierName: string;
    isVat: boolean;
  }>>([]);

  function handleAddRow() {
    setBreakdowns(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        description: '',
        quantity: 1,
        unit: 'pcs',
        unitPrice: 0,
        supplierName: supplierName || '',
        isVat: isVat
      }
    ]);
  }

  function updateRow(id: string, field: string, value: any) {
    setBreakdowns(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  }

  function removeRow(id: string) {
    setBreakdowns(prev => prev.filter(row => row.id !== id));
  }

  const [error, setError] = useState('');

  useEffect(() => {
    if (projectId) {
      getConsolidatedItemsForProject(projectId).then(items => {
        setBoqItems(items);
        setSelectedBoqItemId('');
        setBreakdowns([]);
      });
    }
  }, [projectId]);

  const selectedItem = boqItems.find(i => i.id === selectedBoqItemId);
  const isLot = selectedItem ? (selectedItem.unit?.toLowerCase().includes('lot') || false) : false;

  // Auto-switch to single mode if project changes or no specific item is needed
  useEffect(() => {
    if (boqItems.length > 0) {
      if (isLot && breakdowns.length === 0) {
        setLoggingMode('SINGLE');
      }
    }
  }, [isLot, breakdowns.length, boqItems.length]);

  const breakdownTotal = breakdowns.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);

  const effectiveNetAmount = loggingMode === 'ITEMIZED' ? breakdownTotal : (typeof netAmount === 'number' ? netAmount : 0);
  const calculatedVat = isVat ? effectiveNetAmount * 0.12 : 0;
  const calculatedTotal = effectiveNetAmount + calculatedVat;

  function handleSubmit() {
    setError('');

    if (!voucherNo || !date || !description || (loggingMode === 'SINGLE' && !supplierName) || (loggingMode === 'SINGLE' && netAmount === '')) {
      setError('Please fill out all required fields.');
      return;
    }

    if (loggingMode === 'ITEMIZED') {
      if (breakdowns.length === 0) {
        setError('Please add at least one item to the breakdown.');
        return;
      }
      if (breakdowns.some(b => !b.description || !b.supplierName)) {
        setError('Please provide description and supplier for all breakdown items.');
        return;
      }
    }

    startTransition(async () => {
      try {
        const payload: any = {
          projectId,
          voucherNo,
          date,
          category,
          description,
          issuedById,
          supplierName: loggingMode === 'ITEMIZED' 
            ? (breakdowns.length > 0 && breakdowns.every(b => b.supplierName === breakdowns[0].supplierName) ? breakdowns[0].supplierName : 'Multiple Suppliers') 
            : supplierName,
          netAmount: effectiveNetAmount,
          vatAmount: calculatedVat,
          isAccrued,
          breakdowns: loggingMode === 'ITEMIZED' ? breakdowns.map(b => ({
            description: b.description,
            quantity: Number(b.quantity) || 0,
            unit: b.unit,
            unitPrice: Number(b.unitPrice) || 0,
            supplierName: b.supplierName,
            isVat: b.isVat
          })) : []
        };
        
        if (selectedBoqItemId) {
          payload.consolidatedBoqItemId = selectedBoqItemId;
        }

        await logDirectExpense(payload);
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to log expense');
      }
    });
  }

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
        maxWidth: '1100px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '20px 30px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'linear-gradient(135deg, rgba(0,255,163,0.08), transparent)',
        }}>
          <h2 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1.3rem' }}>
            💸 Log Direct Expense
          </h2>
        </div>

        <div style={{ padding: '20px 30px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Project *</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Link to BOQ Item (Optional)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div 
                  onClick={() => setIsBoqDropdownOpen(!isBoqDropdownOpen)}
                  style={{ 
                    flex: 1, padding: '8px 12px', borderRadius: '6px', backgroundColor: '#16213e', 
                    color: selectedItem ? '#fff' : '#aaa', border: '1px solid var(--glass-border)', cursor: 'pointer',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}
                >
                  {selectedItem ? `${selectedItem.itemCode || '-'} | ${selectedItem.category || 'Uncategorized'} - ${selectedItem.description}` : '-- Select a BOQ Item --'}
                </div>
                {selectedItem && (
                  <button type="button" onClick={() => setSelectedBoqItemId('')} style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'transparent', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>

              {isBoqDropdownOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '5px', width: '800px', maxWidth: '90vw',
                  backgroundColor: '#1a1a2e', border: '1px solid var(--glass-border)', borderRadius: '8px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.8)', zIndex: 10000,
                  display: 'flex', flexDirection: 'column', maxHeight: '450px'
                }}>
                  <div style={{ padding: '10px', borderBottom: '1px solid var(--glass-border)' }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search by code, category, or description..."
                      value={boqSearchQuery}
                      onChange={e => setBoqSearchQuery(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)',
                        backgroundColor: '#16213e', color: '#fff', fontSize: '0.9rem'
                      }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', color: '#fff' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0f172a', zIndex: 1 }}>
                        <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#aaa' }}>Code</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#aaa' }}>Category</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#aaa' }}>Description</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', color: '#aaa' }}>Unit</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', color: '#aaa' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boqItems
                          .filter(item => 
                            item.itemCode?.toLowerCase().includes(boqSearchQuery.toLowerCase()) || 
                            item.description?.toLowerCase().includes(boqSearchQuery.toLowerCase()) ||
                            item.category?.toLowerCase().includes(boqSearchQuery.toLowerCase())
                          )
                          .map(item => (
                            <tr 
                              key={item.id}
                              onClick={() => {
                                setSelectedBoqItemId(item.id);
                                setIsBoqDropdownOpen(false);
                                setBoqSearchQuery('');
                              }}
                              style={{ 
                                borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
                                backgroundColor: selectedBoqItemId === item.id ? 'rgba(0,255,163,0.1)' : 'transparent'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedBoqItemId === item.id ? 'rgba(0,255,163,0.1)' : 'transparent'}
                            >
                              <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{item.itemCode || '-'}</td>
                              <td style={{ padding: '8px 10px', color: '#aaa' }}>{item.category || '-'}</td>
                              <td style={{ padding: '8px 10px' }}>{item.description}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', color: '#aaa' }}>{item.unit || '-'}</td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <button style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--accent-color)', background: 'transparent', color: 'var(--accent-color)', fontSize: '0.7rem', cursor: 'pointer' }}>
                                  Select
                                </button>
                              </td>
                            </tr>
                          ))
                        }
                        {boqItems.filter(item => item.itemCode?.toLowerCase().includes(boqSearchQuery.toLowerCase()) || item.description?.toLowerCase().includes(boqSearchQuery.toLowerCase()) || item.category?.toLowerCase().includes(boqSearchQuery.toLowerCase())).length === 0 && (
                          <tr>
                            <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>No matching items</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Voucher / Ref No. *</label>
              <input type="text" value={voucherNo} onChange={e => setVoucherNo(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Date *</label>
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
                  padding: 8px;
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
                .react-datepicker__day--selected, .react-datepicker__day--in-selecting-range, .react-datepicker__day--in-range {
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
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }}>
                <option value="MATERIALS">Materials</option>
                <option value="RENTAL">Rental</option>
                <option value="CONSUMABLES">Consumables</option>
                <option value="OVERHEAD">Overhead</option>
                <option value="SUBCONTRACT">Subcontract</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Issued By</label>
              <select value={issuedById} onChange={e => setIssuedById(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Supplier / Vendor *</label>
              <input 
                type="text" 
                value={loggingMode === 'ITEMIZED' ? 'Multiple / Itemized Suppliers' : supplierName} 
                onChange={e => setSupplierName(e.target.value)} 
                placeholder="e.g. ABC Hardware" 
                disabled={loggingMode === 'ITEMIZED'}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  borderRadius: '6px', 
                  backgroundColor: loggingMode === 'ITEMIZED' ? 'rgba(255,255,255,0.05)' : '#16213e', 
                  color: loggingMode === 'ITEMIZED' ? '#64748b' : '#fff', 
                  border: '1px solid var(--glass-border)',
                  cursor: loggingMode === 'ITEMIZED' ? 'not-allowed' : 'text'
                }} 
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#16213e', color: '#fff', border: '1px solid var(--glass-border)' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px', padding: '15px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Net Amount *</label>
              <input 
                type="number" 
                step="0.01" 
                value={loggingMode === 'ITEMIZED' ? breakdownTotal : netAmount} 
                onChange={e => setNetAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} 
                disabled={loggingMode === 'ITEMIZED'}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  borderRadius: '6px', 
                  backgroundColor: loggingMode === 'ITEMIZED' ? 'rgba(255,255,255,0.05)' : '#16213e', 
                  color: loggingMode === 'ITEMIZED' ? '#64748b' : '#fff', 
                  border: '1px solid var(--glass-border)',
                  cursor: loggingMode === 'ITEMIZED' ? 'not-allowed' : 'text'
                }} 
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '25px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#fff' }}>
                <input type="checkbox" checked={isVat} onChange={e => setIsVat(e.target.checked)} />
                Add 12% VAT
              </label>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', color: '#aaa' }}>Total Amount</label>
              <div style={{ padding: '8px', backgroundColor: '#0f172a', borderRadius: '6px', color: '#4ade80', fontWeight: 'bold' }}>
                ₱ {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '20px', display: 'flex', gap: '20px', padding: '10px 15px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: loggingMode === 'SINGLE' ? '#4ade80' : '#aaa' }}>
              <input type="radio" name="logMode" checked={loggingMode === 'SINGLE'} onChange={() => setLoggingMode('SINGLE')} />
              Log as Single Item (1 Lot)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: loggingMode === 'ITEMIZED' ? '#4ade80' : '#aaa' }}>
              <input type="radio" name="logMode" checked={loggingMode === 'ITEMIZED'} onChange={() => setLoggingMode('ITEMIZED')} />
              Provide Itemized Breakdown (Multi-Supplier)
            </label>
          </div>

          {loggingMode === 'ITEMIZED' && (
            <div style={{ marginBottom: '20px', border: '1px solid var(--glass-border)', padding: '15px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: 'var(--accent-color)' }}>Detailed Item Breakdown</h4>
                <button type="button" onClick={handleAddRow}
                  style={{ background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                  + Add Row
                </button>
              </div>
              
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '5px' }}>Description</th>
                    <th style={{ textAlign: 'left', padding: '5px' }}>Qty</th>
                    <th style={{ textAlign: 'left', padding: '5px' }}>Unit</th>
                    <th style={{ textAlign: 'left', padding: '5px' }}>Unit Price</th>
                    <th style={{ textAlign: 'left', padding: '5px' }}>Supplier / Vendor</th>
                    <th style={{ textAlign: 'left', padding: '5px' }}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {breakdowns.map((bd) => (
                    <tr key={bd.id}>
                      <td style={{ padding: '2px' }}><input type="text" value={bd.description} onChange={e => updateRow(bd.id, 'description', e.target.value)} style={{ width: '100%', padding: '4px', background: '#16213e', border: '1px solid var(--glass-border)', color: '#fff' }} /></td>
                      <td style={{ padding: '2px', width: '60px' }}><input type="number" value={bd.quantity} onChange={e => updateRow(bd.id, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value))} style={{ width: '100%', padding: '4px', background: '#16213e', border: '1px solid var(--glass-border)', color: '#fff' }} /></td>
                      <td style={{ padding: '2px', width: '60px' }}><input type="text" value={bd.unit} onChange={e => updateRow(bd.id, 'unit', e.target.value)} style={{ width: '100%', padding: '4px', background: '#16213e', border: '1px solid var(--glass-border)', color: '#fff' }} /></td>
                      <td style={{ padding: '2px', width: '80px' }}><input type="number" value={bd.unitPrice} onChange={e => updateRow(bd.id, 'unitPrice', e.target.value === '' ? '' : parseFloat(e.target.value))} style={{ width: '100%', padding: '4px', background: '#16213e', border: '1px solid var(--glass-border)', color: '#fff' }} /></td>
                      <td style={{ padding: '2px', width: '150px' }}><input type="text" value={bd.supplierName} onChange={e => updateRow(bd.id, 'supplierName', e.target.value)} placeholder="Supplier" style={{ width: '100%', padding: '4px', background: '#16213e', border: '1px solid var(--glass-border)', color: '#fff' }} /></td>
                      <td style={{ padding: '2px', width: '80px' }}>{((Number(bd.quantity) || 0) * (Number(bd.unitPrice) || 0)).toLocaleString()}</td>
                      <td style={{ padding: '2px', width: '30px', textAlign: 'center' }}><button type="button" onClick={() => removeRow(bd.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#fff' }}>
            <input type="checkbox" checked={isAccrued} onChange={e => setIsAccrued(e.target.checked)} />
            Mark as Accrued Expense (Post-dated / Not yet paid)
          </label>

        </div>

        <div style={{ padding: '15px 30px', borderTop: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--bg-secondary, #16213e)' }}>
          <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem', maxWidth: '60%' }}>
            {error}
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button type="button" onClick={onClose} disabled={isPending} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'transparent', color: '#fff', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={isPending} style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--accent-color)', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
              {isPending ? 'Saving...' : 'Log Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
