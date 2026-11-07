import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ShieldAlert, Activity, Eye, Search } from 'lucide-react';

export default async function ProjectAuditTrailTab({ projectId }: { projectId: string }) {
  // AuditLog has no projectId column: scope to logs about this project or its own records.
  const byProject = { where: { projectId }, select: { id: true } } as const;
  const related = await Promise.all([
    prisma.materialRequest.findMany(byProject),
    prisma.billing.findMany(byProject),
    prisma.variationOrder.findMany(byProject),
    prisma.jobOrder.findMany(byProject),
    prisma.subcontractPackage.findMany(byProject),
    prisma.accomplishment.findMany(byProject),
  ]);
  const transactionIds = [projectId, ...related.flat().map((r) => r.id)];

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { transactionId: { in: transactionIds } },
        { newValue: { contains: projectId } },
        { oldValue: { contains: projectId } },
      ],
    },
    include: {
      user: { select: { name: true, role: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  if (auditLogs.length === 0) {
    return (
      <div style={{ 
        position: 'relative', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.2)',
        background: 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
        boxShadow: 'inset 0 0 50px rgba(239,68,68,0.05), 0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(239, 68, 68, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(239, 68, 68, 0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px', transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
          animation: 'gridMoveRed 15s linear infinite', opacity: 0.5, zIndex: 0
        }} />
        <style>{`
          @keyframes gridMoveRed { 0% { background-position: 0 0; } 100% { background-position: 0 40px; } }
          @keyframes float3dRed { 0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-5deg); box-shadow: 0 20px 40px rgba(239,68,68,0.1), inset 0 1px 0 rgba(255,255,255,0.2); } 50% { transform: translateY(-15px) rotateX(15deg) rotateY(0deg); box-shadow: 0 35px 50px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.3); } }
          @keyframes pulseGlowRed { 0%, 100% { filter: drop-shadow(0 0 10px rgba(239,68,68,0.5)); } 50% { filter: drop-shadow(0 0 25px rgba(239,68,68,0.8)); } }
        `}</style>
        <div style={{
          position: 'relative', zIndex: 1, padding: '50px 60px', background: 'rgba(10, 15, 30, 0.6)', backdropFilter: 'blur(16px)',
          borderRadius: '24px', border: '1px solid rgba(239, 68, 68, 0.15)', borderTop: '1px solid rgba(239, 68, 68, 0.4)',
          borderLeft: '1px solid rgba(239, 68, 68, 0.4)', textAlign: 'center', animation: 'float3dRed 6s ease-in-out infinite',
          transformStyle: 'preserve-3d', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(0,0,0,0.8))',
            border: '2px solid rgba(239,68,68,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(239,68,68,0.5), 0 0 30px rgba(239,68,68,0.2)', animation: 'pulseGlowRed 3s infinite', transform: 'translateZ(40px)'
          }}>
            <ShieldAlert size={48} color="#ef4444" strokeWidth={1.5} />
          </div>
          <div style={{ transform: 'translateZ(30px)' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '2rem', fontWeight: '800', background: 'linear-gradient(to right, #ffffff, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '1px' }}>
              Security Audit Trail
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
              No critical security or system modification events have been logged for this project.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .row-hover-red { transition: background 0.2s ease, transform 0.2s ease; }
        .row-hover-red:hover { background: rgba(239, 68, 68, 0.05); transform: scale(1.01); box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 10; position: relative; border-radius: 8px; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', color: '#fff' }}>
          <div style={{ background: 'rgba(239,68,68,0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
            <ShieldAlert size={24} color="#ef4444" />
          </div>
          Security Audit Trail
        </h2>
      </div>

      <div style={{ 
        background: 'rgba(10, 15, 30, 0.8)', backdropFilter: 'blur(20px)', borderRadius: '16px', 
        border: '1px solid rgba(255,255,255,0.1)', padding: '8px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: '0.95rem' }}>
          <thead>
            <tr>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Timestamp</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>User</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Action Type</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log: any) => (
              <tr key={log.id} className="row-hover-red" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '16px', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px', color: 'rgba(255,255,255,0.6)' }}>
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                  {log.user?.name || 'System'}
                </td>
                <td style={{ padding: '16px', color: '#ef4444', fontWeight: 'bold' }}>
                  {log.actionType}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.7)', borderTopRightRadius: '8px', borderBottomRightRadius: '8px' }}>
                  {log.moduleName} - {log.remarks || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
