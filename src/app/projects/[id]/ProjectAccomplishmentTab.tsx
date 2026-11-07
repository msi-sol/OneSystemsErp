import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Target, TrendingUp, CalendarCheck, FileCheck, ArrowRightCircle } from 'lucide-react';
import AccomplishmentReviewButtons from './AccomplishmentReviewButtons';

export default async function ProjectAccomplishmentTab({ projectId }: { projectId: string }) {
  const accomplishments = await prisma.accomplishment.findMany({
    where: { projectId },
    orderBy: { accomplishmentDate: 'desc' }
  });

  const totalLogs = accomplishments.length;
  // Billed accomplishments were approved first, so they count as approved earned value too.
  const approvedAccomplishments = accomplishments.filter((a: any) => a.status === 'APPROVED' || a.status === 'BILLED').length;
  const totalValue = accomplishments.reduce((sum: number, a: any) => sum + (a.approvedAmount || 0), 0);
  const recordHref = `/accomplishments/${projectId}/new`;
  const peso = (value: number) => `₱ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const statusColor = (status: string) => status === 'APPROVED' ? '#10b981' : status === 'BILLED' ? '#3b82f6' : status === 'REJECTED' ? '#ef4444' : '#f59e0b';

  if (accomplishments.length === 0) {
    return (
      <div style={{ 
        position: 'relative', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.2)',
        background: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
        boxShadow: 'inset 0 0 50px rgba(16,185,129,0.05), 0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px', transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
          animation: 'gridMoveEmerald 15s linear infinite', opacity: 0.5, zIndex: 0
        }} />
        <style>{`
          @keyframes gridMoveEmerald { 0% { background-position: 0 0; } 100% { background-position: 0 40px; } }
          @keyframes float3dEmerald { 0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-5deg); box-shadow: 0 20px 40px rgba(16,185,129,0.1), inset 0 1px 0 rgba(255,255,255,0.2); } 50% { transform: translateY(-15px) rotateX(15deg) rotateY(0deg); box-shadow: 0 35px 50px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.3); } }
          @keyframes pulseGlowEmerald { 0%, 100% { filter: drop-shadow(0 0 10px rgba(16,185,129,0.5)); } 50% { filter: drop-shadow(0 0 25px rgba(16,185,129,0.8)); } }
          .tech-button-emerald { position: relative; overflow: hidden; transition: all 0.3s ease; }
          .tech-button-emerald::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition: left 0.5s ease; }
          .tech-button-emerald:hover::before { left: 100%; }
          .tech-button-emerald:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
        `}</style>
        <div style={{
          position: 'relative', zIndex: 1, padding: '50px 60px', background: 'rgba(10, 15, 30, 0.6)', backdropFilter: 'blur(16px)',
          borderRadius: '24px', border: '1px solid rgba(16, 185, 129, 0.15)', borderTop: '1px solid rgba(16, 185, 129, 0.4)',
          borderLeft: '1px solid rgba(16, 185, 129, 0.4)', textAlign: 'center', animation: 'float3dEmerald 6s ease-in-out infinite',
          transformStyle: 'preserve-3d', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(0,0,0,0.8))',
            border: '2px solid rgba(16,185,129,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(16,185,129,0.5), 0 0 30px rgba(16,185,129,0.2)', animation: 'pulseGlowEmerald 3s infinite', transform: 'translateZ(40px)'
          }}>
            <Target size={48} color="#10b981" strokeWidth={1.5} />
          </div>
          <div style={{ transform: 'translateZ(30px)' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '2rem', fontWeight: '800', background: 'linear-gradient(to right, #ffffff, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '1px' }}>
              Project Accomplishment
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
              No physical accomplishment or earned value logs have been recorded yet.
            </p>
          </div>
          <Link href={recordHref} className="tech-button-emerald" style={{
              marginTop: '10px', backgroundColor: '#10b981', color: '#fff', padding: '14px 32px', borderRadius: '12px', fontWeight: '900',
              fontSize: '1.1rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase',
              letterSpacing: '1px', transform: 'translateZ(50px)'
            }}>
            <TrendingUp size={20} /> Log Accomplishment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .card-emerald { background: rgba(10, 15, 30, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05); border-top: 1px solid rgba(255,255,255,0.15); border-left: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; transition: transform 0.3s ease, box-shadow 0.3s ease; position: relative; overflow: hidden; }
        .card-emerald:hover { transform: translateY(-5px); box-shadow: 0 15px 30px rgba(0,0,0,0.4), inset 0 0 20px rgba(16, 185, 129, 0.05); }
        .card-emerald::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%); pointer-events: none; }
        .row-hover-emerald { transition: background 0.2s ease, transform 0.2s ease; }
        .row-hover-emerald:hover { background: rgba(16, 185, 129, 0.05); transform: scale(1.01); box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 10; position: relative; border-radius: 8px; }
        .header-button-emerald:hover { transform: scale(1.05) !important; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', color: '#fff' }}>
          <div style={{ background: 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
            <Target size={24} color="#10b981" />
          </div>
          Accomplishment & Earned Value
        </h2>
        <Link href={recordHref} className="header-button-emerald" style={{
            background: 'linear-gradient(135deg, #10b981, #34d399)', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontWeight: 'bold',
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(16,185,129,0.3)', transition: 'transform 0.2s'
          }}>
          <ArrowRightCircle size={18} /> Record Progress
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Accomplishment Logs', value: totalLogs.toLocaleString(), Icon: FileCheck },
          { label: 'Approved Logs', value: `${approvedAccomplishments.toLocaleString()} of ${totalLogs.toLocaleString()}`, Icon: CalendarCheck },
          { label: 'Approved Earned Value', value: peso(totalValue), Icon: TrendingUp },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="card-emerald">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Icon size={16} color="#10b981" /> {label}
            </div>
            <div style={{ marginTop: '10px', fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="card-emerald" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '14px 16px' }}>Billing Period</th>
              <th style={{ padding: '14px 16px' }}>Accomplishment Date</th>
              <th style={{ padding: '14px 16px' }}>Status</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Approved Amount</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>Review</th>
            </tr>
          </thead>
          <tbody>
            {accomplishments.map((a) => (
              <tr key={a.id} className="row-hover-emerald" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{a.billingPeriod}</td>
                <td style={{ padding: '12px 16px' }}>{new Date(a.accomplishmentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ color: statusColor(a.status), border: `1px solid ${statusColor(a.status)}`, borderRadius: '999px', padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {a.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>{a.approvedAmount != null ? peso(a.approvedAmount) : '—'}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {a.status === 'FOR_REVIEW' ? <AccomplishmentReviewButtons accomplishmentId={a.id} /> : <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
