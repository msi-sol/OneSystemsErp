'use client';

import React, { useState } from 'react';
import { updateAIValidationStatus, runAIDiagnostics } from '@/app/actions/equipmentActions';
import AiThinking from '@/components/ai/AiThinking';

interface AIValidation {
  id: string;
  type: string;
  severity: string;
  status: string;
  findings: string;
  recommendations: string;
  createdAt: string;
  equipment: { id: string; code: string; name: string; category: string; status: string; lastEngineHours: number | null };
}

interface SafetyEvent {
  id: string;
  eventType: string;
  eventTime: string;
  severity: string;
  status: string;
  equipment: { code: string; name: string };
  driver: { firstName: string; lastName: string } | null;
  aiReviews: { aiSummary: string; aiRiskScore: number; aiRecommendation: string }[];
}

interface Stats {
  openFindings: number;
  resolvedFindings: number;
  criticalFindings: number;
  highFindings: number;
  safetyEvents: number;
}

export default function AIClient({
  initialValidations,
  initialSafetyEvents,
  initialStats
}: {
  initialValidations: AIValidation[];
  initialSafetyEvents: SafetyEvent[];
  initialStats: Stats;
}) {
  const [validations, setValidations] = useState<AIValidation[]>(initialValidations);
  const [safetyEvents] = useState<SafetyEvent[]>(initialSafetyEvents);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ analyzed: number; newFindings: number; skippedDuplicates: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'VALIDATIONS' | 'SAFETY'>('VALIDATIONS');

  const handleRunDiagnostics = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const result = await runAIDiagnostics();
      setScanResult(result);
      
      // Refresh data
      const [newValidations, newStats] = await Promise.all([
        import('@/app/actions/equipmentActions').then(m => m.getAIValidations()),
        import('@/app/actions/equipmentActions').then(m => m.getAIDashboardStats())
      ]);
      setValidations(newValidations as any);
      setStats(newStats);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await updateAIValidationStatus(id, newStatus);
      const [newValidations, newStats] = await Promise.all([
        import('@/app/actions/equipmentActions').then(m => m.getAIValidations()),
        import('@/app/actions/equipmentActions').then(m => m.getAIDashboardStats())
      ]);
      setValidations(newValidations as any);
      setStats(newStats);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MEDIUM': return '#f59e0b';
      case 'LOW': return '#3b82f6';
      default: return 'var(--text-secondary)';
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'PREDICTIVE_MAINTENANCE': return '🔧';
      case 'FUEL_AUDIT': return '⛽';
      case 'UTILIZATION_AUDIT': return '⏱️';
      default: return '🤖';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* STATS BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
        <StatCard icon="🔴" label="Critical Findings" value={String(stats.criticalFindings)} color="#ef4444" highlight={stats.criticalFindings > 0} />
        <StatCard icon="🟠" label="High Priority" value={String(stats.highFindings)} color="#f97316" highlight={stats.highFindings > 0} />
        <StatCard icon="⚠️" label="Open Findings" value={String(stats.openFindings)} color="#f59e0b" />
        <StatCard icon="✅" label="Resolved" value={String(stats.resolvedFindings)} color="#22c55e" />
        <StatCard icon="🚨" label="Safety Events (7d)" value={String(stats.safetyEvents)} color="#8b5cf6" highlight={stats.safetyEvents > 0} />
      </div>

      {/* ACTION BAR */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🧠 AI Diagnostic Engine
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Run the AI engine to analyze cross-module data (FMS Telemetry, Engine Hours, Maintenance Logs, Utilization) to predict failures and detect anomalies.
          </p>
        </div>
        <button
          onClick={handleRunDiagnostics}
          disabled={isScanning}
          style={{
            background: 'linear-gradient(135deg, #ef4444, #b91c1c)', color: '#fff', border: 'none', padding: '12px 24px',
            borderRadius: '8px', fontWeight: 'bold', cursor: isScanning ? 'not-allowed' : 'pointer', fontSize: '1rem',
            display: 'flex', alignItems: 'center', gap: '8px', transition: 'transform 0.15s, box-shadow 0.15s',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)'
          }}
          onMouseOver={e => { if (!isScanning) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.6)'; } }}
          onMouseOut={e => { if (!isScanning) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.4)'; } }}
        >
          {isScanning ? '🤖 Analyzing…' : '🤖 Run AI Diagnostics Now'}
        </button>
      </div>
      {isScanning && <div style={{ marginBottom: 16 }}><AiThinking messages={['Reading telemetry and engine hours', 'Reviewing maintenance logs', 'Checking utilization patterns', 'Looking for failure warning signs', 'Recording findings']} /></div>}

      {scanResult && (
        <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', padding: '15px', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>✅</span>
          <div>
            <strong>Scan Complete:</strong> Analyzed {scanResult.analyzed} equipment units. 
            Found <strong>{scanResult.newFindings} new issues</strong>. 
            (Skipped {scanResult.skippedDuplicates} already open issues).
          </div>
        </div>
      )}

      {/* STATUS TABS */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', borderRadius: '10px', padding: '4px', border: '1px solid var(--glass-border)' }}>
        <button
          onClick={() => setActiveTab('VALIDATIONS')}
          style={{
            flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontWeight: '600', fontSize: '0.9rem', transition: 'all 0.2s',
            background: activeTab === 'VALIDATIONS' ? 'var(--bg-primary)' : 'transparent',
            color: activeTab === 'VALIDATIONS' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'VALIDATIONS' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
          }}
        >
          🔍 AI Findings & Alerts ({validations.filter(v => v.status === 'OPEN').length} Open)
        </button>
        <button
          onClick={() => setActiveTab('SAFETY')}
          style={{
            flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontWeight: '600', fontSize: '0.9rem', transition: 'all 0.2s',
            background: activeTab === 'SAFETY' ? 'var(--bg-primary)' : 'transparent',
            color: activeTab === 'SAFETY' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: activeTab === 'SAFETY' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
          }}
        >
          🚨 Fleet Safety Events ({safetyEvents.length})
        </button>
      </div>

      {activeTab === 'VALIDATIONS' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {validations.length === 0 ? (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
              No AI findings yet. Click "Run AI Diagnostics Now" to scan your fleet data.
            </div>
          ) : (
            validations.map(val => (
              <div key={val.id} style={{
                background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                border: `1px solid ${val.status === 'OPEN' ? `${severityColor(val.severity)}66` : 'var(--glass-border)'}`,
                display: 'flex', flexDirection: 'column', gap: '15px',
                opacity: val.status === 'RESOLVED' ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '2rem' }}>{typeIcon(val.type)}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>[{val.equipment.code}] {val.equipment.name}</strong>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', background: `${severityColor(val.severity)}22`, color: severityColor(val.severity) }}>
                          {val.severity} SEVERITY
                        </span>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', background: val.status === 'OPEN' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)', color: val.status === 'OPEN' ? '#f59e0b' : '#22c55e' }}>
                          {val.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Detected: {new Date(val.createdAt).toLocaleString('en-PH')} • Type: {val.type.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  
                  {val.status === 'OPEN' ? (
                    <button 
                      onClick={() => handleStatusUpdate(val.id, 'RESOLVED')}
                      style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      ✓ Mark Resolved
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleStatusUpdate(val.id, 'OPEN')}
                      style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Reopen
                    </button>
                  )}
                </div>

                <div style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${severityColor(val.severity)}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem', display: 'block', marginBottom: '4px' }}>Finding:</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>{val.findings}</div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem', display: 'block', marginBottom: '4px' }}>AI Recommendation:</strong>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.4' }}>{val.recommendations}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {safetyEvents.length === 0 ? (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}>
              No safety events recorded.
            </div>
          ) : (
            safetyEvents.map(event => {
              const aiReview = event.aiReviews[0];
              return (
                <div key={event.id} style={{
                  background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
                  border: `1px solid ${event.severity === 'CRITICAL' || event.severity === 'HIGH' ? 'rgba(239,68,68,0.4)' : 'var(--glass-border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: '2rem' }}>{event.eventType === 'OVERSPEED' ? '🏎️' : event.eventType === 'HARSH_BRAKING' ? '🛑' : '⚠️'}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{event.equipment.name}</strong>
                          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', background: `${severityColor(event.severity)}22`, color: severityColor(event.severity) }}>
                            {event.eventType}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {new Date(event.eventTime).toLocaleString('en-PH')} • Operator: {event.driver ? `${event.driver.firstName} ${event.driver.lastName}` : 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {aiReview && (
                    <div style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>🤖</span>
                        <strong style={{ color: '#8b5cf6' }}>AI Safety Review</strong>
                        <span style={{ background: '#8b5cf6', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          Risk Score: {aiReview.aiRiskScore}/100
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px', lineHeight: '1.4' }}>
                        {aiReview.aiSummary}
                      </div>
                      <div style={{ color: '#8b5cf6', fontSize: '0.9rem', fontWeight: '500' }}>
                        Recommendation: {aiReview.aiRecommendation}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

    </div>
  );
}

function StatCard({ icon, label, value, color, highlight }: { icon: string; label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div style={{
      background: highlight ? `${color}11` : 'var(--bg-secondary)',
      borderRadius: '12px', padding: '16px',
      border: `1px solid ${highlight ? `${color}44` : 'var(--glass-border)'}`,
      display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <span style={{ fontSize: '1.4rem' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{label}</span>
      <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color }}>{value}</span>
    </div>
  );
}
