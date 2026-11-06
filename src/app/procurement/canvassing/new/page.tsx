'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createCanvassForm } from '@/app/actions/canvass';

export default function StartCanvassPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mrId = searchParams?.get('mrId');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!mrId) return;

    let isActive = true;
    async function start(requestId: string) {
      setError('');
      try {
        const res = await createCanvassForm(requestId);
        if (!isActive) return;
        if (res.success && res.canvassId) {
          router.push(`/procurement/canvassing/${res.canvassId}`);
        } else {
          setError(res.error || 'Failed to start canvass.');
        }
      } catch (cause) {
        if (isActive) {
          setError(cause instanceof Error ? cause.message : 'Failed to start canvass.');
        }
      }
    }
    
    start(mrId);
    return () => { isActive = false; };
  }, [mrId, router, attempt]);

  const linkStyle = { color: 'var(--accent-color)', fontWeight: 600, textDecoration: 'none' };

  if (!mrId) {
    return (
      <section style={{ maxWidth: '720px', margin: '40px auto', padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
        <h1 style={{ color: 'var(--text-primary)', marginTop: 0 }}>Select an approved MRF</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          A material request is required before a canvass form can be prepared. Choose an approved MRF from the canvassing dashboard.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <Link href="/procurement/canvassing" style={linkStyle}>Go to Canvassing →</Link>
          <Link href="/material-requests" style={linkStyle}>View Material Requests →</Link>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ maxWidth: '720px', margin: '40px auto', padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
        <h1 style={{ color: 'var(--text-primary)', marginTop: 0 }}>Could not prepare the canvass</h1>
        <p role="alert" style={{ color: '#fca5a5', lineHeight: 1.6 }}>{error}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <button type="button" onClick={() => setAttempt(value => value + 1)} style={{ background: 'var(--accent-color)', color: '#000', border: 0, borderRadius: '6px', padding: '9px 14px', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
          <Link href="/procurement/canvassing" style={linkStyle}>Back to Canvassing</Link>
          <Link href="/material-requests" style={linkStyle}>View Material Requests</Link>
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: 'var(--accent-color)', textShadow: '0 0 10px var(--accent-glow)' }}>
          Preparing Canvass Form...
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>Extracting BOQ items from the approved Material Request.</p>
      </div>
    </div>
  );
}
