'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addSupplierQuotation, updateSupplierQuotation, autoGeneratePOFromCanvass, sendCanvassEmail, approveCanvassRecommendation, endorseCanvassRecommendation } from '@/app/actions/canvass';
import { uploadAndAnalyzeQuotationsBulk } from '@/app/actions/aiQuotationActions';
import PrintableCanvass from './PrintableCanvass';

export default function CanvassClientTabs({ canvass, suppliers }: { canvass: any, suppliers: any[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'QUOTATIONS' | 'AI_COMPARISON'>('ITEMS');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingPO, setIsGeneratingPO] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isEndorsing, setIsEndorsing] = useState(false);

  const handleEndorse = async () => {
    setIsEndorsing(true);
    const res = await endorseCanvassRecommendation(canvass.id);
    if (res.success) {
      alert('AI Recommendation Endorsed!');
      router.refresh();
    } else {
      alert(res.error);
    }
    setIsEndorsing(false);
  };

  const handleApprove = async () => {
    setIsApproving(true);
    const res = await approveCanvassRecommendation(canvass.id);
    if (res.success) {
      alert('AI Recommendation Approved!');
      router.refresh();
    } else {
      alert(res.error);
    }
    setIsApproving(false);
  };

  // Form states for new quotation
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [editQuotationId, setEditQuotationId] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [quoteItems, setQuoteItems] = useState<Record<string, { unitCost: number, quantityAvailable: number }>>({});
  
  // Print & Email states
  const [showPrint, setShowPrint] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSelectedSuppliers, setEmailSelectedSuppliers] = useState<string[]>([]);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Upload AI states
  const [showUploadAIModal, setShowUploadAIModal] = useState(false);
  const [uploadAIFiles, setUploadAIFiles] = useState<File[]>([]);
  const [uploadAIResults, setUploadAIResults] = useState<any[] | null>(null);
  const [isUploadingAI, setIsUploadingAI] = useState(false);

  const handleRunAI = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/ai/compare-quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvassId: canvass.id })
      });
      const data = await res.json();
      if (data.success) {
        router.refresh();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Error running AI comparison');
    }
    setIsAnalyzing(false);
  };

  const handleSubmitQuotation = async () => {
    if (!selectedSupplier) return alert('Select a supplier');
    
    const items = canvass.items.map((item: any) => ({
      canvassItemId: item.id,
      unitCost: quoteItems[item.id]?.unitCost || 0,
      quantityAvailable: quoteItems[item.id]?.quantityAvailable || item.quantityRequired
    }));

    const res = editQuotationId 
      ? await updateSupplierQuotation(canvass.id, editQuotationId, selectedSupplier, items)
      : await addSupplierQuotation(canvass.id, selectedSupplier, items);

    if (res.success) {
      setShowAddQuote(false);
      setEditQuotationId(null);
      setQuoteItems({});
      setSelectedSupplier('');
      router.refresh();
    } else {
      alert(res.error);
    }
  };

  const handleEditQuotation = (q: any) => {
    setEditQuotationId(q.id);
    setSelectedSupplier(q.supplierId);
    
    const initialQuoteItems: Record<string, { unitCost: number, quantityAvailable: number }> = {};
    q.items.forEach((item: any) => {
      initialQuoteItems[item.canvassItemId] = {
        unitCost: item.unitCost,
        quantityAvailable: item.quantityAvailable
      };
    });
    setQuoteItems(initialQuoteItems);
    setShowAddQuote(true);
    // Scroll to top to see form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSendEmail = async () => {
    if (emailSelectedSuppliers.length === 0) return alert('Please select at least one supplier to email.');
    setIsSendingEmail(true);
    const res = await sendCanvassEmail(canvass.id, emailSelectedSuppliers);
    if (res.success) {
      alert(res.message);
      setShowEmailModal(false);
      setEmailSelectedSuppliers([]);
    } else {
      alert(res.error);
    }
    setIsSendingEmail(false);
  };

  const handleUploadAI = async () => {
    if (uploadAIFiles.length === 0) return alert('Please select quotation files to upload.');

    setIsUploadingAI(true);
    setUploadAIResults(null);
    const formData = new FormData();
    uploadAIFiles.forEach(f => formData.append('files', f));

    const res = await uploadAndAnalyzeQuotationsBulk(canvass.id, formData);
    if (res.success) {
      setUploadAIResults(res.results as any || []);
      router.refresh(); 
    } else {
      alert(res.error);
    }
    setIsUploadingAI(false);
  };

  const handleGeneratePO = async () => {
    if (!canvass.recommendedSupplierId) return alert('No recommended supplier selected');
    setIsGeneratingPO(true);
    const res = await autoGeneratePOFromCanvass(canvass.id, canvass.recommendedSupplierId);
    if (res.success) {
      alert('Purchase Order Draft Generated Successfully!');
      router.push(`/procurement/purchase-orders/${res.poId}`);
    } else {
      alert(res.error);
      setIsGeneratingPO(false);
    }
  };

  return (
    <div className="glass-card" style={{ marginTop: '20px' }}>
      {showPrint && <PrintableCanvass canvass={canvass} onClose={() => setShowPrint(false)} />}
      
      {showEmailModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#1e1e2e', padding: '30px', borderRadius: '12px', width: '500px', border: '1px solid var(--glass-border)', color: '#fff' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--accent-color)' }}>📧 Send Canvass via Email</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>Select suppliers to send this canvass request to:</p>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <div style={{ marginBottom: '10px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold' }}>
                  <input 
                    type="checkbox" 
                    style={{ marginRight: '10px', transform: 'scale(1.2)' }}
                    checked={emailSelectedSuppliers.length === suppliers.length && suppliers.length > 0}
                    onChange={(e) => setEmailSelectedSuppliers(e.target.checked ? suppliers.map(s => s.id) : [])}
                  />
                  Select All Suppliers
                </label>
              </div>
              {suppliers.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    style={{ marginRight: '10px', transform: 'scale(1.2)' }}
                    checked={emailSelectedSuppliers.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) setEmailSelectedSuppliers([...emailSelectedSuppliers, s.id]);
                      else setEmailSelectedSuppliers(emailSelectedSuppliers.filter(id => id !== s.id));
                    }}
                  />
                  {s.name} {s.email ? `(${s.email})` : '(No Email)'}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowEmailModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSendEmail} disabled={isSendingEmail} style={{ padding: '8px 16px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '4px', cursor: isSendingEmail ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {isSendingEmail ? 'Sending...' : 'Send Emails'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadAIModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#1e1e2e', padding: '30px', borderRadius: '12px', width: '550px', border: '1px solid var(--glass-border)', color: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🤖 Bulk Upload Quotations (AI Extract)
            </h3>
            
            {!uploadAIResults ? (
              <>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Upload scanned PDFs or images of the suppliers' quotations. Our AI will automatically identify the supplier, cross-reference the items, tabulate the costs, and reject any that contain mismatched items.
                </p>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Quotation Files (Multiple Allowed)</label>
                  <input 
                    type="file" 
                    multiple
                    accept="application/pdf,image/*"
                    onChange={(e) => setUploadAIFiles(Array.from(e.target.files || []))}
                    style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--glass-border)', borderRadius: '4px' }}
                  />
                  {uploadAIFiles.length > 0 && (
                     <p style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--accent-color)' }}>
                       {uploadAIFiles.length} file(s) selected.
                     </p>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button onClick={() => { setShowUploadAIModal(false); setUploadAIFiles([]); }} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleUploadAI} disabled={isUploadingAI || uploadAIFiles.length === 0} style={{ padding: '8px 16px', background: 'var(--accent-color)', border: 'none', color: '#000', borderRadius: '4px', cursor: (isUploadingAI || uploadAIFiles.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    {isUploadingAI ? '🤖 AI Engine Processing...' : 'Upload & Extract Bulk'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h4 style={{ color: '#fff', marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>AI Extraction Results</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {uploadAIResults.map((result, idx) => (
                    <div key={idx} style={{ 
                      padding: '12px', 
                      borderRadius: '8px', 
                      background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      border: `1px solid ${result.success ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{result.success ? '✅ ' : '❌ '}{result.fileName}</span>
                        {result.success && <span style={{ color: '#10b981' }}>{result.supplierName}</span>}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        {result.success ? result.message : result.error}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowUploadAIModal(false); setUploadAIFiles([]); setUploadAIResults(null); }} style={{ padding: '8px 16px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          onClick={() => setActiveTab('ITEMS')}
          style={{
            background: activeTab === 'ITEMS' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
            border: activeTab === 'ITEMS' ? '1px solid var(--accent-color)' : '1px solid transparent',
            color: activeTab === 'ITEMS' ? 'var(--accent-color)' : 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '4px', cursor: 'pointer'
          }}>Canvassed Items</button>
        <button 
          onClick={() => setActiveTab('QUOTATIONS')}
          style={{
            background: activeTab === 'QUOTATIONS' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
            border: activeTab === 'QUOTATIONS' ? '1px solid var(--accent-color)' : '1px solid transparent',
            color: activeTab === 'QUOTATIONS' ? 'var(--accent-color)' : 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '4px', cursor: 'pointer'
          }}>Supplier Quotations ({canvass.quotations.length})</button>
        <button 
          onClick={() => setActiveTab('AI_COMPARISON')}
          style={{
            background: activeTab === 'AI_COMPARISON' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
            border: activeTab === 'AI_COMPARISON' ? '1px solid #a855f7' : '1px solid transparent',
            color: activeTab === 'AI_COMPARISON' ? '#e9d5ff' : 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '4px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
          🤖 AI Tabulation & Summary
        </button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {canvass.status === 'DRAFT' && canvass.recommendedSupplierId && (
            <button 
              onClick={handleEndorse}
              disabled={isEndorsing}
              style={{
                background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 'bold',
                padding: '8px 16px', borderRadius: '4px', cursor: isEndorsing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
              {isEndorsing ? 'Endorsing...' : '✍️ Endorse'}
            </button>
          )}
          {canvass.status === 'ENDORSED' && (
            <button 
              onClick={handleApprove}
              disabled={isApproving}
              style={{
                background: '#10b981', border: 'none', color: '#fff', fontWeight: 'bold',
                padding: '8px 16px', borderRadius: '4px', cursor: isApproving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
              {isApproving ? 'Approving...' : '✅ Approve'}
            </button>
          )}
          {(canvass.status === 'APPROVED' || canvass.status === 'COMPLETED') && (
            <button 
              onClick={handleGeneratePO}
              disabled={isGeneratingPO || canvass.status === 'COMPLETED'}
              style={{
                background: canvass.status === 'COMPLETED' ? 'transparent' : 'var(--accent-color)',
                border: canvass.status === 'COMPLETED' ? '1px solid var(--accent-color)' : 'none',
                color: canvass.status === 'COMPLETED' ? 'var(--text-secondary)' : '#000',
                fontWeight: 'bold',
                padding: '8px 16px', borderRadius: '4px', cursor: (isGeneratingPO || canvass.status === 'COMPLETED') ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
              {isGeneratingPO ? 'Generating...' : (canvass.status === 'COMPLETED' ? 'PO Generated' : '📄 Generate PO')}
            </button>
          )}
          <button 
            onClick={() => setShowEmailModal(true)}
            style={{
              background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6',
              padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
            📧 Email Suppliers
          </button>
          <button 
            onClick={() => setShowPrint(true)}
            style={{
              background: 'var(--accent-color)', border: 'none', color: '#000', fontWeight: 'bold',
              padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
            🖨️ Print Form
          </button>
        </div>
      </div>

      {activeTab === 'ITEMS' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '8px' }}>Item Code</th>
              <th style={{ padding: '8px' }}>Description</th>
              <th style={{ padding: '8px' }}>Req. Quantity</th>
            </tr>
          </thead>
          <tbody>
            {canvass.items.map((item: any) => (
              <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 8px', color: '#fff' }}>{item.consolidatedBoqItem.itemCode}</td>
                <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{item.consolidatedBoqItem.description}</td>
                <td style={{ padding: '12px 8px' }}>{item.quantityRequired} {item.consolidatedBoqItem.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeTab === 'QUOTATIONS' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px', gap: '10px' }}>
            {canvass.status !== 'COMPLETED' && (
              <>
                <button 
                  onClick={() => setShowUploadAIModal(true)}
                  style={{
                    background: 'var(--accent-color)', color: '#000', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold'
                  }}>
                  🤖 Upload Quotation (AI Extract)
                </button>
                <button 
                  onClick={() => {
                    setShowAddQuote(!showAddQuote);
                    if (!showAddQuote) {
                      setEditQuotationId(null);
                      setSelectedSupplier('');
                      setQuoteItems({});
                    }
                  }}
                  style={{
                    background: 'transparent', color: 'var(--accent-color)', padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--accent-color)', cursor: 'pointer', fontWeight: 'bold'
                  }}>
                  {showAddQuote ? 'Cancel Encoding' : '+ Encode Quotation'}
                </button>
              </>
            )}
          </div>

          {showAddQuote && (
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--glass-border)' }}>
              <h4 style={{ margin: '0 0 15px 0', color: 'var(--accent-color)' }}>
                {editQuotationId ? 'Edit Supplier Quotation' : 'New Supplier Quotation'}
              </h4>
              <select 
                value={selectedSupplier} 
                onChange={e => setSelectedSupplier(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '15px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '4px' }}>
                <option value="">Select Supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '8px' }}>Item</th>
                    <th style={{ padding: '8px' }}>Req Qty</th>
                    <th style={{ padding: '8px' }}>Unit Cost (₱)</th>
                  </tr>
                </thead>
                <tbody>
                  {canvass.items.map((item: any) => (
                    <tr key={item.id}>
                      <td style={{ padding: '8px', color: '#fff' }}>{item.consolidatedBoqItem.description}</td>
                      <td style={{ padding: '8px' }}>{item.quantityRequired}</td>
                      <td style={{ padding: '8px' }}>
                        <input 
                          type="number" 
                          placeholder="0.00"
                          value={quoteItems[item.id]?.unitCost || ''}
                          onChange={e => setQuoteItems({ ...quoteItems, [item.id]: { ...quoteItems[item.id], unitCost: parseFloat(e.target.value) } })}
                          style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', borderRadius: '4px' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button onClick={handleSubmitQuotation} style={{ background: '#4ade80', color: '#000', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                {editQuotationId ? 'Update Quotation' : 'Submit Quotation'}
              </button>
            </div>
          )}

          {canvass.quotations.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No quotations received yet.</p>
          ) : (
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {canvass.quotations.map((q: any) => (
                <div key={q.id} style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: q.isRecommended ? '2px solid #a855f7' : '1px solid var(--glass-border)', 
                  padding: '15px', borderRadius: '8px', minWidth: '250px' 
                }}>
                  <h4 style={{ margin: '0 0 10px 0', color: q.isRecommended ? '#a855f7' : 'var(--text-primary)' }}>
                    {q.isRecommended && '⭐ '} {q.supplier.name}
                  </h4>
                  <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}>Total: <strong style={{ color: '#fff' }}>₱{q.totalAmount.toLocaleString()}</strong></p>
                  <p style={{ margin: '5px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Delivery: {q.deliveryPeriod || 'N/A'} | Payment: {q.paymentTerms || 'N/A'}</p>
                  <p style={{ margin: '5px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Status: {q.status}</p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    {q.fileUrl ? (
                      <a href={q.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: '0.85rem', color: '#3b82f6', textDecoration: 'underline' }}>
                        📄 View Original Quotation
                      </a>
                    ) : (
                      <span></span>
                    )}
                    {canvass.status !== 'COMPLETED' && (
                      <button 
                        onClick={() => handleEditQuotation(q)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'AI_COMPARISON' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              {canvass.quotations.length < 2 && !canvass.aiSummary ? 'We recommend at least 2 quotations before running AI Comparison.' : ''}
            </p>
            <button 
              onClick={handleRunAI} 
              disabled={isAnalyzing || canvass.quotations.length === 0}
              style={{
                background: 'linear-gradient(45deg, #a855f7, #ec4899)',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: canvass.quotations.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
              {isAnalyzing ? '🤖 Re-tabulating...' : (canvass.aiSummary ? '🔄 Re-Run AI Tabulation' : '🤖 Generate AI Comparison & Summary')}
            </button>
          </div>

          {canvass.aiSummary && (
            <div style={{ 
              background: 'rgba(168, 85, 247, 0.1)', 
              border: '1px solid rgba(168, 85, 247, 0.3)', 
              padding: '20px', 
              borderRadius: '8px',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
              color: '#e9d5ff'
            }}>
              {canvass.aiSummary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
