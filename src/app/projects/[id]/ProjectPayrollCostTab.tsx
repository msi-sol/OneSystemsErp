import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Users, Banknote, Calendar, ShieldCheck, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

export default async function ProjectPayrollCostTab({ projectId }: { projectId: string }) {
  const payrolls = await prisma.payroll.findMany({
    where: { projectId },
    include: {
      worker: { select: { firstName: true, lastName: true, workerCategory: true, designation: true } },
      payrollPeriod: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalGrossPay = payrolls.reduce((sum, p) => sum + (p.grossPay || 0), 0);
  const totalNetPay = payrolls.reduce((sum, p) => sum + (p.netPay || 0), 0);
  const totalDeductions = payrolls.reduce((sum, p) => sum + (p.totalDeductions || 0), 0);
  const totalHours = payrolls.reduce((sum, p) => sum + (p.regularHours || 0) + (p.overtimeHours || 0), 0);

  if (payrolls.length === 0) {
    return (
      <div style={{ 
        position: 'relative',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        background: 'radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
        boxShadow: 'inset 0 0 50px rgba(168, 85, 247, 0.05), 0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(168, 85, 247, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(168, 85, 247, 0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
          animation: 'gridMovePurple 15s linear infinite',
          opacity: 0.5,
          zIndex: 0
        }} />
        <style>{`
          @keyframes gridMovePurple {
            0% { background-position: 0 0; }
            100% { background-position: 0 40px; }
          }
          @keyframes float3dPurple {
            0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-5deg); box-shadow: 0 20px 40px rgba(168, 85, 247, 0.1), inset 0 1px 0 rgba(255,255,255,0.2); }
            50% { transform: translateY(-15px) rotateX(15deg) rotateY(0deg); box-shadow: 0 35px 50px rgba(168, 85, 247, 0.2), inset 0 1px 0 rgba(255,255,255,0.3); }
          }
          @keyframes pulseGlowPurple {
            0%, 100% { filter: drop-shadow(0 0 10px rgba(168, 85, 247, 0.5)); }
            50% { filter: drop-shadow(0 0 25px rgba(168, 85, 247, 0.8)); }
          }
          .tech-button-purple {
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
          }
          .tech-button-purple::before {
            content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s ease;
          }
          .tech-button-purple:hover::before { left: 100%; }
          .tech-button-purple:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 20px rgba(168, 85, 247, 0.4); }
        `}</style>
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          padding: '50px 60px',
          background: 'rgba(10, 15, 30, 0.6)',
          backdropFilter: 'blur(16px)',
          borderRadius: '24px',
          border: '1px solid rgba(168, 85, 247, 0.15)',
          borderTop: '1px solid rgba(168, 85, 247, 0.4)',
          borderLeft: '1px solid rgba(168, 85, 247, 0.4)',
          textAlign: 'center',
          animation: 'float3dPurple 6s ease-in-out infinite',
          transformStyle: 'preserve-3d',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(0,0,0,0.8))',
            border: '2px solid rgba(168,85,247,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(168,85,247,0.5), 0 0 30px rgba(168,85,247,0.2)',
            animation: 'pulseGlowPurple 3s infinite', transform: 'translateZ(40px)'
          }}>
            <Banknote size={48} color="#a855f7" strokeWidth={1.5} />
          </div>

          <div style={{ transform: 'translateZ(30px)' }}>
            <h2 style={{ 
              margin: '0 0 12px 0', fontSize: '2rem', fontWeight: '800', 
              background: 'linear-gradient(to right, #ffffff, #a855f7)', 
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '1px'
            }}>
              Payroll Cost Distribution
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
              No payroll distributions or timesheet hours have been allocated to this project yet.
            </p>
          </div>

          <Link href="/payroll" className="tech-button-purple" style={{
              marginTop: '10px', backgroundColor: '#a855f7', color: '#fff',
              padding: '14px 32px', borderRadius: '12px', fontWeight: '900',
              fontSize: '1.1rem', textDecoration: 'none', display: 'inline-flex',
              alignItems: 'center', gap: '10px', textTransform: 'uppercase',
              letterSpacing: '1px', transform: 'translateZ(50px)'
            }}>
            <Calendar size={20} /> View Timesheets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .card-purple {
          background: rgba(10, 15, 30, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.05);
          border-top: 1px solid rgba(255,255,255,0.15);
          border-left: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 24px;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .card-purple:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.4), inset 0 0 20px rgba(168, 85, 247, 0.05);
        }
        .card-purple::after {
          content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
          pointer-events: none;
        }
        .row-hover-purple {
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .row-hover-purple:hover {
          background: rgba(168, 85, 247, 0.05);
          transform: scale(1.01);
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          z-index: 10;
          position: relative;
          border-radius: 8px;
        }
        .header-button-purple:hover {
          transform: scale(1.05) !important;
        }
      `}</style>

      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', color: '#fff' }}>
          <div style={{ background: 'rgba(168,85,247,0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.2)' }}>
            <Banknote size={24} color="#a855f7" />
          </div>
          Project Payroll Costs
        </h2>
        <Link 
          href="/payroll" 
          className="header-button-purple"
          style={{
            background: 'linear-gradient(135deg, #a855f7, #c084fc)',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 15px rgba(168,85,247,0.3)',
            transition: 'transform 0.2s'
          }}
        >
          <Calendar size={18} /> Process Payroll
        </Link>
      </div>

      {/* 3D Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div className="card-purple" style={{ borderBottom: '2px solid #a855f7' }}>
          <div style={{ fontSize: '0.85rem', color: '#a855f7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowUpRight size={16} /> Total Gross Pay
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#a855f7', textShadow: '0 0 10px rgba(168,85,247,0.3)' }}>
            ₱ {totalGrossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Gross Compensation</div>
        </div>
        
        <div className="card-purple">
          <div style={{ fontSize: '0.85rem', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} /> Total Net Pay
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#4ade80' }}>
            ₱ {totalNetPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Take-home Pay Distributed</div>
        </div>
        
        <div className="card-purple">
          <div style={{ fontSize: '0.85rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowDownRight size={16} /> Total Deductions
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fbbf24' }}>
            ₱ {totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Tax & Mandated Deductions</div>
        </div>
        
        <div className="card-purple">
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Total Hours Logged
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff' }}>
            {totalHours.toLocaleString()} hrs
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Regular & Overtime</div>
        </div>
      </div>

      {/* 3D List View */}
      <div style={{ 
        background: 'rgba(10, 15, 30, 0.8)', 
        backdropFilter: 'blur(20px)',
        borderRadius: '16px', 
        border: '1px solid rgba(255,255,255,0.1)', 
        padding: '8px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: '0.95rem' }}>
          <thead>
            <tr>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Worker Name</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Role / Category</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Payroll Period</th>
              <th style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Hours Worked</th>
              <th style={{ padding: '16px', textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Gross Pay</th>
              <th style={{ padding: '16px', textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {payrolls.map((p: any) => (
              <tr key={p.id} className="row-hover-purple" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '16px', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px', color: '#fff', fontWeight: 'bold' }}>
                  {p.worker?.firstName} {p.worker?.lastName}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.8)' }}>
                  <div style={{ fontSize: '0.9rem' }}>{p.worker?.designation || p.worker?.workerCategory || 'Worker'}</div>
                  {p.worker?.designation && p.worker?.workerCategory && p.worker.workerCategory !== p.worker.designation && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{p.worker.workerCategory}</div>}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.7)' }}>
                  {/* PayrollPeriod has no name field; describe it from its month, half and dates. */}
                  {p.payrollPeriod ? `${p.payrollPeriod.month}/${p.payrollPeriod.year} · ${String(p.payrollPeriod.periodType || '').replace(/_/g, ' ').toLowerCase()} (${new Date(p.payrollPeriod.startDate).toLocaleDateString()} – ${new Date(p.payrollPeriod.endDate).toLocaleDateString()})` : '—'}
                </td>
                <td style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.9)' }}>
                  {((p.regularHours || 0) + (p.overtimeHours || 0)).toFixed(1)}
                </td>
                <td style={{ padding: '16px', textAlign: 'right', color: '#a855f7', fontWeight: 'bold' }}>
                  ₱ {(p.grossPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td style={{ 
                  padding: '16px', 
                  textAlign: 'right', 
                  fontWeight: '900', 
                  color: '#4ade80',
                  borderTopRightRadius: '8px', 
                  borderBottomRightRadius: '8px' 
                }}>
                  ₱ {(p.netPay || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
