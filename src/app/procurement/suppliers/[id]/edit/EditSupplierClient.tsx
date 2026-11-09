'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateSupplier } from '@/app/actions/supplierActions';
import Link from 'next/link';

export default function EditSupplierClient({ supplier }: { supplier: any }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (!String(formData.get('name') || '').trim()) { setError('Enter the supplier name.'); return; }
    setError('');
    startTransition(async () => {
      const result = await updateSupplier(supplier.id, formData);
      if (!result.success) { setError(result.error); return; }
      router.push('/procurement/suppliers');
    });
  };

  return (
    <div style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
        <Link href="/procurement/suppliers" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 'bold', marginRight: '20px' }}>&larr; Back</Link>
        <h1 style={{ color: 'var(--text-primary)', margin: 0 }}>Edit Supplier: {supplier.name}</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
        {error && <p role="alert" style={{ margin: '0 0 20px', padding: '10px 12px', borderRadius: '8px', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>{error}</p>}
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Supplier Name *</label>
            <input name="name" defaultValue={supplier.name} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>TIN</label>
            <input name="tin" defaultValue={supplier.tin || ''} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Address</label>
          <input name="address" defaultValue={supplier.address || ''} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Contact Person</label>
            <input name="contactPerson" defaultValue={supplier.contactPerson || ''} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Contact Number</label>
            <input name="contactNumber" defaultValue={supplier.contactNumber || ''} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Email</label>
            <input name="email" type="email" defaultValue={supplier.email || ''} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Terms of Payment</label>
            <select name="paymentTerms" defaultValue={supplier.paymentTerms || ''} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
              <option value="">-- Select Terms --</option>
              <option value="CASH ON DELIVERY">CASH ON DELIVERY</option>
              <option value="DATED CHECK ON DELIVERY">DATED CHECK ON DELIVERY</option>
              <option value="PDC 30">PDC 30</option>
              <option value="PDC 45">PDC 45</option>
              <option value="PDC 60">PDC 60</option>
              <option value="PDC 90">PDC 90</option>
              <option value="PDC 180">PDC 180</option>
              <option value="BANK TRANSFER">BANK TRANSFER</option>
              <option value="GCASH">GCASH</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>VAT Setting *</label>
          <select name="isVatable" defaultValue={supplier.isVatable ? "true" : "false"} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
            <option value="true">VAT Registered</option>
            <option value="false">NON-VAT</option>
          </select>
        </div>

        <button type="submit" disabled={isPending} style={{ backgroundColor: 'var(--accent-color)', color: '#000', padding: '12px 24px', borderRadius: '8px', border: 'none', fontWeight: 'bold', width: '100%', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
          {isPending ? 'Updating...' : 'Update Supplier'}
        </button>
      </form>
    </div>
  );
}
