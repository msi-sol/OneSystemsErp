import React from 'react';
import { prisma } from '@/lib/prisma';
import PayrollSubNav from '@/components/PayrollSubNav';

export const dynamic = 'force-dynamic';

// Previously a static mockup that always claimed "UnionBank — Active Production" with fake credentials.
// This lists the real PaymentProvider records. Secrets are never sent to the browser: only whether a
// value is set and, for identifiers, its last four characters.

const maskTail = (value: string | null | undefined) => (value ? `••••${value.slice(-4)}` : null);

function Field({ label, value, missing = 'Not set' }: { label: string; value: React.ReactNode; missing?: string }) {
  return (
    <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 2fr', gap: '20px', borderBottom: '1px solid var(--glass-border)' }}>
      <dt style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{label}</dt>
      <dd style={{ fontSize: '0.85rem', margin: 0, fontFamily: 'monospace', color: value ? '#fff' : '#f39c12', overflowWrap: 'anywhere' }}>{value || missing}</dd>
    </div>
  );
}

export default async function PaymentProviderSetup() {
  const providers = await prisma.paymentProvider.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1000px', margin: '0 auto' }}>
      <PayrollSubNav />
      <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', textShadow: '0 0 10px var(--accent-glow)' }}>Payment Provider Setup</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
          Bank and e-wallet connections used for payroll disbursement.
        </p>
      </div>

      <div style={{ background: 'rgba(243, 156, 18, 0.08)', border: '1px solid rgba(243, 156, 18, 0.35)', color: '#f5c06b', padding: '14px 18px', borderRadius: '12px', marginBottom: '24px', fontSize: '0.9rem', lineHeight: 1.5 }}>
        <strong>Simulation mode:</strong> bank API calls are not live yet. Submissions and status checks are simulated
        by the payment service, so no money is moved by this module regardless of the settings below.
      </div>

      {providers.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)', padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No payment providers have been configured.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {providers.map((p) => {
            const active = p.status.toUpperCase() === 'ACTIVE';
            return (
              <div key={p.id} style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                <div style={{ padding: '20px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0 }}>{p.providerName}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>{p.providerType} · {p.transferRail}</p>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', background: active ? 'rgba(0,255,163,0.15)' : 'rgba(255,255,255,0.08)', color: active ? '#00ffa3' : 'var(--text-secondary)', border: `1px solid ${active ? 'rgba(0,255,163,0.4)' : 'var(--glass-border)'}` }}>
                    {p.status} · {p.environment}
                  </span>
                </div>
                <dl style={{ margin: 0 }}>
                  <Field label="Client ID" value={maskTail(p.clientId)} />
                  <Field label="Client Secret" value={p.clientSecret ? 'Configured' : null} />
                  <Field label="Webhook Signing Secret" value={p.webhookSigningSecret ? 'Configured' : null} />
                  <Field label="API Base URL" value={p.environment === 'Production' ? p.apiBaseUrlProduction : p.apiBaseUrlSandbox} />
                  <Field label="Debit Account" value={p.debitAccountNumber ? `${p.debitAccountName || ''} ${maskTail(p.debitAccountNumber)}`.trim() : null} />
                  <Field label="Per-Transaction Limit" value={p.singleTransactionLimit != null ? `₱${p.singleTransactionLimit.toLocaleString()}` : null} missing="No limit set" />
                  <Field label="Last Connection Test" value={p.lastConnectionTest ? new Date(p.lastConnectionTest).toLocaleString('en-PH') : null} missing="Never tested" />
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
