'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validatePaymentBatchWithAI } from '@/app/actions/aiPaymentValidationActions';
import AiThinking from '@/components/ai/AiThinking';

export default function AIAuditClient({ batchId, existingRiskLevel, existingNotes }: { batchId: string, existingRiskLevel?: string, existingNotes?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRunAudit = async () => {
    setLoading(true);
    const res = await validatePaymentBatchWithAI(batchId);
    setLoading(false);

    if (res.success) {
      alert(`AI Audit Complete. Risk Level: ${res.riskLevel}`);
      router.refresh();
    } else {
      alert('AI Audit Failed: ' + res.error);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'LOW': return '#2ecc71';
      case 'MEDIUM': return '#f39c12';
      case 'HIGH': return '#e67e22';
      case 'BLOCKED': return '#e74c3c';
      default: return '#888';
    }
  };

  return (
    <div style={{ background: 'rgba(52, 152, 219, 0.1)', borderRadius: '12px', padding: '20px', border: '1px solid rgba(52, 152, 219, 0.3)', marginBottom: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>🤖</span> AI Pre-Release Validation (Phase 7)
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 15px 0' }}>
            The AI engine scans this batch for missing details, inactive workers, unverified profiles, duplicate accounts, and routing anomalies.
          </p>
          
          {existingRiskLevel ? (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <strong style={{ color: '#fff' }}>Risk Level:</strong>
                <span style={{ 
                  background: getRiskColor(existingRiskLevel) + '33', 
                  color: getRiskColor(existingRiskLevel), 
                  padding: '4px 12px', 
                  borderRadius: '12px',
                  fontWeight: 'bold'
                }}>
                  {existingRiskLevel}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {existingNotes}
              </div>
            </div>
          ) : (
            <p style={{ color: '#f1c40f', fontStyle: 'italic', margin: 0 }}>
              AI Audit has not been run yet. You must run the audit before you can release this batch!
            </p>
          )}
        </div>

        <button 
          onClick={handleRunAudit}
          disabled={loading}
          style={{ background: '#3498db', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          {loading ? 'Auditing…' : 'Run AI Audit'}
        </button>
      </div>
      {loading && <AiThinking messages={['Reading the payment batch', 'Matching payments to approved documents', 'Looking for duplicate payments', 'Checking amounts and payees', 'Rating the risk']} />}
      
      {existingRiskLevel === 'BLOCKED' && (
        <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(231, 76, 60, 0.2)', borderLeft: '4px solid #e74c3c', color: '#fff' }}>
          <strong>Payment Release Blocked:</strong> Critical anomalies were found. You must resolve these issues before the batch can be released or exported.
        </div>
      )}
    </div>
  );
}
