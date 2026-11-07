import { getAIAuditLogs, getAIAuditMetrics, getChatbotAuditLogs } from '../actions/aiAuditActions';
import { redirect } from 'next/navigation';
import { getAuditViewer } from '@/lib/audit-access';

export const dynamic = 'force-dynamic';

export default async function AiAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; tab?: string }>;
}) {
  if (!(await getAuditViewer())) redirect('/');
  const query = await searchParams;
  const filter = query.filter || 'ALL';
  const tab = query.tab || 'transactions';
  
  const logs = await getAIAuditLogs(filter);
  const chatbotLogs = await getChatbotAuditLogs();
  const metrics = await getAIAuditMetrics();

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 5px 0' }}>AI Audit Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Monitor all AI interventions, blocked transactions, and warnings across the ERP system.</p>
        </div>
      </header>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '10px' }}>Total AI Validations</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{metrics.total}</div>
        </div>
        <div style={{ backgroundColor: 'rgba(255,107,107,0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,107,107,0.2)' }}>
          <div style={{ color: '#ff6b6b', fontSize: '0.9rem', marginBottom: '10px' }}>Blocked Transactions</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ff6b6b' }}>{metrics.blocked}</div>
        </div>
        <div style={{ backgroundColor: 'rgba(255,212,59,0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,212,59,0.2)' }}>
          <div style={{ color: '#ffd43b', fontSize: '0.9rem', marginBottom: '10px' }}>Warnings Issued</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ffd43b' }}>{metrics.warnings}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
        <a href="/ai-audit?tab=transactions" style={{ color: tab === 'transactions' ? '#fff' : 'var(--text-secondary)', textDecoration: 'none', fontWeight: tab === 'transactions' ? 'bold' : 'normal', borderBottom: tab === 'transactions' ? '2px solid var(--accent-color)' : 'none', paddingBottom: '10px' }}>Transaction Validations</a>
        <a href="/ai-audit?tab=chatbot" style={{ color: tab === 'chatbot' ? '#fff' : 'var(--text-secondary)', textDecoration: 'none', fontWeight: tab === 'chatbot' ? 'bold' : 'normal', borderBottom: tab === 'chatbot' ? '2px solid var(--accent-color)' : 'none', paddingBottom: '10px' }}>Chatbot Access Logs</a>
      </div>

      {tab === 'transactions' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <a href="/ai-audit?tab=transactions&filter=ALL" style={{ padding: '8px 16px', borderRadius: '20px', backgroundColor: filter === 'ALL' ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)', color: filter === 'ALL' ? '#000' : '#fff', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>All Logs</a>
            <a href="/ai-audit?tab=transactions&filter=BLOCKED" style={{ padding: '8px 16px', borderRadius: '20px', backgroundColor: filter === 'BLOCKED' ? '#ff6b6b' : 'rgba(255,255,255,0.05)', color: filter === 'BLOCKED' ? '#fff' : '#fff', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>Blocked Only</a>
            <a href="/ai-audit?tab=transactions&filter=WARNING" style={{ padding: '8px 16px', borderRadius: '20px', backgroundColor: filter === 'WARNING' ? '#ffd43b' : 'rgba(255,255,255,0.05)', color: filter === 'WARNING' ? '#000' : '#fff', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>Warnings Only</a>
          </div>

          {/* Logs Table */}
          <div style={{ backgroundColor: 'var(--bg-card, #1a1b1e)', border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'hidden' }}>

        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)' }}>
            <p>No AI audit logs found.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '15px' }}>Date</th>
                <th style={{ padding: '15px' }}>Module</th>
                <th style={{ padding: '15px' }}>User Role</th>
                <th style={{ padding: '15px' }}>Status</th>
                <th style={{ padding: '15px' }}>AI Findings</th>
                <th style={{ padding: '15px' }}>Reference Used</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '15px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '15px', fontWeight: 500 }}>{log.moduleName}</td>
                  <td style={{ padding: '15px' }}>
                    <span style={{ padding: '4px 8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.8rem' }}>
                      {log.userRole}
                    </span>
                  </td>
                  <td style={{ padding: '15px' }}>
                    <span style={{ 
                      padding: '6px 10px', 
                      borderRadius: '6px', 
                      backgroundColor: log.validationStatus === 'BLOCKING ISSUE' ? 'rgba(255,107,107,0.1)' : log.validationStatus === 'WARNING' ? 'rgba(255,212,59,0.1)' : 'rgba(81,207,102,0.1)',
                      color: log.validationStatus === 'BLOCKING ISSUE' ? '#ff6b6b' : log.validationStatus === 'WARNING' ? '#ffd43b' : '#51cf66',
                      fontSize: '0.8rem',
                      fontWeight: 600
                    }}>
                      {log.validationStatus}
                    </span>
                  </td>
                  <td style={{ padding: '15px', maxWidth: '400px' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '5px' }}>{log.aiFindings}</div>
                    {log.overrides && log.overrides.length > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#ffd43b', marginTop: '10px', padding: '8px', backgroundColor: 'rgba(255,212,59,0.05)', borderRadius: '6px', border: '1px dashed rgba(255,212,59,0.3)' }}>
                        <strong>Override Request:</strong> {log.overrides[0].overrideReason}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '15px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {log.reference ? log.reference.title : 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {tab === 'chatbot' && (
        <div style={{ backgroundColor: 'var(--bg-card, #1a1b1e)', border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'hidden' }}>
          {chatbotLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)' }}>
              <p>No chatbot interaction logs found.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '15px' }}>Date</th>
                  <th style={{ padding: '15px' }}>User</th>
                  <th style={{ padding: '15px' }}>Question / Prompt</th>
                  <th style={{ padding: '15px' }}>Sources Allowed</th>
                  <th style={{ padding: '15px' }}>Sources Denied</th>
                </tr>
              </thead>
              <tbody>
                {chatbotLogs.map((log: any) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '15px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '15px', fontWeight: 500 }}>
                      {log.user ? (log.user.name || log.user.email) : 'Unknown'}
                    </td>
                    <td style={{ padding: '15px', maxWidth: '400px' }}>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontStyle: 'italic' }}>"{log.question}"</div>
                    </td>
                    <td style={{ padding: '15px' }}>
                      <span style={{ padding: '4px 10px', backgroundColor: 'rgba(81,207,102,0.1)', color: '#51cf66', borderRadius: '4px', fontWeight: 'bold' }}>
                        {log.sourcesRetrieved} chunks
                      </span>
                    </td>
                    <td style={{ padding: '15px' }}>
                      {log.sourcesDenied > 0 ? (
                        <span style={{ padding: '4px 10px', backgroundColor: 'rgba(255,107,107,0.1)', color: '#ff6b6b', borderRadius: '4px', fontWeight: 'bold' }}>
                          {log.sourcesDenied} blocked
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
