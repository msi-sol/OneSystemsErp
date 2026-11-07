import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Hammer, CirclePlay, CheckCircle, Clock, AlertTriangle, FileText, ArrowRightCircle } from 'lucide-react';

export default async function ProjectJobOrdersTab({ projectId }: { projectId: string }) {
  const jobOrders = await prisma.jobOrder.findMany({
    where: { projectId },
    include: {
      subcontractor: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalJO = jobOrders.length;
  // Map cards onto the real JobOrderStatus enum (DRAFT, FOR_*_REVIEW, APPROVED, ISSUED, CANCELLED).
  const inProgress = jobOrders.filter((jo) => jo.status === 'ISSUED').length;
  const pending = jobOrders.filter((jo) => jo.status === 'DRAFT' || jo.status.startsWith('FOR_')).length;
  const completed = jobOrders.filter((jo) => jo.status === 'APPROVED').length;

  if (jobOrders.length === 0) {
    return (
      <div style={{ 
        position: 'relative',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid rgba(234, 179, 8, 0.2)',
        background: 'radial-gradient(circle at 50% 50%, rgba(234, 179, 8, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
        boxShadow: 'inset 0 0 50px rgba(234, 179, 8, 0.05), 0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(234, 179, 8, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(234, 179, 8, 0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
          animation: 'gridMoveYellow 15s linear infinite',
          opacity: 0.5,
          zIndex: 0
        }} />
        <style>{`
          @keyframes gridMoveYellow {
            0% { background-position: 0 0; }
            100% { background-position: 0 40px; }
          }
          @keyframes float3dYellow {
            0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-5deg); box-shadow: 0 20px 40px rgba(234, 179, 8, 0.1), inset 0 1px 0 rgba(255,255,255,0.2); }
            50% { transform: translateY(-15px) rotateX(15deg) rotateY(0deg); box-shadow: 0 35px 50px rgba(234, 179, 8, 0.2), inset 0 1px 0 rgba(255,255,255,0.3); }
          }
          @keyframes pulseGlowYellow {
            0%, 100% { filter: drop-shadow(0 0 10px rgba(234, 179, 8, 0.5)); }
            50% { filter: drop-shadow(0 0 25px rgba(234, 179, 8, 0.8)); }
          }
          .tech-button-yellow {
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
          }
          .tech-button-yellow::before {
            content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s ease;
          }
          .tech-button-yellow:hover::before { left: 100%; }
          .tech-button-yellow:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 20px rgba(234, 179, 8, 0.4); }
        `}</style>
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          padding: '50px 60px',
          background: 'rgba(10, 15, 30, 0.6)',
          backdropFilter: 'blur(16px)',
          borderRadius: '24px',
          border: '1px solid rgba(234, 179, 8, 0.15)',
          borderTop: '1px solid rgba(234, 179, 8, 0.4)',
          borderLeft: '1px solid rgba(234, 179, 8, 0.4)',
          textAlign: 'center',
          animation: 'float3dYellow 6s ease-in-out infinite',
          transformStyle: 'preserve-3d',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(234,179,8,0.2), rgba(0,0,0,0.8))',
            border: '2px solid rgba(234,179,8,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(234,179,8,0.5), 0 0 30px rgba(234,179,8,0.2)',
            animation: 'pulseGlowYellow 3s infinite', transform: 'translateZ(40px)'
          }}>
            <Hammer size={48} color="#eab308" strokeWidth={1.5} />
          </div>

          <div style={{ transform: 'translateZ(30px)' }}>
            <h2 style={{ 
              margin: '0 0 12px 0', fontSize: '2rem', fontWeight: '800', 
              background: 'linear-gradient(to right, #ffffff, #eab308)', 
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '1px'
            }}>
              Job Order Control
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
              No piece-rate job orders have been assigned to workers for this project yet.
            </p>
          </div>

          <Link href="/job-orders/create" className="tech-button-yellow" style={{
              marginTop: '10px', backgroundColor: '#eab308', color: '#000',
              padding: '14px 32px', borderRadius: '12px', fontWeight: '900',
              fontSize: '1.1rem', textDecoration: 'none', display: 'inline-flex',
              alignItems: 'center', gap: '10px', textTransform: 'uppercase',
              letterSpacing: '1px', transform: 'translateZ(50px)'
            }}>
            <Hammer size={20} /> Create Job Order
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return '#9e9e9e';
      case 'FOR_REVIEW':
      case 'FOR_FINANCIAL_REVIEW':
      case 'FOR_TECHNICAL_REVIEW': return '#facc15';
      case 'ISSUED': return '#3b82f6';
      case 'APPROVED': return '#22c55e';
      case 'CANCELLED': return '#ef4444';
      default: return '#9e9e9e';
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .card-yellow {
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
        .card-yellow:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.4), inset 0 0 20px rgba(234, 179, 8, 0.05);
        }
        .card-yellow::after {
          content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
          pointer-events: none;
        }
        .row-hover-yellow {
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .row-hover-yellow:hover {
          background: rgba(234, 179, 8, 0.05);
          transform: scale(1.01);
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          z-index: 10;
          position: relative;
          border-radius: 8px;
        }
        .header-button-yellow:hover {
          transform: scale(1.05) !important;
        }
      `}</style>

      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', color: '#fff' }}>
          <div style={{ background: 'rgba(234,179,8,0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(234,179,8,0.2)' }}>
            <Hammer size={24} color="#eab308" />
          </div>
          Job Order Tracking
        </h2>
        <Link 
          href="/job-orders/create" 
          className="header-button-yellow"
          style={{
            background: 'linear-gradient(135deg, #eab308, #facc15)',
            color: '#000',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 15px rgba(234,179,8,0.3)',
            transition: 'transform 0.2s'
          }}
        >
          <ArrowRightCircle size={18} /> New Job Order
        </Link>
      </div>

      {/* 3D Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div className="card-yellow" style={{ borderBottom: '2px solid #eab308' }}>
          <div style={{ fontSize: '0.85rem', color: '#eab308', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} /> Total Job Orders
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#eab308', textShadow: '0 0 10px rgba(234,179,8,0.3)' }}>
            {totalJO}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Total Registered J.O.s</div>
        </div>
        
        <div className="card-yellow">
          <div style={{ fontSize: '0.85rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CirclePlay size={16} /> In Progress
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#3b82f6' }}>
            {inProgress}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Actively Being Worked</div>
        </div>

        <div className="card-yellow">
          <div style={{ fontSize: '0.85rem', color: '#facc15', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} /> Pending Start
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#facc15' }}>
            {pending}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Awaiting Execution</div>
        </div>
        
        <div className="card-yellow">
          <div style={{ fontSize: '0.85rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={16} /> Approved
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#22c55e' }}>
            {completed}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Finished Assignments</div>
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
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>J.O. Number</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Assigned Worker</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Foreman</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Activity</th>
              <th style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Status</th>
              <th style={{ padding: '16px', textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Agreed Amount</th>
            </tr>
          </thead>
          <tbody>
            {jobOrders.map((jo: any) => (
              <tr key={jo.id} className="row-hover-yellow" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '16px', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' }}>
                  <Link href={`/job-orders/${jo.id}`} style={{ 
                    color: '#eab308', 
                    textDecoration: 'none', 
                    fontWeight: 'bold',
                  }}>
                    {jo.jobNumber}
                  </Link>
                </td>
                <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                  {jo.subcontractor?.name || 'Unassigned'}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.7)' }}>
                  -
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.7)', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {jo.description}
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: '900',
                    letterSpacing: '0.5px',
                    backgroundColor: `${getStatusColor(jo.status)}15`,
                    color: getStatusColor(jo.status),
                    border: `1px solid ${getStatusColor(jo.status)}40`,
                    boxShadow: `0 0 10px ${getStatusColor(jo.status)}20`
                  }}>
                    {jo.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td style={{ 
                  padding: '16px', 
                  textAlign: 'right', 
                  fontWeight: '900', 
                  color: '#fff',
                  borderTopRightRadius: '8px', 
                  borderBottomRightRadius: '8px' 
                }}>
                  ₱ {(jo.contractAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
