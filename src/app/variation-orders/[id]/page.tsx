'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import AiThinking from '@/components/ai/AiThinking';
import { 
  ArrowLeft, CheckSquare, Edit, DollarSign, UploadCloud, 
  Send, Bot, Settings, Briefcase, Plus, Search, Trash2, AlertOctagon,
  Clock, FileText, MapPin, ChevronDown, ChevronUp, History, Calendar
} from 'lucide-react';
import { 
  getVariationOrderById, 
  addVariationOrderItem, 
  submitVariationOrder,
  createMRFFromVO,
  createSubcontractFromVO,
  approveVariationOrderStage,
  deleteVariationOrder,
  deleteVariationOrderItem,
  updateVariationOrderDetails
} from '@/app/actions/variationOrderActions';
import { preCheckVariationOrder } from '@/app/actions/aiVariationValidationActions';
import AIValidationPanel from '@/components/VariationOrders/AIValidationPanel';
import AIVariationAssistant from '@/components/VariationOrders/AIVariationAssistant';
import AddVariationItemModal from '@/components/VariationOrders/AddVariationItemModal';
import styles from '../../projects/page.module.css';

export default function VariationOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const voId = params?.id as string;

  const [vo, setVo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [aiChecking, setAiChecking] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showApprovalHistory, setShowApprovalHistory] = useState(false);

  useEffect(() => {
    fetchVO();
  }, [voId]);

  const fetchVO = async () => {
    try {
      const data = await getVariationOrderById(voId);
      setVo(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAIPreCheck = async () => {
    setActionLoading(true); setAiChecking(true);
    try {
      const res = await preCheckVariationOrder(voId, 'SYSTEM');
      toast.success('AI Pre-check complete!');
      fetchVO();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false); setAiChecking(false);
    }
  };

  const handleDeleteVO = async () => {
    if (vo.currentStatus === 'APPROVED') {
      if (!confirm('SUPER ADMIN WARNING: Force Deleting an APPROVED Variation Order will permanently revert all associated BOQ entries and contract amounts! Are you absolutely sure you want to proceed?')) return;
    } else {
      if (!confirm('Are you sure you want to delete this Variation Order? This cannot be undone.')) return;
    }
    
    setActionLoading(true);
    try {
      await deleteVariationOrder(voId);
      toast.success(vo.currentStatus === 'APPROVED' ? 'Variation Order Force Deleted & Reverted.' : 'Variation Order deleted.');
      router.push('/variation-orders');
    } catch (e: any) {
      toast.error(e.message);
      setActionLoading(false);
    }
  };

  const handleEditVO = async () => {
    const newReason = prompt('Edit Reason for Variation:', vo.reasonForVariation);
    if (newReason && newReason !== vo.reasonForVariation) {
      try {
        await updateVariationOrderDetails(voId, { reasonForVariation: newReason });
        toast.success('Variation Order updated.');
        fetchVO();
      } catch (e: any) {
        toast.error(e.message);
      }
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Remove this item?')) return;
    try {
      await deleteVariationOrderItem(itemId, voId);
      toast.success('Item removed.');
      fetchVO();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCreateMRF = async () => {
    setActionLoading(true);
    try {
      const itemIds = vo.items.map((i: any) => i.id);
      await createMRFFromVO(voId, itemIds, 'USER_ID_PLACEHOLDER');
      toast.success('Material Request created successfully!');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      let stage = 'TECHNICAL_REVIEW';
      if (vo.currentStatus === 'SUBMITTED') stage = 'TECHNICAL_REVIEW';
      else if (vo.currentStatus === 'FOR_COSTING') stage = 'COST_REVIEW';
      else if (vo.currentStatus === 'FOR_PM_REVIEW') stage = 'PM_REVIEW';
      else if (vo.currentStatus === 'FOR_FINANCE_REVIEW') stage = 'FINANCE_REVIEW';
      else if (vo.currentStatus === 'FOR_PD_APPROVAL') stage = 'PD_APPROVAL';

      if (vo.currentStatus === 'FOR_PD_APPROVAL') {
        // Final approval -> propagate to BOQ
        const res = await fetch(`/api/projects/${vo.projectId}/variation-orders/${voId}/approve`, {
          method: 'POST'
        });
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.error || 'Failed to propagate VO to BOQ');
        }
        toast.success('VO Final Approved and Integrated into BOQ & Schedule!');
      } else {
        await approveVariationOrderStage(voId, stage, 'APPROVED', 'USER_ID_PLACEHOLDER', 'Approved via Dashboard');
        toast.success('VO Stage Approved!');
      }
      
      await fetchVO();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getNextStageText = () => {
    if (vo.currentStatus === 'SUBMITTED') return 'Approve & Send to Costing';
    if (vo.currentStatus === 'FOR_COSTING') return 'Approve & Send to PM Review';
    if (vo.currentStatus === 'FOR_PM_REVIEW') return 'Approve & Send to Finance';
    if (vo.currentStatus === 'FOR_FINANCE_REVIEW') return 'Approve & Send to PD';
    if (vo.currentStatus === 'FOR_PD_APPROVAL') return 'Final Approve';
    return 'Approve VO';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return '#9e9e9e';
      case 'SUBMITTED': return '#2196f3';
      case 'FOR_COSTING': case 'FOR_PM_REVIEW': case 'FOR_FINANCE_REVIEW': case 'FOR_PD_APPROVAL':
        return '#ff9800';
      case 'APPROVED': return '#4caf50';
      case 'REJECTED': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;
  if (!vo) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Variation Order not found</div>;

  const statusColor = getStatusColor(vo.currentStatus);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <button 
            onClick={() => router.back()} 
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-primary)', marginTop: '4px' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>{vo.voNumber}</h1>
              <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold',
                backgroundColor: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44`
              }}>
                {vo.currentStatus.replace(/_/g, ' ')}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold',
                backgroundColor: 'rgba(255,152,0,0.1)', color: '#ff9800', border: '1px solid rgba(255,152,0,0.3)'
              }}>
                <AlertOctagon size={12} /> Risk: {vo.aiRiskRating || 'UNRATED'}
              </span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {vo.variationType} &bull; {vo.reasonForVariation || 'No reason specified'}
            </p>
          </div>
        </div>
      </div>

      {/* VO DETAILS SECTION */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px',
        padding: '20px', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '110px' }}>Variation Type</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600' }}>{vo.variationType}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '110px' }}>Category</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{vo.variationCategory || 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '110px' }}>Location</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{vo.affectedLocation || 'N/A'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '110px' }}>Date Requested</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{new Date(vo.dateRequested).toLocaleDateString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '110px' }}>Time Impact</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{vo.timeImpact?.replace(/_/g, ' ') || 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', width: '110px' }}>Source</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{vo.sourceOfVariation || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* FINANCIAL SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', background: 'var(--glass-bg)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Original Contract</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>₱ {(vo.originalContractAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
        <div style={{ padding: '16px 20px', background: 'rgba(0,200,83,0.06)', borderRadius: '10px', border: '1px solid rgba(0,200,83,0.2)' }}>
          <div style={{ fontSize: '0.7rem', color: '#00c853', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Additive Amount</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#00c853' }}>+ ₱ {(vo.additionalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
        <div style={{ padding: '16px 20px', background: 'rgba(255,82,82,0.06)', borderRadius: '10px', border: '1px solid rgba(255,82,82,0.2)' }}>
          <div style={{ fontSize: '0.7rem', color: '#ff5252', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Deductive Amount</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ff5252' }}>- ₱ {(vo.deductiveAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
        <div style={{ padding: '16px 20px', background: 'rgba(0,176,255,0.08)', borderRadius: '10px', border: '2px solid rgba(0,176,255,0.3)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Revised Contract</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>₱ {(vo.currentRevisedContractAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{(vo.percentageImpact || 0).toFixed(2)}% Impact</div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <button 
          onClick={handleRunAIPreCheck} 
          disabled={actionLoading || vo.currentStatus === 'APPROVED'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer',
            background: 'rgba(25,118,210,0.1)', color: '#1976D2', border: '1px solid rgba(25,118,210,0.3)'
          }}
        >
          <Bot size={15} /> {aiChecking ? 'Checking…' : 'AI Pre-Check'}
        </button>

        {vo.approvals && vo.approvals.length > 0 && (
          <button 
            onClick={() => setShowApprovalHistory(!showApprovalHistory)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer',
              background: showApprovalHistory ? 'rgba(156,39,176,0.15)' : 'rgba(156,39,176,0.08)', color: '#9c27b0', border: '1px solid rgba(156,39,176,0.3)'
            }}
          >
            <History size={15} /> Approval History ({vo.approvals.length})
            {showApprovalHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {vo.currentStatus === 'DRAFT' && (
          <>
            <button 
              onClick={handleEditVO} disabled={actionLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            >
              <Edit size={15} /> Edit
            </button>
            <button 
              onClick={async () => { try { await submitVariationOrder(voId); toast.success('Variation Order submitted for review.'); } catch (e: any) { toast.error(e?.message || 'The Variation Order could not be submitted.'); } fetchVO(); }}
              disabled={actionLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: 'linear-gradient(135deg, #00ffa3, #00cc82)', color: '#000', border: 'none' }}
            >
              <Send size={15} /> Submit for Review
            </button>
          </>
        )}

        {vo.currentStatus !== 'DRAFT' && vo.currentStatus !== 'APPROVED' && (
          <button 
            onClick={handleApprove} disabled={actionLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: 'linear-gradient(135deg, #4caf50, #388e3c)', color: '#fff', border: 'none' }}
          >
            <CheckSquare size={15} /> {getNextStageText()}
          </button>
        )}

        {vo.approvedForProcurement && (
          <button 
            onClick={handleCreateMRF} disabled={actionLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: 'rgba(255,152,0,0.1)', color: '#ff9800', border: '1px solid rgba(255,152,0,0.3)' }}
          >
            <Briefcase size={15} /> Create MRF
          </button>
        )}

        <button 
          onClick={handleDeleteVO} disabled={actionLoading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', background: 'rgba(255,82,82,0.08)', color: '#ff5252', border: '1px solid rgba(255,82,82,0.3)', marginLeft: 'auto' }}
        >
          <Trash2 size={15} /> {vo.currentStatus === 'APPROVED' ? 'Force Delete' : 'Delete'}
        </button>
      </div>
      {aiChecking && <div style={{ margin: '-12px 0 24px' }}><AiThinking messages={['Reading the variation order', 'Checking the scope against the contract BOQ', 'Checking quantities and rates', 'Assessing cost and schedule impact', 'Preparing the pre-check result']} /></div>}

      {/* COLLAPSIBLE APPROVAL HISTORY */}
      {showApprovalHistory && vo.approvals && vo.approvals.length > 0 && (
        <div style={{
          marginBottom: '24px', padding: '20px', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid rgba(156,39,176,0.2)',
          animation: 'fadeIn 0.2s ease'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} style={{ color: '#9c27b0' }} /> Approval Timeline
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {vo.approvals.map((approval: any, index: number) => (
              <div key={approval.id} style={{ display: 'flex', gap: '16px', position: 'relative' }}>
                {/* Timeline line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                    background: approval.action === 'APPROVED' ? '#4caf50' : approval.action === 'REJECTED' ? '#f44336' : '#ff9800',
                    border: '2px solid rgba(255,255,255,0.1)', marginTop: '6px'
                  }} />
                  {index < vo.approvals.length - 1 && (
                    <div style={{ width: '2px', flex: 1, background: 'rgba(255,255,255,0.08)', minHeight: '30px' }} />
                  )}
                </div>
                {/* Content */}
                <div style={{ flex: 1, paddingBottom: index < vo.approvals.length - 1 ? '16px' : '0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{approval.stage.replace(/_/g, ' ')}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(approval.createdAt).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px',
                      background: approval.action === 'APPROVED' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)',
                      color: approval.action === 'APPROVED' ? '#4caf50' : '#f44336'
                    }}>
                      {approval.action}
                    </span>
                    {approval.remarks && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>— {approval.remarks}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* VO BOQ TABLE */}
      <div style={{ marginBottom: '24px', padding: '20px', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
            VO BOQ Table
            <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)', marginLeft: '8px' }}>
              ({vo.items.length} item{vo.items.length !== 1 ? 's' : ''})
            </span>
          </h3>
          {vo.currentStatus === 'DRAFT' && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', background: 'rgba(0,255,163,0.1)', color: '#00ffa3', border: '1px solid rgba(0,255,163,0.3)' }}
            >
              <Plus size={14} /> Add Item
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Category</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Item #</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Description</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Class</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Unit</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Orig Qty</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Rev Qty</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Unit Cost</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600', borderBottom: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>Net Amount</th>
                {vo.currentStatus === 'DRAFT' && <th style={{ padding: '10px 12px', borderBottom: '1px solid var(--glass-border)', width: '40px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {vo.items.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No items added yet.</td></tr>
              ) : (
                vo.items.map((item: any) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {item.workCategory || 'Uncategorized'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.voItemNumber}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{item.description}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{item.itemClassification.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{item.unit}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>{item.originalQuantity}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: item.revisedQuantity !== item.originalQuantity ? 'var(--accent-color)' : 'var(--text-primary)' }}>{item.revisedQuantity}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-primary)' }}>₱ {(item.approvedUnitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: (item.netAmount || 0) > 0 ? '#00c853' : (item.netAmount || 0) < 0 ? '#ff5252' : 'var(--text-primary)' }}>
                      ₱ {(item.netAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    {vo.currentStatus === 'DRAFT' && (
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button onClick={() => handleDeleteItem(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff5252', cursor: 'pointer', padding: '4px' }}>
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {vo.items.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <td colSpan={8} style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>TOTAL NET:</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '1rem', color: 'var(--accent-color)' }}>
                    ₱ {vo.items.reduce((sum: number, i: any) => sum + (i.netAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  {vo.currentStatus === 'DRAFT' && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* AI VALIDATION */}
      <div style={{ marginBottom: '24px', padding: '20px', background: 'var(--glass-bg)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>AI Validation Results</h3>
        <AIValidationPanel validations={vo.aiValidations} />
      </div>

      <AIVariationAssistant voId={voId} />

      <AddVariationItemModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        projectId={vo.projectId} 
        voId={voId} 
        onSuccess={fetchVO} 
      />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
}
